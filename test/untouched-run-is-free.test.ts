/**
 * LOOKING IS NOT PLAYING — a run or a raid that was never begun costs nothing.
 *
 * Reported on 21 September 2026: "je viens de faire un game dig, j'ai pas
 * bougé, j'ai perdu 20", and then "pareil pour le raid". Both crossings take
 * their price AT THE DOOR, which is the only moment the row is in hand:
 * `payForRun` charges ENERGY.RUN_COST on `join`, and a raid opens the hour-long
 * per-victim cooldown on POST. What the player buys there is a BOARD, and a
 * board they never broke ground on was never dealt to them — so walking out to
 * look and walking home was costing a third of the bank, and glancing at a
 * raid target burned it for an hour.
 *
 * The two fixes are deliberately different shapes, because the two costs are:
 * energy is a number and is REFUNDED at the exit that every run passes through;
 * the cooldown is a timestamp and is instead EXCLUDED from, the window being
 * measured — the abandoned row stays on file as history.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { currentEnergy } from '../src/lib/game/regen';
import { chargeRun } from '../src/lib/game/burrow';
import { generateIsland } from '../src/lib/game/island';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape } from '../src/config/gridConfig';
import { spawnTile, terrainNeighbors } from '../src/lib/game/terrainBoard';
import { mulberry32 } from '../src/lib/game/rng';
import { ENERGY, OUT_OF_RUN_ENERGY, RAID as RAID_TUNING, RAID_RUN as RAID_RUN_TUNING } from '../config/tuning';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const RAID = read('../src/app/api/raid/route.ts');

/** The refund as `bankRun` computes it: fold the regen in, add the cost, clamp. */
function refundOf(row: { energy: number; energyUpdatedAt: Date }, now: number) {
  return Math.min(OUT_OF_RUN_ENERGY.MAX, currentEnergy(row, now) + ENERGY.RUN_COST);
}

describe('a run that dug nothing is refunded', () => {
  it('hands back exactly what the crossing took', () => {
    const t0 = Date.now();
    const before = { energy: 60, energyUpdatedAt: new Date(t0 - 60_000) };

    const charged = chargeRun(before, t0);
    expect(charged).not.toBeNull();
    expect(charged!.energy).toBe(60 - ENERGY.RUN_COST);

    // Straight back out without a single dig, a second later.
    const back = refundOf(charged!, t0 + 1_000);
    expect(back).toBe(60);
  });

  it('cannot print energy by loitering on the island', () => {
    // THE TRAP THIS GUARDS. `players.energy` is a value read against its
    // stamp, not a running total: regen accrues while the player is out there,
    // so a refund that added to the column without folding that in — or
    // without clamping — would hand back more than the crossing took. Four
    // hours of loitering at 5/hour is 20 points of regen on top of the 20 paid.
    const t0 = Date.now();
    const charged = chargeRun({ energy: 60, energyUpdatedAt: new Date(t0) }, t0)!;
    const fourHoursLater = t0 + 4 * 3_600_000;

    expect(refundOf(charged, fourHoursLater)).toBe(OUT_OF_RUN_ENERGY.MAX);
    // And never more than the ceiling, however long the look.
    expect(refundOf(charged, t0 + 50 * 3_600_000)).toBe(OUT_OF_RUN_ENERGY.MAX);
  });

  it('refunds from a part-spent bar without over-crediting', () => {
    const t0 = Date.now();
    // A bar well below the ceiling: the clamp must not be what decides this.
    const charged = chargeRun({ energy: 30, energyUpdatedAt: new Date(t0) }, t0)!;
    expect(charged.energy).toBe(30 - ENERGY.RUN_COST);
    expect(refundOf(charged, t0 + 1_000)).toBe(30);
  });

  it('is keyed on having MOVED, not on tiles dug or carrots banked', () => {
    // `tilesDug` was the first answer and it was wrong: walking revealed
    // ground is free (`resolveMove` returns before the dig branch) and a
    // rabbit spawns beside ground that is already open, so a run can be played
    // properly and dig nothing — "j'ai fait un pas, ca a pas consome les 20".
    // Carrots would be worse still: an unlucky board that paid nothing is a
    // run that HAPPENED and stays paid for.
    const bank = SERVER.slice(SERVER.indexOf('async function bankRun'));
    expect(bank).toMatch(/const refunded = !run\.moved;/);
    expect(bank).not.toMatch(/const refunded = run\.tilesDug === 0;/);
  });

  it('marks the run as moved on any accepted step, dug or walked', () => {
    // Set from the outcome of `resolveMove` having been ACCEPTED, not from
    // `out.dig` — that is the bug this replaced — and after the rejection
    // guard, so a refused step (too fast, a cliff, the tutorial hold) does not
    // start the run.
    const move = SERVER.slice(SERVER.indexOf("socket.on('move'"));
    const body = move.slice(0, move.indexOf("socket.on('leave'"));
    const guard = body.indexOf("if (!out.ok) return socket.emit('move_rejected'");
    const flag = body.indexOf('rabbit.run.moved = true');
    expect(guard).toBeGreaterThan(-1);
    expect(flag).toBeGreaterThan(guard);
    // And it is not conditioned on a dig.
    const between = body.slice(guard, flag);
    expect(between).not.toMatch(/if \(out\.dig\)/);
  });

  it('folds the regen in and re-stamps, like the charge did', () => {
    const bank = SERVER.slice(SERVER.indexOf('async function bankRun'));
    const refund = bank.slice(bank.indexOf('const refunded ='), bank.indexOf('await db.update(players)'));
    expect(refund).toMatch(/currentEnergy\(row, now\.getTime\(\)\) \+ ENERGY\.RUN_COST/);
    expect(refund).toMatch(/Math\.min\(OUT_OF_RUN_ENERGY\.MAX/);
    expect(refund).toMatch(/energyUpdatedAt: now/);
  });

  it('does not spend the first island on a look-around', () => {
    // `runsPlayed` is what sends a first-timer to their authored island, so a
    // refunded run must not count — or a newcomer who glances and comes back
    // has silently lost the tutorial.
    const bank = SERVER.slice(SERVER.indexOf('async function bankRun'));
    expect(bank).toMatch(/runsPlayed: raw`\$\{players\.runsPlayed\} \+ \$\{refunded \? 0 : 1\}`/);
  });

  it('a step onto revealed ground really does dig nothing — the bug itself', () => {
    // THE PROOF the criterion had to change. `resolveMove` returns early on
    // revealed ground ("walking revealed ground is free"), so the outcome
    // carries no `dig` and `tilesDug` never moves — while the player has
    // plainly played. A rabbit spawns beside exactly such ground.
    const seed = 'refund-walk';
    const island = generateIsland({ seed, contentSeed: 'quiet' });
    for (const t of island.tiles.values()) {
      t.content = 'empty'; t.adjacent = 0; t.hinted = false; t.revealed = false;
    }
    const spawn = spawnTile(seed);
    const to = terrainNeighbors(seed, spawn)[0];
    expect(to).toBeDefined();
    // Open the ground the step lands on, as a cascade or another player would.
    island.tiles.get(spawn)!.revealed = true;
    island.tiles.get(to)!.revealed = true;

    const rabbit = spawnRabbit('p1', 'Test', ENERGY.START, seed);
    rabbit.run = { id: 'r1', startedAt: 0, tilesDug: 0, bombsHit: 0, loot: {}, nfts: [] };
    const out = resolveMove(island, rabbit, to, makeShape('dig-zero'), mulberry32(1), 10_000);

    expect(out.ok).toBe(true);
    expect(out.dig).toBeUndefined();   // nothing was dug...
    expect(rabbit.tile).toBe(to);      // ...but the rabbit moved.
    // So the old criterion would have called this a look-around and refunded
    // it, while the new one counts it as the run it is.
    expect(rabbit.run!.tilesDug).toBe(0);
  });

  it('still banks the carrots and the tiles of a real run', () => {
    const bank = SERVER.slice(SERVER.indexOf('async function bankRun'));
    expect(bank).toMatch(/stock: raw`\$\{players\.stock\} \+ \$\{carrots\}`/);
    expect(bank).toMatch(/tilesDug: raw`\$\{players\.tilesDug\} \+ \$\{run\.tilesDug\}`/);
  });
});

describe('a raid that was never walked does not burn the target', () => {
  it('measures the cooldown from walked raids only', () => {
    const post = RAID.slice(RAID.indexOf('export async function POST'));
    const window = post.slice(0, post.indexOf('const start = entranceTile'));
    // `visited` opens holding the entrance tile alone and grows by one per
    // step, so > 1 is "took at least one step".
    expect(window).toMatch(/array_length\(\$\{raidRuns\.visited\}, 1\), 0\) > 1/);
  });

  it('asks Postgres for array_length — `visited` is integer[], not json', () => {
    // A jsonb_array_length here throws on an integer[] column, which would
    // take the whole POST down rather than merely mis-measuring the window.
    const post = RAID.slice(RAID.indexOf('export async function POST'));
    expect(post).not.toMatch(/jsonb_array_length/);
    expect(post).toMatch(/coalesce\(array_length/);
  });

  it('still opens holding the entrance tile, which is what makes 1 mean "unwalked"', () => {
    expect(RAID).toMatch(/visited: \[start\]/);
  });

  it('does not count as a raid played until a step is taken', () => {
    // `raidsPlayed` is bumped in the SETTLE transaction, which only a PATCH
    // reaches — an opened-and-abandoned raid never gets there. The quests read
    // this same column (`lib/game/quests`), so "Knock on a door" follows it
    // rather than needing its own rule.
    const settle = RAID.slice(RAID.indexOf('await db.transaction'));
    expect(settle).toMatch(/raidsPlayed: raw`\$\{players\.raidsPlayed\} \+ 1`/);
    const post = RAID.slice(RAID.indexOf('export async function POST'), RAID.indexOf('export async function PATCH'));
    expect(post).not.toMatch(/raidsPlayed/);
    const del = RAID.slice(RAID.indexOf('export async function DELETE'));
    expect(del).not.toMatch(/raidsPlayed/);
  });

  it('writes no line in the victim log without a step', () => {
    // `raids` is the defender's history of what was done to them. It is
    // inserted in the settle transaction only; abandoning writes nothing.
    const del = RAID.slice(RAID.indexOf('export async function DELETE'));
    expect(del).not.toMatch(/tx\.insert\(raids\)|db\.insert\(raids\)/);
    const post = RAID.slice(RAID.indexOf('export async function POST'), RAID.indexOf('export async function PATCH'));
    expect(post).not.toMatch(/insert\(raids\)/);
  });

  it('does not put an intruder on the defender\'s burrow before the first step', () => {
    // The POST used to announce the raid the moment it opened, so a player who
    // opened a target to look at it and left gave the defender a live siren
    // for a crossing that never happened.
    const post = RAID.slice(RAID.indexOf('export async function POST'), RAID.indexOf('export async function PATCH'));
    expect(post).not.toMatch(/await tellDefender/);
    // The PATCH still does, on every step.
    const patch = RAID.slice(RAID.indexOf('export async function PATCH'), RAID.indexOf('export async function DELETE'));
    expect(patch).toMatch(/await tellDefender\(run\.id\)/);
  });

  it('announces a retreat only from a raid that was announced', () => {
    const del = RAID.slice(RAID.indexOf('export async function DELETE'));
    expect(del).toMatch(/if \(run\.visited\.length > 1\) await tellDefender/);
  });

  it('hides an unwalked raid from the defender\'s own fallback read', () => {
    // The push and this GET must agree, or a defender who merely loads their
    // page at the wrong moment sees the intruder the push deliberately hid.
    const INCOMING = read('../src/app/api/raid/incoming/route.ts');
    const walked = INCOMING.match(/coalesce\(array_length/g) ?? [];
    expect(walked.length).toBe(2); // the open raid, and the one just ended
  });

  it('costs the burrow the same crossing as a run, paid at the first step', () => {
    // "Pareil pour les raids" (21 September 2026): a raid used to cost the
    // burrow's bar nothing at all — its own 26-point budget paid for the walk.
    // The charge is ENERGY.RUN_COST, off the same bar, through the same
    // conditional write the join uses, and it lands on the first PATCH — so
    // opening a target to look at it stays free, and the cooldown, the
    // defender's alert and the bill all start on the same step.
    const patch = RAID.slice(RAID.indexOf('export async function PATCH'), RAID.indexOf('export async function DELETE'));
    expect(patch).toMatch(/const firstStep = run\.visited\.length <= 1;/);
    const charge = patch.slice(patch.indexOf('if (firstStep) {'), patch.indexOf('const mined ='));
    expect(charge).toMatch(/await payCrossing\(session\.sub\)/);
    expect(charge).toMatch(/error: 'no_energy'/);
    // Before any step is written, so a refused bar leaves the raid where it stood.
    expect(patch.indexOf('await payCrossing(')).toBeLessThan(patch.indexOf('const visited = [...run.visited, to]'));
  });

  it('refuses at the door, like the island, when the bar cannot afford one', () => {
    const post = RAID.slice(RAID.indexOf('export async function POST'), RAID.indexOf('export async function PATCH'));
    expect(post).toMatch(/if \(!canStartRun\(attacker, now\)\)/);
    expect(post).toMatch(/error: 'no_energy'/);
    expect(post).toMatch(/need: ENERGY\.RUN_COST/);
    // Refused, nothing is inserted: the check sits before the insert.
    expect(post.indexOf('canStartRun(')).toBeLessThan(post.indexOf('db.insert(raidRuns)'));
  });

  it('never charges the POST itself — looking stays free', () => {
    const post = RAID.slice(RAID.indexOf('export async function POST'), RAID.indexOf('export async function PATCH'));
    expect(post).not.toMatch(/payCrossing\(/);
  });

  it('is said in every language', () => {
    for (const loc of ['en', 'fr', 'zh', 'pt-BR']) {
      const dict = read(`../src/i18n/dict/${loc}.ts`);
      const block = dict.slice(dict.indexOf('raidErrors: {'), dict.indexOf('}', dict.indexOf('raidErrors: {')));
      expect(block, loc).toMatch(/no_energy: '/);
    }
  });

  it('re-reads the burrow bar once the first step has paid', () => {
    // The freshness rule (test/burrow-freshness.test.ts) seen from the raid:
    // the panel sits on the burrow beside the very bar the step just moved.
    const PAGE = read('../src/app/page.tsx');
    expect(PAGE).toMatch(/const raidCharged = \(raid\.raid\?\.walked\.length \?\? 0\) >= 2;/);
    expect(PAGE).toMatch(/if \(raidCharged\) refreshBurrowRef\.current\(\);/);
  });

  it('keeps one-raid-at-a-time, which is a different guard', () => {
    // The abandoned row is still OPEN until it ends, and that check has
    // nothing to do with the cooldown — loosening the window must not quietly
    // let someone hold two crossings at once.
    const post = RAID.slice(RAID.indexOf('export async function POST'));
    expect(post).toMatch(/isNull\(raidRuns\.endedAt\)/);
    expect(post).toMatch(/error: 'raid_in_progress'/);
  });
});

describe('the shield answers a loss, not a visit', () => {
  /**
   * 21 September 2026: "on peut se faire raid tant qu'on peut, le shield ne
   * s'active que si on s'est fait prendre du butin". The settle used to shield
   * the defender on EVERY finished raid, so a raider who died on the doorstep
   * of an empty burrow still bought its owner twelve hours of peace.
   */
  it('is granted in the settle only when loot actually left', () => {
    const settle = RAID.slice(RAID.indexOf('await db.transaction'));
    const shield = settle.slice(settle.indexOf('...(outcome.loot > 0 ? {'), settle.indexOf('}).where(eq(players.id, run.defenderId))'));
    expect(shield).toMatch(/shieldedUntil: reachedField/);
    expect(shield).toMatch(/RAID\.BROKEN_SHIELD_MS/);
    expect(shield).toMatch(/RAID_RUN\.SHIELD_AFTER_RAID_MS/);
    // And nowhere else in the settle is a shield written unconditionally.
    const unconditional = settle.replace(shield, '');
    expect(unconditional).not.toMatch(/shieldedUntil:/);
  });

  it('still grades the shield by how deep the raider got', () => {
    // Loot is the gate; depth still picks the length. A sacked field (16h)
    // outranks a raid stopped short (12h) — the ordering `BROKEN_SHIELD_MS`
    // exists to keep.
    expect(RAID_TUNING.BROKEN_SHIELD_MS).toBeGreaterThan(RAID_RUN_TUNING.SHIELD_AFTER_RAID_MS);
  });
});
