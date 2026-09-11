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

  const island = new IsoIslandView({
    map,
    tileset,
    metrics: { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT },
    decoScale: DECO_SCALE,
    placements,
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
   * LEVEL WITH THE BOARD, not beneath it.
   *
   * The terrain is one container, so its `zIndex` is a single number for the
   * whole landscape — sea, cliffs, trees, rocks and sheep alike. Parked below
   * the tiles it buried its own careful sorting: every sprite in here already
   * carries `isoDepth(x, y, tier) + 1`, on exactly the scale the tiles use
   * (`tileDepth(i) * 16 + tier`, and `tileDepth` is `col + row`) — the two were
   * built to interleave and never got the chance. That is why a tree could not
   * stand in front of a tile, and why `fadeBehind` (which exists to let a tree
   * HIDE a rabbit) had nothing to fade.
   *
   * At 0 both scales finally meet: a near tree sorts above a far tile, a far
   * cliff below a near one, per sprite rather than per layer. The board's own
   * fog drops just under this — see `FOG_Z` in Tile.ts.
   */
  island.view.zIndex = 0;
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
