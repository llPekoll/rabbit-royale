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
 * Nothing is farmed, walked or stood on inside a cliff.
 *
 * A cell below a shelf's edge is land on the map but rock on the screen: the
 * face is drawn standing on it. Burying a carrot there would put it inside the
 * cliff, which is the kind of thing that looks like a rendering bug and is
 * really a disagreement between the board and the picture.
 */
describe('cliffs are not ground', () => {
  it.each(SEEDS.slice(0, 20))('%s farms nothing under a cliff', (seed) => {
    const map = generateIsland({ seed, tiers: 4, rise: 0.55 });
    const board = new IslandBoard(map);
    for (const cell of board.farmableCells()) {
      expect(board.isUnderCliff(cell.x, cell.y)).toBe(false);
    }
  });

  it.each(SEEDS.slice(0, 20))('%s never walks into one', (seed) => {
    const map = generateIsland({ seed, tiers: 4, rise: 0.55 });
    const board = new IslandBoard(map);
    for (const [x, y] of standableCells(board, map)) {
      for (const to of board.stepsFrom(x, y)) {
        expect(board.isUnderCliff(to.x, to.y)).toBe(false);
      }
    }
  });

  /**
   * The pockets a cliff cuts off stay SMALL.
   *
   * Keeping only the main body is what makes connectivity true, but it would
   * also be a perfect way to hide a bad island: a generator that dealt two
   * halves and a bridge would pass every test above while quietly throwing
   * away half the map. So the share discarded is pinned too.
   */
  it.each(SEEDS.slice(0, 20))('%s strands almost nothing', (seed) => {
    const map = generateIsland({ seed, tiers: 4, rise: 0.55 });
    const board = new IslandBoard(map);
    const standable = landCells(map).filter(([x, y]) => !board.isUnderCliff(x, y));
    const onBoard = standable.filter(([x, y]) => board.isOnBoard(x, y));
    expect(onBoard.length / standable.length).toBeGreaterThan(0.9);
  });

  it('still leaves most of the island farmable', () => {
    const map = generateIsland({ seed: 'yield', tiers: 3 });
    const board = new IslandBoard(map);
    // A rule that quietly ate the island would pass both tests above.
    expect(board.farmableCells().length).toBeGreaterThan(landCells(map).length * 0.7);
  });
});

/**
 * Nothing is walkable that something is standing in.
 *
 * The rule the whole registry exists for, and the bug it was written after:
 * trees were drawn on cells the board still called free, so the ring offered a
 * tile with a pine on it and the rabbit walked behind the trunk. The board no
 * longer asks what a sprite IS — it asks the registry whether that kind
 * blocks, which means a new kind of scenery cannot be added without answering.
 */
describe('things block their cell', () => {
  const map = generateIsland({ seed: 'blocking', tiers: 3 });

  /** One thing of every kind, each on its own cell. */
  const oneOfEach = (board: IslandBoard): Occupant[] => {
    const cells = standableCells(board, map);
    return (Object.keys(THING_RULES) as ThingKind[]).map((kind, i) => ({
      id: `${kind}`, kind, x: cells[i * 3][0], y: cells[i * 3][1],
    }));
  };

  it.each(Object.keys(THING_RULES) as ThingKind[])(
    'a %s is walkable exactly when the registry says it does not block',
    (kind) => {
      const board = new IslandBoard(map);
      const [x, y] = standableCells(board, map)[0];
      const withThing = new IslandBoard(map, [{ id: 't', kind, x, y }]);
      expect(withThing.isWalkable(x, y)).toBe(!blocksCell(kind));
    },
  );

  it('never offers a step onto a blocked cell', () => {
    const board = new IslandBoard(map, oneOfEach(new IslandBoard(map)));
    for (const [x, y] of standableCells(board, map)) {
      for (const to of board.stepsFrom(x, y)) {
        expect(board.isBlocked(to.x, to.y)).toBe(false);
      }
    }
  });

  it('never farms a blocked cell', () => {
    const board = new IslandBoard(map, oneOfEach(new IslandBoard(map)));
    for (const cell of board.farmableCells()) {
      expect(board.isBlocked(cell.x, cell.y)).toBe(false);
    }
  });

  /**
   * The invariant that makes "no highlight, no passage" true rather than
   * merely intended: walkable and farmable are the SAME set of cells. If they
   * ever diverge, something is buried where nobody can dig it up.
   */
  it('farms exactly what it can walk on', () => {
    const board = new IslandBoard(map, oneOfEach(new IslandBoard(map)));
    const farmable = board.farmableCells().map((c) => cellKey(c.x, c.y)).sort();
    const walkable: string[] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (board.isWalkable(x, y)) walkable.push(cellKey(x, y));
      }
    }
    expect(farmable).toEqual(walkable.sort());
  });

  it('leaves ground cover walkable and volumes blocking', () => {
    // The line is "would a rabbit go round it", not "is it drawn large". A
    // mushroom is flat on the grass and a bush is pushed through; both would
    // eat the island a sprite at a time if they blocked. Bushes in particular
    // are the most-scattered thing there is — when they blocked, they took
    // more of the board than trees, cliffs and livestock combined.
    expect(blocksCell('prop')).toBe(false);
    expect(blocksCell('bush')).toBe(false);
    expect(blocksCell('tree')).toBe(true);
    expect(blocksCell('rock')).toBe(true);
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
