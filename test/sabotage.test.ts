/**
 * Planting a bomb on a live island.
 *
 * The item existed and the dig honoured it; nothing ever planted one. What is
 * pinned here is the RULE that makes planting fair on a minesweeper board:
 * the numbers already read must stay true, so a plant recounts them and
 * reports what changed — and is refused wherever the board has already said
 * "safe".
 */
import { describe, expect, it } from 'vitest';
import { SABOTAGE } from '../config/tuning';
import { generateIsland, revealTile, cascadeHints, boardNeighbors } from '../src/lib/game/island';
import { plantBlocker, plantBomb, plantedBy } from '../src/lib/game/sabotage';
import { makeShape } from '../src/config/gridConfig';
import { farmableTiles } from '../src/lib/game/terrainBoard';

const SEED = 'plant-test';
const fresh = () => ({ island: generateIsland({ seed: SEED, contentSeed: 'c', lifetimeCarrots: 0 }), shape: makeShape(SEED) });

/** An undug, non-chest, non-bomb tile with at least one neighbour. */
function plantable(island: ReturnType<typeof generateIsland>): number {
  for (const t of farmableTiles(SEED)) {
    const tile = island.tiles.get(t);
    if (tile && !tile.revealed && !tile.hinted && tile.content !== 'chest' && tile.content !== 'bomb') return t;
  }
  throw new Error('no plantable tile');
}

describe('where a bomb may be planted', () => {
  it('refuses dug ground, and ground a cascade has vouched for', () => {
    const { island } = fresh();
    const t = plantable(island);
    revealTile(island, t, 'digger');
    expect(plantBlocker(island, 'sab', t)).toBe('revealed');

    const { island: i2 } = fresh();
    // Find a zero and open its cascade: its neighbours become `hinted`.
    const zero = farmableTiles(SEED).find((x) => { const tile = i2.tiles.get(x); return tile && tile.content !== 'bomb' && tile.adjacent === 0; });
    if (zero !== undefined) {
      revealTile(i2, zero, 'digger');
      const hinted = cascadeHints(i2, [zero]).map((h) => h.tile);
      const target = hinted.find((h) => !i2.tiles.get(h)?.revealed);
      if (target !== undefined) expect(plantBlocker(i2, 'sab', target)).toBe('hinted');
    }
  });

  it('refuses a chest — the beam is a promise', () => {
    const { island } = fresh();
    const chest = [...island.tiles.entries()].find(([, t]) => t.content === 'chest')?.[0];
    if (chest !== undefined) expect(plantBlocker(island, 'sab', chest)).toBe('chest');
  });

  it('caps how many one saboteur keeps live on an island', () => {
    const { island, shape } = fresh();
    for (let i = 0; i < SABOTAGE.MAX_PLANTED_PER_ISLAND; i++) {
      const t = plantable(island);
      expect(plantBlocker(island, 'sab', t)).toBeNull();
      plantBomb(island, shape, 'sab', t);
    }
    expect(plantedBy(island, 'sab')).toBe(SABOTAGE.MAX_PLANTED_PER_ISLAND);
    expect(plantBlocker(island, 'sab', plantable(island))).toBe('too-many');
    // Somebody else's count is their own.
    expect(plantBlocker(island, 'other', plantable(island))).toBeNull();
  });

  it('says nothing about a tile that was already a bomb', () => {
    // Refusing would be a free probe. The answer is the same as for any tile.
    const { island, shape } = fresh();
    const bomb = [...island.tiles.entries()].find(([, t]) => t.content === 'bomb' && !t.revealed)![0];
    expect(plantBlocker(island, 'sab', bomb)).toBeNull();
    const out = plantBomb(island, shape, 'sab', bomb);
    expect(out.changed).toEqual([]);
    expect(island.tiles.get(bomb)?.plantedBy).toBe('sab');
  });
});

describe('what a plant does to the numbers', () => {
  it('turns the tile into the saboteur\'s bomb and recounts the neighbours', () => {
    const { island, shape } = fresh();
    const t = plantable(island);
    const before = boardNeighbors(island, t).map((n) => island.tiles.get(n)!.adjacent);
    plantBomb(island, shape, 'sab', t);
    expect(island.tiles.get(t)).toMatchObject({ content: 'bomb', plantedBy: 'sab' });
    const after = boardNeighbors(island, t).map((n) => island.tiles.get(n)!.adjacent);
    for (let i = 0; i < before.length; i++) expect(after[i]).toBe(before[i] + 1);
  });

  it('reports only the numbers somebody can already see', () => {
    const { island, shape } = fresh();
    const t = plantable(island);
    const nbs = boardNeighbors(island, t).filter((n) => island.tiles.get(n)?.content !== 'bomb');
    // Dig one neighbour: its number is on screen and must be redrawn.
    revealTile(island, nbs[0], 'digger');
    const out = plantBomb(island, shape, 'sab', t);
    expect(out.changed.map((c) => c.tile)).toContain(nbs[0]);
    expect(out.changed.find((c) => c.tile === nbs[0])?.adjacent).toBe(island.tiles.get(nbs[0])!.adjacent);
    // The rest are still hidden: nobody is told.
    for (const c of out.changed) expect(island.tiles.get(c.tile)!.revealed || island.tiles.get(c.tile)!.hinted).toBe(true);
  });
});
