/**
 * The pulled-back shot has to actually show the board — all of it, on every
 * player's burrow.
 *
 * This is the whole reason the camera exists: in portrait the played ground ran
 * 208px off the right-hand edge of the design space, so a defender could not
 * reach their own far flank and a raider could not see the route they were
 * choosing between. A constant tuned against one viewport is exactly the kind
 * of thing that silently stops holding on the other, so both are asserted.
 *
 * And now against every SEED as well. The ground is generated per player, so
 * the framing is no longer one sum checked once: a homestead that comes out
 * wider or taller than the one the numbers were tuned against would run off
 * the screen for exactly the player who owns it, and nobody else would ever
 * see it happen.
 *
 * The promise about not pulling past the painting is gone with the painting.
 * The terrain is drawn only where the island is and the sea around it is the
 * scene's own colour, so there is no backdrop edge to walk into frame.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardCamFraming, MIN_TILE_PX } from '../src/game/scenes/burrowCamera';

/** The design spaces the game actually runs in — see Application. */
const VIEWPORTS = [
  { name: 'landscape', w: 960, h: 540 },
  { name: 'portrait', w: 480, h: 860 },
] as const;

/** A spread of real-shaped player ids — see the note in burrow-raid.test. */
const SEEDS = [
  'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk',
  'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b',
  'player-1',
  'player-2',
] as const;

describe('burrow camera', () => {
  for (const v of VIEWPORTS) {
    describe(v.name, () => {
      it('fits every burrow entirely on screen', () => {
        // Half a pixel of slack for the rounding in the projection: a cell
        // that lands at -0.3 is on screen, and a test that says otherwise
        // fails on arithmetic rather than on framing.
        for (const seed of SEEDS) {
          const f = boardCamFraming(seed, v.w, v.h);
          expect(f.board.left, seed).toBeGreaterThanOrEqual(-0.5);
          expect(f.board.top, seed).toBeGreaterThanOrEqual(-0.5);
          expect(f.board.right, seed).toBeLessThanOrEqual(v.w + 0.5);
          expect(f.board.bottom, seed).toBeLessThanOrEqual(v.h + 0.5);
        }
      });

      it('keeps tiles big enough to tap', () => {
        // A trap is placed by hitting one tile. Design px, not device px: the
        // canvas is fitted to the screen, so 23 of these on a 480-wide
        // portrait space is a comfortable thumb target on a real phone. A
        // board you can see but cannot hit is no better than one you cannot.
        for (const seed of SEEDS) {
          const f = boardCamFraming(seed, v.w, v.h);
          expect(f.tileWidth, seed).toBeGreaterThanOrEqual(MIN_TILE_PX);
        }
      });

      it('centres the homestead rather than pinning it to a corner', () => {
        // The margin is shared between the two sides. A framing that fits by
        // pushing everything to one edge technically passes the test above and
        // reads as a bug.
        for (const seed of SEEDS) {
          const f = boardCamFraming(seed, v.w, v.h);
          const leftGap = f.board.left;
          const rightGap = v.w - f.board.right;
          const topGap = f.board.top;
          const bottomGap = v.h - f.board.bottom;
          expect(Math.abs(leftGap - rightGap), seed).toBeLessThan(1);
          expect(Math.abs(topGap - bottomGap), seed).toBeLessThan(1);
        }
      });
    });
  }

  /**
   * Placement clears the column out of the way.
   *
   * The cards (HP, energy, garden, upgrade) are readings of a burrow the
   * player is not managing at that moment, and they occupy ~400px down the
   * left of a board that has to be tapped cell by cell across its whole width.
   * On a narrow window they covered most of the useful island.
   *
   * Asserted against the source because it is a rendering condition, not a
   * value: what is being pinned is that the cards sit behind `!placing`, and
   * that the two things placement itself needs — the instruction and the way
   * out — do not.
   */
  it('hides the burrow cards while placing', () => {
    const page = readFileSync(join(__dirname, '..', 'src/app/page.tsx'), 'utf8');
    const gate = page.indexOf('{!placing && (');
    expect(gate, 'the cards must sit behind a !placing gate').toBeGreaterThan(-1);

    // The HP card — the first of the four — is inside the gate.
    const hp = page.indexOf('HIT POINTS');
    expect(hp).toBeGreaterThan(gate);

    // And the gate closes before the way out, so "Done placing" is still
    // rendered while placing. Textual order alone would prove nothing here
    // (the exit's JSX happens to be written later in the file either way), so
    // this checks the CLOSING of the block instead.
    const close = page.indexOf('</>\n              )}', gate);
    expect(close, 'the !placing block must be closed').toBeGreaterThan(hp);
    // The BUTTON, not the word: "Done placing" also appears in the comment
    // explaining this very gate, which sits above it.
    const done = page.indexOf('onClick={stopPlacing}');
    expect(done, 'the exit must be outside the gate').toBeGreaterThan(close);
  });
});
