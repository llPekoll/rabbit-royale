/**
 * THE BURROW'S GUARD, AGAINST A RUNNING SERVER (2026-10-23) — the Abols/Zicels
 * chain replayed on a throwaway database: two raiders take turns on one
 * burrow, and the guard (lib/game/raid-guard) must shut the door behind the
 * first, raise a shield from the victim's bag, and hold the door while
 * someone is inside.
 *
 *   createdb rr_guard_test && DATABASE_URL=…/rr_guard_test bun db:migrate
 *   DATABASE_URL=…/rr_guard_test WS_PORT=3052 bun run server/index.ts   (another shell)
 *   DATABASE_URL=…/rr_guard_test bun tools/raid-guard-check.ts
 */
import postgres from 'postgres';
import { setBurrowEdits, fieldTiles } from '../src/game/burrow/board';
import { distanceToField } from '../src/lib/game/raid';

const BASE = process.env.GUARD_URL ?? 'http://localhost:3052';
if (!/rr_guard_test/.test(process.env.DATABASE_URL ?? '')) {
  console.error('refusing to run: DATABASE_URL must point at rr_guard_test');
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });

let failed = 0;
const check = (what: string, ok: boolean, detail: unknown = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail === '' ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function api(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) as any };
}

async function guest() {
  const r = await fetch(BASE + '/api/auth/guest', { method: 'POST' });
  const j = await r.json() as any;
  await sql`update players set level = 8, runs_played = 5, energy = 200, energy_updated_at = now(),
    shielded_until = null, last_seen_at = now() where id = ${j.player.id}`;
  return { token: j.token as string, id: j.player.id as string };
}

/** Straight for the field; returns the step answer that settled it. */
async function walk(token: string, defenderId: string) {
  const enter = await api(token, 'POST', '/api/raid', { defenderId });
  if (enter.status !== 200) return { refused: enter.json };
  let view = enter.json.raid;
  setBurrowEdits(defenderId, view.defender?.edits ?? null);
  const dist = distanceToField(defenderId);
  const field = new Set(fieldTiles(defenderId));
  for (let n = 0; n < 60; n++) {
    const moves: number[] = view.steps ?? [];
    if (!moves.length) break;
    const next = moves.sort((a, b) => (field.has(a) ? -100 : dist.get(a) ?? 50) - (field.has(b) ? -100 : dist.get(b) ?? 50))[0];
    const r = await api(token, 'PATCH', '/api/raid', { tile: next });
    if (r.status !== 200) return { error: r.json };
    view = r.json.raid ?? view;
    if (r.json.outcome) return { outcome: r.json.outcome };
    if (view.finished) break;
  }
  await api(token, 'DELETE', '/api/raid');
  return { unfinished: true };
}

const victimState = async (id: string) => {
  const [p] = await sql`select stock, shielded_until from players where id = ${id}`;
  const [s] = await sql`select qty from inventory where player_id = ${id} and kind = 'shield'`;
  return { stock: Number(p.stock), shieldedUntil: p.shielded_until as Date | null, shields: s ? Number(s.qty) : 0 };
};

const zicels = await guest(), abols = await guest(), third = await guest(), grim = await guest();
// The victim: rich, no bomb, no plank, two shields in the bag.
await sql`update players set stock = 6000 where id = ${grim.id}`;
await sql`delete from traps where owner_id = ${grim.id}`;
await sql`delete from fences where owner_id = ${grim.id}`;
await sql`insert into inventory (player_id, kind, qty) values (${grim.id}, 'shield', 2)
  on conflict (player_id, kind) do update set qty = 2`;
// The tuning table may be empty here: the file's numbers rule (300 / 2 h, 30 min, 3).

// 1. Zicels walks in and takes something.
const first = await walk(zicels.token, grim.id);
check('the first raid reaches the field and takes carrots', !!first.outcome?.reachedField && first.outcome.loot > 0, first);
const afterFirst = await victimState(grim.id);
check('loot ≥ 300 raised a shield from the bag', !!afterFirst.shieldedUntil && afterFirst.shieldedUntil.getTime() > Date.now() + 5 * 3_600_000, afterFirst);
check('…and spent exactly one', afterFirst.shields === 1, afterFirst);

// 2. Abols, seconds later: the shield turns him away.
const second = await walk(abols.token, grim.id);
check('the second raider is refused by the shield', second.refused?.error === 'target_shielded' && !second.refused.rest, second);

// 3. No shield (say the bag was empty): the breather alone turns him away.
await sql`update players set shielded_until = null where id = ${grim.id}`;
const third1 = await walk(abols.token, grim.id);
check('without a shield, the breather refuses him', third1.refused?.error === 'target_shielded' && third1.refused.rest === true && third1.refused.retryInMs > 25 * 60_000, third1);
const list = await api(abols.token, 'GET', '/api/raid');
const row = (list.json?.targets ?? []).find((t: any) => t.id === grim.id);
check('the target list shows the door shut, with the wait', row?.door === 'shield' && row.doorWaitMs > 25 * 60_000, row && { door: row.door, doorWaitMs: row.doorWaitMs });

// 4. Half an hour later the door opens.
await sql`update raid_runs set ended_at = ended_at - interval '31 minutes', started_at = started_at - interval '31 minutes' where defender_id = ${grim.id}`;
const fourth = await walk(abols.token, grim.id);
check('after the breather, a raid goes through', !!fourth.outcome, fourth);
const afterFourth = await victimState(grim.id);
check('the second shield goes up on its own', afterFourth.shields === 0 && !!afterFourth.shieldedUntil && afterFourth.shieldedUntil.getTime() > Date.now(), afterFourth);

// 5. The ceiling: a third looting raid today, then nobody until tomorrow.
await sql`update players set shielded_until = null where id = ${grim.id}`;
await sql`update raid_runs set ended_at = ended_at - interval '31 minutes', started_at = started_at - interval '31 minutes' where defender_id = ${grim.id}`;
const fifth = await walk(third.token, grim.id);
check('a third raid in the day goes through (bag empty: no shield)', !!fifth.outcome && fifth.outcome.loot > 0, fifth);
await sql`update raid_runs set ended_at = ended_at - interval '31 minutes', started_at = started_at - interval '31 minutes' where defender_id = ${grim.id}`;
const sixth = await walk(zicels.token, grim.id);
check('a fourth one inside 24 h is refused for hours', sixth.refused?.rest === true && sixth.refused.retryInMs > 20 * 3_600_000, sixth);

// 6. One raider at a time, on a fresh burrow.
const other = await guest();
await sql`update players set stock = 6000 where id = ${other.id}`;
const enter = await api(zicels.token, 'POST', '/api/raid', { defenderId: other.id });
const view = enter.json?.raid;
await api(zicels.token, 'PATCH', '/api/raid', { tile: (view?.steps ?? [])[0] });
const meanwhile = await api(abols.token, 'POST', '/api/raid', { defenderId: other.id });
check('while Zicels is inside, Abols cannot open the same burrow', meanwhile.json?.error === 'target_shielded' && meanwhile.json.busy === true, meanwhile.json);
await api(zicels.token, 'DELETE', '/api/raid');

await sql.end();
console.log(failed ? `\n${failed} FAILED` : '\nall good');
process.exit(failed ? 1 : 0);
