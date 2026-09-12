/**
 * The burrow's generated ground and the trap balance.
 *
 * The balance numbers here were found by simulation, not by feel, and they are
 * the kind of thing that silently rots: someone raises the raider's energy to
 * make raids feel better and defence quietly becomes decorative. These tests
 * are what makes that a deliberate change rather than an accident.
 *
 * Every layout assertion now runs over a SAMPLE OF SEEDS rather than over one
 * hand-drawn picture. That is the whole point of the change these tests
 * follow: a burrow is grown from its owner's id, so "the layout is crossable"
 * is a promise about a generator, and a generator that holds for one seed and
 * not the next is broken in the way that matters — the player whose burrow
 * cannot be raided is a real player.
 */
import { describe, expect, it } from 'vitest';
import {
  BURROW_COLS, BURROW_ROWS, burrowIndex, burrowTilePos, burrowScreenToTile,
} from '../src/config/burrowConfig';
import {
  burrowCell, burrowNeighbors, entranceTile, fieldTiles, isTrappable,
  isWalkable, shortestRaidPath, walkableTiles,
} from '../src/game/burrow/board';
import { MIN_CROSSING } from '../src/game/burrow/generate';
import { RAID, RAID_RUN, TRAPS } from '../config/tuning';
import { distanceToField, settleRaid } from '../src/lib/game/raid';

/**
 * The seeds every layout promise is checked against.
 *
 * Shaped like the ids the game actually uses — a wallet address and a guest
 * uuid — rather than "a", "b", "c": the seed is hashed, so the character of
 * the strings does not matter mathematically, but a sample that looks like
 * production is the one that would catch a hashing change that collapses real
 * ids together.
 */
const SEEDS = [
  'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk',
  'sol:DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
  'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b',
  'guest:8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d',
  'player-1',
  'player-2',
  'player-3',
] as const;

/** Run one assertion over every sample burrow, naming the seed that failed. */
const forEachBurrow = (name: string, check: (seed: string) => void) =>
  it(name, () => {
    for (const seed of SEEDS) {
      try {
        check(seed);
      } catch (err) {
        throw new Error(`seed "${seed}": ${(err as Error).message}`);
      }
    }
  });

describe('burrow layout', () => {
  forEachBurrow('has exactly one entrance and a field to reach', (seed) => {
    const entrances = walkableTiles(seed).filter((i) => burrowCell(seed, i) === 'entrance');
    expect(entrances).toHaveLength(1);
    expect(fieldTiles(seed).length).toBeGreaterThan(0);
  });

  forEachBurrow('lets a raider actually reach the field', (seed) => {
    // A burrow nobody can cross is not a burrow, it is a wall.
    expect(shortestRaidPath(seed)).toBeLessThan(Infinity);
  });

  forEachBurrow('makes the crossing long enough to be worth defending', (seed) => {
    // Too short and trap placement stops mattering: there is no route to choose.
    expect(shortestRaidPath(seed)).toBeGreaterThanOrEqual(MIN_CROSSING);
  });

  forEachBurrow('lets the defender mine every tile a rabbit can walk on', (seed) => {
    // The rule a player can learn in one sentence, and the reason `cells.ts`
    // exists: walkable and minable are the same answer, so the board can never
    // offer a tile the server then refuses.
    //
    // The field and the entrance used to be carved out — a bomb on the
    // objective was called a coin flip on the last step, one on the entrance a
    // raid that dies before it begins. What the exclusions actually did was
    // fence off the two areas a defender most wants to defend, on a board that
    // could not explain why those tiles ignored a tap. MAX_PLACED is what
    // keeps a burrow from becoming a maze, whatever the bombs sit on.
    for (const t of walkableTiles(seed)) expect(isTrappable(seed, t)).toBe(true);
    for (const i of fieldTiles(seed)) expect(isTrappable(seed, i)).toBe(true);
    expect(isTrappable(seed, entranceTile(seed))).toBe(true);
  });

  forEachBurrow('still refuses a tile that is not on the board at all', (seed) => {
    // The other half of the rule, and the half that is a SECURITY check: the
    // tile index arrives off the wire, so a wall, a negative and a number past
    // the end all have to be refused rather than trusted.
    const walls = [...Array(BURROW_COLS * BURROW_ROWS).keys()]
      .filter((t) => burrowCell(seed, t) === 'blocked');
    for (const t of walls) expect(isTrappable(seed, t)).toBe(false);
    for (const bad of [-1, 1.5, NaN, BURROW_COLS * BURROW_ROWS]) {
      expect(isTrappable(seed, bad)).toBe(false);
    }
  });

  forEachBurrow('keeps every walkable tile connected to the entrance', (seed) => {
    const seen = new Set([entranceTile(seed)]);
    const queue = [entranceTile(seed)];
    while (queue.length) {
      for (const n of burrowNeighbors(seed, queue.pop()!)) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    // An island of ground a raider can never reach is wasted trap budget.
    expect(seen.size).toBe(walkableTiles(seed).length);
  });

  forEachBurrow('gives the defender real ground to mine', (seed) => {
    // Traps are the only defence there is. A homestead with a handful of
    // trappable tiles makes placement a formality rather than a decision.
    const minable = walkableTiles(seed).filter((t) => isTrappable(seed, t));
    expect(minable.length).toBeGreaterThan(TRAPS.MAX_PLACED * 4);
  });

  it('grows a DIFFERENT burrow for a different player', () => {
    // The reason the ground is generated at all: two burrows must not be the
    // same place with the traps moved, or a raider learns one crossing and
    // reuses it on everybody.
    const shapes = SEEDS.map((s) => walkableTiles(s).join(','));
    expect(new Set(shapes).size).toBe(SEEDS.length);
  });

  it('grows the SAME burrow for one player, every time', () => {
    // The client draws this and the server validates against it, both from the
    // seed alone. Two answers to that question is the bug the whole design
    // exists to make impossible.
    for (const seed of SEEDS) {
      expect(walkableTiles(seed)).toEqual(walkableTiles(seed));
      expect(entranceTile(seed)).toBe(entranceTile(seed));
    }
  });

  it('round-trips tile to screen and back', () => {
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      const { x, y } = burrowTilePos(i);
      expect(burrowScreenToTile(x, y)).toBe(i);
    }
  });

  forEachBurrow('treats off-board coordinates as off-board', (seed) => {
    expect(burrowScreenToTile(-9999, -9999)).toBeNull();
    // Off the end of the grid, and a non-integer off the wire: both have to be
    // refused rather than throw, since these are called with numbers a client
    // chose.
    expect(isWalkable(seed, BURROW_COLS * BURROW_ROWS)).toBe(false);
    expect(isWalkable(seed, -1)).toBe(false);
    expect(isWalkable(seed, 1.5)).toBe(false);
    expect(burrowIndex(0, 0)).toBe(0);
  });
});

/**
 * A raider that heads for the field without being able to see traps, learning
 * only from the ones that go off. Returns WHERE IT STOPPED, because a raid is
 * now scored by depth rather than by success.
 */
function walkRaid(seed: string, traps: ReadonlySet<number>): number {
  const dist = distanceToField(seed);
  const goal = new Set(fieldTiles(seed));
  let at = entranceTile(seed);
  let energy = RAID_RUN.START_ENERGY;
  const seen = new Set([at]);
  const burned = new Set<number>();

  for (let i = 0; i < 80; i++) {
    if (goal.has(at)) return at;
    const options = burrowNeighbors(seed, at).filter((n) => !seen.has(n));
    if (options.length === 0) return at;
    // Head for the field, but step around the neighbourhood of a sprung trap.
    const scored = options.map((n) => ({
      n,
      s: (dist.get(n) ?? 99) +
        ([...burned].some((b) => burrowNeighbors(seed, b).includes(n)) ? 2 : 0),
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
function busiestTiles(seed: string, n: number): Set<number> {
  const dist = distanceToField(seed);
  const goal = new Set(fieldTiles(seed));
  const traffic = new Map<number, number>();

  for (let run = 0; run < 1200; run++) {
    let at = entranceTile(seed);
    const seen = new Set([at]);
    for (let i = 0; i < 60 && !goal.has(at); i++) {
      const here = dist.get(at) ?? 99;
      const options = burrowNeighbors(seed, at)
        .filter((nb) => !seen.has(nb) && (dist.get(nb) ?? 99) < here);
      if (!options.length) break;
      at = options[Math.floor(Math.random() * options.length)];
      seen.add(at);
      if (isTrappable(seed, at)) traffic.set(at, (traffic.get(at) ?? 0) + 1);
    }
  }
  return new Set(
    walkableTiles(seed).filter((t) => isTrappable(seed, t))
      .sort((a, b) => (traffic.get(b) ?? 0) - (traffic.get(a) ?? 0))
      .slice(0, n),
  );
}

const STOCK = 10_000;

/**
 * Average carrots a raid takes from a burrow defended by `placed` traps.
 *
 * Averaged across the sample of SEEDS as well as across runs. The balance is a
 * promise about the generator, not about one homestead: a trap ladder that
 * slopes nicely on one island and cliffs on another is exactly the failure the
 * old single-layout test could not see.
 */
function averageLoot(placed: number, runsPerSeed = 60): number {
  let total = 0;
  let runs = 0;
  for (const seed of SEEDS) {
    const traps = busiestTiles(seed, placed);
    const dist = distanceToField(seed);
    for (let i = 0; i < runsPerSeed; i++) {
      total += settleRaid({
        seed,
        endedAt: walkRaid(seed, traps),
        defenderStock: STOCK,
        defenderHp: 600,
        defenderLevel: 6,
        shielded: false,
      }, Math.random, dist).loot;
      runs++;
    }
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
  const SEED = SEEDS[0];
  const reached = () => fieldTiles(SEED)[0];

  it('gives a shielded defender total protection', () => {
    // Anything less invites the farming the shield exists to prevent.
    const out = settleRaid({
      seed: SEED, endedAt: reached(), defenderStock: STOCK,
      defenderHp: 600, defenderLevel: 6, shielded: true,
    });
    expect(out.loot).toBe(0);
    expect(out.damage).toBe(0);
  });

  it('caps a single haul, so a whale cannot be emptied in one hit', () => {
    const out = settleRaid({
      seed: SEED, endedAt: reached(), defenderStock: 10_000_000,
      defenderHp: 600, defenderLevel: 6, shielded: false,
    });
    expect(out.loot).toBeLessThanOrEqual(RAID.LOOT_CAP);
  });

  it('never deals more damage than the burrow has left', () => {
    const out = settleRaid({
      seed: SEED, endedAt: reached(), defenderStock: STOCK,
      defenderHp: 5, defenderLevel: 6, shielded: false,
    });
    expect(out.damage).toBeLessThanOrEqual(5);
  });

  it('pays the crown holder\'s raider more — heavy is the head', () => {
    const base = {
      seed: SEED, endedAt: reached(), defenderStock: STOCK,
      defenderHp: 600, defenderLevel: 6, shielded: false,
    };
    const plain = settleRaid(base, () => 0.5);
    const crown = settleRaid({ ...base, crowned: true }, () => 0.5);
    expect(crown.loot).toBeGreaterThan(plain.loot);
  });

  it('is reproducible for a given roll — a disputed haul can be replayed', () => {
    const base = {
      seed: SEED, endedAt: reached(), defenderStock: STOCK,
      defenderHp: 600, defenderLevel: 6, shielded: false,
    };
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
