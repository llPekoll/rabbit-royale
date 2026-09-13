/**
 * The climb target on the carrot pill: how far to the place above.
 *
 * This number is shown as a goal — "340 to pass" — so it has to be the real
 * distance to the real player ahead, in the unit the ranking is actually made
 * of. The cases that matter are the edges: the leader has nobody to chase, an
 * unranked player is not on the board at all, a tie is zero rather than
 * negative, and a missing Redis degrades to "no line" rather than to a throw.
 *
 * `gapToNextRank` talks to Redis, so these tests stand a fake in its place:
 * what is being checked is the ARITHMETIC and the edge handling, not that the
 * Redis client works.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { gapToNextRank } from '../src/lib/leaderboard';

/** A sorted set, as much of it as `gapToNextRank` uses. */
function fakeRedis(scores: Array<[string, number]>) {
  // Highest first, which is what REV order means.
  const desc = [...scores].sort((a, b) => b[1] - a[1]);
  return {
    zRevRank: async (_k: string, id: string) => {
      const i = desc.findIndex(([p]) => p === id);
      return i === -1 ? null : i;
    },
    zScore: async (_k: string, id: string) =>
      desc.find(([p]) => p === id)?.[1] ?? null,
    zRangeWithScores: async (_k: string, from: number, to: number) =>
      desc.slice(from, to + 1).map(([value, score]) => ({ value, score })),
  };
}

const BOARD: Array<[string, number]> = [
  ['alice', 6483],
  ['bob', 3144],
  ['carol', 1036],
  ['dave', 696],
  ['erin', 696], // ties with dave, on purpose
  ['frank', 0],
];

/* The fake is passed IN rather than mocked over the module.
   `gapToNextRank` calls its own module-local `redis()`, which `vi.mock` on the
   module's exports cannot intercept — the first version of this file did that
   and every case came back null, which would have looked like a broken
   function rather than a broken test. The function takes the client as an
   optional argument instead; production still passes nothing. */
let board = fakeRedis(BOARD);
beforeEach(() => { board = fakeRedis(BOARD); });

describe('gap to next rank', () => {
  it('is the distance to the player one place ahead', async () => {
    // carol is #3 on 1036; bob is #2 on 3144.
    expect(await gapToNextRank(1, 'carol', board)).toEqual({ rank: 3, gap: 3144 - 1036 });
  });

  it('reports the rank alongside it, 1-based', async () => {
    expect((await gapToNextRank(1, 'bob', board))?.rank).toBe(2);
    expect((await gapToNextRank(1, 'frank', board))?.rank).toBe(6);
  });

  /**
   * The leader has nothing to chase, and a "0 to pass" on the #1 row would
   * read as "you are one point away" rather than "you are first".
   */
  it('is null for the leader', async () => {
    expect(await gapToNextRank(1, 'alice', board)).toBeNull();
  });

  it('is null for a player who is not on the board', async () => {
    expect(await gapToNextRank(1, 'nobody', board)).toBeNull();
  });

  /**
   * Ties are 0, never negative: two players on the same score are level, and
   * a negative target would render as "-0 to pass".
   */
  it('is 0 on a tie, never negative', async () => {
    const tied = await gapToNextRank(1, 'erin', board);
    expect(tied?.gap).toBe(0);
    expect(tied!.gap).toBeGreaterThanOrEqual(0);
  });

  /**
   * No Redis is the local and phase-1 case — the pill simply shows no rank
   * line. It must not throw: the counter above it is not optional.
   */
  it('is null when there is no Redis', async () => {
    expect(await gapToNextRank(1, 'carol', null)).toBeNull();
  });

  /** Fractional scores round UP: 0.4 short is still short. */
  it('rounds a fractional gap up, so "to pass" really passes', async () => {
    const tight = fakeRedis([['x', 10.4], ['y', 10]]);
    expect((await gapToNextRank(1, 'y', tight))?.gap).toBe(1);
  });
});
