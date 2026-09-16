/**
 * Where the burrow's camera sits, and why it moves.
 *
 * The screen has two readings of the same ground, and they want different
 * framings. At HOME the burrow is a place: the camera sits close and the
 * homestead fills the frame. While PLACING a trap, or RAIDING someone else's,
 * it is a board, and a board you cannot see the whole of is a board you cannot
 * make a decision on — so both fit the whole homestead (`boardCam`).
 *
 * A raid briefly had a close shot of its own that followed the raider, from
 * the time the defender's ground was hidden and uncovered cell by cell: a fit
 * of a hidden board framed empty sea. The ground is drawn in full again, and
 * the close shot went with the hiding — a raider who could see four cells of
 * somebody's island could not tell what they were looking at.
 *
 * It is one transform on the scene container rather than a per-object rescale:
 * the terrain, the crop, the clouds and the board all keep their measured
 * relationship to each other and only the window onto them changes.
 *
 * ## What the ground being GENERATED changed here
 *
 * The shot used to be clamped against the BACKDROP — a full-canvas painting
 * that the camera was forbidden from pulling past, because a strip of empty
 * canvas along the bottom of the burrow read as a broken screen. There is no
 * painting any more: the ground is tiles, drawn only where the island is, and
 * the sea around it is the scene's own colour edge to edge. So the binding
 * constraint is now the BOARD itself, which is what the camera was always
 * really about — fit the played ground, at a size a thumb can use.
 *
 * The board's extent is also no longer a constant. Every player's homestead is
 * a different shape, so the framing is solved per seed rather than once.
 *
 * ## Placement is no longer a fit
 *
 * `boardCam` frames the whole homestead, and for a RAID that is still the shot:
 * a raider is choosing a route and needs to see the ground it crosses. For
 * PLACEMENT it was measured and found wanting. The homestead is a wide, flat
 * isometric diamond (~787x350 scene px), so the `Math.min` below is decided by
 * the WIDTH on every screen, and the height is spent on sea. In the 960x540
 * landscape space that is a 47-54px tile filling 65-82% of the frame.
 *
 * Placement is the one screen where a cell is a TARGET rather than a thing to
 * look at, so it opens closer than the fit (`PLACE_ZOOM_OPEN`) and is driven
 * like the island: pinch/wheel to zoom, drag to pan, within limits that cannot
 * lose the board. Zoomed all the way out is exactly the old fit, so nothing is taken
 * away — the shot the screen used to open on is one gesture from where it now
 * opens.
 */
import { GAME_W, GAME_H } from '../Application';
import { BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H } from '@/config/burrowConfig';
import { burrowCell } from '@/game/burrow/board';
import { burrowTileScreen } from '@/game/burrow/screen';

export interface BurrowCam {
  scale: number;
  x: number;
  y: number;
}

/**
 * The played ground's bounding box, in scene coordinates.
 *
 * Only the walkable cells: the sea and the scenery around them are framing,
 * and fitting the whole 19x19 lattice would spend the screen on water. Lifted
 * tiles are included at their lifted position, so a shelf at the top of the
 * homestead is not cropped off.
 */
export function boardBounds(seed: string) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
    if (burrowCell(seed, i) === 'blocked') continue;
    const { x, y } = burrowTileScreen(seed, i);
    minX = Math.min(minX, x - BURROW_HALF_W);
    maxX = Math.max(maxX, x + BURROW_HALF_W);
    minY = Math.min(minY, y - BURROW_HALF_H);
    maxY = Math.max(maxY, y + BURROW_HALF_H);
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Margin around the board in the pulled-back shot, as a share of the frame.
 *
 * The homestead should not be pressed against the edges of the screen: the
 * terrain draws a coastline and a rim of sea, and cropping to the exact
 * walkable box cuts the island off at its own shore.
 *
 * 0.82 rather than the old 0.94, which filled the frame almost edge to edge.
 * Placement is the one screen where the whole board has to be READABLE AND
 * TAPPABLE at once — the player is scanning for a cell to mine, not admiring
 * the homestead — and a board pressed against the frame leaves the outermost
 * cells half under the window's own edges. The extra breathing room costs
 * nothing: the shot is already a fit, so pulling back only makes each cell
 * smaller, and `MIN_TILE_PX` guards the floor.
 */
const BOARD_MARGIN = 0.82;

/**
 * The smallest a cell may be drawn, in DESIGN pixels.
 *
 * A trap is placed by hitting one tile. Design px, not device px: the canvas
 * is fitted to the screen, so 23 of these on a 480-wide portrait space is a
 * comfortable thumb target on a real phone.
 */
export const MIN_TILE_PX = 23;

/**
 * THE HOME SHOT'S WINDOW: the part of the frame the chrome leaves bare, as
 * shares of the design canvas.
 *
 * At home the homestead is a backdrop. The burrow's cards stand on the left
 * quarter of the screen (`.rr-burrow` is `max(25vw, 220px)` plus its inset),
 * the top bar takes the first band and the loop bar the last, and a homestead
 * framed against the whole canvas put its western shore under the cards and
 * its southern one under DIG / DEFEND / RAID — on the Seeker the land ran to y
 * 498 of a 431px canvas. Paul (2026-09-16): "the player's island is too big".
 * So the shot fits the land into the window between those three, and the
 * whole homestead is seen beside the cards rather than behind them.
 *
 * Shares rather than a measurement handed over from the DOM: this is the one
 * place the board has to know where the chrome is, and a backdrop can afford
 * the approximation where a tap target could not. The numbers are the
 * Seeker's (890x400): 25vw + 10px of edge + 12px of padding = 0.27 of the
 * width; a 56px top bar = 0.14 and a 48px bar over a 10px edge = 0.145 of the
 * height. On taller screens the bands are proportionally smaller than this
 * says, which only costs a little sea.
 */
const HOME_LEFT = 0.27;
const HOME_TOP = 0.14;
const HOME_BOTTOM = 0.145;

/** Air around the land inside that window, as a share of it. */
const HOME_MARGIN = 0.9;

/**
 * At home: the homestead fitted into the window the chrome leaves, centred in
 * it, never closer than the laid-out 1:1 — that is placement's job. Without a
 * seed (the scene's first frame, before its data lands) it is the identity the
 * layout was drawn in.
 */
export function homeCam(seed?: string, W: number = GAME_W, H: number = GAME_H): BurrowCam {
  if (seed === undefined) return { scale: 1, x: 0, y: 0 };
  const b = boardBounds(seed);
  const win = {
    x: W * HOME_LEFT, y: H * HOME_TOP,
    w: W * (1 - HOME_LEFT), h: H * (1 - HOME_TOP - HOME_BOTTOM),
  };
  const scale = Math.min(1, (win.w * HOME_MARGIN) / b.w, (win.h * HOME_MARGIN) / b.h);
  return {
    scale,
    x: win.x + win.w / 2 - scale * (b.minX + b.maxX) / 2,
    y: win.y + win.h / 2 - scale * (b.minY + b.maxY) / 2,
  };
}

/**
 * The decision shot: fit the whole homestead, centred.
 *
 * A FIT, not a constant — and this is the opposite of what the painted burrow
 * did, for a reason that changed under it. Back then the board was a fixed
 * 19x19 picture and a fitted camera cancelled every change to the tile size
 * exactly (cells at 34, 48, 64 and 80px all came out at 46.8px on screen, with
 * only the camera's scale moving). A constant was the right call: the two
 * knobs were fighting and only one should be the lever.
 *
 * Now every player's homestead is a different SHAPE, and one constant cannot
 * frame all of them — a wide island would run off the screen and a compact one
 * would sit in a corner of it. So the camera fits the seed's own board, and
 * the tile size still decides how big a cell is relative to the homestead
 * around it. The two are no longer fighting because they are answering
 * different questions.
 */
export function boardCam(seed: string, W: number = GAME_W, H: number = GAME_H): BurrowCam {
  const b = boardBounds(seed);
  const scale = Math.min((W * BOARD_MARGIN) / b.w, (H * BOARD_MARGIN) / b.h);
  return {
    scale,
    x: W / 2 - scale * (b.minX + b.maxX) / 2,
    y: H / 2 - scale * (b.minY + b.maxY) / 2,
  };
}

/**
 * The closest placement may be pinched in to, as a multiple of the fit.
 *
 * It is a MULTIPLE of the fit rather than a tile size like the island's
 * `DEFAULT_TILE_PX`, because the fit already absorbs the seed's shape and the
 * viewport's — a constant tile size would re-introduce the per-seed framing
 * problem the fit exists to solve.
 *
 * WHY THE CEILING IS ABOVE THE OPENING SHOT. It used to be the same number,
 * and that is what made the pinch feel broken: the screen opened AT the
 * ceiling, so half of every pinch — the half that pulls the board closer —
 * moved nothing at all. A gesture that answers in one direction only reads as
 * a stuck board rather than as a limit, and the fix is to open inside the
 * range instead of on its edge.
 */
const PLACE_ZOOM_MAX = 3;

/**
 * How close placement OPENS, as a multiple of the fit.
 *
 * The fit spends the frame's height on sea (65-82% filled in landscape, and
 * the width is what binds), so it takes more than the fit for a cell to read
 * as a target. 1.5 rather than the 2 this opened on at first: at 2 the board
 * is a keyhole on a phone — the outer cells are off-screen, so the first thing
 * the screen asks of the player is a pan, before they have seen what they are
 * choosing between. Both directions of the pinch now answer from here.
 */
const PLACE_ZOOM_OPEN = 1.5;

/**
 * How far past the board's edge it may be dragged, as a share of the frame.
 *
 * Borrowed from the island's `PAN_SLACK`, for the same reason: pinning the
 * coast to the screen's edge puts the outermost cells under the window's own
 * rim, where a thumb has to reach past the bezel to hit them.
 */
const PAN_SLACK = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The zoom range placement may move in, for this homestead on this screen.
 *
 * `min` is the old fit — the whole homestead in frame, which is where the
 * screen used to be nailed. `max` is `PLACE_ZOOM_MAX`, comfortably ABOVE the
 * shot placement opens on (`PLACE_ZOOM_OPEN`) so that a pinch answers in both
 * directions from the start — when the two were the same number, pinching
 * closer moved nothing and the board read as stuck. The ceiling still exists
 * because past it the pixel art is a wall of blocks and the board becomes a
 * keyhole; unlike the island there is nothing to inspect up close — a cell is
 * either trappable or it is not.
 *
 * `Math.max` guards the degenerate screen where the fit is already past the
 * ceiling, so the range can never come back inverted.
 */
export function placeZoomLimits(seed: string, W: number = GAME_W, H: number = GAME_H) {
  const min = boardCam(seed, W, H).scale;
  return { min, max: Math.max(min * PLACE_ZOOM_MAX, min) };
}

/**
 * Hold one axis inside the frame: centred while the board is smaller than the
 * screen, otherwise held so its edge cannot pass the screen's by more than the
 * slack. The same arithmetic as the island's `clampAxis`, and the reason it is
 * a copy rather than an import is that the two cameras measure different
 * things — this one has no land/sea split to clamp against, only the board.
 */
function clampAxis(pos: number, scale: number, lo: number, hi: number, size: number): number {
  const span = (hi - lo) * scale;
  if (span <= size) return size / 2 - scale * (lo + hi) / 2;
  const slack = size * PAN_SLACK;
  return clamp(pos, size - slack - scale * hi, slack - scale * lo);
}

/** Bring a placement camera back inside its zoom range and its pan bounds. */
export function clampPlaceCam(
  cam: BurrowCam, seed: string, W: number = GAME_W, H: number = GAME_H,
): BurrowCam {
  const { min, max } = placeZoomLimits(seed, W, H);
  const scale = clamp(cam.scale, min, max);
  const b = boardBounds(seed);
  return {
    scale,
    x: clampAxis(cam.x, scale, b.minX, b.maxX, W),
    y: clampAxis(cam.y, scale, b.minY, b.maxY, H),
  };
}

/**
 * The shot placement OPENS on: the fit, twice as close, centred on the board.
 *
 * Centred rather than aimed at anything in particular — unlike the island,
 * which opens on the spawn tile, a homestead has no cell the player is about
 * to act from. Every trappable cell is equally a candidate, so the middle is
 * the fairest place to start and the pan reaches the rest.
 */
export function placeCam(seed: string, W: number = GAME_W, H: number = GAME_H): BurrowCam {
  const b = boardBounds(seed);
  const { min, max } = placeZoomLimits(seed, W, H);
  // Clamped into the range rather than assumed inside it: on a screen whose
  // fit is already past the ceiling the two collapse, and the opening shot
  // must still be a scale the pinch can move away from in both directions.
  const scale = clamp(min * PLACE_ZOOM_OPEN, min, max);
  return clampPlaceCam({
    scale,
    x: W / 2 - scale * (b.minX + b.maxX) / 2,
    y: H / 2 - scale * (b.minY + b.maxY) / 2,
  }, seed, W, H);
}

/**
 * Zoom about a point, keeping the scene under it PUT.
 *
 * That invariant is what makes a pinch feel like grabbing the board rather
 * than like working a slider: solve for the scene point under `at` before the
 * change, then place that same point back under `at` after it.
 */
export function zoomPlaceCam(
  cam: BurrowCam, factor: number, at: { x: number; y: number }, seed: string,
  W: number = GAME_W, H: number = GAME_H,
): BurrowCam {
  const { min, max } = placeZoomLimits(seed, W, H);
  const scale = clamp(cam.scale * factor, min, max);
  const sceneX = (at.x - cam.x) / cam.scale;
  const sceneY = (at.y - cam.y) / cam.scale;
  return clampPlaceCam({ scale, x: at.x - sceneX * scale, y: at.y - sceneY * scale }, seed, W, H);
}

/** Slide the placement camera by a design-space delta, clamped. */
export function panPlaceCam(
  cam: BurrowCam, dx: number, dy: number, seed: string,
  W: number = GAME_W, H: number = GAME_H,
): BurrowCam {
  return clampPlaceCam({ scale: cam.scale, x: cam.x + dx, y: cam.y + dy }, seed, W, H);
}

/**
 * What the pulled-back shot puts where, for the test that guards it.
 *
 * Returned rather than re-derived in the test, so the assertion is made against
 * the code that actually runs instead of a second copy of the arithmetic that
 * could drift from it.
 */
export function boardCamFraming(seed: string, W: number, H: number) {
  const cam = boardCam(seed, W, H);
  const b = boardBounds(seed);
  return {
    cam,
    board: {
      left: cam.x + cam.scale * b.minX,
      right: cam.x + cam.scale * b.maxX,
      top: cam.y + cam.scale * b.minY,
      bottom: cam.y + cam.scale * b.maxY,
    },
    // The LIVE half-width, not the shipped constant: the tuning harness can
    // change the tile size, and a report that ignored it would describe a board
    // nobody is looking at.
    tileWidth: BURROW_HALF_W * 2 * cam.scale,
  };
}
