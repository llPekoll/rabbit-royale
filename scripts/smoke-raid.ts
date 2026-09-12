/**
 * A raid, walked end to end against a real database.
 *
 * The unit tests cover the arithmetic (raid.test, shop.test). This proves the
 * part they cannot: that an attacker can actually enter a burrow, step across
 * it, spring a trap, and come out with carrots that really left somebody else's
 * bank — with the route handlers wired to Postgres.
 *
 *   bun run scripts/smoke-raid.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { players, raidRuns, raids, traps } from '../src/lib/db/schema';
import { signSession } from '../src/lib/auth/jwt';
import { entranceTile, burrowNeighbors, burrowCell } from '../src/game/burrow/board';
import { distanceToField } from '../src/lib/game/raid';
import { RAID_RUN, TRAPS, SMOKE } from '../config/tuning';
import * as Raid from '../src/app/api/raid/route';
import * as Shop from '../src/app/api/shop/route';

const ATT = 'sol:RAIDATT111111111111111111111111111111111';
const DEF = 'sol:RAIDDEF111111111111111111111111111111111';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log('        ', detail); }
}

async function reset() {
  for (const id of [ATT, DEF]) await db.delete(players).where(eq(players.id, id));
  await db.insert(players).values([
    { id: ATT, wallet: 'RAIDATT', name: 'Attacker', stock: 50_000 },
    { id: DEF, wallet: 'RAIDDEF', name: 'Defender', stock: 10_000 },
  ]);
}

async function main() {
  await reset();
  const attToken = await signSession({ sub: ATT, wallet: 'RAIDATT', name: 'Attacker' });
  const defToken = await signSession({ sub: DEF, wallet: 'RAIDDEF', name: 'Defender' });

  const req = (token: string, method: string, body?: unknown) =>
    new Request('http://smoke.test/api', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const list = () => Raid.GET(req(attToken, 'GET')).then((r) => r.json());
  const enter = (defenderId: string) => Raid.POST(req(attToken, 'POST', { defenderId })).then((r) => r.json());
  const step = (tile: number) => Raid.PATCH(req(attToken, 'PATCH', { tile })).then((r) => r.json());

  console.log('\nraid, against the real database\n');

  // Targets.
  const targets = await list();
  check('the target list names other players', targets.targets?.some((t: {id: string}) => t.id === DEF), targets.targets?.length);
  check('...and never yourself', !targets.targets?.some((t: {id: string}) => t.id === ATT));

  // Enter.
  const entered = await enter(DEF);
  check('a raid starts at the door', entered.raid?.tile === entranceTile(DEF), entered);
  check('...with a full budget', entered.raid?.energy === RAID_RUN.START_ENERGY);
  check('...and the defender named', entered.raid?.defender?.name === 'Defender');
  check('you cannot raid yourself', (await enter(ATT)).error === 'cannot_raid_yourself');
  check('two raids at once are refused', (await enter(DEF)).error === 'raid_in_progress');

  // The view is PARTIAL: only where you have been, and its neighbours.
  const seen = entered.raid.view.length;
  check('the board is revealed by walking, not all at once',
    seen > 0 && seen <= 1 + burrowNeighbors(DEF, entranceTile(DEF)).length, seen);
  check('a raider is never told where traps are',
    !JSON.stringify(entered.raid).includes('"traps"'), Object.keys(entered.raid));

  // Steps.
  check('a distant tile is refused', (await step(0)).error === 'not_adjacent');
  check('a blocked tile is refused', (await step(-1)).error === 'not_adjacent');
  check('a non-integer tile is refused', (await step(1.5)).error === 'not_adjacent');

  // Walk towards the field, greedily by distance.
  // The defender's id IS their burrow's seed: the ground is grown from it on
  // both sides, so this walks the same homestead the route validates against.
  const dist = distanceToField(DEF);
  let guard = 0;
  let last = entered.raid;
  while (!last.finished && guard++ < 40) {
    const here = last.raid?.tile ?? last.tile;
    const next = burrowNeighbors(DEF, here)
      .sort((a: number, b: number) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))[0];
    const out = await step(next);
    if (out.error) { check(`walking failed: ${out.error}`, false, out); break; }
    last = out.raid?.finished ? { ...out, finished: true } : { raid: out.raid, finished: false };
    if (out.outcome) {
      check('reaching the field ends the raid', out.outcome.reachedField === true, out.outcome);
      check('...and pays the full share', out.outcome.loot > 0, out.outcome.loot);
      break;
    }
  }

  const def = await db.query.players.findFirst({ where: eq(players.id, DEF) });
  const att = await db.query.players.findFirst({ where: eq(players.id, ATT) });
  check('the carrots really left the defender', (def?.stock ?? 0) < 10_000, def?.stock);
  check('...and really arrived at the attacker', (att?.stock ?? 0) > 50_000, att?.stock);
  check('the season score moved WITH the carrots',
    (att?.seasonScore ?? 0) > 0 && (att?.seasonScore ?? 0) === (att?.stock ?? 0) - 50_000,
    { score: att?.seasonScore, gained: (att?.stock ?? 0) - 50_000 });
  check('the victim is shielded afterwards',
    !!def?.shieldedUntil && def.shieldedUntil.getTime() > Date.now(), def?.shieldedUntil);
  check('the raid is logged for the victim to read',
    (await db.query.raids.findMany({ where: eq(raids.defenderId, DEF) })).length === 1);
  check('a shielded target cannot be raided again',
    (await enter(DEF)).error === 'target_shielded');

  // ── Traps actually cost the raider ──────────────────────────────────────
  await reset();
  // Mine every tile next to the door, so the first step MUST spring one.
  const doorway = burrowNeighbors(DEF, entranceTile(DEF))
    .filter((t: number) => burrowCell(DEF, t) === 'ground');
  await db.insert(traps).values(doorway.map((tile) => ({ ownerId: DEF, tile })));

  const mined = await enter(DEF);
  check('a raid starts on a mined burrow', mined.raid?.energy === RAID_RUN.START_ENERGY, mined.error);
  const first = await step(doorway[0]);
  check('stepping on a trap springs it', first.sprungTrap === true, first);
  check('...and it drains energy',
    first.raid?.energy === RAID_RUN.START_ENERGY - RAID_RUN.STEP_COST - TRAPS.DRAIN,
    first.raid?.energy);
  check('...and the trap is spent, not reusable',
    (await db.query.traps.findMany({ where: eq(traps.ownerId, DEF) })).length === doorway.length - 1);
  check('the clue numbers are visible without a screen',
    first.raid?.view?.some((v: {clue: number|null}) => v.clue !== null), first.raid?.view?.slice(0, 3));
  check('...and a mined neighbourhood reads above zero',
    first.raid?.view?.some((v: {clue: number|null}) => (v.clue ?? 0) > 0));

  // ── The smoke screen blinds the raider ──────────────────────────────────
  await db.update(players)
    .set({ smokeUntil: new Date(Date.now() + SMOKE.DURATION_MS) })
    .where(eq(players.id, DEF));

  const blinded = await Raid.GET(req(attToken, 'GET')).then((r) => r.json());
  check('a screen hides every clue number',
    blinded.raid?.view?.every((v: {clue: number|null}) => v.clue === null), blinded.raid?.view?.slice(0, 3));
  check('...and says so, rather than showing a blank board', blinded.raid?.smoked === true);
  check('...but still shows WHERE the tiles are',
    (blinded.raid?.view?.length ?? 0) > 0, blinded.raid?.view?.length);

  // Buying one from the shop is what a defender actually does.
  await db.update(players).set({ smokeUntil: null, stock: 50_000 }).where(eq(players.id, DEF));
  const bought = await Shop.POST(req(defToken, 'POST', { kind: 'smoke' })).then((r) => r.json());
  check('a screen can be bought with carrots', !bought.error, bought.error);
  const smoked = await db.query.players.findFirst({ where: eq(players.id, DEF) });
  check('...and really hides the burrow',
    !!smoked?.smokeUntil && smoked.smokeUntil.getTime() > Date.now(), smoked?.smokeUntil);

  for (const id of [ATT, DEF]) await db.delete(players).where(eq(players.id, id));
  console.log(failures === 0 ? '\nall good\n' : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
