/**
 * Where a cell's corners stand, when tiers join by RAMPS rather than steps.
 *
 * Pure arithmetic over the map, kept apart from `slopes.ts` (which needs a
 * canvas and Pixi) so the board geometry the server shares — `terrainBoard`,
 * the burrow's `screen` — can put a rabbit on a ramp's surface too.
 */
import { levelAt, type IslandMap } from './generate';

/** Lift of the four corners above the cell's own tier, in tiers: top, right, bottom, left. */
export type CornerLifts = [number, number, number, number];

/**
 * A vertex stands at the HIGHEST of the four cells that share it. A cell in
 * the middle of a plateau, or of the low ground, has four corners at its own
 * height and is flat. A low cell touching a plateau has the corners it shares
 * with it lifted, and becomes the ramp up; the plateau's own corners are its
 * own height, so it stays flat and keeps a clean outline. Sea is tier 0 and
 * never lifts anything, so a coast cell is flat toward the water.
 */
export function cornerLifts(map: IslandMap, x: number, y: number): CornerLifts {
  const tier = levelAt(map, x, y);
  const v = (vx: number, vy: number) =>
    Math.max(
      levelAt(map, vx - 1, vy - 1), levelAt(map, vx, vy - 1),
      levelAt(map, vx - 1, vy), levelAt(map, vx, vy),
    ) - tier;
  return [v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)];
}

/** Mean corner lift: where something standing in the middle of the cell rests. */
export function meanLift(lifts: readonly number[]): number {
  return (lifts[0] + lifts[1] + lifts[2] + lifts[3]) / 4;
}

/** How far above its tier the middle of a cell sits, in tiers; 0 on flat ground and at sea. */
export function surfaceLift(map: IslandMap, x: number, y: number): number {
  if (levelAt(map, x, y) === 0) return 0;
  return meanLift(cornerLifts(map, x, y));
}
