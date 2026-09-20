/**
 * THE FIRST ISLAND MUST BE TEACHABLE — on every seed, for every player.
 *
 * The tutorial's captions state a deduction out loud ("seven are already dug,
 * so the bomb is the last one"). If the board it is dealt on does not actually
 * support that deduction, the lesson teaches guessing, which is the opposite
 * of the game. So the property is pinned here rather than left to the eye:
 * across many seeds, the taught bomb has a WITNESS — a revealed tile whose
 * every other neighbour is revealed too, so its number resolves to that one
 * cell.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateIsland, boardNeighbors } from '@/lib/game/island';
import { flagTile, resolveMove, spawnRabbit, teachingHold } from '@/lib/game/run';
import { farmableTiles, spawnTile, terrainNeighbors } from '@/lib/game/terrainBoard';
import { makeShape } from '@/config/gridConfig';
import { TUTORIAL_BOMB, TUTORIAL_CHEST, TUTORIAL_SPAWN } from '@/lib/game/tutorial-map';
import type { Rabbit } from '@/lib/game/types';
import { firstIslandSeed } from '@/lib/game/first-island';

/**
 * OPEN means the player can read this cell's number — dug OR hinted.
 *
 * The distinction matters here and nowhere else in the codebase: at birth the
 * island reveals only the spawn ring (9 tiles) and then CASCADES hints out
 * from every zero in it (another ~30). A witness built from `revealed` alone
 * finds almost nothing, because what the player is actually reading when the
 * run opens is mostly hinted. Measured on one board: 9 revealed, 32 hinted.
 */
const isOpen = (island: ReturnType<typeof generateIsland>, i: number): boolean => {
  const t = island.tiles.get(i);
  return Boolean(t?.revealed || t?.hinted);
};

/** The one bomb the layout deals inside the spawn's reach — the taught one. */
function taughtBomb(island: ReturnType<typeof generateIsland>): number | undefined {
  // The taught bomb is the only bomb touching ground the player can already
  // read: everything else is dealt from three steps out AND out of the ring's
  // sight, so it lights nothing at birth.
  for (const [index, tile] of island.tiles) {
    if (tile.content !== 'bomb') continue;
    if (boardNeighbors(island, index).some((n) => isOpen(island, n))) return index;
  }
  return undefined;
}

describe('the first island is ONE island', () => {
  it('is byte-identical for every player, whatever content seed is passed', () => {
    const boards = ['alice', 'bob', 'carol', 'dave'].map((who) => {
      const island = generateIsland({
        seed: firstIslandSeed(who),
        // Deliberately different, and deliberately ignored: the server passes a
        // fresh randomUUID() here for every island it creates.
        contentSeed: `uuid-${who}-${Math.random()}`,
      });
      return [...island.tiles]
        .sort((a, b) => a[0] - b[0])
        .map(([i, t]) => `${i}:${t.content}:${t.revealed ? 'r' : ''}${t.hinted ? 'h' : ''}`)
        .join('|');
    });
    for (const board of boards) expect(board).toBe(boards[0]);
    // ...and it is a real board, not an empty one that trivially matches.
    expect(boards[0].length).toBeGreaterThan(100);
  });
});

describe('the first island teaches what its captions claim', () => {
  // 300 boards: enough that a 1-in-60 regression cannot hide (60 was, and did
  // — it passed while 7 boards in 250 were broken), fast enough to stay in the
  // ordinary suite. Verified clean at 800.
  const seeds = Array.from({ length: 300 }, (_, i) => firstIslandSeed(`teach-${i}`));

  it('deals a taught bomb that a revealed number PROVES', () => {
    let proven = 0;
    let dealt = 0;
    for (const seed of seeds) {
      const island = generateIsland({ seed, contentSeed: `c-${seed}` });
      const bomb = taughtBomb(island);
      if (bomb === undefined) continue;
      dealt++;
      const witness = boardNeighbors(island, bomb).find((w) => {
        if (!isOpen(island, w)) return false;
        // Every other neighbour open → this witness's count means THIS cell,
        // which is exactly the sentence the tutorial says out loud.
        return boardNeighbors(island, w).every((n) => n === bomb || isOpen(island, n));
      });
      if (witness !== undefined) proven++;
    }
    expect(dealt).toBeGreaterThan(0);
    // EVERY board, not most of them. The captions state the deduction out
    // loud, so a board that cannot support it is a board that teaches
    // guessing — there is no acceptable rate of that below 100%.
    //
    // It took three passes to get here and the numbers are worth keeping: a
    // witness looked for among REVEALED tiles alone proved 5% of boards;
    // counting hinted ones too (what the player actually reads) took it to
    // 62%; and `openTaughtWitness`, which opens the one straggler the cascade
    // left, closes the rest.
    expect(proven).toBe(dealt);
  });

  it('never buries the taught bomb where the spawn already stands', () => {
    for (const seed of seeds.slice(0, 20)) {
      const island = generateIsland({ seed, contentSeed: `c-${seed}` });
      for (const [index, tile] of island.tiles) {
        // A bomb is never revealed and never hinted — the cascade only ever
        // opens the neighbours of a ZERO, and a zero has no bomb beside it.
        if (tile.content === 'bomb') expect(isOpen(island, index)).toBe(false);
      }
      expect(island.tiles.size).toBeGreaterThan(0);
    }
  });
});

describe('the first island holds the player at its lesson', () => {
  const build = () => generateIsland({
    seed: firstIslandSeed('hold'),
    contentSeed: 'whatever',
  });

  it('names the taught bomb while it is unmarked, and lets go once it is flagged', () => {
    const island = build();
    const held = teachingHold(island);
    expect(held, 'the tutorial board must have a bomb to teach').not.toBeNull();
    expect(island.tiles.get(held!)?.content).toBe('bomb');

    // Marking it is what ends the hold — nothing else does.
    island.tiles.get(held!)!.flagged = true;
    expect(teachingHold(island)).toBeNull();
  });

  it('never holds an ordinary island', () => {
    const ordinary = generateIsland({ seed: 'meadow-1', contentSeed: 'c' });
    expect(teachingHold(ordinary)).toBeNull();
  });

  it('cannot be FINISHED without marking the bomb — the leak that shipped once', () => {
    /**
     * The regression this exists for. The hold first read
     * `!revealed && !hinted`, which let a player step on HINTED ground — and
     * a hinted tile is still buried, so stepping on it digs it and cascades
     * another ring open, which hints more tiles, which are steppable too. The
     * hold leaked one ring at a time until the player walked onto the chest
     * and finished the tutorial having marked nothing. Seen in a live run on
     * 2026-09-20: tiles 497, 498, 467, then the chest at 436.
     */
    const island = build();
    const shape = makeShape(island.seed);
    const rabbit = spawnRabbit('p1', 'Greedy', undefined, island.seed);

    let clock = 1_000_000;
    let finished = false;
    let dug = 0;
    // A player clicking every neighbour they can, as fast as the server allows.
    for (let step = 0; step < 400 && !finished; step++) {
      let moved = false;
      for (const to of terrainNeighbors(island.seed, rabbit.tile)) {
        clock += 400;
        const wasBuried = !island.tiles.get(to)?.revealed;
        const out = resolveMove(island, rabbit, to, shape, () => 0.5, clock);
        if (!out.ok) continue;
        moved = true;
        if (wasBuried && out.dig) dug++;
        if (out.tutorialDone) finished = true;
        break;
      }
      if (!moved) break;
    }

    expect(finished, 'the tutorial must not be completable while the bomb is unmarked').toBe(false);
    expect(teachingHold(island), 'the lesson is still standing').not.toBeNull();
    // The one door the hold opens is the step that reaches the bomb, so the
    // walker ends up beside it rather than frozen on the spawn.
    expect(dug).toBeLessThanOrEqual(2);
  });

  it('leaves the bomb REACHABLE, or the hold would be a deadlock', () => {
    // `flagTile` needs the rabbit standing next to the cell it marks. Holding
    // to already-dug ground alone stranded the player: 9 reachable tiles and
    // none of them beside the bomb, so the lesson could never be finished.
    const island = build();
    const shape = makeShape(island.seed);
    const rabbit = spawnRabbit('p1', 'Walker', undefined, island.seed);
    const bomb = teachingHold(island)!;

    /**
     * Walk the corridor, never turning back.
     *
     * A greedy walker that revisits cells just ping-pongs between the first
     * two open tiles for ever, which says nothing about whether the lesson is
     * reachable. Refusing to step back is what makes it walk the corridor to
     * its end — which is the cell beside the bomb, because the hold refuses
     * the bomb itself.
     */
    let clock = 1_000_000;
    const visited = new Set<number>([rabbit.tile]);
    for (let step = 0; step < 400; step++) {
      let moved = false;
      for (const to of terrainNeighbors(island.seed, rabbit.tile)) {
        if (visited.has(to)) continue;
        clock += 400;
        if (resolveMove(island, rabbit, to, shape, () => 0.5, clock).ok) {
          visited.add(to);
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    // The walk ends WITHIN REACH of the bomb — that is what `flagTile` needs.
    expect(boardNeighbors(island, rabbit.tile)).toContain(bomb);

    // ...and marking it from there both works and ends the hold.
    const out = flagTile(island, rabbit, bomb, clock + 1000);
    expect(out.ok).toBe(true);
    expect(out.flag?.correct).toBe(true);
    expect(teachingHold(island)).toBeNull();
  });

  it('refuses a dig past the lesson, but still allows walking open ground', () => {
    const island = build();
    const spawn = [...island.tiles].find(([, t]) => t.revealed)?.[0];
    expect(spawn).toBeDefined();

    const rabbit: Rabbit = {
      id: 'r', playerId: 'p', name: 'tester', crowned: false,
      tile: spawn!, energy: 100, carrots: 0, alive: true,
      stunnedUntil: 0, lastMoveAt: 0,
    } as unknown as Rabbit;

    const shape = makeShape(island.seed);
    const rng = () => 0.5;
    // A step onto UNOPENED ground is refused while the lesson stands...
    const shut = boardNeighbors(island, spawn!)
      .find((n) => { const t = island.tiles.get(n); return t && !t.revealed && !t.hinted; });
    if (shut !== undefined) {
      const out = resolveMove(island, rabbit, shut, shape, rng, 10_000);
      expect(out.ok).toBe(false);
      expect(out.rejection).toBe('learn-first');
    }

    // ...while ground the player can already read stays walkable, so they are
    // held at the lesson rather than frozen in place.
    const open = boardNeighbors(island, spawn!)
      .find((n) => { const t = island.tiles.get(n); return t?.revealed || t?.hinted; });
    if (open !== undefined) {
      const out = resolveMove(island, rabbit, open, shape, rng, 20_000);
      expect(out.rejection).not.toBe('learn-first');
    }
  });
});

describe('the tutorial corridor', () => {
  const seeds = ['a', 'b', 'c'].map((s) => firstIslandSeed(`corridor-${s}`));

  it('opens on exactly ONE way to go', () => {
    // The shape is the lesson: a spawn with eight neighbours offers eight
    // wrong turns, and the sea saying "this way" needs no caption at all.
    for (const seed of seeds) {
      expect(spawnTile(seed)).toBe(TUTORIAL_SPAWN);
      expect(terrainNeighbors(seed, TUTORIAL_SPAWN)).toHaveLength(1);
    }
  });

  it('is still walkable to the chest AFTER the bomb is marked', () => {
    /**
     * The regression this exists for. A marked bomb is a wall — `resolveMove`
     * refuses a step onto a flagged tile so a slip of the thumb cannot cost a
     * run — and the first corridor ran straight THROUGH the bomb. The moment
     * the player learned the lesson, the island sealed itself: the chest was
     * unreachable and the tutorial could not be finished. Caught in
     * simulation, on 2026-09-20, the same day the corridor was drawn.
     */
    for (const seed of seeds) {
      const island = generateIsland({ seed, contentSeed: 'c' });
      const bomb = teachingHold(island)!;
      expect(bomb).toBe(TUTORIAL_BOMB);
      island.tiles.get(bomb)!.flagged = true;

      // Walk from the spawn without ever stepping on the flagged bomb.
      const seen = new Set<number>([TUTORIAL_SPAWN]);
      const queue = [TUTORIAL_SPAWN];
      while (queue.length) {
        const cell = queue.shift()!;
        for (const n of terrainNeighbors(seed, cell)) {
          if (seen.has(n) || n === bomb) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      expect(seen.has(TUTORIAL_CHEST), `${seed}: the chest must survive the X`).toBe(true);
    }
  });

  it('keeps the corridor clear of scenery, or it is cut in two', () => {
    // A tree removes its cell from the board entirely (`farmableTiles`), which
    // on a one-cell corridor is not texture but a severed island: measured, a
    // single pine left 11 tiles visible and unreachable.
    for (const seed of seeds) {
      const walkable = new Set(farmableTiles(seed));
      const seen = new Set<number>([TUTORIAL_SPAWN]);
      const queue = [TUTORIAL_SPAWN];
      while (queue.length) {
        const cell = queue.shift()!;
        for (const n of terrainNeighbors(seed, cell)) {
          if (seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      for (const tile of walkable) {
        expect(seen.has(tile), `${seed}: tile ${tile} is stranded`).toBe(true);
      }
    }
  });
});

describe('the tutorial points at ONE thing at a time', () => {
  /**
   * The scene is a Pixi object and cannot be built in a unit test, so this
   * pins the RULE the scene follows, as source: the chest's arrow is planted
   * only when no bomb is being taught. Paul, 2026-09-20: "les arrow sont
   * melange... la fleche doit etre sur mark a bomb pas sur le chest; des que
   * tu as mis la croix tu vas sur le chest."
   */
  const SCENE = readFileSync('src/game/scenes/IslandScene.ts', 'utf8');

  it('holds the chest arrow back while a bomb is still being taught', () => {
    const fn = SCENE.slice(SCENE.indexOf('private pointAtTutorialChest'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    expect(body).toMatch(/if \(this\.taughtBomb !== null\) return;/);
  });

  it('draws NOTHING but the cross on the taught cell', () => {
    /**
     * Three marks landed on one tile once: the ghost X, a gold chevron, and
     * the keyboard hint's white triangle — `MoveArrows` puts one on every
     * reachable neighbour, and a one-way corridor's only neighbour is the
     * cell being taught. "Les arrow se superpose" (Paul, 2026-09-20).
     *
     * The cross says which cell AND what to do to it, so it is the only mark
     * that stays.
     */
    const fn = SCENE.slice(SCENE.indexOf('teachBomb(tile: number | null)'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    expect(body).not.toMatch(/new ChestPointer/);
    // ...and the keyboard marks stand down while a bomb is being taught.
    expect(SCENE).toMatch(/const teaching = this\.taughtBomb !== null;/);
  });

  it('hands over to the chest the moment the lesson ends', () => {
    const fn = SCENE.slice(SCENE.indexOf('teachBomb(tile: number | null)'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    // Null means "the X is placed": that is where the chest is allowed to ask.
    expect(body).toMatch(/if \(tile === null\)[\s\S]*pointAtTutorialChest/);
  });
});
