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
 * So the camera pulls back for the decision and returns afterwards. It is one
 * transform on the scene container rather than a per-object rescale: the
 * backdrop, the crop, the clouds and the board all keep their measured
 * relationship to each other (burrowConfig's origin was solved against the art)
 * and only the window onto them changes.
 */
import { GAME_W, GAME_H } from '../Application';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, BURROW_TILE_W, BURROW_ZOOM,
  burrowCell, burrowTilePos,
} from '@/config/burrowConfig';
import PLOTS from '@/config/carrotPlots.json';

/**
 * How far back the camera pulls to show the whole board.
 *
 * Aggressive on purpose — the ask was for a cut you FEEL, not a nudge. It stops
 * at 0.78 rather than going further because the tiles are the tap targets: at
 * this scale they are ~27px across, and below roughly 24 they stop being
 * comfortable to hit with a thumb, which would trade one unusable board for
 * another.
 */
export const BURROW_CAM_OUT = 0.78;

/** Room left around the board when pulled back, so it does not touch the edges. */
const BOARD_PAD = 1.08;

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
 * The scale is the pull-back OR whatever it takes to fit the board with a
 * margin, whichever is further out — so a viewport shape that the constant was
 * not chosen for still gets a board it can see all of.
 */
export function boardCam(W: number = GAME_W, H: number = GAME_H): BurrowCam {
  const b = boardBounds();
  const fit = Math.min(W / (b.w * BOARD_PAD), H / (b.h * BOARD_PAD));
  return frame(
    Math.min(BURROW_CAM_OUT, fit),
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
    tileWidth: BURROW_TILE_W * cam.scale,
  };
}
