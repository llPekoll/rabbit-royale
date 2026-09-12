/**
 * The burrow's board: the ground a raider has to cross.
 *
 * This file is now GEOMETRY ONLY — where a tile sits on screen, how big a
 * diamond is, which tile a tap names. What the ground actually IS (walkable,
 * blocked, the entrance, the field) moved to `game/burrow/board.ts`, because
 * it is no longer the same for everybody.
 *
 * ## What changed, and why the split
 *
 * Every burrow used to be one hand-drawn 19x19 ASCII layout, calibrated by eye
 * against one painting. That made a raid a memory test — the rocks, the door
 * and the field were in the same place in every burrow in the game, so the
 * second crossing was the first one replayed. It also made the layout and the
 * ART a matched pair that nothing could keep matched: the grid was measured
 * against `burrow.webp`, and a redraw pointed the raid's win condition at a
 * lawn without anything noticing (which is what `burrow-calibration` existed
 * to catch).
 *
 * The ground is now TILES, cut from the owner's seed on the same terrain the
 * island uses, and drawn from those tiles rather than painted. So there is no
 * painting to calibrate against and no origin to solve: the board is the
 * picture. What is left here is the projection it is drawn with.
 *
 * Same isometric projection as the island — a burrow and an island are the
 * same world, and a player should not have to learn the angle twice.
 */
import { BURROW_COLS, BURROW_ROWS, burrowIndex, burrowColRow } from '@/game/burrow/generate';

export { BURROW_COLS, BURROW_ROWS, burrowIndex, burrowColRow };

/**
 * The diamond — the island's exact tile, 44x24.
 *
 * Deliberately the SAME numbers as `gridConfig`'s `ISO_TILE_W/H`, not merely
 * the same proportion. The board used to be a touch smaller (40x22) on the
 * reasoning that a 19x19 grid has more cells to fit than the island's 16x16,
 * but that traded a real cost for an imaginary one: the placement camera is
 * FITTED, so it cancels any change to this number (see the note on `boardCam`)
 * and nothing ever ran off the canvas. What the difference did buy was a
 * SECOND SET OF TILE ART — art drawn for a 44-wide diamond is wrong on a
 * 40-wide one, by 10%, in every tile of the game.
 *
 * One world, one diamond, one set of tiles to draw. A larger cell is also a
 * larger thumb target, which is the direction `MIN_TILE_PX` wants to go.
 */
export const BURROW_TILE_W = 44;
export const BURROW_TILE_H = 24;

/**
 * The tile size actually used to lay out and draw the board.
 *
 * A `let` with a setter, not a const, so Burrow/Placing can put a slider on
 * it. Changing this changes how much ground one cell covers — the grid gets
 * coarser or finer and the homestead keeps its place on screen. It is the knob
 * that actually changes how big a cell is; the camera is deliberately NOT
 * (see the note on `boardCam`, where a fitted camera cancelled every change to
 * this number exactly).
 */
export let BURROW_HALF_W = BURROW_TILE_W / 2;
export let BURROW_HALF_H = BURROW_TILE_H / 2;

/** Override the tile size for tuning, or pass null to restore the shipped one. */
export function setBurrowTileSize(width: number | null): void {
  const w = width ?? BURROW_TILE_W;
  BURROW_HALF_W = w / 2;
  // Locked to the island's isometric angle: the two screens are one world, and
  // a diamond of a different proportion would read as a different camera.
  BURROW_HALF_H = (w * BURROW_TILE_H / BURROW_TILE_W) / 2;
}

/**
 * How far one terrain tier lifts a tile, in board pixels.
 *
 * The island's `TIER_LIFT`, verbatim, now that the two boards share a diamond.
 * It used to be scaled down alongside the smaller cell; with the cells equal
 * there is nothing left to scale, and a shelf that is one art-tile tall on the
 * island has to be one art-tile tall here or the same cliff sprite draws with
 * a gap under it on one screen and an overhang on the other.
 *
 * The ground, the playable tiles and the tap resolver all read it from here —
 * a lift the renderer and the board disagreed on would put a raider's marker
 * beside the tile it is standing on.
 */
export const BURROW_TIER_LIFT = 18;

/**
 * Where tile (0, 0) sits: the top vertex of the diamond lattice.
 *
 * Solved rather than measured now. The grid is 19x19, so the lattice spans
 * `(cols + rows) * halfW` across and is centred by putting its left corner at
 * the canvas middle minus half of that — which is what these two lines say.
 * There is no painting to line it up with any more, which is the point: the
 * old pair were constants tuned against `burrow.webp` and silently wrong the
 * moment the art changed.
 */
export const BURROW_ORIGIN_X = 480;
/**
 * A little above centre: lifted tiles grow UPWARD from their cell, so a board
 * centred on its flat projection sits low once the shelves are on it.
 */
export const BURROW_ORIGIN_Y = 96;

export function burrowTilePos(index: number): { x: number; y: number } {
  const { col, row } = burrowColRow(index);
  return {
    x: BURROW_ORIGIN_X + (col - row) * BURROW_HALF_W,
    y: BURROW_ORIGIN_Y + (col + row) * BURROW_HALF_H,
  };
}

/**
 * Painter's depth for a tile: the diagonal running away from the camera.
 *
 * Scaled by 16 and left room for the tier, exactly like the island's
 * `isoDepth`, so that a tile and a tree standing on the terrain under it sort
 * against the SAME ruler. They are siblings in one sorted container — that is
 * what lets a rock on a near cell draw in front of a cliff on a far one.
 */
export const burrowTileDepth = (index: number) => {
  const { col, row } = burrowColRow(index);
  return (col + row) * 16;
};

/**
 * Screen point → burrow tile, ignoring height.
 *
 * The inverse of `burrowTilePos` at tier 0. On terraced ground this answers
 * with the cell the point would hit if the burrow were flat, which is why the
 * scene uses `burrowTileAt` (in `game/burrow/screen.ts`) instead — it walks the
 * tiers from the top down, the way the eye does.
 */
export function burrowScreenToTile(sx: number, sy: number): number | null {
  const dx = sx - BURROW_ORIGIN_X;
  const dy = sy - BURROW_ORIGIN_Y;
  const col = Math.round((dx / BURROW_HALF_W + dy / BURROW_HALF_H) / 2);
  const row = Math.round((dy / BURROW_HALF_H - dx / BURROW_HALF_W) / 2);
  if (col < 0 || col >= BURROW_COLS || row < 0 || row >= BURROW_ROWS) return null;
  return burrowIndex(col, row);
}
