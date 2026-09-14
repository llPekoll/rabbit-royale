import { describe, expect, it } from 'vitest';
import { generateIsland, publicView, revealTile } from '@/lib/game/island';
import { resolveMove, spawnRabbit } from '@/lib/game/run';
import { reachableTiles } from '@/lib/game/reachable';
import { terrainNeighbors, farmableTiles, spawnTile } from '@/lib/game/terrainBoard';
import { mulberry32, seedFrom, shuffle } from '@/lib/game/rng';
import { COLS, ROWS, makeShape } from '@/config/gridConfig';
import { tierFor } from '@config/tuning';

/**
 * The promise the whole redesign rests on: the ring the client lights is
 * exactly the set of moves the server accepts. Checked end to end, over many
 * seeds, through the REAL functions both sides call.
 */
describe('client ring mirrors server authority', () => {
  it.each(Array.from({ length: 25 }, (_, i) => `live-${i}`))('%s', (seed) => {
    const island = generateIsland({ seed });
    const rabbit = spawnRabbit('p1', 'Test', 10, seed);
    const shape = makeShape(seed);

    const lit = reachableTiles({
      tile: rabbit.tile,
      energy: rabbit.energy,
      alive: true,
      stunnedUntil: 0,
      isRevealed: (i) => island.tiles.get(i)?.revealed ?? false,
    }, seed, 1_000_000);

    // Every lit tile is accepted by the server.
    for (const to of lit) {
      const fresh = spawnRabbit('p2', 'T', 10, seed);
      fresh.lastMoveAt = 0;
      const out = resolveMove(island, fresh, to, shape, mulberry32(1), 1_000_000);
      expect(out.ok, `server refused a lit tile ${to}: ${out.rejection}`).toBe(true);
    }

    // And every tile NOT offered by the terrain is refused.
    const offered = new Set(terrainNeighbors(seed, rabbit.tile));
    for (let i = 0; i < COLS * ROWS; i++) {
      if (offered.has(i) || i === rabbit.tile) continue;
      const fresh = spawnRabbit('p3', 'T', 10, seed);
      fresh.lastMoveAt = 0;
      const out = resolveMove(island, fresh, i, shape, mulberry32(1), 1_000_000);
      expect(out.ok, `server allowed an unlit tile ${i}`).toBe(false);
    }
  });

  it('buries nothing a player cannot reach', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `buried-${i}`;
      const island = generateIsland({ seed });
      const playable = new Set(farmableTiles(seed));
      for (const tile of island.tiles.keys()) expect(playable.has(tile)).toBe(true);
    }
  });

  it('spawns every rabbit on ground it can stand on', () => {
    for (let i = 0; i < 30; i++) {
      const seed = `spawn-${i}`;
      const rabbit = spawnRabbit('p', 'T', 10, seed);
      expect(rabbit.tile).toBe(spawnTile(seed));
      expect(farmableTiles(seed)).toContain(rabbit.tile);
    }
  });
});

/**
 * The bombs must not be derivable from anything the client is given.
 *
 * This is the regression guard for a real hole: `generateIsland` is pure, and
 * every primitive it uses (`mulberry32`, `seedFrom`, `shuffle`, `farmableTiles`,
 * `spawnTile`, `tierFor`) already ships to the browser for other reasons. So
 * keeping `island.ts` out of the client bundle never protected anything — a
 * player could re-run the algorithm in a console from the `seed` the snapshot
 * hands them and read off every bomb.
 *
 * The fix is the two-seed split: `seed` stays public and cuts the land, while a
 * private `contentSeed` decides what is buried. The test below is the ATTACK,
 * written with client-side imports only, and it must now fail to reproduce the
 * island. If someone ever collapses the two seeds again, this goes red.
 */
describe('buried content is not derivable from the public seed', () => {
  /** The maphack, exactly as an attacker would write it in a console. */
  function guessBombs(seed: string, lifetimeCarrots = 0): number[] {
    const rng = mulberry32(seedFrom(`content:${seed}`));
    const tier = tierFor(lifetimeCarrots);
    const tiles = farmableTiles(seed);
    const spawn = spawnTile(seed);
    const safe = new Set<number>([spawn, ...terrainNeighbors(seed, spawn)]);
    const pool = shuffle(rng, tiles.filter((i) => !safe.has(i)));
    return pool.slice(0, Math.floor(tiles.length * tier.bombDensity)).sort((a, b) => a - b);
  }

  const bombsOf = (island: ReturnType<typeof generateIsland>) =>
    [...island.tiles].filter(([, t]) => t.content === 'bomb').map(([i]) => i).sort((a, b) => a - b);

  it('the seed alone no longer yields the bomb map', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `secret-${i}`;
      const island = generateIsland({ seed, contentSeed: `private-${i}` });
      expect(bombsOf(island)).not.toEqual(guessBombs(seed));
    }
  });

  it('two islands sharing a public seed bury their bombs differently', () => {
    // The same coastline twice — what a player sees is identical — yet the
    // contents must not be. This is the property that makes publishing the
    // island id harmless.
    const a = generateIsland({ seed: 'same-land', contentSeed: 'run-a' });
    const b = generateIsland({ seed: 'same-land', contentSeed: 'run-b' });
    expect([...a.tiles.keys()].sort()).toEqual([...b.tiles.keys()].sort());
    expect(bombsOf(a)).not.toEqual(bombsOf(b));
  });

  it('the public view carries no content seed', () => {
    const island = generateIsland({ seed: 'wire', contentSeed: 'do-not-ship' });
    expect(JSON.stringify(publicView(island))).not.toContain('do-not-ship');
  });

  /**
   * Chests are the ONE thing an undug tile is allowed to advertise, because
   * seeing one and choosing to walk to it is the feature. These pin the edges
   * of that exception — it must stay a hole exactly the size of "a chest is
   * here, this big", and not a crack the rest of the board leaks through.
   */
  describe('the chest exception', () => {
    const withChests = () => {
      const island = generateIsland({ seed: 'chest-wire', contentSeed: 'private' });
      return { island, view: publicView(island) };
    };

    it('shows undug chests, with their tier', () => {
      const { island, view } = withChests();
      const buried = [...island.tiles.entries()]
        .filter(([, t]) => t.content === 'chest' && !t.revealed);
      expect(buried.length).toBeGreaterThan(0);
      expect(view.chests).toHaveLength(buried.length);
      for (const c of view.chests) {
        expect(island.tiles.get(c.tile)!.content).toBe('chest');
        expect(c.tier).toBe(island.tiles.get(c.tile)!.chestTier);
      }
    });

    /**
     * THE leak that would matter. `adjacent` is the minesweeper clue, and
     * handing it out for an undug tile would turn every chest into a free
     * reading of the bombs around it — the walk is supposed to be as dangerous
     * as any other.
     */
    it('leaks no clue number with a chest', () => {
      const { view } = withChests();
      for (const c of view.chests) {
        expect(Object.keys(c).sort()).toEqual(['tier', 'tile']);
      }
    });

    /** Nothing but chests escapes the veil: no bomb, carrot or empty tile. */
    it('advertises nothing else that is still buried', () => {
      const { island, view } = withChests();
      for (const entry of view.revealed) {
        expect(island.tiles.get(entry.tile)!.revealed).toBe(true);
      }
      const shown = new Set(view.chests.map((c) => c.tile));
      for (const [index, tile] of island.tiles) {
        if (tile.revealed || tile.content === 'chest') continue;
        expect(shown.has(index), `tile ${index} (${tile.content}) escaped the veil`).toBe(false);
      }
    });

    /** A dug chest moves to `revealed` and stops being advertised twice. */
    it('stops advertising a chest once it is dug', () => {
      const { island } = withChests();
      const [tile] = [...island.tiles.entries()].find(([, t]) => t.content === 'chest')!;
      revealTile(island, tile);
      const view = publicView(island);
      expect(view.chests.map((c) => c.tile)).not.toContain(tile);
      expect(view.revealed.map((r) => r.tile)).toContain(tile);
    });
  });
});
