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
import { ENERGY, OUT_OF_RUN_ENERGY } from '../config/tuning';

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

  it('is keyed on tiles dug, not on carrots banked', () => {
    // An unlucky run that turned up nothing but dirt HAPPENED and stays paid
    // for; keying this on the haul would refund every board that failed to pay
    // out, which is a different — and much worse — game.
    const bank = SERVER.slice(SERVER.indexOf('async function bankRun'));
    expect(bank).toMatch(/const refunded = run\.tilesDug === 0;/);
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

  it('keeps one-raid-at-a-time, which is a different guard', () => {
    // The abandoned row is still OPEN until it ends, and that check has
    // nothing to do with the cooldown — loosening the window must not quietly
    // let someone hold two crossings at once.
    const post = RAID.slice(RAID.indexOf('export async function POST'));
    expect(post).toMatch(/isNull\(raidRuns\.endedAt\)/);
    expect(post).toMatch(/error: 'raid_in_progress'/);
  });
});
