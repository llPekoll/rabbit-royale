/**
 * The arming clock: a sprung trap is repaired, not replaced.
 *
 * This is the rule the GDD always stated ("repairs and defense re-setup are
 * free. Always", and `pay-to-repair` in the rejected list) and the code did
 * not: a sprung trap used to be deleted, so a defender bought their ground
 * back every morning at the daily allowance's pace while losing it at the
 * attackers' pace. The asymmetry is the churn, and these tests pin the shape
 * that removes it.
 */
import { describe, expect, it } from 'vitest';
import { TRAPS } from '../config/tuning';
import { armedTraps, isArmed, rearmAt, rearmingTraps } from '../src/lib/game/traps';

const ago = (ms: number) => new Date(Date.now() - ms);
const HOUR = 3_600_000;

describe('isArmed', () => {
  it('counts a trap that was never sprung', () => {
    expect(isArmed({ tile: 4 })).toBe(true);
    expect(isArmed({ tile: 4, sprungAt: null })).toBe(true);
  });

  it('keeps a freshly sprung trap down', () => {
    expect(isArmed({ tile: 4, sprungAt: ago(0) })).toBe(false);
  });

  it('brings it back once the rearm window has passed', () => {
    expect(isArmed({ tile: 4, sprungAt: ago(TRAPS.REARM_MS + 1000) })).toBe(true);
  });

  it('holds it down right up to the boundary', () => {
    // A trap that came back a second early would be a trap the raider's clues
    // did not warn about, which is the one thing the board may never do.
    expect(isArmed({ tile: 4, sprungAt: ago(TRAPS.REARM_MS - 1000) })).toBe(false);
  });
});

describe('the stagger', () => {
  /**
   * The reason rearming is not a single tick. A board that snaps from bare to
   * full the moment the owner logs in makes the second raider's crossing
   * meaningless, and reads to the owner as a switch rather than a recovery.
   */
  it('brings a fully sprung board back ONE trap at a time', () => {
    // Four traps sprung in the same raid, so only the stagger separates them.
    const sprungAt = ago(TRAPS.REARM_MS + 1000);
    const board = [0, 1, 2, 3].map((tile) => ({ tile, sprungAt }));

    const up = armedTraps(board).length;
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(board.length);
  });

  it('restores the trap that went down FIRST, first', () => {
    // The only order an owner watching their burrow could predict.
    const board = [
      { tile: 1, sprungAt: ago(TRAPS.REARM_MS + 1000) },
      { tile: 2, sprungAt: ago(TRAPS.REARM_MS - HOUR) },
    ];
    expect(armedTraps(board).map((t) => t.tile)).toEqual([1]);
  });

  it('ranks by when each was sprung, not by tile order', () => {
    // Same set, listed backwards: the answer may not change.
    const early = { tile: 9, sprungAt: ago(TRAPS.REARM_MS + 1000) };
    const late = { tile: 2, sprungAt: ago(TRAPS.REARM_MS - HOUR) };
    expect(armedTraps([early, late]).map((t) => t.tile))
      .toEqual(armedTraps([late, early]).map((t) => t.tile));
  });

  it('eventually brings the whole board back', () => {
    // However long the queue, waiting is always enough — a trap can never be
    // stranded down, which would be the deletion bug with extra steps.
    const sprungAt = ago(TRAPS.REARM_MS + 8 * TRAPS.REARM_STAGGER_MS + 1000);
    const board = Array.from({ length: TRAPS.MAX_PLACED }, (_, tile) => ({ tile, sprungAt }));
    expect(armedTraps(board)).toHaveLength(TRAPS.MAX_PLACED);
  });

  it('spaces each rank by exactly one stagger', () => {
    const sprungAt = ago(0);
    expect(rearmAt(sprungAt, 1) - rearmAt(sprungAt, 0)).toBe(TRAPS.REARM_STAGGER_MS);
  });
});

describe('armedTraps', () => {
  it('is what both the clues and the damage roll read', () => {
    // THE invariant: the board a raider reads and the board the server settles
    // against are the same board, because they come from the same call.
    const board = [
      { tile: 1 },
      { tile: 2, sprungAt: ago(0) },
      { tile: 3, sprungAt: ago(TRAPS.REARM_MS + 1000) },
    ];
    const armed = armedTraps(board).map((t) => t.tile);
    expect(armed).toContain(1);
    expect(armed).not.toContain(2);
  });

  it('leaves an all-armed board untouched', () => {
    const board = [{ tile: 1 }, { tile: 2 }, { tile: 3 }];
    expect(armedTraps(board)).toHaveLength(3);
  });

  it('holds down a board sprung a moment ago, whatever its size', () => {
    const board = Array.from({ length: TRAPS.MAX_PLACED }, (_, tile) => ({
      tile, sprungAt: ago(0),
    }));
    expect(armedTraps(board)).toHaveLength(0);
  });
});

describe('rearmingTraps — what the owner is shown', () => {
  it('lists only the traps still down, soonest first', () => {
    const board = [
      { tile: 1 },
      { tile: 2, sprungAt: ago(HOUR) },
      { tile: 3, sprungAt: ago(2 * HOUR) },
    ];
    const out = rearmingTraps(board);
    expect(out.map((r) => r.trap.tile)).toEqual([3, 2]);
    expect(out[0].readyAt).toBeLessThan(out[1].readyAt);
  });

  it('says nothing about a board that is fully up', () => {
    expect(rearmingTraps([{ tile: 1 }, { tile: 2 }])).toHaveLength(0);
  });

  it('never lists a trap that armedTraps calls standing', () => {
    // The two views are complements: a trap is in exactly one of them, or the
    // burrow screen would report a total that does not add up.
    const sprungAt = ago(TRAPS.REARM_MS + 1000);
    const board = [0, 1, 2, 3].map((tile) => ({ tile, sprungAt }));
    const armed = new Set(armedTraps(board).map((t) => t.tile));
    for (const { trap } of rearmingTraps(board)) expect(armed.has(trap.tile)).toBe(false);
    expect(armed.size + rearmingTraps(board).length).toBe(board.length);
  });
});

/**
 * The economics the clock exists to fix. A defender must not be able to lose
 * ground faster than they can get it back, and must not be able to buy the
 * clock off either.
 */
describe('the anti-churn property', () => {
  it('costs the owner nothing to restore a sprung trap', () => {
    // The whole point: the tile keeps its trap. There is no allowance to spend
    // and no carrot to pay — waiting is the entire price.
    const trap = { tile: 5, sprungAt: ago(0) };
    expect(isArmed(trap)).toBe(false);
    expect(isArmed(trap, Date.now() + TRAPS.REARM_MS + 1000)).toBe(true);
  });

  it('restarts the clock on a trap sprung twice', () => {
    // Camping a known tile costs the raider the full rearm every time, not
    // just the first — otherwise a second raider walks the same corridor free.
    const first = ago(TRAPS.REARM_MS + 1000);
    const again = ago(0);
    expect(isArmed({ tile: 5, sprungAt: first })).toBe(true);
    expect(isArmed({ tile: 5, sprungAt: again })).toBe(false);
  });

  it('brings a raided board back well inside a night away', () => {
    // The number that matters for churn: a player raided at bedtime must not
    // wake up to a bare burrow. A full board takes REARM + (n-1) * STAGGER.
    const worst = TRAPS.REARM_MS + (TRAPS.MAX_PLACED - 1) * TRAPS.REARM_STAGGER_MS;
    expect(worst).toBeLessThan(8 * HOUR);
  });
});
