/**
 * Generation invariants. These are the properties a playtest cannot check by
 * eye — an island that occasionally buries a bomb under the spawn produces a
 * bug report reading "sometimes I die instantly", which is unfixable without
 * this file.
 */
import { describe, expect, it } from 'vitest';
import { boardNeighbors, generateIsland, dugFraction, publicView, recomputeAdjacency } from '../src/lib/game/island';
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

  it('hints match the bombs actually adjacent — the eight cells, cliffs included', () => {
    const seed = 'hints';
    const island = generateIsland({ seed });
    for (const [index, tile] of island.tiles) {
      // Counted over the BOARD's neighbours, not the cells a rabbit can step
      // to: a bomb on the shelf above is one cell away whether or not the
      // cliff can be climbed. Counting only steps read "0" beside a bomb.
      const bombs = boardNeighbors(island, index)
        .filter((n) => island.tiles.get(n)?.content === 'bomb').length;
      expect(tile.adjacent).toBe(bombs);
      // And never a cell the island does not hold: a hint that counted the
      // sea would be unsolvable.
      for (const nb of boardNeighbors(island, index)) expect(island.tiles.has(nb)).toBe(true);
    }
  });

  it('counts a bomb across a cliff the rabbit cannot climb', () => {
    // Find a pair of board-adjacent tiles that are NOT step-adjacent — a
    // cliff — and bury a bomb on the far side. The near side must say "1".
    for (const seed of ['cliff-1', 'cliff-2', 'cliff-3', 'cliff-4', 'cliff-5']) {
      const island = generateIsland({ seed });
      for (const t of island.tiles.values()) t.content = 'empty';
      const pair = [...island.tiles.keys()].flatMap((a) =>
        boardNeighbors(island, a)
          .filter((b) => !terrainNeighbors(seed, a).includes(b))
          .map((b) => [a, b] as const),
      )[0];
      if (!pair) continue;
      const [near, far] = pair;
      island.tiles.get(far)!.content = 'bomb';
      recomputeAdjacency(island, makeShape(seed));
      expect(island.tiles.get(near)!.adjacent).toBe(1);
      return;
    }
    throw new Error('no cliff found in five seeds — the terrain has changed');
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
