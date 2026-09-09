/**
 * Autotiling for the Tiny Swords terrain sheets.
 *
 * Both sheets are laid out as the classic 4-wide "blob" set: a column picked by
 * whether the cell has a neighbour to the WEST and EAST, a row picked the same
 * way for NORTH and SOUTH. Sixteen combinations, no inner corners — which is
 * exactly what the art draws, and why plateaus in this pack read as blocky
 * shelves rather than smooth coastline.
 *
 *      col 0 = west edge   col 1 = middle   col 2 = east edge   col 3 = both
 *      row 0 = north edge  row 1 = middle   row 2 = south edge  row 3 = both
 *
 * Deliberately free of Pixi and of the map type: this is the one piece of the
 * island that is pure arithmetic, so it is the one piece that can be tested
 * without a renderer or a canvas.
 */

/** Which of a cell's four orthogonal neighbours belong to the same region. */
export interface EdgeMask {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export type BlobIndex = 0 | 1 | 2 | 3;

/** Reads a region as `(x, y) => boolean`; out-of-bounds must answer false. */
export type RegionTest = (x: number, y: number) => boolean;

/** The four orthogonal neighbours of `(x, y)`, as a mask. */
export function edgeMask(inRegion: RegionTest, x: number, y: number): EdgeMask {
  return {
    n: inRegion(x, y - 1),
    e: inRegion(x + 1, y),
    s: inRegion(x, y + 1),
    w: inRegion(x - 1, y),
  };
}

/** Column in the 4-wide set: 1 when flanked, 0/2 at an edge, 3 when 1 cell wide. */
export function blobCol(m: EdgeMask): BlobIndex {
  if (m.w && m.e) return 1;
  if (m.e) return 0;
  if (m.w) return 2;
  return 3;
}

/** Row in the 4-tall set: 1 when flanked, 0/2 at an edge, 3 when 1 cell tall. */
export function blobRow(m: EdgeMask): BlobIndex {
  if (m.n && m.s) return 1;
  if (m.s) return 0;
  if (m.n) return 2;
  return 3;
}

/**
 * The elevation sheet is 4x8, not 4x4: its surface rows are 0/1/2 and its
 * "one row tall" surface is banished to row 4, because rows 3 and 5 hold the
 * CLIFF FACES that belong under each of those two cases.
 */
export const ELEVATION_SURFACE_ROW: Record<BlobIndex, number> = { 0: 0, 1: 1, 2: 2, 3: 4 };

/**
 * The cliff face drawn in the cell BELOW a plateau's south edge.
 *
 * Two variants ship, and which one is right depends on the plateau itself: a
 * shelf two or more rows deep gets row 3, a shelf exactly one row deep gets
 * row 5, whose face is drawn to sit under that shorter silhouette. Passing the
 * wrong one is not a crash, just a visible seam where the rock meets the grass.
 */
export function elevationWallRow(plateauIsOneRowTall: boolean): number {
  return plateauIsOneRowTall ? 5 : 3;
}

/** The banded face used to stack a second storey of cliff under the first. */
export const ELEVATION_WALL_STACK_ROW = 7;
