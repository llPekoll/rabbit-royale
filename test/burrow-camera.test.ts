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

      it('pulls back far enough to read as a change of shot', () => {
        // Below this the cut stops being felt and the whole thing is a nudge.
        expect(f.cam.scale).toBeLessThanOrEqual(0.85);
      });

      it('keeps tiles big enough to tap', () => {
        // A trap is placed by hitting one tile. Design px, not device px: the
        // canvas is fitted to the screen, so 23 of these on a 480-wide portrait
        // space is a comfortable thumb target on a real phone. Still a floor —
        // a board you can see but cannot hit is no better than one you cannot.
        expect(f.tileWidth).toBeGreaterThanOrEqual(23);
      });

      it('pulls back as far as the painting physically allows', () => {
        // The ask was to see a MAX of the map, and the backdrop's edge is the
        // only real limit: one notch further and the canvas shows past the
        // painting. So the shot sits ON that limit — meaning the tighter of the
        // two axes has its margin down to nothing. Only one axis can bind (the
        // art and the canvas are different shapes), hence the min. This fails
        // if a future constant quietly reins the camera back in.
        const slack = Math.min(-f.backdrop.left, -f.backdrop.top);
        expect(slack).toBeLessThanOrEqual(3);
      });
    });
  }
});
