/**
 * Placing the island's square tiles on an ISOMETRIC lattice, with volume.
 *
 * The Tiny Swords terrain is drawn top-down: every tile is a flat 64px square
 * facing the camera. Nothing in the pack is drawn as a rhombus, so a true
 * isometric island would need different art. What this module does instead is
 * change where the tiles GO — the grid is projected into diamonds while each
 * tile keeps its own undistorted pixels.
 *
 * That is the deliberate cut over the alternative (rotating the container 45
 * degrees and squashing it, which is geometrically honest and makes the pixel
 * art bleed, because the rotation does not land on the pixel grid). Here every
 * sprite stays axis-aligned and crisp.
 *
 * The projection is the standard one, the same in every reference on the
 * subject (Clint Bellanger's isometric maths, Excalibur, Unity's isometric
 * tilemaps):
 *
 *     screenX = (x - y) * w / 2
 *     screenY = (x + y) * h / 2  -  tier * z
 *
 * `h < w` is what tilts the plane away from the viewer; at `h === w` the
 * lattice is a plain 45-degree rotation with no tilt. 2:1 is the classic.
 *
 * ## Where the volume comes from
 *
 * Lifting a plateau by `tier * z` alone does NOT read as raised — it reads as
 * a shape floating over a hole, because nothing fills the gap the lift opens
 * underneath. Every reference solves this the same way: a raised cell is not
 * one sprite but a STACK — the cliff face repeated down the gap, then the
 * surface on top. `columnFaces` is that count, and it is why this island has
 * sides rather than just a silhouette.
 */

/**
 * The classic 2:1 isometric cell, the one the eye reads as iso without effort.
 *
 * `z` is 32 rather than a rounder number because that is how tall the solid
 * part of the pack's cliff face actually draws (`FACE_SOLID_H`). Lift a tier
 * by less and the face overshoots, leaving a band of rock hanging below the
 * shelf it belongs to; lift it by more and the column comes up short and the
 * sea shows through the gap. Matching the art is what makes a plateau close.
 */
export const ISO_TILE = { w: 64, h: 32, z: 32 } as const;

export interface IsoMetrics {
  /** Width of one cell's diamond, in pixels. */
  w: number;
  /** Height of one cell's diamond. Half of `w` is the classic 2:1 look. */
  h: number;
  /** How far one terrain tier lifts a tile, in pixels. */
  z: number;
}

export interface IsoPoint {
  x: number;
  y: number;
}

/**
 * Grid cell to screen position, in pixels, relative to cell (0, 0)'s centre.
 *
 * `x` and `y` are free to be fractional: a prop standing at (3.5, 2.5) lands in
 * the middle of its cell, and that is how the deco layer places its feet.
 */
export function isoProject(x: number, y: number, tier: number, m: IsoMetrics): IsoPoint {
  return {
    x: (x - y) * (m.w / 2),
    y: (x + y) * (m.h / 2) - tier * m.z,
  };
}

/**
 * Screen position back to a (fractional) grid cell, ignoring height.
 *
 * The inverse of `isoProject` at tier 0 — which is what a mouse gives you, so
 * this is the one a future "click a tile" needs. On a map with plateaus the
 * answer is the cell the point would hit if the island were flat; resolving
 * which raised cell is actually under the cursor means walking the column
 * stack, and that is a job for whoever needs it.
 */
export function isoUnproject(sx: number, sy: number, m: IsoMetrics): IsoPoint {
  return {
    x: (sx / (m.w / 2) + sy / (m.h / 2)) / 2,
    y: (sy / (m.h / 2) - sx / (m.w / 2)) / 2,
  };
}

/**
 * How many cliff-face tiles stand under a cell, to fill the gap its lift opens.
 *
 * A cell at tier 3 whose downhill neighbour is tier 1 has to cover two tiers'
 * worth of drop, or the viewer sees straight through the island. The faces are
 * `z` apart, and `faceH` is how tall one face tile draws, so a tier needs
 * `ceil(z / faceH)` of them to close without a seam — usually one, more when
 * the tier lift is set taller than the art.
 */
export function columnFaces(tiersToCover: number, m: IsoMetrics, faceH: number): number {
  if (tiersToCover <= 0) return 0;
  return Math.max(1, Math.ceil((tiersToCover * m.z) / faceH));
}

/**
 * Painter's-algorithm depth for a cell.
 *
 * On an isometric lattice a cell hides whatever is further from the camera,
 * and "further" is `x + y` — the diagonal running away from the viewer. Ties
 * within one diagonal are broken by height, so a plateau tile is drawn after
 * the ground it stands on rather than being buried by it.
 *
 * Scaled rather than added raw so that a tier never outranks a whole diagonal:
 * one step back along the grid always wins over one step up.
 */
export function isoDepth(x: number, y: number, tier: number): number {
  return (x + y) * 16 + tier;
}

/**
 * The pixel box a whole `width x height` grid occupies, and where its origin
 * sits inside it.
 *
 * Projection puts cell (0, 0) at the TOP of the diamond and sends the left half
 * of the grid into negative x, so a view that just stamped tiles from (0, 0)
 * would hang off the left edge of its own bounds. `originX` / `originY` are the
 * offset that brings the whole lattice back inside the box — add them once on
 * the container and every projected point lands in [0, width] x [0, height].
 *
 * `maxTier` matters because lifted tiles poke out of the TOP by `maxTier * z`,
 * and `footH` because the tile art hangs below its anchor — a 64px tile on a
 * 32px diamond overhangs the bottom row by half its height.
 */
export function isoBounds(
  width: number,
  height: number,
  maxTier: number,
  m: IsoMetrics,
  footH = 0,
) {
  return {
    width: (width + height) * (m.w / 2),
    height: (width + height) * (m.h / 2) + maxTier * m.z + footH,
    /** Cell (0, 0) sits at the top of the diamond, `height` cells right of the left corner. */
    originX: height * (m.w / 2),
    originY: maxTier * m.z,
  };
}
