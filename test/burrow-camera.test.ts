/**
 * The pulled-back shot has to actually show the board — all of it.
 *
 * This is the whole reason the camera exists: in portrait the played ground ran
 * 208px off the right-hand edge of the design space, so a defender could not
 * reach their own far flank and a raider could not see the route they were
 * choosing between. A constant tuned against one viewport is exactly the kind
 * of thing that silently stops holding on the other, so both are asserted.
 *
 * The second promise is that pulling back must not pull PAST the painting. The
 * camera recentres as well as shrinking, and a recentre can walk the backdrop's
 * edge into frame — a strip of empty canvas along the bottom of the burrow
 * reads as a broken screen in a way a slightly off-centre board never does.
 */
import { describe, expect, it } from 'vitest';
import { boardCamFraming } from '../src/game/scenes/burrowCamera';

/** The design spaces the game actually runs in — see Application. */
const VIEWPORTS = [
  { name: 'landscape', w: 960, h: 540 },
  { name: 'portrait', w: 480, h: 860 },
] as const;

describe('burrow camera', () => {
  for (const v of VIEWPORTS) {
    describe(v.name, () => {
      const f = boardCamFraming(v.w, v.h);

      it('fits the whole board on screen', () => {
        expect(f.board.left).toBeGreaterThanOrEqual(0);
        expect(f.board.top).toBeGreaterThanOrEqual(0);
        expect(f.board.right).toBeLessThanOrEqual(v.w);
        expect(f.board.bottom).toBeLessThanOrEqual(v.h);
      });

      it('never lets the canvas show past the backdrop', () => {
        expect(f.backdrop.left).toBeLessThanOrEqual(0);
        expect(f.backdrop.top).toBeLessThanOrEqual(0);
        expect(f.backdrop.right).toBeGreaterThanOrEqual(v.w);
        expect(f.backdrop.bottom).toBeGreaterThanOrEqual(v.h);
      });

      it('changes the shot enough to be felt', () => {
        // Either direction counts — what must not happen is a nudge. Landscape
        // now zooms IN (the board is the subject), portrait still pulls back
        // because the board is wider than that frame at 1:1.
        expect(Math.abs(f.cam.scale - 1)).toBeGreaterThan(0.08);
      });

      it('keeps tiles big enough to tap', () => {
        // Now a floor the shot clears easily rather than the thing that caps
        // it: framing on the board roughly doubled the cell size in landscape.
        // A trap is placed by hitting one tile. Design px, not device px: the
        // canvas is fitted to the screen, so 23 of these on a 480-wide portrait
        // space is a comfortable thumb target on a real phone. Still a floor —
        // a board you can see but cannot hit is no better than one you cannot.
        expect(f.tileWidth).toBeGreaterThanOrEqual(23);
      });

      it('gives the board most of the frame', () => {
        // The fault this replaces: the shot was framed on the PAINTING, so the
        // played ground used 47% of the width and 46% of the height — under a
        // quarter of the screen, parked in a corner, tiles at 23.6px — and no
        // amount of tuning the pull-back constant could grow it, because the
        // camera could only ever shrink. The board is the subject now.
        const w = (f.board.right - f.board.left) / v.w;
        expect(w).toBeGreaterThan(0.7);
      });

      it('keeps the whole board on screen', () => {
        // Zooming in must not push the far flank out of frame: every cell has
        // to stay reachable, which is the promise the pull-back existed for.
        expect(f.board.left).toBeGreaterThanOrEqual(-0.5);
        expect(f.board.top).toBeGreaterThanOrEqual(-0.5);
        expect(f.board.right).toBeLessThanOrEqual(v.w + 0.5);
        expect(f.board.bottom).toBeLessThanOrEqual(v.h + 0.5);
      });
    });
  }
});
