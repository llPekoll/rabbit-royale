/**
 * The island's shape is generated, not drawn by hand, so the properties a
 * hand-drawn island had for free now need asserting. A sandbar cut off from the
 * spawn would put carrots and chests on unreachable land — which a player reads
 * as the game being broken, and which no amount of playtesting reliably finds.
 */
import { describe, expect, it } from 'vitest';
import {
  COLS, ROWS, SPAWN_INDEX, makeShape, playableTiles, isForbidden, neighbors,
  toIndex, toColRow, tilePos, screenToTile, tileInScreenDirection,
} from '../src/config/gridConfig';

/** Every land tile the spawn can walk to. */
function reachable(shape: ReadonlySet<string>) {
  const seen = new Set([SPAWN_INDEX]);
  const queue = [SPAWN_INDEX];
  while (queue.length) {
    for (const n of neighbors(queue.pop()!, shape)) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return seen;
}

describe('makeShape', () => {
  it('is deterministic for a seed', () => {
    expect([...makeShape('abc')].sort()).toEqual([...makeShape('abc')].sort());
  });

  it('gives different seeds different coastlines', () => {
    expect([...makeShape('abc')].sort()).not.toEqual([...makeShape('xyz')].sort());
  });

  it('always leaves the spawn on land', () => {
    for (let i = 0; i < 200; i++) {
      expect(isForbidden(SPAWN_INDEX, makeShape(`seed-${i}`))).toBe(false);
    }
  });

  it('never strands land the spawn cannot reach', () => {
    for (let i = 0; i < 200; i++) {
      const shape = makeShape(`seed-${i}`);
      expect(reachable(shape).size).toBe(playableTiles(shape));
    }
  });

  it('leaves room for four players to race', () => {
    // The original 8x8 board had 44 playable tiles — a solo board. Four rabbits
    // need a real island, and this is the number that decision comes down to.
    for (let i = 0; i < 200; i++) {
      expect(playableTiles(makeShape(`seed-${i}`))).toBeGreaterThan(120);
    }
  });

  it('does not fill the whole grid — an island needs a coast', () => {
    for (let i = 0; i < 50; i++) {
      expect(playableTiles(makeShape(`seed-${i}`))).toBeLessThan(COLS * ROWS);
    }
  });
});

describe('grid maths', () => {
  it('round-trips index and col/row', () => {
    for (let i = 0; i < COLS * ROWS; i++) {
      const { col, row } = toColRow(i);
      expect(toIndex(col, row)).toBe(i);
    }
  });

  it('round-trips tile to screen and back', () => {
    const shape = makeShape('screen');
    for (let i = 0; i < COLS * ROWS; i++) {
      if (isForbidden(i, shape)) continue;
      const { x, y } = tilePos(i);
      expect(screenToTile(x, y, shape)).toBe(i);
    }
  });
});

describe('tileInScreenDirection', () => {
  it('maps screen-up to the tile drawn directly above', () => {
    const shape = makeShape('dirs');
    const from = SPAWN_INDEX;
    const up = tileInScreenDirection(from, 0, -1, shape);
    expect(up).not.toBeNull();
    // "Up" on an isometric board is the col-1,row-1 diagonal: it must land
    // ABOVE the origin on screen and share its x.
    const a = tilePos(from);
    const b = tilePos(up!);
    expect(b.y).toBeLessThan(a.y);
    expect(b.x).toBeCloseTo(a.x, 5);
  });

  it('returns a real neighbour for all four screen directions', () => {
    const shape = makeShape('dirs');
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const to = tileInScreenDirection(SPAWN_INDEX, dx, dy, shape);
      expect(to).not.toBeNull();
      expect(neighbors(SPAWN_INDEX, shape)).toContain(to);
    }
  });
});
