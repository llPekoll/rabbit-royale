/**
 * Where the island's camera sits, and why it moves.
 *
 * The island used to have no camera at all. The board was laid out around
 * `ISO_ORIGIN_X` / `ISO_ORIGIN_Y` — two numbers MEASURED by hand against the
 * 960x540 landscape canvas — and the whole design space was then fitted to the
 * window by `Application.resize`. That works on a desktop, where the canvas and
 * the window have roughly the same shape. On a phone it fails twice over:
 *
 *  - The portrait design space is 480x860, but the origin is still 515 — past
 *    the right edge of the canvas it is supposedly measured in. The board hung
 *    off the side and the fit shrank everything to compensate.
 *  - `Math.min(w / W, h / H)` is a fit-CONTAIN. Whatever the board's shape, the
 *    difference between it and the window's shape came out as bare sea: the
 *    played ground never reached the edges of the screen it was drawn on.
 *
 * So the island now frames itself the way the burrow already does
 * (`burrowCamera`): solve for the seed's OWN board rather than for a canvas
 * that no longer describes anything, and one transform on the scene container
 * so the terrain, the board, the rabbits and the fog keep their measured
 * relationship and only the window onto them changes.
 *
 * ## Why this is a cover, and what the cover is taken against
 *
 * The island is played by TAPPING the cell you want to step onto, and there is
 * no camera-follow: the shot is solved once per viewport and then holds. So an
 * over-zoomed shot is not cosmetic — a cell off screen is a cell that cannot be
 * walked to.
 *
 * What makes a cover safe here is WHAT it is taken against. The first cut
 * fitted the walkable box, copying the burrow, and a cover on that box needed
 * 3.3x — four columns of sixteen, the rest unreachable. But the walkable box is
 * not what is drawn: `TerrainBackground` builds the terrain over the FULL 16x16
 * lattice, so the shore and the cliffs outside the playable island are ground
 * too. Against the lattice (704x420 rather than 374x282) the portrait cover is
 * 2.05x, and that is a shot you can play.
 *
 * ## The trade this shot makes, deliberately
 *
 * Portrait is where the two things anyone wants are in direct conflict. The
 * lattice is 1.68:1 and a portrait phone is 0.56:1 — three times narrower — so
 * the height can be filled or the tiles can be made smaller, never both:
 *
 *     scale   tile on a phone   columns across   sea band top and bottom
 *     1.36    49px              8.0              144px
 *     1.50    54px              7.3              115px
 *     1.80    64px              6.1               52px
 *     2.05    73px              5.3                0px
 *
 * The shot takes the bottom row: the ground reaches the top and bottom of the
 * screen, at the cost of holding about five columns in frame. That is a choice
 * about how the game should look, not a fact about the arithmetic — the row
 * above is a one-constant change if it should ever read as too close.
 *
 * The only way to have both is to change the GENERATOR rather than the shot: a
 * taller grid (`ROWS`, or `TERRAIN_OPTIONS`) brings the lattice's aspect closer
 * to the screen's, and the cover scale falls out of it.
 */
import { GAME_W, GAME_H } from '../Application';
import { COLS, ROWS, HALF_W, HALF_H, tilePos, toColRow } from '@/config/gridConfig';
import { levelTierAt, TIER_LIFT } from '@/lib/game/terrainBoard';

export interface IslandCam {
  scale: number;
  x: number;
  y: number;
}

/**
 * The DRAWN ground's bounding box, in scene coordinates.
 *
 * The whole 16x16 lattice, not just the walkable cells — and this is the
 * correction that made the island reach the top of the screen.
 *
 * The first cut of this camera fitted the playable box, copying the burrow,
 * where it is right: there the sea around the homestead really is empty
 * framing. Here it is not. `TerrainBackground` builds `IsoIslandView` over the
 * FULL grid, so the shore, the cliffs and the scenery outside the walkable
 * island are all drawn ground. Measured, the difference is not marginal: the
 * playable box is about 374x282 and the lattice is 704x438, so fitting the
 * former framed a small island floating in the middle of the latter and left
 * ~150px of bare sea above it. Every cell the old box excluded is a cell with
 * terrain on it.
 *
 * Headroom above for the tallest tier: a raised tile is drawn as a column whose
 * TOP FACE is at the lifted point and whose art continues upward past it, so a
 * box measured at tile centres clips the plateaus along the top row.
 */
function boardBounds(seed: string) {
  // Tallest tier ON this island, not the generator's ceiling: reserving three
  // tiers of headroom for a flat island would push the ground back down and
  // reopen the very gap this exists to close.
  let tallest = 0;
  for (let i = 0; i < COLS * ROWS; i++) {
    const { col, row } = toColRow(i);
    const tier = levelTierAt(seed, col, row);
    if (tier > tallest) tallest = tier;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < COLS * ROWS; i++) {
    const { x, y } = tilePos(i);
    minX = Math.min(minX, x - HALF_W);
    maxX = Math.max(maxX, x + HALF_W);
    minY = Math.min(minY, y - HALF_H - tallest * TIER_LIFT);
    maxY = Math.max(maxY, y + HALF_H);
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * How much lattice must stay in frame across the screen's WIDTH, in cells.
 *
 * The backstop against a keyhole: whatever shape the island came out, keep
 * this many cells across so the player can see where they are going.
 *
 * In `HALF_W` units, not whole tiles — a diamond column advances by half a tile
 * width, so this is ~7 columns of the 16.
 *
 * It is deliberately LOOSE enough not to bind in portrait. It used to be 10.5,
 * measured against the playable box; against the full lattice that same number
 * capped the scale at 1.36 where the cover wants 1.96, and the 144px of sea
 * along the top came straight back. A limit that quietly overrides the thing it
 * is limiting is worse than no limit: the point here is to stop an absurd zoom,
 * not to be the value that decides the shot.
 */
const MIN_CELLS_VISIBLE = 7;

/**
 * The smallest a cell may be drawn, in DESIGN pixels.
 *
 * A tile is a tap target: the island is played by tapping the cell you want to
 * step onto, and the ring of eight around the rabbit has to be separable by a
 * thumb. Design px rather than device px, because the canvas is itself fitted
 * to the screen — see `MIN_TILE_PX` in `burrowCamera`, the same reasoning.
 */
export const MIN_TILE_PX = 26;

/**
 * Frame the island: cover the canvas with the seed's own played ground, then
 * clamp back to what stays playable.
 *
 * The `Math.max` is the difference between this and the fit it replaces — it
 * lets the LONGER axis overflow instead of leaving a band of sea. The ceiling
 * under it is what stops that from going too far.
 */
export function islandCam(seed: string, W: number = GAME_W, H: number = GAME_H): IslandCam {
  const b = boardBounds(seed);
  // What it would take to fill the screen in both axes — the long axis wins,
  // which is the whole difference between a cover and a fit.
  const cover = Math.max(W / b.w, H / b.h);
  // And what it may not exceed if the board is to stay reachable.
  const ceiling = W / (MIN_CELLS_VISIBLE * HALF_W);
  // The floor keeps a cell tappable on a viewport so extreme that even the
  // ceiling is small. Applied last, so it wins: an untappable board is a
  // worse failure than a board zoomed past its budget.
  const scale = Math.max(Math.min(cover, ceiling), MIN_TILE_PX / (HALF_W * 2));
  return {
    scale,
    x: W / 2 - scale * (b.minX + b.maxX) / 2,
    y: H / 2 - scale * (b.minY + b.maxY) / 2,
  };
}

/**
 * What the shot puts where, for the test that guards it.
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
  };
}
