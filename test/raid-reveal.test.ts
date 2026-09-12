/**
 * What a raider is allowed to SEE of somebody else's burrow.
 *
 * The information contract used to be about numbers only: a raider read clue
 * counts for tiles near where they had walked, and never the trap positions.
 * The ground itself was not a secret, because every burrow in the game was the
 * same painting and there was nothing about its shape left to learn.
 *
 * Generated burrows changed that, and the raid screen did not follow: the
 * defender's whole homestead — the cliffs, the trees, the building, the garden
 * — was drawn in full colour with a dim wash over the tiles not yet read. A
 * raider could see the route, the objective and every obstacle before their
 * first step, which is the crossing solved in advance.
 *
 * So the shape of the land is now part of what is hidden, and these pin the
 * rule in the one place it can be asserted without a canvas: the PAYLOAD.
 * Whatever the renderer does, it can only draw what it is handed.
 */
import { describe, expect, it } from 'vitest';
import { raiderView, trapClues, distanceToField } from '../src/lib/game/raid';
import {
  burrowNeighbors, entranceTile, fieldTiles, walkableTiles, isTrappable,
} from '../src/game/burrow/board';
import { burrowBuilding } from '../src/game/burrow/buildings';
import { BURROW_COLS } from '../src/game/burrow/generate';

const SEEDS = [
  'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk',
  'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b',
  'player-1',
  'player-2',
] as const;

const forEachBurrow = (name: string, check: (seed: string) => void) =>
  it(name, () => {
    for (const seed of SEEDS) {
      try {
        check(seed);
      } catch (err) {
        throw new Error(`seed "${seed}": ${(err as Error).message}`);
      }
    }
  });

/** Walk greedily towards the field, as a competent raider would. */
function walk(seed: string, steps: number): number[] {
  const dist = distanceToField(seed);
  let at = entranceTile(seed);
  const walked = [at];
  for (let i = 0; i < steps; i++) {
    const next = burrowNeighbors(seed, at)
      .filter((n) => !walked.includes(n))
      .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))[0];
    if (next === undefined) break;
    at = next;
    walked.push(at);
  }
  return walked;
}

describe('what a raid reveals', () => {
  forEachBurrow('shows only a sliver of the homestead at the door', (seed) => {
    const view = raiderView(seed, [entranceTile(seed)], trapClues(seed, []), false);
    // Nine cells at most — where you stand, and the eight around it. Against a
    // homestead of well over a hundred walkable tiles.
    expect(view.length).toBeLessThanOrEqual(9);
    expect(view.length * 4).toBeLessThan(walkableTiles(seed).length);
  });

  forEachBurrow('never names the garden from the doorway', (seed) => {
    // The objective is the thing a raider is crossing FOR. Seeing where it is
    // from the door turns the crossing into a straight line.
    const shown = new Set(
      raiderView(seed, [entranceTile(seed)], trapClues(seed, []), false).map((v) => v.tile),
    );
    expect(fieldTiles(seed).some((f) => shown.has(f))).toBe(false);
  });

  forEachBurrow('never names the burrow building from the doorway', (seed) => {
    // The building stands beside the garden, so showing it early is showing
    // the raider which way to walk. It is the loudest thing on the board.
    const b = burrowBuilding(seed, 1);
    const shown = new Set(
      raiderView(seed, [entranceTile(seed)], trapClues(seed, []), false).map((v) => v.tile),
    );
    expect(shown.has(b.y * BURROW_COLS + b.x)).toBe(false);
  });

  forEachBurrow('grows only as fast as the raider walks', (seed) => {
    const clues = trapClues(seed, []);
    let last = 0;
    for (const steps of [0, 2, 4, 6]) {
      const seen = raiderView(seed, walk(seed, steps), clues, false).length;
      // Monotonic, and never a jump to the whole board.
      expect(seen).toBeGreaterThanOrEqual(last);
      expect(seen).toBeLessThan(walkableTiles(seed).length);
      last = seen;
    }
  });

  forEachBurrow('tells the client which shelf every revealed tile is on', (seed) => {
    // The renderer hides unrevealed ground entirely, so a tile arriving
    // without its tier would be drawn at sea level — inside the cliff it is
    // supposed to be standing on.
    const view = raiderView(seed, walk(seed, 4), trapClues(seed, []), false);
    expect(view.every((v) => Number.isInteger(v.tier) && v.tier >= 1)).toBe(true);
  });

  forEachBurrow('carries nothing but tile, clue and tier', (seed) => {
    // The payload is the whole security boundary: the renderer can only draw
    // what it is handed, so a field added here is a field a raider can read.
    const mined = walkableTiles(seed).filter((t) => isTrappable(seed, t)).slice(0, 5);
    const view = raiderView(seed, walk(seed, 3), trapClues(seed, mined), false);
    for (const entry of view) {
      expect(Object.keys(entry).sort()).toEqual(['clue', 'tier', 'tile']);
    }
  });

  forEachBurrow('still hides the numbers under a smoke screen, but not the ground', (seed) => {
    // Blind is not the same as void: a raider who has uncovered ground must go
    // on seeing that ground, or a smoke screen would erase the board they are
    // standing on rather than the clues written over it.
    const walked = walk(seed, 3);
    const lit = raiderView(seed, walked, trapClues(seed, []), false);
    const dark = raiderView(seed, walked, trapClues(seed, []), true);
    expect(dark.map((v) => v.tile).sort()).toEqual(lit.map((v) => v.tile).sort());
    expect(dark.every((v) => v.clue === null)).toBe(true);
  });
});
