/**
 * The generated burrow, and the promises a raid rests on.
 *
 * This replaces `burrow-calibration`, which checked that the board's origin
 * and layout landed on the SOIL A PAINTING DREW — the right test while the
 * burrow was one picture with an invisible grid over it, and meaningless now
 * that the ground is tiles cut from the owner's seed. What was worth keeping
 * from it is the instinct: the thing that silently rots is the relationship
 * between the board and what is drawn on it, so assert it rather than eyeball
 * it.
 *
 * The promises here are the ones the rest of the game assumes without checking:
 *
 *   - the same seed always grows the same burrow (the server validates raids
 *     against this and the client draws it, independently);
 *   - the board is big enough, connected, and crossable;
 *   - the building stands on the burrow's own ground, beside its field, and
 *     does not move when the burrow is upgraded.
 *
 * Every one of them is checked over a SPREAD of seeds. A generator that holds
 * for the seed a developer happened to try is not a generator that holds.
 */
import { describe, expect, it } from 'vitest';
import {
  burrowTerrain, BURROW_COLS, BURROW_ROWS, MIN_CROSSING,
} from '../src/game/burrow/generate';
import {
  burrowFor, burrowCell, burrowNeighbors, burrowTier, entranceTile, fieldTiles,
  walkableTiles,
} from '../src/game/burrow/board';
import { burrowBuilding, BURROW_BUILDING_TIERS } from '../src/game/burrow/buildings';
import { levelAt } from '../src/game/island/generate';

/**
 * Enough seeds to be a sample rather than an anecdote, shaped like the ids the
 * game actually uses — a wallet address, a guest uuid, a plain name.
 */
const SEEDS = [
  'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk',
  'sol:DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
  'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b',
  'guest:8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d',
  'player-1',
  'player-2',
  'player-3',
  'player-4',
] as const;

/** Run one assertion over every sample burrow, naming the seed that failed. */
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

describe('burrow terrain', () => {
  forEachBurrow('is deterministic in the seed alone', (seed) => {
    // The load-bearing promise of the whole design: the server has no canvas
    // and the browser has no database, and they have to agree about the
    // ground without it crossing the wire.
    const a = burrowTerrain(seed);
    const b = burrowTerrain(seed);
    expect([...a.map.level]).toEqual([...b.map.level]);
    expect(a.cells).toEqual(b.cells);
    expect(a.entrance).toBe(b.entrance);
    expect(a.field).toEqual(b.field);
    expect(a.placements).toEqual(b.placements);
  });

  forEachBurrow('fills the board it claims to fill', (seed) => {
    const { map, cells } = burrowFor(seed);
    expect(map.width).toBe(BURROW_COLS);
    expect(map.height).toBe(BURROW_ROWS);
    expect(cells).toHaveLength(BURROW_COLS * BURROW_ROWS);
  });

  forEachBurrow('keeps a rim of sea around the homestead', (seed) => {
    // The renderer depends on it: a shore cell on the border has nowhere to
    // put its foam, and a plateau there loses the row its cliff stands on.
    const { map } = burrowFor(seed);
    for (let c = 0; c < BURROW_COLS; c++) {
      expect(levelAt(map, c, 0)).toBe(0);
      expect(levelAt(map, c, BURROW_ROWS - 1)).toBe(0);
    }
    for (let r = 0; r < BURROW_ROWS; r++) {
      expect(levelAt(map, 0, r)).toBe(0);
      expect(levelAt(map, BURROW_COLS - 1, r)).toBe(0);
    }
  });

  forEachBurrow('never calls open sea walkable', (seed) => {
    // A tile off the island is not a cell a raider can be standing on, and one
    // that answered otherwise would let a step be validated into the water.
    for (const tile of walkableTiles(seed)) {
      expect(burrowTier(seed, tile)).toBeGreaterThan(0);
    }
  });

  forEachBurrow('puts the entrance on the rim, at ground level', (seed) => {
    // A door in the middle of the homestead puts the raider past half the
    // ground the defender is protecting before they have taken a step; one on
    // a shelf has them looking down on the whole crossing.
    const entrance = entranceTile(seed);
    const col = entrance % BURROW_COLS;
    const row = Math.floor(entrance / BURROW_COLS);
    const toEdge = Math.min(col, row, BURROW_COLS - 1 - col, BURROW_ROWS - 1 - row);
    expect(toEdge).toBeLessThanOrEqual(3);
    expect(burrowTier(seed, entrance)).toBe(1);
  });

  forEachBurrow('puts the field a real walk away from the door', (seed) => {
    expect(burrowFor(seed).crossing).toBeGreaterThanOrEqual(MIN_CROSSING);
  });

  forEachBurrow('grows the field on ONE shelf', (seed) => {
    // A garden spilling over a cliff edge reads as two gardens, and the crop
    // sprites planted on it would float off the drop.
    const tiers = new Set(fieldTiles(seed).map((t) => burrowTier(seed, t)));
    expect(tiers.size).toBe(1);
  });

  forEachBurrow('keeps the field in one connected patch', (seed) => {
    // Reaching ANY field tile wins the raid, so a garden in two halves would
    // quietly mean two objectives at two different distances.
    const field = new Set(fieldTiles(seed));
    const seen = new Set([fieldTiles(seed)[0]]);
    const queue = [fieldTiles(seed)[0]];
    while (queue.length) {
      for (const n of burrowNeighbors(seed, queue.pop()!)) {
        if (field.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    expect(seen.size).toBe(field.size);
  });

  forEachBurrow('never steps a raider up a cliff', (seed) => {
    // Two adjacent tiles can both be walkable and still not connected: one is
    // a shelf above the other. The rule has to be the island's, or a player
    // learns what a cliff means twice.
    for (const tile of walkableTiles(seed)) {
      const here = burrowTier(seed, tile);
      for (const n of burrowNeighbors(seed, tile)) {
        expect(Math.abs(burrowTier(seed, n) - here)).toBeLessThanOrEqual(1);
      }
    }
  });

  forEachBurrow('makes neighbourliness mutual', (seed) => {
    // A one-way step would let a raider walk into a pocket they cannot leave,
    // which ends their raid on a rule they cannot see.
    for (const tile of walkableTiles(seed)) {
      for (const n of burrowNeighbors(seed, tile)) {
        expect(burrowNeighbors(seed, n)).toContain(tile);
      }
    }
  });
});

describe('the burrow building', () => {
  forEachBurrow('stands on the burrow\'s own walkable ground', (seed) => {
    const b = burrowBuilding(seed, 1);
    const tile = b.y * BURROW_COLS + b.x;
    // Ground, not the field (it would bury the objective) and not the door.
    expect(burrowCell(seed, tile)).toBe('ground');
    expect(b.tier).toBeGreaterThan(0);
  });

  forEachBurrow('stands beside the garden it is defending', (seed) => {
    const b = burrowBuilding(seed, 1);
    const near = fieldTiles(seed).some((t) => {
      const col = t % BURROW_COLS;
      const row = Math.floor(t / BURROW_COLS);
      return Math.max(Math.abs(col - b.x), Math.abs(row - b.y)) <= 3;
    });
    expect(near).toBe(true);
  });

  forEachBurrow('does not move when the burrow is upgraded', (seed) => {
    // A player's home walking across their garden every time they pay for it
    // is the bug this is here to prevent.
    const first = burrowBuilding(seed, 1);
    for (let level = 2; level <= 8; level++) {
      const later = burrowBuilding(seed, level);
      expect({ x: later.x, y: later.y }).toEqual({ x: first.x, y: first.y });
    }
  });

  forEachBurrow('changes what it LOOKS like as the level climbs', (seed) => {
    // The upgrade is otherwise invisible: everything a level buys is a number
    // on a panel.
    const urls = [1, 2, 3, 4].map((l) => burrowBuilding(seed, l).url);
    expect(new Set(urls).size).toBe(BURROW_BUILDING_TIERS);
  });

  forEachBurrow('degrades to a building for a missing or absurd level', (seed) => {
    // The level arrives from a database row and from the wire (a raider is
    // shown the DEFENDER's), so it has to survive being nonsense.
    for (const level of [null, undefined, 0, -3, 999, NaN]) {
      expect(burrowBuilding(seed, level).url).toBeTruthy();
    }
    // Past the ladder, everyone shows the top of it.
    expect(burrowBuilding(seed, 999).url).toBe(burrowBuilding(seed, BURROW_BUILDING_TIERS).url);
  });

  forEachBurrow('stands the art on the ground rather than floating it', (seed) => {
    // Anchored at the sprite's FOOT, measured off its alpha bounds. A building
    // anchored at its box's bottom hovers over the cell.
    const b = burrowBuilding(seed, 1);
    expect(b.anchorY).toBeGreaterThan(0.5);
    expect(b.anchorY).toBeLessThanOrEqual(1);
  });
});
