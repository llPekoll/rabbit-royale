/**
 * The first island is AUTHORED, and these are the beats it promises.
 *
 * A tutorial that sometimes opens on a "2", or buries its golden carrot on
 * the far shore, teaches a different lesson to every third player. The layout
 * is dealt by hand in `firstIslandLayout` (island.ts) so that it cannot; this
 * file is what says so when a change to the terrain or the densities quietly
 * breaks the deal. See FIRST_RUN in tuning for the beats in prose.
 */
import { describe, expect, it } from 'vitest';
import { generateIsland, islandProgress } from '../src/lib/game/island';
import { farmableTiles, spawnTile, terrainNeighbors } from '../src/lib/game/terrainBoard';
import { firstIslandSeed, isFirstIsland } from '../src/lib/game/first-island';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape } from '../src/config/gridConfig';
import { mulberry32 } from '../src/lib/game/rng';
import { CHEST_TIER_WEIGHTS, FIRST_RUN, ISLAND_TIERS } from '../config/tuning';

const SEEDS = Array.from({ length: 30 }, (_, i) => firstIslandSeed(`test-${i}`));

/** Steps from the spawn, over the terrain's own moves. */
function steps(seed: string, spawn: number): Map<number, number> {
  const dist = new Map<number, number>([[spawn, 0]]);
  const queue = [spawn];
  for (let h = 0; h < queue.length; h++) {
    const here = queue[h];
    for (const nb of terrainNeighbors(seed, here)) {
      if (dist.has(nb)) continue;
      dist.set(nb, dist.get(here)! + 1);
      queue.push(nb);
    }
  }
  return dist;
}

describe('the first island', () => {
  it('is named by its seed alone', () => {
    expect(isFirstIsland(firstIslandSeed('abc'))).toBe(true);
    expect(isFirstIsland('abc')).toBe(false);
  });

  it('is small enough to clear in one sitting, and all of a piece', () => {
    for (const seed of SEEDS) {
      const tiles = farmableTiles(seed);
      expect(tiles.length).toBeGreaterThan(40);
      expect(tiles.length).toBeLessThan(100);
      // Every farmable tile is reachable from the spawn: a prize the player
      // can see and never reach is worse than no prize.
      const reach = steps(seed, spawnTile(seed));
      for (const t of tiles) expect(reach.has(t), `${seed} tile ${t}`).toBe(true);
    }
  });

  it('is a fraction of an ordinary island', () => {
    const first = farmableTiles(firstIslandSeed('size')).length;
    const plain = farmableTiles('size').length;
    expect(first * 4).toBeLessThan(plain);
  });

  it('opens on a ring of zeros and exactly one "1"', () => {
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const spawn = spawnTile(seed);
      const ring = terrainNeighbors(seed, spawn);
      const hints = ring.map((i) => island.tiles.get(i)!.adjacent);
      expect(island.tiles.get(spawn)!.adjacent).toBe(0);
      expect(hints.filter((h) => h === 1)).toHaveLength(1);
      expect(hints.filter((h) => h === 0)).toHaveLength(ring.length - 1);
      for (const i of [spawn, ...ring]) expect(island.tiles.get(i)!.revealed).toBe(true);
    }
  });

  it('puts the taught bomb two steps out and nothing else explosive that close', () => {
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const dist = steps(seed, spawnTile(seed));
      const near = [...island.tiles].filter(([i, t]) => t.content === 'bomb' && dist.get(i)! <= 2);
      expect(near).toHaveLength(1);
      expect(dist.get(near[0][0])).toBe(2);
    }
  });

  it('keeps the heart back beside the lesson', () => {
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const dist = steps(seed, spawnTile(seed));
      const taught = [...island.tiles].find(([i, t]) => t.content === 'bomb' && dist.get(i) === 2)![0];
      const golden = [...island.tiles].filter(([, t]) => t.content === 'golden').map(([i]) => i);
      expect(golden).toHaveLength(1);
      expect(terrainNeighbors(seed, taught)).toContain(golden[0]);
    }
  });

  it('shows one chest, the lowest tier, a short walk away', () => {
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const dist = steps(seed, spawnTile(seed));
      const chests = [...island.tiles].filter(([, t]) => t.content === 'chest');
      expect(chests).toHaveLength(1);
      const [tile, chest] = chests[0];
      expect(chest.chestTier).toBe(CHEST_TIER_WEIGHTS[0].kind);
      expect(dist.get(tile)!).toBeGreaterThanOrEqual(3);
      expect(dist.get(tile)!).toBeLessThanOrEqual(FIRST_RUN.CHEST_MAX_DISTANCE);
    }
  });

  it('ends the run when its chest is opened', () => {
    // THE CHEST IS THE ENDING. Everything before it is the lesson — walk, read
    // the numbers, survive the bomb — and once the box is open the island has
    // nothing left to teach. Letting it run on would leave a first-time player
    // in a field of ordinary carrots waiting for an eruption clock they have
    // no reason to sit through, when the recap (and the burrow behind it) is
    // what they should be looking at.
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const shape = makeShape(seed);
      const [chest] = [...island.tiles].find(([, t]) => t.content === 'chest')!;
      const rabbit = spawnRabbit('p1', 'Test', undefined, seed);
      // Walked to the chest's doorstep — the walk itself is `run.test.ts`'s
      // business, and what is under test here is the DIG.
      rabbit.tile = terrainNeighbors(seed, chest)[0];

      const out = resolveMove(island, rabbit, chest, shape, mulberry32(1), 1_000_000);
      expect(out.ok, seed).toBe(true);
      expect(out.tutorialDone, seed).toBe(true);
      expect(out.runOver, seed).toBe(true);
      // ALIVE on the prize: the rabbit is standing on the chest it just opened,
      // and the server reads this to withhold `rabbit_died` — which would slump
      // it and drain the map to grey, the picture of running out of energy.
      expect(rabbit.alive, seed).toBe(true);
    }
  });

  it('does not end an ORDINARY island on a chest', () => {
    // The rule is the tutorial's alone. On any other board a chest is one
    // prize among many and the run goes on — ending it there would cut every
    // run short at its first box.
    const seed = 'plain';
    const island = generateIsland({ seed, contentSeed: 'content-plain' });
    const shape = makeShape(seed);
    const [chest] = [...island.tiles].find(([, t]) => t.content === 'chest')!;
    const rabbit = spawnRabbit('p1', 'Test', undefined, seed);
    rabbit.tile = terrainNeighbors(seed, chest)[0];

    const out = resolveMove(island, rabbit, chest, shape, mulberry32(1), 1_000_000);
    expect(out.ok).toBe(true);
    expect(out.tutorialDone).toBeUndefined();
    expect(out.runOver).toBe(false);
  });

  it('is gentler than Meadow and richer, so the first recap shows a haul', () => {
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const total = island.tiles.size;
      let bombs = 0; let carrots = 0;
      for (const t of island.tiles.values()) {
        if (t.content === 'bomb') bombs++;
        if (t.content === 'carrot' || t.content === 'golden') carrots++;
      }
      expect(bombs / total).toBeLessThan(ISLAND_TIERS[0].bombDensity);
      expect(carrots / total).toBeGreaterThan(ISLAND_TIERS[0].carrotDensity);
      // The eruption clock is the safe tiles: all of them are diggable.
      expect(islandProgress(island).safeTotal).toBe(total - bombs);
    }
  });

  it('still hides the bombs behind the content seed', () => {
    const seed = firstIslandSeed('secret');
    const a = generateIsland({ seed, contentSeed: 'one' });
    const b = generateIsland({ seed, contentSeed: 'two' });
    const bombsOf = (isl: typeof a) => [...isl.tiles].filter(([, t]) => t.content === 'bomb').map(([i]) => i);
    expect(bombsOf(a)).not.toEqual(bombsOf(b));
  });
});
