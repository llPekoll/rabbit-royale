/**
 * The rule set. Every number comes from tuning.ts on purpose — these tests
 * assert BEHAVIOUR (walking is free, a bomb leaves you in its crater, the first digger is
 * paid), never a literal, so retuning during a playtest does not turn the suite
 * red for no reason.
 */
import { describe, expect, it } from 'vitest';
import { BOMB, ENERGY, MULTIPLAYER, RUN } from '../config/tuning';
import { generateIsland } from '../src/lib/game/island';
import { resolveMove, spawnRabbit, isAdjacent } from '../src/lib/game/run';
import { COLS, ROWS, SPAWN_INDEX, makeShape, neighbors } from '../src/config/gridConfig';
import { mulberry32 } from '../src/lib/game/rng';
import type { Island } from '../src/lib/game/types';

const SEED = 'test';
const shape = makeShape(SEED);
const rng = () => mulberry32(1);

/** A blank island with known contents — generation is tested elsewhere. */
function blank(): Island {
  const island = generateIsland({ seed: SEED });
  for (const tile of island.tiles.values()) {
    tile.content = 'empty';
    tile.revealed = false;
    tile.adjacent = 0;
  }
  island.dugCount = 0;
  return island;
}

/** Move at a time the anti-speedhack gate always accepts. */
let clock = 1_000_000;
const soon = () => (clock += MULTIPLAYER.MIN_MOVE_INTERVAL_MS + 10);

/** A neighbour of the spawn — the tile a test steps onto. */
const step = () => neighbors(SPAWN_INDEX, shape)[0];

describe('resolveMove', () => {
  it('charges energy to dig and reveals the tile', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    const to = step();
    const before = rabbit.energy;

    const out = resolveMove(island, rabbit, to, shape, rng(), soon());
    expect(out.ok).toBe(true);
    expect(rabbit.energy).toBe(before - ENERGY.DIG_COST);
    expect(island.tiles.get(to)!.revealed).toBe(true);
    expect(rabbit.tile).toBe(to);
  });

  it('walks revealed ground for free', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    const to = step();
    island.tiles.get(to)!.revealed = true;

    const before = rabbit.energy;
    resolveMove(island, rabbit, to, shape, rng(), soon());
    expect(rabbit.energy).toBe(before);
  });

  it('pays energy and a carrot for a carrot tile', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    const to = step();
    island.tiles.get(to)!.content = 'carrot';

    const before = rabbit.energy;
    resolveMove(island, rabbit, to, shape, rng(), soon());
    expect(rabbit.energy).toBe(before - ENERGY.DIG_COST + ENERGY.CARROT_GAIN);
    expect(rabbit.carrots).toBe(RUN.CARROT_VALUE);
  });

  it('caps energy at the ceiling', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test', ENERGY.MAX);
    const to = step();
    island.tiles.get(to)!.content = 'golden';

    resolveMove(island, rabbit, to, shape, rng(), soon());
    expect(rabbit.energy).toBeLessThanOrEqual(ENERGY.MAX);
  });

  it('stuns on a bomb and leaves the rabbit in the crater', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    const bomb = step();
    island.tiles.get(bomb)!.content = 'bomb';

    const before = rabbit.energy;
    const now = soon();
    const out = resolveMove(island, rabbit, bomb, shape, rng(), now);

    expect(rabbit.energy).toBe(before - ENERGY.DIG_COST - ENERGY.BOMB_LOSS);
    // The rabbit ENDS UP on the tile it dug — a step that cost a bomb. It
    // used to be thrown a cell back, which put the crater between the player
    // and their rabbit and read as a two-cell shove; see `run.ts`.
    expect(rabbit.tile).toBe(bomb);
    expect(rabbit.stunnedUntil).toBe(now + BOMB.STUN_MS);
    expect(out.dig?.knockback?.tile).toBe(rabbit.tile);
  });

  it('ignores input while stunned', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    rabbit.stunnedUntil = 5_000;
    const out = resolveMove(island, rabbit, step(), shape, rng(), 4_000);
    expect(out.ok).toBe(false);
    expect(out.rejection).toBe('stunned');
  });

  it('rejects moves faster than a human can make them', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    const t = soon();
    resolveMove(island, rabbit, step(), shape, rng(), t);
    const out = resolveMove(island, rabbit, SPAWN_INDEX, shape, rng(), t + 1);
    expect(out.ok).toBe(false);
    expect(out.rejection).toBe('too-fast');
  });

  it('refuses a tile that is not adjacent — the client cannot teleport', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    // A tile two steps out: legal ground, illegal move.
    const far = neighbors(neighbors(SPAWN_INDEX, shape)[0], shape)
      .find((n) => !isAdjacent(SPAWN_INDEX, n) && n !== SPAWN_INDEX)!;
    const out = resolveMove(island, rabbit, far, shape, rng(), soon());
    expect(out.rejection).toBe('not-adjacent');
  });

  it('refuses to walk into the sea', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    // A tile index that is not land at all.
    const water = [...Array(COLS * ROWS).keys()].find((i) => !island.tiles.has(i))!;
    const out = resolveMove(island, rabbit, water, shape, rng(), soon());
    expect(out.rejection).toBe('off-island');
  });

  it('ends the run at zero energy', () => {
    // A bomb, not a plain dig: with digging free, the bar only reaches zero
    // when a bomb takes the last of it.
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test', ENERGY.DIG_COST + ENERGY.BOMB_LOSS);
    const bomb = step();
    island.tiles.get(bomb)!.content = 'bomb';
    const out = resolveMove(island, rabbit, bomb, shape, rng(), soon());
    expect(rabbit.energy).toBe(0);
    expect(rabbit.alive).toBe(false);
    expect(out.runOver).toBe(true);
  });

  it('refuses a dig from a rabbit whose bar is at zero, whatever a dig costs', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test', 0);
    const out = resolveMove(island, rabbit, step(), shape, rng(), soon());
    expect(out.rejection).toBe('no-energy');
  });

  it('pays a carrot to the first digger only', () => {
    const island = blank();
    const first = spawnRabbit('p1', 'First');
    const second = spawnRabbit('p2', 'Second');
    const to = step();
    island.tiles.get(to)!.content = 'carrot';

    resolveMove(island, first, to, shape, rng(), soon());
    expect(first.carrots).toBe(RUN.CARROT_VALUE);

    // Second arrives at a tile that is now revealed: free to walk, and it pays
    // nothing — the carrot is gone.
    const before = second.energy;
    resolveMove(island, second, to, shape, rng(), soon());
    expect(second.carrots).toBe(0);
    expect(second.energy).toBe(before);
  });

  it('will not let a dead rabbit move', () => {
    const island = blank();
    const rabbit = spawnRabbit('p1', 'Test');
    rabbit.alive = false;
    expect(resolveMove(island, rabbit, step(), shape, rng(), soon()).rejection).toBe('dead');
  });
});

describe('isAdjacent', () => {
  it('accepts all 8 neighbours and rejects the tile itself', () => {
    for (const n of neighbors(SPAWN_INDEX, shape)) {
      expect(isAdjacent(SPAWN_INDEX, n)).toBe(true);
    }
    expect(isAdjacent(SPAWN_INDEX, SPAWN_INDEX)).toBe(false);
  });
});
