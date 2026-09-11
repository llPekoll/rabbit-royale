/**
 * Generation invariants. These are the properties a playtest cannot check by
 * eye — an island that occasionally buries a bomb under the spawn produces a
 * bug report reading "sometimes I die instantly", which is unfixable without
 * this file.
 */
import { describe, expect, it } from 'vitest';
import { generateIsland, dugFraction, publicView, recomputeAdjacency } from '../src/lib/game/island';
import { makeShape, isForbidden, COLS, ROWS } from '../src/config/gridConfig';
import { spawnTile, terrainNeighbors, farmableTiles } from '../src/lib/game/terrainBoard';

describe('generateIsland', () => {
  it('is deterministic for a seed', () => {
    const a = generateIsland({ seed: 'abc' });
    const b = generateIsland({ seed: 'abc' });
    expect([...a.tiles].map(([i, t]) => [i, t.content])).toEqual(
      [...b.tiles].map(([i, t]) => [i, t.content]),
    );
  });

  it('gives different seeds different islands', () => {
    const a = generateIsland({ seed: 'abc' });
    const b = generateIsland({ seed: 'xyz' });
    expect([...a.tiles].map(([, t]) => t.content)).not.toEqual(
      [...b.tiles].map(([, t]) => t.content),
    );
  });

  it('holds only playable ground — never sea, cliff rock or a blocked cell', () => {
    // The silhouette is no longer the authority: the TERRAIN is. A tile the
    // island buries content in has to be one a rabbit can actually reach.
    const island = generateIsland({ seed: 'sea' });
    const playable = new Set(farmableTiles('sea'));
    for (const index of island.tiles.keys()) {
      expect(playable.has(index)).toBe(true);
    }
  });

  it('never buries a bomb under the spawn or its ring', () => {
    for (let i = 0; i < 100; i++) {
      const seed = `seed-${i}`;
      const island = generateIsland({ seed });
      const shape = makeShape(seed);
      for (const index of [spawnTile(seed), ...terrainNeighbors(seed, spawnTile(seed))]) {
        const tile = island.tiles.get(index)!;
        expect(tile.content).not.toBe('bomb');
        expect(tile.revealed).toBe(true);
      }
    }
  });

  it('hints match the bombs actually adjacent', () => {
    const seed = 'hints';
    const island = generateIsland({ seed });
    for (const [index, tile] of island.tiles) {
      // Counted over the terrain's neighbours: a hint that counted cells which
      // are not on the board would be unsolvable.
      const bombs = terrainNeighbors(seed, index)
        .filter((n) => island.tiles.get(n)?.content === 'bomb').length;
      expect(tile.adjacent).toBe(bombs);
    }
  });

  it('re-counts hints after a bomb is planted — the sabotage tell', () => {
    const seed = 'sabotage';
    const island = generateIsland({ seed });
    const shape = makeShape(seed);
    // Find a quiet tile with a plantable neighbour.
    const victim = [...island.tiles.keys()].find((i) => {
      const nbs = terrainNeighbors(seed, i);
      return nbs.some((n) => island.tiles.get(n)!.content === 'empty');
    })!;
    const before = island.tiles.get(victim)!.adjacent;
    const target = terrainNeighbors(seed, victim).find((n) => island.tiles.get(n)!.content === 'empty')!;

    island.tiles.get(target)!.content = 'bomb';
    recomputeAdjacency(island, shape);

    // The "2" becomes a "3": exactly what an attentive victim can notice.
    expect(island.tiles.get(victim)!.adjacent).toBe(before + 1);
  });

  it('counts the pre-revealed spawn ring in dugFraction', () => {
    const island = generateIsland({ seed: 'dug' });
    expect(dugFraction(island)).toBeGreaterThan(0);
    expect(dugFraction(island)).toBeLessThan(0.1);
  });
});

describe('publicView', () => {
  it('sends ONLY revealed tiles — an unrevealed one has no field at all', () => {
    const island = generateIsland({ seed: 'secret' });
    const view = publicView(island);

    // The whole security model: a client cannot read a bomb out of a payload
    // that does not mention the tile.
    expect(view.revealed.length).toBeLessThan(island.tiles.size);
    for (const entry of view.revealed) {
      expect(island.tiles.get(entry.tile)!.revealed).toBe(true);
    }
    const sent = new Set(view.revealed.map((r) => r.tile));
    for (const [index, tile] of island.tiles) {
      if (!tile.revealed) expect(sent.has(index)).toBe(false);
    }
  });

  it('carries the seed, so the client can cut the same coastline', () => {
    const view = publicView(generateIsland({ seed: 'coast' }));
    expect(view.seed).toBe('coast');
  });
});
