/**
 * Where a burrow tile sits on screen once the ground under it has height.
 *
 * `burrowConfig` projects a FLAT 19x19 lattice: it knows the diamond and the
 * origin, and nothing about terrain. That was the whole story while the burrow
 * was a painting with a grid over it. On generated terrain a tile can stand a
 * shelf above its neighbour, and a flat projection puts it — and the trap on
 * it, and the raider standing on it — sunk into the cliff it is supposed to be
 * on top of.
 *
 * So these two functions are the terrain-aware pair, and they are the ones
 * anything standing ON the burrow should use. Exactly the same split, for the
 * same reason, as the island's `tileScreenPos` / `terrainTileAt`.
 */
import {
  BURROW_HALF_H, BURROW_TIER_LIFT, burrowTilePos, burrowScreenToTile, burrowTileDepth,
} from '@/config/burrowConfig';
import { burrowFor, burrowTier, isWalkable } from './board';

/**
 * How far up the screen a tile sits, for the tier it stands on.
 *
 * Zero at ground level, one `BURROW_TIER_LIFT` per shelf.
 */
export const burrowLift = (seed: string, tile: number) =>
  Math.max(0, burrowTier(seed, tile) - 1) * BURROW_TIER_LIFT;

/** Where a tile's centre sits on screen, terrace included. */
export function burrowTileScreen(seed: string, tile: number): { x: number; y: number } {
  const flat = burrowTilePos(tile);
  return { x: flat.x, y: flat.y - burrowLift(seed, tile) };
}

/**
 * Painter's depth for a tile on terraced ground.
 *
 * The diagonal decides, the tier breaks ties — so a shelf tile draws after the
 * ground it stands on rather than being buried by it. The same ruler the
 * island's `isoDepth` uses, which is what lets the terrain's trees and rocks
 * interleave with the board's diamonds instead of landing wholly in front of
 * or behind them.
 */
export const burrowDepth = (seed: string, tile: number) =>
  burrowTileDepth(tile) + burrowTier(seed, tile);

/**
 * Which tile a point on screen names, terraces included.
 *
 * `burrowScreenToTile` inverts a flat projection, so on raised ground it
 * answers with the cell in FRONT of the one the player is looking at — tap a
 * shelf and the trap lands on the grass below it. Corrected by trying the
 * tiers from the top down: the first one whose lifted diamond contains the
 * point wins, which is also what the eye picks, since a higher tile is drawn
 * over a lower one.
 *
 * NOT what the scene uses to place a bomb. The board resolves a tap the way
 * the farm does — each cell's diamond carries a polygon hit area and sorts
 * inside its terrain block, so Pixi's own draw order gives the answer and
 * there is no second projection to keep in step with the first. This stays as
 * the way to ask the question WITHOUT a scene, which is what the tests do.
 */
export function burrowTileAt(seed: string, sx: number, sy: number): number | null {
  const { map } = burrowFor(seed);
  for (let tier = map.tiers; tier >= 1; tier--) {
    const lift = (tier - 1) * BURROW_TIER_LIFT;
    const tile = burrowScreenToTile(sx, sy + lift);
    if (tile === null) continue;
    if (burrowTier(seed, tile) !== tier) continue;
    if (!isWalkable(seed, tile)) continue;
    return tile;
  }
  return null;
}

/** How tall one tile's art hangs below its anchor — for bounds and camera. */
export const BURROW_TILE_FOOT = BURROW_HALF_H * 2;
