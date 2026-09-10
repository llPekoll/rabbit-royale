/**
 * Where the burrow's camera sits, and why it moves.
 *
 * The screen has two readings of the same ground, and they want opposite
 * framings. At HOME the burrow is a place: the art is worth looking at, so the
 * camera sits close and the homestead fills the frame. While PLACING a trap —
 * or RAIDING someone else's — the burrow is a board, and a board you cannot see
 * the whole of is a board you cannot make a decision on. In portrait the played
 * ground actually ran 208px off the right-hand edge, so the far flank was not
 * merely small, it was unreachable.
 *
 * So the camera reframes for the decision and returns afterwards — zooming IN
 * on the board in landscape, and back out in portrait, whichever puts the
 * played ground on the screen at a size a thumb can use. It is one
 * transform on the scene container rather than a per-object rescale: the
 * backdrop, the crop, the clouds and the board all keep their measured
 * relationship to each other (burrowConfig's origin was solved against the art)
 * and only the window onto them changes.
 */
import { GAME_W, GAME_H } from '../Application';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, BURROW_ZOOM,
  burrowCell, burrowTilePos,
} from '@/config/burrowConfig';
import PLOTS from '@/config/carrotPlots.json';

/**
 * The scale at which the backdrop exactly fills the canvas.
 *
 * Below it the painting no longer covers every edge, and `frame()`'s clamp
 * would start eating the pull-back silently — the camera would report one scale
 * and show another. Computed against the design space the game actually runs
 * in, and against BOTH orientations, so the tighter of the two wins rather than
 * a rotation quietly breaking the promise.
 */
function backdropFloor(): number {
  let floor = 0;
  for (const [W, H] of [[GAME_W, GAME_H], [GAME_H, GAME_W]] as const) {
    const back = rawBackdropSize(W, H);
    floor = Math.max(floor, W / back.w, H / back.h);
  }
  // A whisker inside the exact fit. Landing ON it leaves the edge a rounding
  // error short of the canvas, which is a one-pixel seam rather than a bug —
  // but it is a seam a player would see against the sky.
  return floor * 1.002;
}

/** Memo for `burrowCamOut`: the art does not change size at runtime. */
let camOut: number | null = null;

/**
 * How far back the camera pulls to show the whole board.
 *
 * This is now the furthest the shot can physically go: at this scale the
 * backdrop's edges land exactly on the canvas edges, so the player sees the
 * WHOLE painting and one pixel more would be a strip of empty canvas along the
 * bottom of their burrow. Derived from the art rather than typed, because the
 * number that matters is "as far as the painting allows" and a literal would go
 * stale the day the backdrop is redrawn at another aspect ratio.
 *
 * Note what does NOT limit it any more: it used to stop at 0.78 to protect the
 * tap targets, but a design pixel is not a device pixel — the canvas is fitted
 * to the screen, so the tiles here are ~23.5 design px and still a comfortable
 * thumb target on a phone. The binding constraint was always the painting.
 *
 * A FUNCTION rather than a `const`, and this is not style. The design space it
 * measures against lives in Application, which pulls in Pixi and the whole
 * scene graph; computing this at module scope ran that chain during Next's
 * prerender of `/` and hit a half-initialised binding in the import cycle
 * ("Cannot access 'jf' before initialization" — a build failure, not a runtime
 * one). Deferring the sum to first call keeps module load inert. Memoised, so
 * callers still pay for it once.
 */
export function burrowCamOut(): number {
  camOut ??= backdropFloor();
  return camOut;
}

/**
 * How far the camera sits back while placing.
 *
 * A constant on purpose — see boardCam. Slightly above 1 so the decision shot
 * is a touch wider than the home shot, which is what makes the change of
 * framing read as a camera move rather than as nothing happening; the SIZE of
 * a cell is the tile's job, not this one's.
 */
const PLACING_SCALE = 1.0;

export interface BurrowCam {
  scale: number;
  x: number;
  y: number;
}

/** The played ground's bounding box, in scene coordinates. */
function boardBounds() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
    if (burrowCell(i) === 'blocked') continue;
    const { x, y } = burrowTilePos(i);
    minX = Math.min(minX, x - BURROW_HALF_W);
    maxX = Math.max(maxX, x + BURROW_HALF_W);
    minY = Math.min(minY, y - BURROW_HALF_H);
    maxY = Math.max(maxY, y + BURROW_HALF_H);
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * The backdrop's size in scene space.
 *
 * Mirrors what BurrowScene does to the sprite — cover the canvas, then multiply
 * by BURROW_ZOOM — because the camera has to know how much painted ground it
 * has before it can promise not to pull past the edge of it.
 */
function backdropSize(W: number, H: number) {
  return rawBackdropSize(W, H);
}

/** The same sum, hoisted so `backdropFloor` can use it before the exports run. */
function rawBackdropSize(W: number, H: number) {
  const cover = Math.max(W / PLOTS.art.w, H / PLOTS.art.h);
  return {
    w: PLOTS.art.w * cover * BURROW_ZOOM,
    h: PLOTS.art.h * cover * BURROW_ZOOM,
  };
}

/**
 * Centre the camera on a point at a given scale, without ever showing past the
 * painting.
 *
 * The clamp is the whole reason this is computed rather than tweened by hand: a
 * pull-back that also recentres can walk the backdrop's edge into frame, and a
 * strip of empty canvas along the bottom of the burrow reads as a bug in a way
 * a slightly off-centre board never does. Where the two wishes conflict, the
 * painting wins and the board lands a little off centre.
 */
function frame(scale: number, fx: number, fy: number, W: number, H: number): BurrowCam {
  const back = backdropSize(W, H);
  const x = W / 2 - scale * fx;
  const y = H / 2 - scale * fy;
  // The backdrop is drawn centred on the canvas, so in scene space it spans
  // W/2 ± back.w/2. These are the offsets that keep it over every edge.
  const xMin = W - scale * (W / 2 + back.w / 2);
  const xMax = -scale * (W / 2 - back.w / 2);
  const yMin = H - scale * (H / 2 + back.h / 2);
  const yMax = -scale * (H / 2 - back.h / 2);
  return {
    scale,
    x: Math.min(Math.max(x, xMin), xMax),
    y: Math.min(Math.max(y, yMin), yMax),
  };
}

/** At home: the framing the art was measured in, untouched. */
export function homeCam(): BurrowCam {
  return { scale: 1, x: 0, y: 0 };
}

/**
 * The placement shot: a FIXED pull-back, not a fit.
 *
 * This used to solve a scale that made the board fill the frame. That sounds
 * right and is a trap: a camera that refits the board cancels every change to
 * the board. Make a cell bigger and the board grows; the camera zooms out by
 * exactly the same factor to keep it fitted; the cell lands on screen at the
 * size it started. Measured, not guessed — 34px, 48px, 64px and 80px cells all
 * came out at 46.8px on screen, with only the camera's scale moving (1.38x
 * down to 0.58x) and the homestead shrinking around them.
 *
 * So the camera is now a constant, and the tile size is the knob that actually
 * changes how big a cell is. The two were fighting; only one of them should be
 * the lever, and it should be the one whose name matches what it does.
 *
 * The clamp in `frame` still applies, so a board that outgrows the painting is
 * held to the art's edge rather than sliding off it.
 */
export function boardCam(W: number = GAME_W, H: number = GAME_H): BurrowCam {
  const b = boardBounds();
  return frame(
    PLACING_SCALE,
    (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2,
    W, H,
  );
}

/**
 * What the pulled-back shot puts where, for the test that guards it.
 *
 * Returned rather than re-derived in the test, so the assertion is made against
 * the code that actually runs instead of a second copy of the arithmetic that
 * could drift from it.
 */
export function boardCamFraming(W: number, H: number) {
  const cam = boardCam(W, H);
  const b = boardBounds();
  const back = backdropSize(W, H);
  return {
    cam,
    board: {
      left: cam.x + cam.scale * b.minX,
      right: cam.x + cam.scale * b.maxX,
      top: cam.y + cam.scale * b.minY,
      bottom: cam.y + cam.scale * b.maxY,
    },
    backdrop: {
      left: cam.x + cam.scale * (W / 2 - back.w / 2),
      right: cam.x + cam.scale * (W / 2 + back.w / 2),
      top: cam.y + cam.scale * (H / 2 - back.h / 2),
      bottom: cam.y + cam.scale * (H / 2 + back.h / 2),
    },
    // The LIVE half-width, not the shipped constant: the tuning harness can
    // change the tile size, and a report that ignored it would describe a board
    // nobody is looking at.
    tileWidth: BURROW_HALF_W * 2 * cam.scale,
  };
}
