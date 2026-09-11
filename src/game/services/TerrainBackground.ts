/**
 * The island's ground, GENERATED rather than painted.
 *
 * `IslandBackground` picks one of three paintings by seed and stretches it
 * behind the board. This draws the actual terrain the server is now playing
 * on: the coastline, the plateaus, the cliff faces, and everything standing on
 * them. Same seed, same island, on both sides — the client is a reflection.
 *
 * It implements the SAME interface as the painting (`layout` / `destroy`), so
 * the scene swaps one for the other without knowing which it has. That is the
 * point: the board, the camera and the resize path are untouched.
 *
 * The terrain is drawn at the board's own metrics and pinned to the board's
 * origin, so a terrain cell and a playable tile are the same diamond rather
 * than two grids that merely look alike.
 */
import { Container } from 'pixi.js';
import { HALF_W, HALF_H, ISO_ORIGIN_X, ISO_ORIGIN_Y, COLS, ROWS } from '@/config/gridConfig';
import { IsoIslandView, loadIslandTileset, isoProject } from '@/game/island';
import { terrainFor, TIER_LIFT } from '@/lib/game/terrainBoard';
import type { IslandBackground } from './IslandBackground';

/** Scenery is cut for 64px tiles; the board's are 44x24. */
const DECO_SCALE = 0.4;

export interface TerrainBackground extends IslandBackground {
  /** Fade whatever the rabbit is standing behind. */
  fadeBehind(tileX: number, tileY: number): void;
  /** Advance the sway. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void;
}

/**
 * Draw the terrain for `seed` into `container`.
 *
 * Resolves once the sheets have decoded, so the board is never built over an
 * empty frame — the same contract the painting honours.
 */
export async function createTerrainBackground(
  container: Container,
  seed: string,
): Promise<TerrainBackground> {
  const tileset = await loadIslandTileset();
  const { map, placements } = terrainFor(seed);

  /**
   * The standing art joins the BOARD's container, not the terrain's.
   *
   * Pixi only ever sorts siblings, and a container is painted in a single turn.
   * With the trees, rocks and sheep inside the terrain's own subtree, the whole
   * landscape took one place in the order: entirely in front of the tiles, or
   * entirely behind them. Behind is what shipped, which is why a sheep sat
   * under the fog of the very cell it stands on.
   *
   * Note there is no wrapper around them — a wrapper would be one sibling with
   * one depth, i.e. exactly the same bug at one remove. They go in loose, so
   * each sprite's `isoDepth(x, y, tier) + 1` competes directly with each tile's
   * `tileDepth(i) * 16 + tier`. Those are the same ruler (`tileDepth` is
   * `col + row`, and `isoDepth` is `(x + y) * 16 + tier`), which is what makes
   * the interleave correct rather than merely plausible.
   *
   * The GROUND does not move: it is a backdrop, and nothing in it needs to come
   * forward.
   */
  const island = new IsoIslandView({
    map,
    tileset,
    metrics: { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT },
    decoScale: DECO_SCALE,
    placements,
    decoLayer: container,
  });

  // Line the terrain up with the BOARD's grid: project the board's origin
  // cell through the terrain's own projection and shift by the difference, so
  // tile (0,0) of each lands on the same pixel.
  const origin = isoProject(0.5, 0.5, 0, { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT });
  island.view.position.set(
    ISO_ORIGIN_X - origin.x - island.originX,
    ISO_ORIGIN_Y - origin.y - island.originY,
  );
  /**
   * The ground stays UNDER the board — it is a backdrop and nothing more.
   *
   * -10 rather than some low sort value: the clouds document their own depth
   * against this exact number.
   */
  island.view.zIndex = -10;
  container.addChild(island.view);

  return {
    layout() {
      // The terrain is pinned to the board's grid, and the board does not move
      // on resize — the scene rescales its whole container instead. Nothing to
      // recompute, unlike the painting, which had to re-cover the viewport.
    },
    fadeBehind: (x, y) => island.fadeBehind(x, y),
    update: (deltaMs) => island.update(deltaMs),
    destroy: () => island.destroy(),
  };
}

/** The board's extent in terrain cells, for anything that needs to clamp. */
export const BOARD_CELLS = { width: COLS, height: ROWS } as const;
