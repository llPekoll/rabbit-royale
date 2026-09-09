/**
 * Generation invariants. These are the properties a playtest cannot check by
 * eye — an island that occasionally spawns a bomb under the rabbit produces a
 * bug report that reads "sometimes I die instantly", which is unfixable without
 * this file.
 */
import { describe, expect, it } from 'vitest';
import { ISLAND } from '../config/tuning';
import { generateIsland, dugFraction, publicView, knockbackTarget } from '../src/lib/game/island';
import { idx } from '../src/lib/game/types';

describe('generateIsland', () => {
  it('is deterministic for a seed', () => {
    const a = generateIsland({ seed: 'abc' });
    const b = generateIsland({ seed: 'abc' });
    expect(a.tiles.map((t) => t.content)).toEqual(b.tiles.map((t) => t.content));
    expect([a.width, a.height]).toEqual([b.width, b.height]);
  });

  it('gives different seeds different islands', () => {
    const a = generateIsland({ seed: 'abc' });
    const b = generateIsland({ seed: 'xyz' });
    expect(a.tiles.map((t) => t.content)).not.toEqual(b.tiles.map((t) => t.content));
  });

  it('never buries a bomb in the spawn ring', () => {
    for (let i = 0; i < 200; i++) {
      const island = generateIsland({ seed: `seed-${i}` });
      const cx = Math.floor(island.width / 2);
      const cy = Math.floor(island.height / 2);
      for (let dy = -ISLAND.SAFE_RADIUS; dy <= ISLAND.SAFE_RADIUS; dy++) {
        for (let dx = -ISLAND.SAFE_RADIUS; dx <= ISLAND.SAFE_RADIUS; dx++) {
          const tile = island.tiles[idx(island, cx + dx, cy + dy)];
          expect(tile.content).not.toBe('bomb');
          expect(tile.revealed).toBe(true);
        }
      }
    }
  });

  it('hints match the bombs actually adjacent', () => {
    const island = generateIsland({ seed: 'hints', width: 16, height: 16 });
    for (let y = 0; y < island.height; y++) {
      for (let x = 0; x < island.width; x++) {
        let bombs = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= island.width || ny >= island.height) continue;
            if (island.tiles[idx(island, nx, ny)].content === 'bomb') bombs++;
          }
        }
        expect(island.tiles[idx(island, x, y)].adjacent).toBe(bombs);
      }
    }
  });

  it('counts the pre-revealed spawn ring in dugFraction', () => {
    const island = generateIsland({ seed: 'dug', width: 16, height: 16 });
    expect(dugFraction(island)).toBeGreaterThan(0);
    expect(dugFraction(island)).toBeLessThan(0.1);
  });
});

describe('publicView', () => {
  it('hides the content of every unrevealed tile', () => {
    const island = generateIsland({ seed: 'secret', width: 18, height: 18 });
    const view = publicView(island);
    const hidden = view.tiles.filter((t) => !t.revealed);
    expect(hidden.length).toBeGreaterThan(0);
    // The whole security model of this game: an unrevealed tile carries NO
    // field a client could read a bomb out of.
    for (const tile of hidden) expect(Object.keys(tile)).toEqual(['revealed']);
  });
});

describe('knockbackTarget', () => {
  it('prefers revealed ground over fresh dirt', () => {
    const island = generateIsland({ seed: 'kb', width: 16, height: 16 });
    island.tiles.forEach((t) => { t.revealed = false; });
    const from = { x: 8, y: 8 };
    island.tiles[idx(island, 6, 8)].revealed = true; // 2 back, revealed
    const landing = knockbackTarget(island, from, [-1, 0], 3);
    expect(landing).toEqual({ x: 6, y: 8 });
  });

  it('stays inside the island at the edge', () => {
    const island = generateIsland({ seed: 'edge', width: 16, height: 16 });
    const landing = knockbackTarget(island, { x: 1, y: 5 }, [-1, 0], 3);
    expect(landing.x).toBeGreaterThanOrEqual(0);
  });
});
