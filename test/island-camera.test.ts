/**
 * The island has to FILL the screen, and be big enough to play with a thumb.
 *
 * Both halves of that were broken, and in a way only a phone showed. The scene
 * was laid out around `ISO_ORIGIN_X = 515` — measured by hand against the
 * 960-wide landscape canvas — and then fitted to the window. In portrait the
 * design space is 480 wide, so the board's own origin sat past the right edge
 * of the canvas it was measured in, and the fit shrank everything to
 * compensate. On top of that the fit was a CONTAIN, so whatever was left
 * between the board's shape and the window's came out as bare sea.
 *
 * The assertions below are the two complaints, made checkable: the ground
 * reaches every edge, and a cell is a real tap target. Asserted per seed
 * because the island is generated — a shape the numbers were never tuned
 * against would fail for exactly the player who rolled it, and for nobody
 * else.
 */
import { describe, expect, it } from 'vitest';
import { islandCamFraming, MIN_TILE_PX } from '../src/game/scenes/islandCamera';
import { ISO_TILE_W } from '../src/config/gridConfig';

/** The design spaces the game actually runs in — see Application. */
const VIEWPORTS = [
  { name: 'landscape', w: 960, h: 540 },
  { name: 'portrait', w: 480, h: 860 },
  // The real one the bug was reported on: a Telegram mini-app on a phone.
  { name: 'telegram portrait', w: 390, h: 719 },
] as const;

const SEEDS = ['island-1', 'island-2', 'seed:abc', 'default', 'x'] as const;

describe('island camera', () => {
  for (const v of VIEWPORTS) {
    describe(v.name, () => {
      it('covers every edge — no bare sea anywhere', () => {
        // Both axes, which is what taking the cover against the DRAWN
        // lattice rather than the walkable box bought. Fitting the walkable
        // box left ~144px of sea along the top of a phone; every cell it
        // excluded has terrain on it.
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          expect(f.board.left, seed).toBeLessThanOrEqual(0.5);
          expect(f.board.top, seed).toBeLessThanOrEqual(0.5);
          expect(f.board.right, seed).toBeGreaterThanOrEqual(v.w - 0.5);
          expect(f.board.bottom, seed).toBeGreaterThanOrEqual(v.h - 0.5);
        }
      });

      it('keeps enough of the board reachable to play it', () => {
        // There is no camera-follow: a cell you cannot see is a cell you
        // cannot tap, so an over-zoomed shot is not a cosmetic problem.
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          expect(v.w / f.tileWidth, seed).toBeGreaterThanOrEqual(5);
          expect(f.tileWidth, seed).toBeGreaterThanOrEqual(MIN_TILE_PX);
        }
      });

      it('draws a cell large enough to tap', () => {
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          expect(f.tileWidth, seed).toBeGreaterThanOrEqual(MIN_TILE_PX);
        }
      });

      it('centres the island on the frame', () => {
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          // Equal overflow on opposite edges is what "centred" means for a
          // cover: whatever is cropped is cropped evenly, so the island is
          // never pushed against one side.
          expect(f.board.left + f.board.right, seed).toBeCloseTo(v.w, 5);
          expect(f.board.top + f.board.bottom, seed).toBeCloseTo(v.h, 5);
        }
      });
    });
  }

  /**
   * The complaint that started this: "on mobile it is really too small, can you
   * zoom all that x2". Measured against what the OLD path drew — the portrait
   * design space fitted to the phone, at which a 44px tile came out around
   * 36px on a 390-wide screen.
   */
  it('at least doubles the old on-screen tile size in portrait', () => {
    const phone = { w: 390, h: 719 };
    // What the fit-contain used to give: design space 480x860 scaled to fit.
    const oldScale = Math.min(phone.w / 480, phone.h / 860);
    const oldTilePx = ISO_TILE_W * oldScale;

    for (const seed of SEEDS) {
      const f = islandCamFraming(seed, 480, 860);
      // The camera works in design space; the canvas fit then applies on top.
      const newTilePx = f.tileWidth * oldScale;
      expect(newTilePx / oldTilePx, seed).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * The trade the portrait shot deliberately makes.
   *
   * Filling the height and shrinking the tiles are in direct conflict on a
   * phone (the lattice is 1.68:1, the screen 0.56:1), and this is the side that
   * was chosen: the ground reaches the top, at about five columns in frame.
   *
   * Pinned because the losing side of that trade is one constant away, and a
   * later tune that quietly reopened the band of sea along the top would be
   * undoing a decision rather than adjusting a number.
   */
  it('fills the height of a portrait phone', () => {
    for (const seed of SEEDS) {
      const f = islandCamFraming(seed, 480, 860);
      expect(f.board.top, seed).toBeLessThanOrEqual(0.5);
      expect(f.board.bottom, seed).toBeGreaterThanOrEqual(860 - 0.5);
      // And the cost it is paid for with, so the trade stays visible here
      // rather than only in the camera's own comments.
      expect(480 / f.tileWidth, seed).toBeGreaterThan(4.5);
    }
  });
});
