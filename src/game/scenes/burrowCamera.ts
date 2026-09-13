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
function boardBounds(seed: string) {
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

/** At home: the framing the scene is laid out in, untouched. */
export function homeCam(): BurrowCam {
  return { scale: 1, x: 0, y: 0 };
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
