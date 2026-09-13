/**
 * The island's camera: where it starts, how far it may go, and the arithmetic
 * of moving it.
 *
 * The island used to be framed ONCE per viewport — a cover of the whole
 * lattice, solved so the ground reached every edge of the screen and then
 * held — because the whole board had to be on screen: there was no way to
 * reach a cell that was not. That shot only worked because the board was
 * small. It is 32x32 now, and the point of a board that size is that it does
 * NOT fit: the player zooms (pinch, wheel) and pans (drag) across it, and the
 * camera is state the gestures move rather than a number solved from the seed.
 *
 * Everything here is pure arithmetic in DESIGN pixels (the `GAME_W`/`GAME_H`
 * space `Application` fits to the window), on a `{ scale, x, y }` triple that
 * `IslandScene` applies as one transform on its container. Scene coordinates
 * map to design coordinates as `design = x + scale * scene`. Nothing in the
 * scene moves for the camera; only the window onto it does.
 *
 * Three rules, and the reasons for them:
 *
 *  - The DEFAULT ZOOM is a tile size, not a fit. The old cover produced a
 *    ~60px tile in landscape and ~73px in portrait, and both were played and
 *    accepted; a fit of the new lattice would draw a 30px tile in landscape and
 *    15px in portrait, which is no longer a tap target. So the default is the
 *    tile size the old shot happened to give, made explicit, and the island
 *    simply overflows the frame around it.
 *
 *  - The ZOOM RANGE runs from "the whole island in frame" to a tile four times
 *    its drawn size. The floor is an overview — cells that small are not meant
 *    to be tapped, and the player zooms back in to play — and the ceiling is
 *    where the pixel art stops being art.
 *
 *  - The PAN is clamped to the land: the island can be dragged until its coast
 *    meets the screen's edge (plus a little slack) and no further, so it can
 *    never be lost off-screen. On an axis where the island is smaller than the
 *    screen it is centred instead, since there is nothing to pan to.
 */
import { GAME_W, GAME_H } from '../Application';
import { COLS, ROWS, HALF_W, HALF_H, ISO_TILE_W, tilePos, toColRow } from '@/config/gridConfig';
import { levelTierAt, spawnTile, tileScreenPos, TIER_LIFT } from '@/lib/game/terrainBoard';

export interface IslandCam {
  scale: number;
  x: number;
  y: number;
}

/** A point, in whichever space the caller says. */
export interface Point {
  x: number;
  y: number;
}

/**
 * How wide a tile is drawn at the DEFAULT zoom, in design pixels.
 *
 * Per orientation because the design spaces are: 960x540 landscape and 480x860
 * portrait are two different rulers, and the same tile has to come out the
 * same size under a thumb on each. These are the sizes the old cover shot
 * produced (60 and 73), rounded to what read best — the portrait one nudged up
 * because a phone is held closer than a desk.
 */
export const DEFAULT_TILE_PX = { landscape: 60, portrait: 80 } as const;

/**
 * The smallest a cell may be drawn AT THE DEFAULT ZOOM, in design pixels.
 *
 * A tile is a tap target: the island is played by tapping the cell you want to
 * step onto, and the ring of eight around the rabbit has to be separable by a
 * thumb. The player may zoom OUT past this for an overview — that is what the
 * overview is for — but the shot the game opens on must be playable as is.
 */
export const MIN_TILE_PX = 26;

/**
 * The largest a cell may be drawn, in design pixels: four times its art.
 *
 * Past this the 44px diamond is a wall of nearest-neighbour blocks and the
 * player can see about three cells, which is a keyhole rather than a board.
 */
export const MAX_TILE_PX = ISO_TILE_W * 4;

/**
 * How far past the island's edge the board may be dragged, as a share of the
 * screen. Zero would pin the coast to the screen edge; a little slack lets it
 * be pulled towards the middle so the cells on it can be tapped without a
 * thumb on the bezel.
 */
const PAN_SLACK = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The LAND's bounding box, in scene coordinates, with a shore around it.
 *
 * The land only — cells the terrain raised above the sea — and not the whole
 * lattice. The lattice is a 32x32 diamond and the island fills about 60% of
 * it, so its bounding box is mostly open sea; a pan clamped against it let
 * the island be dragged until only its corner was left on screen, with two
 * thirds of the frame showing water. Clamping against the land is what makes
 * "the island cannot be lost" mean the island.
 *
 * `SHORE` cells of margin all round, so the coast's foam and the rim of sea
 * the surf is drawn on stay in the box: the pan may bring the coast to the
 * edge of the screen, not cut it off at the last land cell.
 *
 * Headroom above for the tallest tier ON this island: a raised tile is drawn
 * as a column whose top face is at the lifted point and whose art continues
 * upward past it, so a box measured at tile centres clips the plateaus along
 * the top row.
 *
 * Cached by seed: it is read on every gesture event, and a pinch fires dozens
 * a second.
 */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  w: number;
  h: number;
}

/** Cells of sea kept around the land in the camera's box — see `boardBounds`. */
const SHORE = 2;

const boundsCache = new Map<string, Bounds>();

export function boardBounds(seed: string): Bounds {
  const hit = boundsCache.get(seed);
  if (hit) return hit;

  let tallest = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < COLS * ROWS; i++) {
    const { col, row } = toColRow(i);
    const tier = levelTierAt(seed, col, row);
    if (tier === 0) continue;
    if (tier > tallest) tallest = tier;
    const { x, y } = tilePos(i);
    minX = Math.min(minX, x - HALF_W);
    maxX = Math.max(maxX, x + HALF_W);
    minY = Math.min(minY, y - HALF_H);
    maxY = Math.max(maxY, y + HALF_H);
  }
  minX -= SHORE * HALF_W * 2;
  maxX += SHORE * HALF_W * 2;
  minY -= SHORE * HALF_H * 2 + tallest * TIER_LIFT;
  maxY += SHORE * HALF_H * 2;
  const b = { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
  boundsCache.set(seed, b);
  return b;
}

/**
 * The zoom the camera may not leave, for this island on this screen.
 *
 * `min` puts the whole island in frame — the overview. `max` is the tile
 * ceiling, or `min` if the screen is so small that even the overview is past
 * it, so the range is never inverted.
 */
export function zoomLimits(seed: string, W: number = GAME_W, H: number = GAME_H) {
  const b = boardBounds(seed);
  const min = Math.min(W / b.w, H / b.h);
  const max = Math.max(MAX_TILE_PX / ISO_TILE_W, min);
  return { min, max };
}

/** The zoom the island opens on: a playable tile, whatever the screen. */
export function defaultZoom(seed: string, W: number = GAME_W, H: number = GAME_H): number {
  const tile = H > W ? DEFAULT_TILE_PX.portrait : DEFAULT_TILE_PX.landscape;
  const { min, max } = zoomLimits(seed, W, H);
  return clamp(Math.max(tile, MIN_TILE_PX) / ISO_TILE_W, min, max);
}

/**
 * Bring a camera back inside what it is allowed to show: the zoom range, and
 * the pan that keeps the lattice against the frame.
 */
export function clampCam(cam: IslandCam, seed: string, W: number = GAME_W, H: number = GAME_H): IslandCam {
  const { min, max } = zoomLimits(seed, W, H);
  const scale = clamp(cam.scale, min, max);
  const b = boardBounds(seed);
  return {
    scale,
    x: clampAxis(cam.x, scale, b.minX, b.maxX, W),
    y: clampAxis(cam.y, scale, b.minY, b.maxY, H),
  };
}

/**
 * One axis of the pan clamp. `lo..hi` is the board in scene units, `size` the
 * screen in design units. Centred when the board is the smaller of the two;
 * otherwise held so the board's edge cannot pass the screen's edge by more
 * than the slack.
 */
function clampAxis(pos: number, scale: number, lo: number, hi: number, size: number): number {
  const span = (hi - lo) * scale;
  if (span <= size) return size / 2 - scale * (lo + hi) / 2;
  const slack = size * PAN_SLACK;
  // board.left = pos + scale * lo must stay <= slack, and
  // board.right = pos + scale * hi must stay >= size - slack.
  return clamp(pos, size - slack - scale * hi, slack - scale * lo);
}

/** A camera at `scale` with the scene point `focus` in the middle of the screen. */
export function lookAt(
  seed: string, focus: Point, scale: number, W: number = GAME_W, H: number = GAME_H,
): IslandCam {
  return clampCam({
    scale,
    x: W / 2 - scale * focus.x,
    y: H / 2 - scale * focus.y,
  }, seed, W, H);
}

/**
 * The opening shot: the default zoom, centred on `focus` — by default the tile
 * a run starts on, which is where the rabbit will land. The lattice's centre
 * used to be the anchor, and on a board this size that could be a screen away
 * from the spawn.
 */
export function islandCam(
  seed: string, W: number = GAME_W, H: number = GAME_H, focus?: Point,
): IslandCam {
  const at = focus ?? tileScreenPos(seed, spawnTile(seed));
  return lookAt(seed, at, defaultZoom(seed, W, H), W, H);
}

/**
 * Zoom by `factor` about the design point `at`, so whatever is under the
 * finger — or the wheel — stays under it. That invariant is what makes a
 * pinch feel like grabbing the map rather than like a slider: solve for the
 * scene point at `at` before, and place the same point at `at` after.
 */
export function zoomCam(
  cam: IslandCam, factor: number, at: Point, seed: string,
  W: number = GAME_W, H: number = GAME_H,
): IslandCam {
  const { min, max } = zoomLimits(seed, W, H);
  const scale = clamp(cam.scale * factor, min, max);
  const sceneX = (at.x - cam.x) / cam.scale;
  const sceneY = (at.y - cam.y) / cam.scale;
  return clampCam({
    scale,
    x: at.x - sceneX * scale,
    y: at.y - sceneY * scale,
  }, seed, W, H);
}

/** Slide the camera by a design-space delta, clamped. */
export function panCam(
  cam: IslandCam, dx: number, dy: number, seed: string,
  W: number = GAME_W, H: number = GAME_H,
): IslandCam {
  return clampCam({ scale: cam.scale, x: cam.x + dx, y: cam.y + dy }, seed, W, H);
}

/** Where a scene point lands on the screen under `cam`, in design units. */
export function toScreen(cam: IslandCam, p: Point): Point {
  return { x: cam.x + cam.scale * p.x, y: cam.y + cam.scale * p.y };
}

/** The scene point under a design-space screen point. */
export function toScene(cam: IslandCam, p: Point): Point {
  return { x: (p.x - cam.x) / cam.scale, y: (p.y - cam.y) / cam.scale };
}

/**
 * What the opening shot puts where, for the test that guards it.
 *
 * Returned rather than re-derived in the test, so the assertion is made against
 * the code that actually runs instead of a second copy of the arithmetic that
 * could drift from it — the same contract `boardCamFraming` keeps.
 */
export function islandCamFraming(seed: string, W: number, H: number) {
  const cam = islandCam(seed, W, H);
  const b = boardBounds(seed);
  return {
    cam,
    board: {
      left: cam.x + cam.scale * b.minX,
      right: cam.x + cam.scale * b.maxX,
      top: cam.y + cam.scale * b.minY,
      bottom: cam.y + cam.scale * b.maxY,
    },
    tileWidth: HALF_W * 2 * cam.scale,
    /** Where the spawn tile's centre lands on screen. */
    spawn: toScreen(cam, tileScreenPos(seed, spawnTile(seed))),
    limits: zoomLimits(seed, W, H),
  };
}
