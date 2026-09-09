/**
 * The rule set. Every number here comes from tuning.ts on purpose — these tests
 * assert BEHAVIOUR (walking is free, bombs throw you back, the first digger is
 * paid), never a literal, so retuning during a playtest does not turn the suite
 * red for no reason.
 */
import { describe, expect, it } from 'vitest';
import { BOMB, ENERGY, MULTIPLAYER } from '../config/tuning';
import { generateIsland } from '../src/lib/game/island';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { idx, type Island } from '../src/lib/game/types';
import { mulberry32 } from '../src/lib/game/rng';

const rng = () => mulberry32(1);

/** A blank island with known contents — generation is tested elsewhere. */
function blank(): Island {
  const island = generateIsland({ seed: 'test', width: 16, height: 16 });
  island.tiles.forEach((t) => { t.content = 'empty'; t.revealed = false; t.adjacent = 0; });
  island.dugCount = 0;
  return island;
}

/** Move at a time the anti-speedhack gate always accepts. */
let clock = 1_000_000;
const soon = () => (clock += MULTIPLAYER.MIN_MOVE_INTERVAL_MS + 10);

describe('resolveMove', () => {
  it('charges energy to dig and reveals the tile', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    const before = rabbit.energy;
    const out = resolveMove(island, rabbit, 'right', rng(), soon());
    expect(out.ok).toBe(true);
    expect(rabbit.energy).toBe(before - ENERGY.DIG_COST);
    expect(island.tiles[idx(island, rabbit.x, rabbit.y)].revealed).toBe(true);
  });

  it('walks revealed ground for free', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    island.tiles[idx(island, rabbit.x + 1, rabbit.y)].revealed = true;
    const before = rabbit.energy;
    resolveMove(island, rabbit, 'right', rng(), soon());
    expect(rabbit.energy).toBe(before);
  });

  it('pays energy and a carrot for a carrot tile', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    island.tiles[idx(island, rabbit.x + 1, rabbit.y)].content = 'carrot';
    const before = rabbit.energy;
    resolveMove(island, rabbit, 'right', rng(), soon());
    expect(rabbit.energy).toBe(before - ENERGY.DIG_COST + ENERGY.CARROT_GAIN);
    expect(rabbit.carrots).toBe(1);
  });

  it('caps energy at the ceiling', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test', ENERGY.MAX);
    island.tiles[idx(island, rabbit.x + 1, rabbit.y)].content = 'golden';
    resolveMove(island, rabbit, 'right', rng(), soon());
    expect(rabbit.energy).toBeLessThanOrEqual(ENERGY.MAX);
  });

  it('knocks back and stuns on a bomb, without entering the tile', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    const bombX = rabbit.x + 1;
    island.tiles[idx(island, bombX, rabbit.y)].content = 'bomb';
    const before = rabbit.energy;
    const now = soon();
    const out = resolveMove(island, rabbit, 'right', rng(), now);

    expect(rabbit.energy).toBe(before - ENERGY.DIG_COST - ENERGY.BOMB_LOSS);
    expect(rabbit.x).not.toBe(bombX);          // never steps onto the bomb
    expect(rabbit.x).toBeLessThan(bombX);      // thrown backwards
    expect(rabbit.stunnedUntil).toBe(now + BOMB.STUN_MS);
    expect(out.dig?.knockback).toBeDefined();
  });

  it('ignores input while stunned', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    rabbit.stunnedUntil = 5_000;
    const out = resolveMove(island, rabbit, 'right', rng(), 4_000);
    expect(out.ok).toBe(false);
    expect(out.rejection).toBe('stunned');
  });

  it('rejects moves faster than a human can make them', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    const t = soon();
    resolveMove(island, rabbit, 'right', rng(), t);
    const out = resolveMove(island, rabbit, 'right', rng(), t + 1);
    expect(out.ok).toBe(false);
    expect(out.rejection).toBe('too-fast');
  });

  it('refuses to leave the island', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    rabbit.x = 0;
    const out = resolveMove(island, rabbit, 'left', rng(), soon());
    expect(out.rejection).toBe('out-of-bounds');
  });

  it('ends the run at zero energy', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test', ENERGY.DIG_COST);
    island.tiles[idx(island, rabbit.x + 1, rabbit.y)].content = 'empty';
    const out = resolveMove(island, rabbit, 'right', rng(), soon());
    expect(rabbit.energy).toBe(0);
    expect(rabbit.alive).toBe(false);
    expect(out.runOver).toBe(true);
  });

  it('pays a carrot to the first digger only', () => {
    const island = blank();
    const first = spawnRabbit(island, 'p1', 'First');
    const second = spawnRabbit(island, 'p2', 'Second');
    const tx = first.x + 1;
    island.tiles[idx(island, tx, first.y)].content = 'carrot';

    resolveMove(island, first, 'right', rng(), soon());
    expect(first.carrots).toBe(1);

    // Second arrives at a tile that is now revealed: it is free to walk, and
    // pays nothing — the carrot is gone.
    const before = second.energy;
    resolveMove(island, second, 'right', rng(), soon());
    expect(second.carrots).toBe(0);
    expect(second.energy).toBe(before);
  });

  it('will not let a dead rabbit move', () => {
    const island = blank();
    const rabbit = spawnRabbit(island, 'p1', 'Test');
    rabbit.alive = false;
    expect(resolveMove(island, rabbit, 'right', rng(), soon()).rejection).toBe('dead');
  });
});
