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
 * Room left around the board.
 *
 * More than a cosmetic margin now that the shot zooms in to fit. At 1.08 the
 * board filled 93% of the frame and the LANDMARKS went out of it — the door,
 * the fenced field, the mound — which are the things a defender is reading the
 * board against ("cover the path, not the lawn"). A grid with no homestead
 * around it is a spreadsheet again, just a bigger one.
 *
 * 1.08 is as tight as this goes while the board still clears the edges: the
 * cells render at ~47px, roughly double where this screen started, and the
 * fenced field and the path stay in shot. The burrow's door is the first thing
 * to go if it is tightened further, and that is the landmark the whole board is
 * read against.
 *
 * Tunable at runtime through `setBoardPad` — Burrow/Placing puts a slider on it
 * — because this is a judgement about feel, and a number you can only change by
 * editing a file and rebuilding is a number nobody actually tries alternatives
 * for. The override is for tuning; the default is what ships.
 */
const BOARD_PAD = 1.08;

/** The live override, when a tuning harness has set one. */
let boardPadOverride: number | null = null;

/**
 * Override the landscape margin, or pass null to go back to the shipped value.
 *
 * Exists for the Storybook slider. Deliberately a setter rather than an
 * argument threaded through `boardCam`: the scene asks the camera for its
 * framing from several places (placing, raiding, resize), and adding a
 * parameter to all of them to serve a tuning tool would put the tool in the
 * game's code path.
 */
export function setBoardPad(pad: number | null): void {
  boardPadOverride = pad;
}

/**
 * The margin in portrait.
 *
 * Just enough to keep the board off the edges. See boardCam for why it is not
 * the same number as BOARD_PAD.
 */
const BOARD_PAD_TIGHT = 1.06;

/**
 * How far the placement shot may zoom IN.
 *
 * A ceiling, not a target: the fit normally decides, and this only stops a small
 * board (or a very tall viewport) from being magnified until the pixel art turns
 * to mush and the cells lose the context around them. At the burrow's 34x19
 * tile it allows roughly 75px per cell — a thumb target with room to spare.
 */
const BURROW_CAM_MAX = 2.2;

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
 * Pulled back for a decision: the whole board, centred.
 *
 * Solved from the BOARD, not from the painting.
 *
 * This used to cap the scale at `burrowCamOut()` — the widest shot the backdrop
 * allows — on the theory that a decision needs to see everything. It does, but
 * "everything" is the board, and the board is a small part of a wide landscape.
 * Framing the painting left the played ground using 47% of the width and 46% of
 * the height (under a quarter of the screen), parked in the bottom-right corner
 * with the rest of the frame given to empty grass, and tiles at 23.6px. This is
 * the screen where a player picks one cell out of many with a thumb.
 *
 * So the fit decides, and it is usually a zoom IN. `Math.min` against a
 * pull-back constant could only ever shrink, which is why no amount of tuning
 * that constant ever made this screen bigger.
 */
export function boardCam(W: number = GAME_W, H: number = GAME_H): BurrowCam {
  const b = boardBounds();
  // The board is a wide, shallow diamond — about 1.8:1 — so which axis binds
  // depends entirely on the viewport's shape, and the two cases want different
  // margins.
  //
  // Landscape has room to spare once the width is fitted, and the margin is
  // what keeps the burrow's
  // landmarks (door, field, mound) in shot around the grid: a defender reads
  // the board against them. Portrait is the opposite — the width is already the
  // limit and the vertical margin is enormous, so spending the same 35% on the
  // width buys nothing and costs a third of the tile size on the one screen
  // where a thumb is doing the tapping. There, the margin is only what keeps
  // the board off the edges.
  // Portrait vs landscape, not "which axis binds": the board is ~1.79:1 and the
  // landscape design space is 1.78:1, so the width binds in BOTH orientations
  // and an axis test cannot tell them apart.
  const pad = boardPadOverride ?? (H > W ? BOARD_PAD_TIGHT : BOARD_PAD);
  const fit = Math.min(W / (b.w * pad), H / (b.h * pad));
  return frame(
    Math.min(fit, BURROW_CAM_MAX),
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
