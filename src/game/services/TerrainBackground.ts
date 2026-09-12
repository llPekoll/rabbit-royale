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
import { Container, type Sprite } from 'pixi.js';
import { HALF_W, HALF_H, ISO_ORIGIN_X, ISO_ORIGIN_Y, COLS, ROWS, toColRow } from '@/config/gridConfig';
import { IsoIslandView, loadIslandTileset, isoProject } from '@/game/island';
import { terrainFor, TIER_LIFT, levelTierAt } from '@/lib/game/terrainBoard';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { createPackWater, loadPackWater, type PackWater } from '@/game/fx/PackWater';
import { createDucks, loadDucks, type Ducks } from '@/game/fx/Ducks';
import { WATER_LOOK, DUCK_LOOK } from '@/config/waterLook';
import type { IslandBackground } from './IslandBackground';

/** Scenery is cut for 64px tiles; the board's are 44x24. */
const DECO_SCALE = 0.4;

export interface TerrainBackground extends IslandBackground {
  /** Fade whatever the rabbit is standing behind. */
  fadeBehind(tileX: number, tileY: number): void;
  /** Advance the sway. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void;
  /**
   * Put one sheep on a new cell, because the SERVER says so.
   *
   * The terrain scattered the flock from the seed, but it does not decide
   * where it goes from there — sheep bolt when a rabbit closes in, and that
   * makes their position shared mutable state the server owns (`flee.ts`).
   * This is the client's end of that: no rules, just "this one is there now".
   *
   * False for an unknown id — what a client holding a stale flock across a
   * rebuild sends — so the caller can drop it from its roster.
   */
  moveSheep(id: string, x: number, y: number): boolean;
  /**
   * Put a tile's veil inside the terrain block of its cell — see
   * `IsoIslandView.mountVeil`. False when the cell has no block.
   */
  mountVeil(index: number, veil: Sprite): boolean;
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
  /** `decoScale` overrides the board's scenery size — for the stories that
   *  exist to show what the wrong size looks like. The game never passes it. */
  options: { decoScale?: number } = {},
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
    decoScale: options.decoScale ?? DECO_SCALE,
    placements,
    decoLayer: container,
    // No water tiles. The scene already paints the sea edge to edge
    // (`BG_COLOR`), and the pack's water is a flat teal of a DIFFERENT shade:
    // stamped per cell, it drew a second, lighter diamond the size of the
    // whole grid around the island, which read as a veil lying on the water.
    sea: false,
    // And no per-cell surf either, for the same reason one step further out.
    //
    // `buildFoam` stamps one foam sprite on every SEA CELL that touches land.
    // On a grid that coarse the ring it makes is the grid: the shore comes out
    // as a staircase of teal diamonds stepping around the island, which reads
    // as tiled water rather than as a coast. It is the shape the water work in
    // `game/fx` (`PackWater`, and `Island/Water` in Storybook) exists to
    // replace — a continuous band solved from distance to land rather than one
    // sprite per cell.
    //
    // Off rather than restyled: leaving it on would draw the old coastline
    // UNDER the new one the moment that work lands.
    foam: false,
    // Over a playing board a tree without one hovers between two lit
    // diamonds and the eye cannot tell which cell it stands on.
    decoShadows: true,
  });

  // Line the terrain up with the BOARD's grid: project the board's origin
  // cell through the terrain's own projection and shift by the difference, so
  // tile (0,0) of each lands on the same pixel.
  const origin = isoProject(0.5, 0.5, 0, { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT });
  island.view.position.set(
    ISO_ORIGIN_X - origin.x - island.originX,
    ISO_ORIGIN_Y - origin.y - island.originY,
  );
  // The deported sprites are in the scene's container, not under `view`, so
  // moving `view` does not carry them. This hands them the same shift.
  island.placeDeco(island.view.position.x, island.view.position.y);
  /**
   * The ground stays UNDER the board — it is a backdrop and nothing more.
   *
   * -10 rather than some low sort value: the clouds document their own depth
   * against this exact number.
   */
  island.view.zIndex = -10;
  container.addChild(island.view);

  /**
   * The sea's own layer: the surf breaking on the coast, and the ducks on it.
   *
   * Added to the terrain's GROUND container, which is the only frame that
   * lines up cell-for-cell with the land.
   *
   * There are three frames in play and they are one offset apart at each step:
   * the scene's (what `tilePos` answers in), `island.view`'s, and inside that
   * the ground's, shifted by `bounds.origin` — the inset from the lattice's
   * bounding box to its cell (0,0). The ground, the cliffs and every stamped
   * sprite live in the last of those. Two earlier cuts of this got it wrong in
   * both directions: addressing `tilePos` from the view put the surf a constant
   * (-352, -36) off the coast, and projecting correctly but adding to `view`
   * threw it the same distance back the other way, as a ribbon of pale tiles
   * running off the top-left corner.
   *
   * At the bottom of the ground so a duck swimming behind the island is hidden
   * by it rather than sliding over the cliffs, and so the surf's overhang tucks
   * beneath the land it laps.
   */
  const sea = new Container();
  sea.zIndex = -1000;
  island.ground.addChild(sea);

  const isLand = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < COLS && y < ROWS && levelTierAt(seed, x, y) > 0;
  // The terrain's own projection, flat: the surf lies at sea level, not lifted
  // onto whatever tier the land behind it rose to.
  const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };
  const at = (x: number, y: number) => isoProject(x + 0.5, y + 0.5, 0, metrics);

  const water = createPackWater(
    await loadPackWater(), COLS, ROWS, isLand, at, WATER_LOOK,
  );
  sea.addChild(water.view);

  const ducks = createDucks(
    await loadDucks(), COLS, ROWS,
    (x, y) => !isLand(x, y),
    at,
    // Seeded from the island, so the same island always puts its ducks in the
    // same places — a screenshot of a seed is reproducible.
    mulberry32(seedFrom(`${seed}:ducks`)),
    DUCK_LOOK,
  );
  sea.addChild(ducks.view);

  return {
    layout() {
      // The terrain is pinned to the board's grid, and the board does not move
      // on resize — the scene rescales its whole container instead. Nothing to
      // recompute, unlike the painting, which had to re-cover the viewport.
    },
    fadeBehind: (x, y) => island.fadeBehind(x, y),
    moveSheep(id, x, y) {
      // The occupant objects are the SAME ones the view holds, so writing the
      // cell here and calling `syncOccupants` is what moves the sprite — the
      // path a wandering sheep already used, now driven from the wire.
      const one = island.occupants().find((o) => o.id === id);
      if (!one) return false;
      one.x = x;
      one.y = y;
      island.syncOccupants();
      return true;
    },
    mountVeil(index, veil) {
      const { col, row } = toColRow(index);
      return island.mountVeil(col, row, veil);
    },
    update(deltaMs) {
      island.update(deltaMs);
      water.update(deltaMs);
      ducks.update(deltaMs);
    },
    destroy() {
      island.destroy();
      water.destroy();
      ducks.destroy();
      sea.destroy({ children: true });
    },
  };
}

/** The board's extent in terrain cells, for anything that needs to clamp. */
export const BOARD_CELLS = { width: COLS, height: ROWS } as const;
