/**
 * The burrow's layout and the trap balance.
 *
 * The balance numbers here were found by simulation, not by feel, and they are
 * the kind of thing that silently rots: someone raises the raider's energy to
 * make raids feel better and defence quietly becomes decorative. These tests
 * are what makes that a deliberate change rather than an accident.
 */
import { describe, expect, it } from 'vitest';
import {
  BURROW_COLS, BURROW_ROWS, burrowCell, burrowIndex, burrowNeighbors,
  burrowTilePos, burrowScreenToTile, entranceTile, fieldTiles, isTrappable,
  isWalkable, shortestRaidPath, walkableTiles,
} from '../src/config/burrowConfig';
import { RAID_RUN, TRAPS } from '../config/tuning';

describe('burrow layout', () => {
  it('has exactly one entrance and a field to reach', () => {
    const entrances = walkableTiles().filter((i) => burrowCell(i) === 'entrance');
    expect(entrances).toHaveLength(1);
    expect(fieldTiles().length).toBeGreaterThan(0);
  });

  it('lets a raider actually reach the field', () => {
    // A burrow nobody can cross is not a burrow, it is a wall.
    expect(shortestRaidPath()).toBeLessThan(Infinity);
  });

  it('makes the crossing long enough to be worth defending', () => {
    // Too short and trap placement stops mattering: there is no route to choose.
    expect(shortestRaidPath()).toBeGreaterThanOrEqual(6);
  });

  it('never lets a trap sit on the field or the entrance', () => {
    // A trap on the objective makes every raid a coin flip on the last step; a
    // trap on the entrance ends a raid before it starts.
    for (const i of fieldTiles()) expect(isTrappable(i)).toBe(false);
    expect(isTrappable(entranceTile())).toBe(false);
  });

  it('keeps every walkable tile connected to the entrance', () => {
    const seen = new Set([entranceTile()]);
    const queue = [entranceTile()];
    while (queue.length) {
      for (const n of burrowNeighbors(queue.pop()!)) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    // An island of ground a raider can never reach is wasted trap budget.
    expect(seen.size).toBe(walkableTiles().length);
  });

  it('round-trips tile to screen and back', () => {
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      const { x, y } = burrowTilePos(i);
      expect(burrowScreenToTile(x, y)).toBe(i);
    }
  });

  it('treats off-board coordinates as off-board', () => {
    expect(burrowScreenToTile(-9999, -9999)).toBeNull();
    expect(isWalkable(burrowIndex(0, 0))).toBe(false); // corner is scenery
  });
});

/**
 * A raider that heads for the field without being able to see traps, breaking
 * ties at random. Deterministic tie-breaking would let it thread the same safe
 * lane every time, which is an oracle, not a raider.
 */
function simulateRaid(traps: ReadonlySet<number>, rng: () => number): boolean {
  const goal = new Set(fieldTiles());
  const dist = new Map<number, number>();
  let frontier = [...goal];
  for (const t of frontier) dist.set(t, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next: number[] = [];
    for (const t of frontier) for (const n of burrowNeighbors(t)) {
      if (dist.has(n)) continue;
      dist.set(n, d);
      next.push(n);
    }
    frontier = next;
  }

  let at = entranceTile();
  let energy = RAID_RUN.START_ENERGY;
  const seen = new Set([at]);
  for (let i = 0; i < 60; i++) {
    if (goal.has(at)) return true;
    const options = burrowNeighbors(at).filter((n) => !seen.has(n));
    if (options.length === 0) return false;
    const best = Math.min(...options.map((n) => dist.get(n) ?? 99));
    const tied = options.filter((n) => (dist.get(n) ?? 99) === best);
    at = tied[Math.floor(rng() * tied.length)];
    seen.add(at);
    energy -= RAID_RUN.STEP_COST;
    if (traps.has(at)) energy -= TRAPS.DRAIN;
    if (energy <= 0) return false;
  }
  return false;
}

/** Where a competent owner mines: the tiles the most routes run through. */
function busiestTiles(n: number): Set<number> {
  const goal = new Set(fieldTiles());
  const dist = new Map<number, number>();
  let frontier = [...goal];
  for (const t of frontier) dist.set(t, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next: number[] = [];
    for (const t of frontier) for (const nb of burrowNeighbors(t)) {
      if (dist.has(nb)) continue;
      dist.set(nb, d);
      next.push(nb);
    }
    frontier = next;
  }

  const traffic = new Map<number, number>();
  for (let run = 0; run < 2000; run++) {
    let at = entranceTile();
    const seen = new Set([at]);
    for (let i = 0; i < 40 && !goal.has(at); i++) {
      const here = dist.get(at) ?? 99;
      const options = burrowNeighbors(at)
        .filter((nb) => !seen.has(nb) && (dist.get(nb) ?? 99) < here);
      if (!options.length) break;
      at = options[Math.floor(Math.random() * options.length)];
      seen.add(at);
      if (isTrappable(at)) traffic.set(at, (traffic.get(at) ?? 0) + 1);
    }
  }
  return new Set(
    walkableTiles().filter(isTrappable)
      .sort((a, b) => (traffic.get(b) ?? 0) - (traffic.get(a) ?? 0))
      .slice(0, n),
  );
}

const successRate = (placed: number, runs = 400) => {
  let wins = 0;
  const traps = busiestTiles(placed);
  for (let i = 0; i < runs; i++) if (simulateRaid(traps, Math.random)) wins++;
  return wins / runs;
};

describe('trap balance', () => {
  it('lets every raid through an UNDEFENDED burrow', () => {
    // Doing nothing must cost you. Otherwise there is no reason to place traps.
    expect(successRate(0)).toBe(1);
  });

  it('never makes a burrow impregnable', () => {
    // A defence that always holds ends the attacking half of the game, and the
    // whole revenge loop with it.
    expect(successRate(TRAPS.MAX_PLACED)).toBeGreaterThan(0.05);
  });

  it('makes each trap actually lower the odds', () => {
    const none = successRate(0);
    const some = successRate(4);
    const many = successRate(TRAPS.MAX_PLACED);
    expect(some).toBeLessThan(none);
    expect(many).toBeLessThan(some);
  });

  it('keeps a full defence meaningfully strong', () => {
    // Loose bounds on purpose: this asserts the SHAPE of the curve, not a
    // frozen percentage, so retuning stays possible without a red suite.
    expect(successRate(TRAPS.MAX_PLACED)).toBeLessThan(0.55);
  });
});

describe('trap economy', () => {
  it('cannot place more traps than a player can hold', () => {
    expect(TRAPS.MAX_PLACED).toBeLessThanOrEqual(TRAPS.MAX_HELD);
  });

  it('gives a free allowance that refills over a real day', () => {
    expect(TRAPS.FREE_PER_DAY).toBeGreaterThan(0);
    expect(TRAPS.REFILL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
