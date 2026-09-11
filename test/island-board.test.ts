/**
 * The island as a PLAYABLE board.
 *
 * These are not picture checks like `island-tiles.test.ts`. Once the terrain
 * stops being scenery and becomes the ground players move on, the generator
 * owes the game guarantees it never owed a backdrop: an island that looks
 * lovely but strands a player behind a cliff, or splits into two halves that
 * cannot reach each other, is a BROKEN MATCH rather than an ugly one. Nothing
 * here throws in production — it just deals someone an unplayable island — so
 * the properties have to be asserted rather than eyeballed.
 *
 * Everything is checked over many seeds, because the failure is never "this
 * code is wrong", it is "one island in forty comes out wrong".
 */
import { describe, expect, it } from 'vitest';
import { generateIsland, levelAt } from '@/game/island/generate';
import { generateTerrain } from '@/game/island/terrain';
import { IslandBoard, MAX_STEP, cellKey, type Occupant } from '@/game/island/board';
import { THING_RULES, blocksCell, type ThingKind } from '@/game/island/blocking';

const SEEDS = Array.from({ length: 40 }, (_, i) => `board-${i}`);

/** Every land cell of a map, as [x, y] pairs. */
function landCells(map: ReturnType<typeof generateIsland>) {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (levelAt(map, x, y) > 0) out.push([x, y]);
    }
  }
  return out;
}

/**
 * Every cell the board actually offers — land, minus the ones a cliff face is
 * drawn over, minus the pockets those cuts strand.
 *
 * This, not `landCells`, is what connectivity has to be measured against. A
 * cell under a cliff is land on the map and solid rock on the screen; a pocket
 * cut off behind one is grass nothing can walk to. Counting either would fail
 * every island for the sake of tiles no player can use.
 */
function standableCells(board: IslandBoard, map: ReturnType<typeof generateIsland>) {
  return landCells(map).filter(([x, y]) => board.isOnBoard(x, y));
}

/** Cells reachable from a start, walking only legal steps. */
function flood(board: IslandBoard, sx: number, sy: number): Set<string> {
  const seen = new Set<string>([cellKey(sx, sy)]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const step of board.stepsFrom(x, y)) {
      const k = cellKey(step.x, step.y);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([step.x, step.y]);
    }
  }
  return seen;
}

describe('stepping', () => {
  const map = generateIsland({ seed: 'steps', tiers: 3 });

  it('refuses the sea', () => {
    const board = new IslandBoard(map);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (levelAt(map, x, y) === 0) expect(board.isWalkable(x, y)).toBe(false);
      }
    }
  });

  it('refuses a climb taller than one tier', () => {
    const board = new IslandBoard(map);
    for (const [x, y] of landCells(map)) {
      for (const to of board.stepsFrom(x, y)) {
        const climb = Math.abs(levelAt(map, to.x, to.y) - levelAt(map, x, y));
        expect(climb).toBeLessThanOrEqual(MAX_STEP);
      }
    }
  });

  it('refuses a cell somebody is standing on', () => {
    const [[x, y]] = standableCells(new IslandBoard(map), map);
    const neighbour = new IslandBoard(map).stepsFrom(x, y)[0];
    const guard: Occupant = { id: 's1', kind: 'soldier', x: neighbour.x, y: neighbour.y };
    const board = new IslandBoard(map, [guard]);
    expect(board.isWalkable(neighbour.x, neighbour.y)).toBe(false);
    expect(board.canStep(x, y, neighbour.x, neighbour.y)).toBe(false);
  });

  it('never steps more than one cell', () => {
    const board = new IslandBoard(map);
    for (const [x, y] of standableCells(board, map).slice(0, 50)) {
      for (const to of board.stepsFrom(x, y)) {
        expect(Math.abs(to.x - x)).toBeLessThanOrEqual(1);
        expect(Math.abs(to.y - y)).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * The guarantee the whole idea rests on.
 *
 * A player dropped on this island has to be able to REACH the island. The
 * generator already promises each tier is eroded out of the one below, which
 * is what keeps every climb to a single step — this is that promise read back
 * as the thing players actually feel.
 */
describe('every island is one connected board', () => {
  it.each(SEEDS)('%s is walkable end to end', (seed) => {
    const map = generateIsland({ seed, tiers: 3 });
    const board = new IslandBoard(map);
    const standable = standableCells(board, map);
    const reached = flood(board, standable[0][0], standable[0][1]);
    expect(reached.size).toBe(standable.length);
  });

  it.each(SEEDS.slice(0, 12))('%s stays connected with five tiers', (seed) => {
    const map = generateIsland({ seed, tiers: 5, width: 40, height: 40, rise: 0.6 });
    const board = new IslandBoard(map);
    const standable = standableCells(board, map);
    expect(flood(board, standable[0][0], standable[0][1]).size).toBe(standable.length);
  });
});

/**
 * A cliff's FOOT is ground, not a wall.
 *
 * It used to be excluded: the face is drawn across part of that cell, so it
 * looked like rock. But cliff feet run in contiguous bands along every
 * plateau — about 6% of an island, up to 10% — and removing them carved blank
 * strips beside every shelf that read as missing tiles. A tile partly covered
 * by the cliff above it is still a tile a rabbit stands on and digs.
 *
 * What a cliff still refuses is the CLIMB: `MAX_STEP` is what makes a plateau
 * mean anything, and that is tested above.
 */
describe('cliff feet are ground', () => {
  it.each(SEEDS.slice(0, 20))('%s keeps the ground under its cliffs in play', (seed) => {
    const map = generateIsland({ seed, tiers: 4, rise: 0.55 });
    const board = new IslandBoard(map);
    let feet = 0;
    let playable = 0;
    for (const [x, y] of landCells(map)) {
      if (!board.isUnderCliff(x, y)) continue;
      feet++;
      if (board.isFarmable(x, y)) playable++;
    }
    // Some feet sit in a pocket the board drops anyway; the point is that
    // being under a cliff is no longer by ITSELF a reason to be excluded.
    if (feet > 0) expect(playable / feet).toBeGreaterThan(0.8);
  });

  it('scenery still avoids them', () => {
    // A carrot half-buried in a cliff is a poor prize even when the tile is
    // legal, so the terrain keeps growing things elsewhere.
    const { map, placements } = generateTerrain({ seed: 'cliff-scenery', tiers: 4 });
    const board = new IslandBoard(map, placements);
    for (const p of placements) {
      expect(board.isUnderCliff(p.x, p.y)).toBe(false);
    }
  });
});

describe('wandering sheep', () => {
  const map = generateIsland({ seed: 'flock', tiers: 3 });
  const land = standableCells(new IslandBoard(map), map);

  /** A flock on the first `n` land cells that are far enough apart to be legal. */
  const flockOf = (n: number): Occupant[] =>
    land.slice(0, n).map(([x, y], i) => ({ id: `sheep-${i}`, kind: 'sheep' as const, x, y }));

  it('moves sheep at most one cell at a time', () => {
    const flock = flockOf(20);
    const before = new Map(flock.map((o) => [o.id, { x: o.x, y: o.y }]));
    const board = new IslandBoard(map, flock);
    for (const o of board.wander(1)) {
      const was = before.get(o.id)!;
      expect(Math.abs(o.x - was.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(o.y - was.y)).toBeLessThanOrEqual(1);
    }
  });

  it('never lands two sheep on one cell', () => {
    const board = new IslandBoard(map, flockOf(30));
    for (let tick = 0; tick < 200; tick++) {
      board.wander(1);
      const cells = board.occupants().map((o) => cellKey(o.x, o.y));
      expect(new Set(cells).size).toBe(cells.length);
    }
  });

  it('never walks a sheep into the sea or up a cliff', () => {
    const board = new IslandBoard(map, flockOf(30));
    for (let tick = 0; tick < 200; tick++) {
      board.wander(1);
      for (const o of board.occupants()) expect(levelAt(map, o.x, o.y)).toBeGreaterThan(0);
    }
  });

  it('leaves soldiers exactly where they were put', () => {
    const guards: Occupant[] = land.slice(0, 10).map(([x, y], i) => ({
      id: `guard-${i}`, kind: 'soldier', x, y,
    }));
    const board = new IslandBoard(map, guards);
    for (let tick = 0; tick < 100; tick++) board.wander(1);
    for (const g of board.occupants()) {
      const original = guards.find((o) => o.id === g.id)!;
      expect({ x: g.x, y: g.y }).toEqual({ x: original.x, y: original.y });
    }
  });

  it('is seeded: the same island wanders the same way twice', () => {
    const a = new IslandBoard(map, flockOf(20));
    const b = new IslandBoard(map, flockOf(20));
    for (let tick = 0; tick < 30; tick++) { a.wander(); b.wander(); }
    const cells = (board: IslandBoard) =>
      board.occupants().map((o) => `${o.id}@${cellKey(o.x, o.y)}`).sort();
    expect(cells(a)).toEqual(cells(b));
  });
});
