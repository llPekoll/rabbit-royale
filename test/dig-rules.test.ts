/**
 * THE DIG LOOP'S THREE RULES OF 17 SEPTEMBER 2026.
 *
 *   1. The cascade reaches ISLAND.CASCADE_RADIUS squares from the rabbit and is
 *      carried on by walking — an island is no longer born a quarter read.
 *   2. Bombs and golden carrots thicken with the walk from the spawn; the
 *      counts stay the tier's.
 *   3. Surrounding a bomb defuses it and pays carrots on a streak, never hearts.
 */
import { describe, expect, it } from 'vitest';
import { DEFUSE, ENERGY, ISLAND, ISLAND_TIERS } from '../config/tuning';
import {
  boardNeighbors, cascadeAround, cascadeHints, defuseSurrounded, generateIsland, islandProgress,
} from '../src/lib/game/island';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape, toColRow } from '../src/config/gridConfig';
import { spawnTile, terrainNeighbors } from '../src/lib/game/terrainBoard';
import { mulberry32 } from '../src/lib/game/rng';
import type { Island } from '../src/lib/game/types';

const SEED = 'dig-rules';
const squares = (a: number, b: number) => {
  const p = toColRow(a);
  const q = toColRow(b);
  return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row));
};

/** A covered board with no bombs on it: one endless field of zeros. */
function quiet(seed = SEED): Island {
  const island = generateIsland({ seed, contentSeed: 'quiet' });
  for (const t of island.tiles.values()) {
    t.content = 'empty'; t.adjacent = 0; t.hinted = false; t.revealed = false; t.defused = false;
  }
  island.dugCount = 0;
  return island;
}
const recount = (island: Island) => {
  for (const [i, t] of island.tiles) {
    t.adjacent = boardNeighbors(island, i).filter((n) => island.tiles.get(n)!.content === 'bomb').length;
  }
};

describe('the cascade is bounded around the rabbit', () => {
  it('writes nothing further than CASCADE_RADIUS squares out', () => {
    const island = quiet();
    const spawn = spawnTile(SEED);
    island.tiles.get(spawn)!.revealed = true;
    const opened = cascadeHints(island, [spawn], spawn);
    expect(opened.length).toBeGreaterThan(8);
    for (const h of opened) expect(squares(h.tile, spawn)).toBeLessThanOrEqual(ISLAND.CASCADE_RADIUS);
    // Unbounded, the same field opens to the shore — that is what was cut.
    const rest = cascadeHints(island, [spawn]);
    expect(rest.length).toBeGreaterThan(opened.length);
  });

  it('is carried on by a plain walk over dug ground', () => {
    const island = quiet();
    const spawn = spawnTile(SEED);
    island.tiles.get(spawn)!.revealed = true;
    cascadeHints(island, [spawn], spawn);
    const step = terrainNeighbors(SEED, spawn).find((n) => island.tiles.has(n))!;
    island.tiles.get(step)!.revealed = true;
    island.dugCount++;
    const rabbit = spawnRabbit('p1', 'P1', ENERGY.START, SEED);
    rabbit.lastMoveAt = 0;
    const out = resolveMove(island, rabbit, step, makeShape(SEED), mulberry32(1), 10_000);
    expect(out.ok).toBe(true);
    expect(out.dig).toBeUndefined();
    expect(out.hinted?.length).toBeGreaterThan(0);
    for (const h of out.hinted!) expect(squares(h.tile, step)).toBeLessThanOrEqual(ISLAND.CASCADE_RADIUS);
    // Standing still opens nothing more: the walk is what pays for the read.
    expect(cascadeAround(island, step)).toEqual([]);
  });

  it('gives a newborn island far less than it used to', () => {
    let open = 0;
    let total = 0;
    for (let s = 0; s < 12; s++) {
      const island = generateIsland({ seed: `born-${s}`, contentSeed: `c-${s}` });
      total += island.tiles.size;
      for (const t of island.tiles.values()) if (t.revealed || t.hinted) open++;
      const spawn = spawnTile(`born-${s}`);
      for (const [i, t] of island.tiles) {
        if (t.hinted) expect(squares(i, spawn)).toBeLessThanOrEqual(ISLAND.CASCADE_RADIUS);
        if (t.hinted) expect(t.content).not.toBe('bomb');
      }
    }
    // Was 23 % on Meadow, measured the same way before the bound.
    expect(open / total).toBeLessThan(0.1);
  });
});

describe('risk rises with the walk from the spawn', () => {
  it('keeps the tier counts and moves the bombs outward', () => {
    let near = 0, nearN = 0, far = 0, farN = 0;
    for (let s = 0; s < 30; s++) {
      const seed = `grad-${s}`;
      const island = generateIsland({ seed, contentSeed: `g-${s}` });
      const spawn = spawnTile(seed);
      const bombs = [...island.tiles.values()].filter((t) => t.content === 'bomb').length;
      expect(bombs).toBe(Math.floor(island.tiles.size * ISLAND_TIERS[0].bombDensity));
      const ds = [...island.tiles.keys()].map((i) => squares(i, spawn));
      const cut = [...ds].sort((a, b) => a - b)[Math.floor(ds.length / 2)];
      for (const [i, t] of island.tiles) {
        const inner = squares(i, spawn) <= cut;
        if (inner) { nearN++; if (t.content === 'bomb') near++; } else { farN++; if (t.content === 'bomb') far++; }
      }
    }
    expect(far / farN).toBeGreaterThan((near / nearN) * 1.25);
  });
});

describe('surrounding a bomb defuses it', () => {
  /** A bomb in open ground, everything round it dug but `last`. */
  function ringed() {
    const island = quiet();
    const spawn = spawnTile(SEED);
    // A bomb whose eight neighbours all exist, away from the spawn.
    const bomb = [...island.tiles.keys()].find((i) =>
      boardNeighbors(island, i).length === 8 && squares(i, spawn) > 4
      && terrainNeighbors(SEED, i).length >= 4)!;
    island.tiles.get(bomb)!.content = 'bomb';
    recount(island);
    const ring = boardNeighbors(island, bomb);
    // The last one must be steppable from another ring tile.
    const last = ring.find((n) => terrainNeighbors(SEED, n).some((m) => ring.includes(m)))!;
    const from = terrainNeighbors(SEED, last).find((m) => ring.includes(m))!;
    for (const n of ring) if (n !== last) { island.tiles.get(n)!.revealed = true; island.dugCount++; }
    const rabbit = spawnRabbit('p1', 'P1', ENERGY.START, SEED);
    rabbit.tile = from;
    rabbit.lastMoveAt = 0;
    return { island, bomb, last, rabbit };
  }

  it('pays carrots to whoever digs the last safe neighbour, and no hearts', () => {
    const { island, bomb, last, rabbit } = ringed();
    const before = rabbit.carrots;
    const out = resolveMove(island, rabbit, last, makeShape(SEED), mulberry32(1), 10_000);
    expect(out.ok).toBe(true);
    expect(out.dig?.defused).toEqual([{ tile: bomb, carrots: DEFUSE.BASE, streak: 1 }]);
    expect(rabbit.carrots - before).toBe(DEFUSE.BASE);
    expect(out.dig?.carrotDelta).toBe(DEFUSE.BASE);
    expect(rabbit.energy).toBe(ENERGY.START);
    const t = island.tiles.get(bomb)!;
    expect(t.revealed && t.defused).toBe(true);
    // A defused bomb is still a bomb to the numbers around it.
    expect(island.tiles.get(last)!.adjacent).toBe(1);
    // And never was a safe tile: the island's clock did not move for it.
    expect(islandProgress(island).safeTotal).toBe(island.tiles.size - 1);
  });

  it('does nothing while a safe neighbour is still in the ground', () => {
    const { island, bomb, last } = ringed();
    const other = boardNeighbors(island, bomb).find((n) => n !== last)!;
    island.tiles.get(other)!.revealed = false;
    island.tiles.get(last)!.revealed = true;
    expect(defuseSurrounded(island, last)).toEqual([]);
    expect(island.tiles.get(bomb)!.revealed).toBe(false);
  });

  it('climbs with the streak, caps, drops a raid bomb, and a blast resets it', () => {
    const { island, last, rabbit } = ringed();
    rabbit.run = { startedAt: 0, tilesDug: 0, bombsHit: 0, loot: {}, nfts: [], defuseStreak: DEFUSE.ITEM_EVERY - 1 };
    const out = resolveMove(island, rabbit, last, makeShape(SEED), mulberry32(1), 10_000);
    expect(out.dig?.defused?.[0]).toMatchObject({ carrots: DEFUSE.MAX, streak: DEFUSE.ITEM_EVERY, item: true });
    expect(rabbit.run.loot.bomb).toBe(1);

    // Now step on a bomb: the streak is gone with the heart.
    const next = terrainNeighbors(SEED, rabbit.tile).find((n) => island.tiles.has(n) && !island.tiles.get(n)!.revealed);
    if (next !== undefined) {
      island.tiles.get(next)!.content = 'bomb';
      const hit = resolveMove(island, rabbit, next, makeShape(SEED), mulberry32(1), 20_000);
      expect(hit.dig?.content).toBe('bomb');
      expect(hit.dig?.defused).toBeUndefined();
      expect(rabbit.run.defuseStreak).toBe(0);
    }
  });

  it('pays nobody when nobody dug it by foot (a lightning strike)', () => {
    const { island, bomb, last } = ringed();
    island.tiles.get(last)!.revealed = true;
    expect(defuseSurrounded(island, last)).toEqual([{ tile: bomb, carrots: 0, streak: 0 }]);
  });
});
