/**
 * Generation invariants. These are the properties a playtest cannot check by
 * eye — an island that occasionally buries a bomb under the spawn produces a
 * bug report reading "sometimes I die instantly", which is unfixable without
 * this file.
 */
import { describe, expect, it } from 'vitest';
import { boardNeighbors, chestProgress, generateIsland, dugFraction, publicView, recomputeAdjacency } from '../src/lib/game/island';
import { makeShape, isForbidden, toColRow, COLS, ROWS } from '../src/config/gridConfig';
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

  it('starts at zero chests taken, and reaches 1 only when the last one is dug', () => {
    const island = generateIsland({ seed: 'dug' });
    // A fresh island is 0 however much of the spawn ring is pre-revealed: the
    // clock counts CHESTS now, and the ring never opens one.
    expect(dugFraction(island)).toBe(0);

    const chests = [...island.tiles].filter(([, t]) => t.content === 'chest').map(([i]) => i);
    expect(chests.length).toBeGreaterThan(0);

    // Every chest but the last leaves the island running — the eruption is the
    // LAST one, which is what makes whoever takes it end the run for the room.
    for (const i of chests.slice(0, -1)) island.tiles.get(i)!.revealed = true;
    expect(dugFraction(island)).toBeLessThan(1);
    island.tiles.get(chests[chests.length - 1])!.revealed = true;
    expect(dugFraction(island)).toBe(1);
  });

  it('a fully dug island has no chest left, so the eruption always fires', () => {
    // The failure this pins is the one a player actually hit: "je viens de
    // terminer la map et je suis toujours la". If a chest could ever sit on a
    // tile that digging everything does not reach, the island would have no
    // ending at all — the clock would stop at 0.9 and stay there.
    //
    // It cannot, by construction: chests are dealt onto `farmableTiles` like
    // every other content, and `chestProgress` counts a chest as taken the
    // moment its tile is revealed. Pinned over several seeds anyway, because
    // this is the invariant the whole win condition rests on.
    for (const seed of ['end-a', 'end-b', 'end-c', 'end-d', 'end-e']) {
      const island = generateIsland({ seed });
      const chests = chestProgress(island);
      // An island with no chests would erupt instantly; one is not a level.
      expect(chests.total).toBeGreaterThan(1);
      expect(chests.fraction).toBe(0);

      for (const tile of island.tiles.values()) {
        if (tile.content !== 'bomb') tile.revealed = true;
      }
      expect(chestProgress(island).left).toBe(0);
      expect(dugFraction(island)).toBe(1);
    }
  });

  it('keeps the chests well apart from each other, not just from the spawn', () => {
    // The failure this pins: the first placement bucketed the coast into equal
    // angular wedges, and an island is not a disc — a wide, close shore filled
    // two neighbouring wedges and both handed back tiles from the SAME stretch,
    // so chests came out touching. Measured over 12 seeds the closest pair was
    // 1.0 tile, i.e. adjacent. A bay cleared in one visit is one stop however
    // many boxes are in it, which is not the lap the rule is meant to build.
    //
    // 4 tiles is a floor with headroom: the farthest-point traversal
    // (`rimTiles`) actually delivers about 6, and pinning the measured value
    // would fail on the first harmless tweak to the density or the depth floor.
    for (const seed of ['gap-a', 'gap-b', 'gap-c', 'gap-d', 'gap-e', 'gap-f']) {
      const island = generateIsland({ seed });
      const chests = [...island.tiles]
        .filter(([, t]) => t.content === 'chest')
        .map(([i]) => toColRow(i));
      expect(chests.length).toBeGreaterThan(1);

      let closest = Infinity;
      for (let a = 0; a < chests.length; a++) {
        for (let b = a + 1; b < chests.length; b++) {
          closest = Math.min(closest, Math.hypot(
            chests[a].col - chests[b].col, chests[a].row - chests[b].row));
        }
      }
      expect(closest).toBeGreaterThan(4);
    }
  });

  it('puts every chest out on the rim, and spread around it', () => {
    // The rule the placement exists for: finishing an island means walking it.
    // Pinned over several seeds because one lucky coastline proves nothing.
    for (const seed of ['rim-a', 'rim-b', 'rim-c', 'rim-d']) {
      const island = generateIsland({ seed });
      const chests = [...island.tiles].filter(([, t]) => t.content === 'chest').map(([i]) => i);
      expect(chests.length).toBeGreaterThan(1);

      const spawn = spawnTile(seed);
      const origin = toColRow(spawn);
      const far = Math.max(...[...island.tiles.keys()].map((i) => {
        const { col, row } = toColRow(i);
        return Math.hypot(col - origin.col, row - origin.row);
      }));

      // FAR: nothing near the middle, where a run could end without leaving it.
      for (const i of chests) {
        const { col, row } = toColRow(i);
        expect(Math.hypot(col - origin.col, row - origin.row)).toBeGreaterThan(far * 0.35);
      }

      // SPREAD: not all on one headland. Two chests in opposite screen
      // quadrants is the cheapest honest statement of "this is a lap".
      const quadrants = new Set(chests.map((i) => {
        const { col, row } = toColRow(i);
        return `${col + row >= origin.col + origin.row}:${col - row >= origin.col - origin.row}`;
      }));
      expect(quadrants.size).toBeGreaterThan(2);
    }
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
