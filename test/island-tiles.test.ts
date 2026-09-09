/**
 * The two halves of the tile island that can be checked without a canvas: the
 * autotiler's sheet lookup, and the generator's shape.
 *
 * These are the parts that silently produce a WRONG PICTURE rather than an
 * error — a swapped row leaves a cliff pointing the wrong way, a plateau grown
 * flush against the shore leaves a cliff face standing in the sea — so they are
 * worth pinning even though nothing here throws.
 */
import { describe, expect, it } from 'vitest';
import {
  blobCol,
  blobRow,
  edgeMask,
  elevationWallRow,
  ELEVATION_SURFACE_ROW,
} from '@/game/island/autotile';
import { generateIsland, levelAt, southEdges } from '@/game/island/generate';

/** A region test over a rectangle, for exercising the mask by hand. */
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1;

describe('autotile', () => {
  it('puts the middle of a wide region in the middle of the sheet', () => {
    const m = edgeMask(rect(0, 0, 4, 4), 2, 2);
    expect(blobCol(m)).toBe(1);
    expect(blobRow(m)).toBe(1);
  });

  it('reads each edge as the column and row that draws that edge', () => {
    const region = rect(0, 0, 4, 4);
    expect(blobCol(edgeMask(region, 0, 2))).toBe(0); // nothing to the west
    expect(blobCol(edgeMask(region, 4, 2))).toBe(2); // nothing to the east
    expect(blobRow(edgeMask(region, 2, 0))).toBe(0); // nothing to the north
    expect(blobRow(edgeMask(region, 2, 4))).toBe(2); // nothing to the south
  });

  it('uses the both-edges tile for a strip one cell wide or tall', () => {
    expect(blobCol(edgeMask(rect(3, 0, 3, 6), 3, 3))).toBe(3);
    expect(blobRow(edgeMask(rect(0, 3, 6, 3), 3, 3))).toBe(3);
  });

  it('sends the lone cell to both-edges in both directions', () => {
    const m = edgeMask(rect(2, 2, 2, 2), 2, 2);
    expect(blobCol(m)).toBe(3);
    expect(blobRow(m)).toBe(3);
  });

  it('banishes the one-row-tall surface to row 4, past the cliff faces', () => {
    // Rows 3 and 5 hold cliff faces, so the fourth surface variant cannot sit
    // where a 4x4 sheet would put it.
    expect(ELEVATION_SURFACE_ROW[0]).toBe(0);
    expect(ELEVATION_SURFACE_ROW[1]).toBe(1);
    expect(ELEVATION_SURFACE_ROW[2]).toBe(2);
    expect(ELEVATION_SURFACE_ROW[3]).toBe(4);
  });

  it('picks the short cliff face only under a plateau one row deep', () => {
    expect(elevationWallRow(true)).toBe(5);
    expect(elevationWallRow(false)).toBe(3);
  });
});

describe('generateIsland', () => {
  it('is reproducible from its seed', () => {
    const a = generateIsland({ seed: 'harbour-9' });
    const b = generateIsland({ seed: 'harbour-9' });
    expect(Array.from(a.level)).toEqual(Array.from(b.level));
  });

  it('gives different seeds different islands', () => {
    const a = generateIsland({ seed: 'harbour-9' });
    const b = generateIsland({ seed: 'harbour-10' });
    expect(Array.from(a.level)).not.toEqual(Array.from(b.level));
  });

  it('reads open sea outside the grid, so edge cells autotile as coast', () => {
    const map = generateIsland({ seed: 'edges' });
    expect(levelAt(map, -1, 3)).toBe(0);
    expect(levelAt(map, 3, -1)).toBe(0);
    expect(levelAt(map, map.width, 3)).toBe(0);
    expect(levelAt(map, 3, map.height)).toBe(0);
  });

  it('leaves land, and leaves sea around it', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const map = generateIsland({ seed });
      let land = 0;
      for (const level of map.level) if (level > 0) land++;
      expect(land).toBeGreaterThan(40);
      expect(land).toBeLessThan(map.width * map.height * 0.8);
    }
  });

  it('never runs land off the edge of the grid', () => {
    // A cell on the border has no room for foam, and a plateau there loses the
    // row its cliff face stands on.
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const map = generateIsland({ seed });
      for (let x = 0; x < map.width; x++) {
        expect(levelAt(map, x, 0)).toBe(0);
        expect(levelAt(map, x, map.height - 1)).toBe(0);
      }
      for (let y = 0; y < map.height; y++) {
        expect(levelAt(map, 0, y)).toBe(0);
        expect(levelAt(map, map.width - 1, y)).toBe(0);
      }
    }
  });

  it('stands every tier on the one below, never straight on the sea', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const map = generateIsland({ seed, tiers: 4 });
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tier = levelAt(map, x, y);
          if (tier < 2) continue;
          // Every neighbour of a plateau cell is at most one step down, so a
          // shelf always has ground under its rim rather than a drop to water.
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            expect(levelAt(map, x + dx, y + dy)).toBeGreaterThanOrEqual(tier - 1);
          }
        }
      }
    }
  });

  it('gives every cliff a cell below it to stand in', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const map = generateIsland({ seed, tiers: 3 });
      for (let tier = 2; tier <= map.tiers; tier++) {
        for (const { y } of southEdges(map, tier)) {
          expect(y + 1).toBeLessThan(map.height);
        }
      }
    }
  });

  it('stops climbing when there is no room left, rather than inventing tiers', () => {
    const map = generateIsland({ seed: 'small', width: 14, height: 12, tiers: 6 });
    expect(map.tiers).toBeLessThanOrEqual(6);
    let highest = 0;
    for (const level of map.level) highest = Math.max(highest, level);
    expect(map.tiers).toBe(highest);
  });

  it('makes a flat island when asked for one tier', () => {
    const map = generateIsland({ seed: 'flat', tiers: 1 });
    expect(map.tiers).toBe(1);
    for (const level of map.level) expect(level).toBeLessThanOrEqual(1);
  });
});
