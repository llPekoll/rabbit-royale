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
import {
  boardCamFraming, MIN_TILE_PX, placeCam, placeZoomLimits,
  panPlaceCam, zoomPlaceCam, clampPlaceCam,
} from '../src/game/scenes/burrowCamera';
import { BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H } from '../src/config/burrowConfig';
import { burrowCell } from '../src/game/burrow/board';
import { burrowTileScreen } from '../src/game/burrow/screen';

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

    // The first card inside the gate. It was the HP card; HP are gone (they
    // defended nothing), then the SHIELD card held the slot — gone too,
    // because the badge over the homestead already counts the shield down.
    // ENERGY led the column after that, and has now gone the same way: the
    // bar lives on the DIG slab of the loop bar, because the number is read
    // at the moment of deciding to dig and that moment is the slab, not a
    // card above the garden.
    //
    // What leads the column now is THE NEXT THING TO DO — the quest card
    // while the arc runs, the next-action line once every reward is taken.
    // That strip is the one thing the gate is promised to hold, because a
    // burrow with nothing pointing anywhere is just a column of readings.
    //
    // Anchored on the COMPONENT rather than on a word, which also appears in
    // the comments explaining all this — matching prose would let this test
    // pass after the card itself was deleted.
    const first = page.indexOf('<QuestCard');
    expect(first, 'the first card must sit inside the gate').toBeGreaterThan(gate);

    // And the gate closes before the way out, so "Done placing" is still
    // rendered while placing. Textual order alone would prove nothing here
    // (the exit's JSX happens to be written later in the file either way), so
    // this checks the CLOSING of the block instead.
    const close = page.indexOf('</>\n              )}', gate);
    expect(close, 'the !placing block must be closed').toBeGreaterThan(first);
    // The BUTTON, not the word: "Done placing" also appears in the comment
    // explaining this very gate, which sits above it.
    const done = page.indexOf('onClick={stopPlacing}');
    expect(done, 'the exit must be outside the gate').toBeGreaterThan(close);
  });
});

/**
 * PLACEMENT'S OWN CAMERA.
 *
 * Placement stopped being a fit. The homestead is a wide, flat diamond, so the
 * fit above is decided by the WIDTH on every screen and spends the frame's
 * height on sea — a 47-54px tile in landscape. A cell being a tap target is
 * what this screen is for, so it opens at twice the fit and is driven by the
 * same gestures as the island.
 *
 * What these guard is the pair of promises that makes that safe: you cannot
 * lose the board by dragging, and zooming out returns you exactly to the shot
 * the screen used to be nailed to.
 */
describe('placement camera', () => {
  /** The played ground's box — the same cells `boardBounds` measures. */
  function bounds(seed: string) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(seed, i) === 'blocked') continue;
      const { x, y } = burrowTileScreen(seed, i);
      minX = Math.min(minX, x - BURROW_HALF_W);
      maxX = Math.max(maxX, x + BURROW_HALF_W);
      minY = Math.min(minY, y - BURROW_HALF_H);
      maxY = Math.max(maxY, y + BURROW_HALF_H);
    }
    return { minX, maxX, minY, maxY };
  }

  /** How much of the screen the board covers under `cam`, as a share. */
  function covered(seed: string, cam: { scale: number; x: number; y: number }, W: number, H: number) {
    const b = bounds(seed);
    const visW = Math.max(0, Math.min(cam.x + cam.scale * b.maxX, W) - Math.max(cam.x + cam.scale * b.minX, 0));
    const visH = Math.max(0, Math.min(cam.y + cam.scale * b.maxY, H) - Math.max(cam.y + cam.scale * b.minY, 0));
    return (visW * visH) / (W * H);
  }

  /**
   * How much of the BOARD is still on screen, as a share of its own area.
   *
   * The pan clamp's actual promise: drag as hard as you like and the homestead
   * cannot be flung off the window. Independent of the frame's aspect ratio
   * and of how close the shot opens, which is what makes it a stable guard.
   */
  function boardOnScreen(seed: string, cam: { scale: number; x: number; y: number }, W: number, H: number) {
    const b = bounds(seed);
    const visW = Math.max(0, Math.min(cam.x + cam.scale * b.maxX, W) - Math.max(cam.x + cam.scale * b.minX, 0));
    const visH = Math.max(0, Math.min(cam.y + cam.scale * b.maxY, H) - Math.max(cam.y + cam.scale * b.minY, 0));
    return (visW * visH) / ((b.maxX - b.minX) * cam.scale * ((b.maxY - b.minY) * cam.scale));
  }

  for (const v of VIEWPORTS) {
    describe(v.name, () => {
      it('opens closer than the fit, but INSIDE the zoom range', () => {
        // The opening shot is closer than the fit, because a cell is a target
        // here rather than something to look at. What this really guards is
        // the second half: it opens strictly BELOW the ceiling. It used to
        // open exactly ON it, and a pinch that cannot pull the board closer
        // reads as a board that is stuck rather than as a limit reached.
        for (const seed of SEEDS) {
          const fit = boardCamFraming(seed, v.w, v.h);
          const { min, max } = placeZoomLimits(seed, v.w, v.h);
          const place = placeCam(seed, v.w, v.h);
          expect(place.scale / fit.cam.scale, seed).toBeGreaterThan(1);
          expect(place.scale, seed).toBeGreaterThan(min);
          expect(place.scale, seed).toBeLessThan(max);
        }
      });

      it('can be pinched BOTH closer and wider from the shot it opens on', () => {
        // The bug this pins down: placement opened at the ceiling, so pinching
        // in moved nothing at all. Both directions must answer from the start.
        for (const seed of SEEDS) {
          const open = placeCam(seed, v.w, v.h);
          const at = { x: v.w / 2, y: v.h / 2 };
          expect(zoomPlaceCam(open, 1.2, at, seed, v.w, v.h).scale, seed)
            .toBeGreaterThan(open.scale);
          expect(zoomPlaceCam(open, 0.8, at, seed, v.w, v.h).scale, seed)
            .toBeLessThan(open.scale);
        }
      });

      it('draws a tile at least as big as the fit could tap', () => {
        // Zooming IN cannot make a target smaller, so this is a floor that
        // cannot fail while the ratio above holds — it is here to fail loudly
        // if PLACE_ZOOM_OPEN is ever taken below 1.
        for (const seed of SEEDS) {
          const place = placeCam(seed, v.w, v.h);
          expect(BURROW_HALF_W * 2 * place.scale, seed).toBeGreaterThanOrEqual(MIN_TILE_PX);
        }
      });

      it('cannot be dragged until the board leaves the screen', () => {
        // Eight directions, far harder than a thumb could flick. Measured as
        // the share of the BOARD still on screen, not the share of the frame
        // it fills: the homestead is a wide, flat diamond, so in a tall
        // portrait frame even the perfectly centred shot leaves a lot of the
        // window empty. Holding a frame-share here would be asserting the
        // board's aspect ratio rather than the pan clamp, and it moves on its
        // own whenever the opening zoom changes — which is exactly how it
        // tripped when placement stopped opening at its ceiling.
        for (const seed of SEEDS) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            let cam = placeCam(seed, v.w, v.h);
            for (let i = 0; i < 40; i++) cam = panPlaceCam(cam, dx * 300, dy * 300, seed, v.w, v.h);
            // A third of the homestead, measured: the worst of these is a
            // diagonal flick, which loses the most on both axes at once.
            expect(boardOnScreen(seed, cam, v.w, v.h), `${seed} ${dx},${dy}`).toBeGreaterThan(1 / 3);
          }
        }
      });

      it('zooms out to exactly the old fit, and no further', () => {
        // The fit is the floor, so nothing was taken away: the shot the screen
        // used to open on is one gesture from where it now opens.
        for (const seed of SEEDS) {
          const fit = boardCamFraming(seed, v.w, v.h);
          let cam = placeCam(seed, v.w, v.h);
          for (let i = 0; i < 60; i++) cam = zoomPlaceCam(cam, 0.9, { x: v.w / 2, y: v.h / 2 }, seed, v.w, v.h);
          expect(cam.scale, seed).toBeCloseTo(fit.cam.scale, 5);
        }
      });

      it('does not zoom past the ceiling', () => {
        // The ceiling, not the opening shot — the two are deliberately no
        // longer the same number.
        for (const seed of SEEDS) {
          let cam = placeCam(seed, v.w, v.h);
          for (let i = 0; i < 60; i++) cam = zoomPlaceCam(cam, 1.1, { x: v.w / 2, y: v.h / 2 }, seed, v.w, v.h);
          expect(cam.scale, seed).toBeCloseTo(placeZoomLimits(seed, v.w, v.h).max, 5);
        }
      });

      it('keeps the scene point under a pinch put, on an axis that can pan', () => {
        // The invariant that makes a pinch feel like grabbing the board rather
        // than working a slider — solve for the scene point under the fingers
        // before, and it is still under them after.
        //
        // Only on an axis the board OVERFLOWS. Where the board is smaller than
        // the screen `clampAxis` centres it, and centring deliberately
        // overrides the anchor: the alternative is letting a pinch park a
        // board that fits off to one side. Portrait zoomed out is exactly that
        // case, which is why the axis is tested rather than assumed.
        for (const seed of SEEDS) {
          const at = { x: v.w * 0.3, y: v.h * 0.7 };
          const before = placeCam(seed, v.w, v.h);
          // Zoom OUT: the opening shot is already at the ceiling, so an
          // inward pinch is clamped and would move nothing to measure.
          const after = zoomPlaceCam(before, 0.5, at, seed, v.w, v.h);
          const b = bounds(seed);
          const scenePt = { x: (at.x - before.x) / before.scale, y: (at.y - before.y) / before.scale };
          if ((b.maxX - b.minX) * after.scale > v.w) {
            expect(after.x + after.scale * scenePt.x, seed).toBeCloseTo(at.x, 3);
          } else {
            // Centred instead — and that IS the contract on this axis.
            expect(Math.abs((after.x + after.scale * b.minX) - (v.w - (after.x + after.scale * b.maxX))), seed)
              .toBeLessThan(1);
          }
          if ((b.maxY - b.minY) * after.scale > v.h) {
            expect(after.y + after.scale * scenePt.y, seed).toBeCloseTo(at.y, 3);
          } else {
            expect(Math.abs((after.y + after.scale * b.minY) - (v.h - (after.y + after.scale * b.maxY))), seed)
              .toBeLessThan(1);
          }
        }
      });

      it('centres the board on the shot it opens with', () => {
        for (const seed of SEEDS) {
          const cam = placeCam(seed, v.w, v.h);
          const b = bounds(seed);
          const left = cam.x + cam.scale * b.minX;
          const right = cam.x + cam.scale * b.maxX;
          const top = cam.y + cam.scale * b.minY;
          const bottom = cam.y + cam.scale * b.maxY;
          expect(Math.abs(left - (v.w - right)), seed).toBeLessThan(1);
          expect(Math.abs(top - (v.h - bottom)), seed).toBeLessThan(1);
        }
      });

      it('brings an out-of-range camera back rather than trusting it', () => {
        // `wantedCam` re-clamps the player's own framing on every trap buried,
        // so this is the path that runs most often in practice.
        for (const seed of SEEDS) {
          const wild = clampPlaceCam({ scale: 99, x: -9000, y: 9000 }, seed, v.w, v.h);
          const { min, max } = placeZoomLimits(seed, v.w, v.h);
          expect(wild.scale, seed).toBeLessThanOrEqual(max + 1e-9);
          expect(wild.scale, seed).toBeGreaterThanOrEqual(min - 1e-9);
          expect(covered(seed, wild, v.w, v.h), seed).toBeGreaterThan(0.25);
        }
      });
    });
  }
});
