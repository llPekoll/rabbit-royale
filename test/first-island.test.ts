/**
 * The first island is AUTHORED, and these are the beats it promises.
 *
 * A tutorial that sometimes opens on a "2", or buries its golden carrot on
 * the far shore, teaches a different lesson to every third player. The layout
 * is dealt by hand in `firstIslandLayout` (island.ts) so that it cannot; this
 * file is what says so when a change to the terrain or the densities quietly
 * breaks the deal. See FIRST_RUN in tuning for the beats in prose.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boardNeighbors, generateIsland, islandProgress } from '../src/lib/game/island';
import { farmableTiles, spawnTile, terrainNeighbors } from '../src/lib/game/terrainBoard';
import { firstIslandSeed, isFirstIsland } from '../src/lib/game/first-island';
import {
  TUTORIAL_BOMB, TUTORIAL_CHEST, TUTORIAL_CLUE, TUTORIAL_LAND, TUTORIAL_SPAWN,
} from '../src/lib/game/tutorial-map';
import { resolveMove, spawnRabbit, teachingHold } from '../src/lib/game/run';
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
      // A CORRIDOR since 2026-09-20, not a pocket of coastline: the tutorial
      // is drawn by hand in `tutorial-map.ts` so that the first steps have one
      // place to go and the sea does the guiding. Seventeen cells, and the
      // count is a fact about that picture rather than about a generator.
      // Not every drawn cell becomes a tile: `farmableTiles` drops whatever
      // the terrain put a tree or a rock on. The bar is that the corridor is
      // tiny and whole, not an exact count that a scenery roll can move.
      expect(tiles.length).toBeGreaterThanOrEqual(TUTORIAL_LAND.length - 6);
      expect(tiles.length).toBeLessThanOrEqual(TUTORIAL_LAND.length);
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

  it('opens on ONE way to go — the corridor, not a ring', () => {
    // The shape IS the lesson. A spawn with eight neighbours offers eight
    // wrong turns; this one offers a single step, and the sea says so without
    // a caption. Paul, 2026-09-20: "au debut t'as qu'une case ou aller tout le
    // reste c'est de l'eau".
    for (const seed of SEEDS) {
      const spawn = spawnTile(seed);
      expect(spawn).toBe(TUTORIAL_SPAWN);
      expect(terrainNeighbors(seed, spawn)).toHaveLength(1);
    }
  });

  it('forces the deduction: the clue reads 1 and only the bomb is left', () => {
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const clue = island.tiles.get(TUTORIAL_CLUE)!;
      expect(clue.adjacent).toBe(1);
      // HINTED, not dug: the cascade writes its number on the lid from the
      // spawn, so the player sees the "1" from where they land and walks to
      // it. Reading it costs nothing; the tile is still theirs to dig.
      expect(clue.revealed || clue.hinted).toBe(true);
      // Every neighbour the clue has is open except the bomb, so its "1" can
      // only be pointing at that one cell. This is the sentence the captions
      // say out loud, pinned as a property of the board.
      const shut = boardNeighbors(island, TUTORIAL_CLUE)
        .filter((n) => { const t = island.tiles.get(n); return !t?.revealed && !t?.hinted; });
      expect(shut).toEqual([TUTORIAL_BOMB]);
    }
  });

  it('buries exactly ONE bomb, where the map puts it', () => {
    // One bomb on the whole island: the tutorial teaches the X, and a second
    // bomb is a second lesson nobody asked for on a 17-cell corridor.
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const bombs = [...island.tiles].filter(([, t]) => t.content === 'bomb').map(([i]) => i);
      expect(bombs).toEqual([TUTORIAL_BOMB]);
    }
  });

  it('shows one chest, the lowest tier, a short walk away', () => {
    for (const seed of SEEDS) {
      const island = generateIsland({ seed, contentSeed: `content-${seed}` });
      const dist = steps(seed, spawnTile(seed));
      const chests = [...island.tiles].filter(([, t]) => t.content === 'chest');
      expect(chests).toHaveLength(1);
      const [tile, chest] = chests[0];
      expect(tile).toBe(TUTORIAL_CHEST);
      expect(chest.chestTier).toBe(CHEST_TIER_WEIGHTS[0].kind);
      // Past the bomb, so the lesson is behind the player when they reach it.
      expect(dist.get(tile)!).toBeGreaterThanOrEqual(3);
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
      // THE LESSON IS DONE FIRST. The first island holds the player until its
      // taught bomb wears an X (`teachingHold`), so a rabbit teleported to the
      // chest with the lesson still open has its dig refused — correctly. This
      // test is about the DIG, so the X is granted here rather than walked to.
      const held = teachingHold(island);
      if (held !== null) island.tiles.get(held)!.flagged = true;
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

  it('celebrates the chest on the DIG, not on the recap', () => {
    // The jump and the fanfare belong to the moment the box opens. Pinned to
    // the source because a Pixi scene needs a GL context to test directly, and
    // the WIRING is the part that breaks: `move_result` is private to the
    // mover, while `tile_revealed` goes to the whole island — celebrating from
    // the broadcast would have every rabbit dancing for somebody else's chest.
    const socket = readFileSync(new URL('../src/components/use-game-socket.ts', import.meta.url), 'utf8');
    const handler = socket.slice(socket.indexOf("socket.on('move_result'"));
    const body = handler.slice(0, handler.indexOf('\n    });'));
    expect(body).toMatch(/tutorialDone.*celebrateChest/s);
    // The call must come BEFORE the loot early-return — the tutorial's chest is
    // bronze and pays plain carrots, which that return skips, so a call placed
    // after it would never run. Asserted on the CODE either side of the return
    // rather than on string positions: the comment above the call travels with
    // it, so comparing indexOf() offsets cannot tell the two orders apart
    // (verified by mutating the source — the offset check passed both ways).
    const beforeReturn = body.slice(0, body.indexOf('if (!r.dig?.loot) return;'));
    expect(beforeReturn).toMatch(/if \(r\.tutorialDone\) toScene/);

    // And the scene plays the win track rather than inventing a second one.
    const scene = readFileSync(new URL('../src/game/scenes/IslandScene.ts', import.meta.url), 'utf8');
    const celebrate = scene.slice(scene.indexOf('celebrateChest()'));
    expect(celebrate.slice(0, 400)).toMatch(/MUSIC_VICTORY/);
    expect(celebrate.slice(0, 400)).toMatch(/celebrate\(\)/);
  });

  it('points at the chest with the game\'s own arrow sprite', () => {
    // A hand-drawn Graphics triangle stood here first and read as a debug
    // marker beside the game's art. The kit chevron (ARROW_DOWN) is what the
    // burrow already hangs over a raid's goal — same job, same picture.
    const fx = readFileSync(new URL('../src/game/fx/ChestPointer.ts', import.meta.url), 'utf8');
    expect(fx).toMatch(/Keys\.ARROW_DOWN/);
    expect(fx).not.toMatch(/new Graphics\(\)/);
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

  it('IGNORES the content seed — the tutorial is one fixed board', () => {
    // The opposite of every other island, and deliberately so (2026-09-20).
    // Elsewhere the content seed is a private randomUUID() so that holding the
    // public seed tells you nothing about the bombs. The tutorial trades that
    // secrecy for control: it is a scripted lesson whose captions state a
    // deduction and whose run is held until the bomb is marked, and all of
    // that needs the same board under every player. See FIRST_ISLAND_GROUND.
    const seed = firstIslandSeed('secret');
    const a = generateIsland({ seed, contentSeed: 'one' });
    const b = generateIsland({ seed, contentSeed: 'two' });
    const bombsOf = (isl: typeof a) => [...isl.tiles].filter(([, t]) => t.content === 'bomb').map(([i]) => i);
    expect(bombsOf(a)).toEqual(bombsOf(b));
    expect(bombsOf(a).length).toBeGreaterThan(0);
  });

  it('still hides the bombs behind the content seed on every OTHER island', () => {
    const a = generateIsland({ seed: 'meadow-secret', contentSeed: 'one' });
    const b = generateIsland({ seed: 'meadow-secret', contentSeed: 'two' });
    const bombsOf = (isl: typeof a) => [...isl.tiles].filter(([, t]) => t.content === 'bomb').map(([i]) => i);
    expect(bombsOf(a)).not.toEqual(bombsOf(b));
  });
});
