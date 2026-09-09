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
import { RAID, RAID_RUN, TRAPS } from '../config/tuning';
import { distanceToField, settleRaid } from '../src/lib/game/raid';

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
 * A raider that heads for the field without being able to see traps, learning
 * only from the ones that go off. Returns WHERE IT STOPPED, because a raid is
 * now scored by depth rather than by success.
 */
function walkRaid(traps: ReadonlySet<number>): number {
  const dist = distanceToField();
  const goal = new Set(fieldTiles());
  let at = entranceTile();
  let energy = RAID_RUN.START_ENERGY;
  const seen = new Set([at]);
  const burned = new Set<number>();

  for (let i = 0; i < 80; i++) {
    if (goal.has(at)) return at;
    const options = burrowNeighbors(at).filter((n) => !seen.has(n));
    if (options.length === 0) return at;
    // Head for the field, but step around the neighbourhood of a sprung trap.
    const scored = options.map((n) => ({
      n,
      s: (dist.get(n) ?? 99) +
        ([...burned].some((b) => burrowNeighbors(b).includes(n)) ? 2 : 0),
    }));
    const best = Math.min(...scored.map((o) => o.s));
    const tied = scored.filter((o) => o.s === best);
    const next = tied[Math.floor(Math.random() * tied.length)].n;

    const cost = RAID_RUN.STEP_COST + (traps.has(next) ? TRAPS.DRAIN : 0);
    if (energy - cost <= 0) return at;   // out of energy: this is where it ends
    at = next;
    seen.add(at);
    energy -= cost;
    if (traps.has(at)) burned.add(at);
  }
  return at;
}

/** Where a competent owner mines: the tiles the most routes run through. */
function busiestTiles(n: number): Set<number> {
  const dist = distanceToField();
  const goal = new Set(fieldTiles());
  const traffic = new Map<number, number>();

  for (let run = 0; run < 1200; run++) {
    let at = entranceTile();
    const seen = new Set([at]);
    for (let i = 0; i < 60 && !goal.has(at); i++) {
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

const STOCK = 10_000;

/** Average carrots a raid takes from a burrow defended by `placed` traps. */
function averageLoot(placed: number, runs = 200): number {
  const traps = busiestTiles(placed);
  const dist = distanceToField();
  let total = 0;
  for (let i = 0; i < runs; i++) {
    total += settleRaid({
      endedAt: walkRaid(traps),
      defenderStock: STOCK,
      defenderHp: 600,
      defenderLevel: 6,
      shielded: false,
    }, Math.random, dist).loot;
  }
  return total / runs;
}

describe('raid loot', () => {
  it('pays the full share when nothing defends the burrow', () => {
    // Doing nothing must cost you, or there is no reason to place traps.
    expect(averageLoot(0)).toBeCloseTo(STOCK * RAID_RUN.LOOT_SHARE, -2);
  });

  it('pays LESS the better the burrow is defended', () => {
    // The whole point of moving to depth-based loot: a slope, not a threshold.
    const none = averageLoot(0);
    const some = averageLoot(4);
    const many = averageLoot(TRAPS.MAX_PLACED);
    expect(some).toBeLessThan(none);
    expect(many).toBeLessThan(some);
  });

  it('never pays nothing — attacking a fortress is still worth doing', () => {
    // A raid that returns empty-handed teaches the player to stop attacking,
    // and the PvP loop dies with that lesson.
    expect(averageLoot(TRAPS.MAX_PLACED)).toBeGreaterThan(0);
  });

  it('cannot be turned back into a cliff by the numbers', () => {
    // Every step of the ladder differs from the last: no plateau, no wall.
    const ladder = [0, 3, 5, TRAPS.MAX_PLACED].map((n) => averageLoot(n));
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeLessThan(ladder[i - 1]);
    }
  });
});

describe('settleRaid', () => {
  it('gives a shielded defender total protection', () => {
    // Anything less invites the farming the shield exists to prevent.
    const out = settleRaid({
      endedAt: fieldTiles()[0], defenderStock: STOCK,
      defenderHp: 600, defenderLevel: 6, shielded: true,
    });
    expect(out.loot).toBe(0);
    expect(out.damage).toBe(0);
  });

  it('caps a single haul, so a whale cannot be emptied in one hit', () => {
    const out = settleRaid({
      endedAt: fieldTiles()[0], defenderStock: 10_000_000,
      defenderHp: 600, defenderLevel: 6, shielded: false,
    });
    expect(out.loot).toBeLessThanOrEqual(RAID.LOOT_CAP);
  });

  it('never deals more damage than the burrow has left', () => {
    const out = settleRaid({
      endedAt: fieldTiles()[0], defenderStock: STOCK,
      defenderHp: 5, defenderLevel: 6, shielded: false,
    });
    expect(out.damage).toBeLessThanOrEqual(5);
  });

  it('pays the crown holder\'s raider more — heavy is the head', () => {
    const base = { endedAt: fieldTiles()[0], defenderStock: STOCK, defenderHp: 600, defenderLevel: 6, shielded: false };
    const plain = settleRaid(base, () => 0.5);
    const crown = settleRaid({ ...base, crowned: true }, () => 0.5);
    expect(crown.loot).toBeGreaterThan(plain.loot);
  });

  it('is reproducible for a given roll — a disputed haul can be replayed', () => {
    const base = { endedAt: fieldTiles()[0], defenderStock: STOCK, defenderHp: 600, defenderLevel: 6, shielded: false };
    expect(settleRaid(base, () => 0.42)).toEqual(settleRaid(base, () => 0.42));
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
