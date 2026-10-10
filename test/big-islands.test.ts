/**
 * The big islands (BIG_ISLANDS, level 7 on): their own coast from their own
 * seed, a box sized to the level's tile count, the tile index in the island's
 * own grid, and nothing standing that walls part of the island off.
 * All pure — the generator and the board, no server.
 */
import { describe, expect, it } from 'vitest';
import { BIG_ISLANDS, RABBIT_LEVELS, levelRow } from '@config/tuning';
import { generateIsland, boardNeighbors } from '@/lib/game/island';
import { bigPlan } from '@/lib/game/big-island';
import { ISLAND_GROUND, groundSeed, levelSeed, seedLevel } from '@/lib/game/first-island';
import {
  cellOf, farmableTiles, gridOf, indexOf, spawnTile, terrainNeighbors,
} from '@/lib/game/terrainBoard';

const seeds = (level: number, n: number) => Array.from({ length: n }, (_, k) => levelSeed(level, `t${k}`));

describe('which islands are big', () => {
  it('levels 1 to 6 keep the shared 32x32 ground', () => {
    for (let level = 1; level <= 6; level++) {
      const seed = levelSeed(level, 'x');
      expect(groundSeed(seed)).toBe(ISLAND_GROUND);
      expect(bigPlan(seed, seedLevel(seed))).toBeNull();
      expect(gridOf(seed)).toEqual({ cols: 32, rows: 32 });
    }
  });

  it('from level 7 every island is its own ground', () => {
    for (let level = 7; level <= RABBIT_LEVELS.MAX; level++) {
      const seed = levelSeed(level, 'x');
      expect(groundSeed(seed)).toBe(seed);
      expect(bigPlan(seed, seedLevel(seed))).not.toBeNull();
    }
  });

  it('the plan is a pure function of the seed', () => {
    const seed = levelSeed(9, 'same');
    expect(bigPlan(seed, 9)).toEqual(bigPlan(seed, 9));
    expect(gridOf(seed)).toEqual(gridOf(seed));
  });
});

describe('size', () => {
  it('cuts at least MIN_FILL of the drawn count, inside the box bounds', () => {
    for (let level = 7; level <= RABBIT_LEVELS.MAX; level++) {
      for (const seed of seeds(level, 6)) {
        const plan = bigPlan(seed, level)!;
        const [lo, hi] = levelRow(level).big!;
        expect(plan.target).toBeGreaterThanOrEqual(lo);
        expect(plan.target).toBeLessThanOrEqual(hi);
        const { cols, rows } = gridOf(seed);
        expect(cols).toBeLessThanOrEqual(BIG_ISLANDS.MAX_SIDE);
        expect(rows).toBeLessThanOrEqual(BIG_ISLANDS.MAX_SIDE);
        // Farmable is land less what stands on it, so it sits a little under
        // the land count the cutter aims at.
        expect(farmableTiles(seed).length).toBeGreaterThan(plan.target * 0.75);
      }
    }
  });

  it('a level-7 island is about twice the old level 7', () => {
    const tiles = seeds(7, 8).map((s) => farmableTiles(s).length);
    const mean = tiles.reduce((a, n) => a + n, 0) / tiles.length;
    expect(mean).toBeGreaterThan(600);
  });
});

describe('the island grid', () => {
  it('a tile index is in the island\'s own width', () => {
    const seed = levelSeed(10, 'grid');
    const { cols } = gridOf(seed);
    expect(cols).not.toBe(32);
    for (const t of farmableTiles(seed).slice(0, 50)) {
      const { col, row } = cellOf(seed, t);
      expect(indexOf(seed, col, row)).toBe(t);
      expect(t).toBe(row * cols + col);
    }
  });

  it('hint neighbours stay within one cell, never wrapping a row', () => {
    const seed = levelSeed(8, 'wrap');
    const island = generateIsland({ seed, contentSeed: 'c', level: levelRow(8) });
    for (const t of island.tiles.keys()) {
      const a = cellOf(seed, t);
      for (const n of boardNeighbors(island, t)) {
        const b = cellOf(seed, n);
        expect(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))).toBe(1);
      }
    }
  });
});

describe('dealing', () => {
  it('deals the level\'s chests, and every tile is walkable from the spawn', () => {
    for (let level = 7; level <= RABBIT_LEVELS.MAX; level++) {
      for (const seed of seeds(level, 4)) {
        const island = generateIsland({ seed, contentSeed: 'c', level: levelRow(level) });
        const chests = [...island.tiles.values()].filter((t) => t.content === 'chest').length;
        expect(chests).toBe(levelRow(level).chests);
        const start = spawnTile(seed);
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length) {
          for (const n of terrainNeighbors(seed, queue.pop()!)) {
            if (!seen.has(n)) { seen.add(n); queue.push(n); }
          }
        }
        for (const t of island.tiles.keys()) expect(seen.has(t)).toBe(true);
      }
    }
  });
});

describe('no X can lock a chest away', () => {
  it('every chest has a road from the spawn that crosses no bomb', () => {
    for (const level of [3, 6, 7, 8, 9, 10]) {
      for (const seed of seeds(level, 12)) {
        const island = generateIsland({ seed, contentSeed: 'x', level: levelRow(level) });
        const start = spawnTile(seed);
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length) {
          for (const n of terrainNeighbors(seed, queue.pop()!)) {
            const t = island.tiles.get(n);
            if (!t || t.content === 'bomb' || seen.has(n)) continue;
            seen.add(n);
            queue.push(n);
          }
        }
        for (const [i, t] of island.tiles) if (t.content === 'chest') expect(seen.has(i)).toBe(true);
      }
    }
  });
});
