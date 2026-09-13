/**
 * The island is bigger than the screen, and the camera is what makes that
 * playable: it opens on a tile a thumb can hit, centred on the rabbit, and it
 * can be zoomed and dragged — but never past the point where the island is
 * lost.
 *
 * The board used to be framed once per viewport as a cover of the whole
 * lattice, because the whole board had to be on screen: with no way to pan, a
 * cell off-screen was a cell that could not be tapped. That shot was retired
 * with the 32x32 board — a cover of it would draw a 30px tile in landscape and
 * 15px in portrait — and the assertions below are the new contract. Asserted
 * per seed because the island is generated: a shape the numbers were never
 * tuned against would fail for exactly the player who rolled it.
 */
import { describe, expect, it } from 'vitest';
import {
  boardBounds, clampCam, islandCam, islandCamFraming, panCam, zoomCam, zoomLimits,
  toScene, landCentres, MIN_TILE_PX, MAX_TILE_PX, DEFAULT_TILE_PX, OVERVIEW_TILE_PX, LAND_REACH,
} from '../src/game/scenes/islandCamera';
import { ISO_TILE_W } from '../src/config/gridConfig';

/** The design spaces the game actually runs in — see Application. */
const VIEWPORTS = [
  { name: 'landscape', w: 960, h: 540 },
  { name: 'portrait', w: 480, h: 860 },
  // The real one the first camera bug was reported on: a Telegram mini-app.
  { name: 'telegram portrait', w: 390, h: 719 },
] as const;

const SEEDS = ['island-1', 'island-2', 'seed:abc', 'default', 'x'] as const;

describe('the opening shot', () => {
  for (const v of VIEWPORTS) {
    describe(v.name, () => {
      it('overflows the screen — the island is bigger than the frame', () => {
        // The whole point of the larger board. A shot that fitted it would be
        // the old cover again, at a tile size nobody can tap.
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          expect(f.board.left, seed).toBeLessThan(0);
          expect(f.board.right, seed).toBeGreaterThan(v.w);
          expect(f.board.top, seed).toBeLessThan(0);
          expect(f.board.bottom, seed).toBeGreaterThan(v.h);
        }
      });

      it('draws a cell large enough to tap', () => {
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          expect(f.tileWidth, seed).toBeGreaterThanOrEqual(MIN_TILE_PX);
        }
      });

      it('draws the tile at the size the orientation asks for', () => {
        const want = v.h > v.w ? DEFAULT_TILE_PX.portrait : DEFAULT_TILE_PX.landscape;
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          expect(f.tileWidth, seed).toBeCloseTo(want, 5);
        }
      });

      it('opens on the spawn, in the middle of the screen', () => {
        // The lattice's centre used to be the anchor; on a board this size it
        // can be a whole screen away from where the rabbit lands.
        for (const seed of SEEDS) {
          const f = islandCamFraming(seed, v.w, v.h);
          expect(f.spawn.x, seed).toBeCloseTo(v.w / 2, 5);
          expect(f.spawn.y, seed).toBeCloseTo(v.h / 2, 5);
        }
      });
    });
  }
});

describe('the zoom range', () => {
  for (const v of VIEWPORTS) {
    it(`${v.name}: zoomed all the way out, the whole island is in frame — unless that would draw untappable tiles`, () => {
      for (const seed of SEEDS) {
        const { min } = zoomLimits(seed, v.w, v.h);
        const b = boardBounds(seed);
        // Never below the overview's tile floor...
        expect(min * ISO_TILE_W, seed).toBeGreaterThanOrEqual(OVERVIEW_TILE_PX - 1e-6);
        // ...and above it only as far as a full fit needs.
        if (min * ISO_TILE_W > OVERVIEW_TILE_PX + 1e-6) {
          expect(b.w * min, seed).toBeLessThanOrEqual(v.w + 1e-6);
          expect(b.h * min, seed).toBeLessThanOrEqual(v.h + 1e-6);
        }
        // And it is a real overview, not the opening shot again.
        expect(min, seed).toBeLessThan(islandCam(seed, v.w, v.h).scale);
      }
    });

    it(`${v.name}: zoomed all the way in, a tile is four times its art`, () => {
      for (const seed of SEEDS) {
        const { max } = zoomLimits(seed, v.w, v.h);
        expect(max * ISO_TILE_W, seed).toBeCloseTo(MAX_TILE_PX, 5);
      }
    });
  }

  it('is never inverted, however small the screen', () => {
    const { min, max } = zoomLimits('island-1', 120, 80);
    expect(max).toBeGreaterThanOrEqual(min);
  });
});

describe('zooming about a point', () => {
  it('keeps the scene point under the finger where it was', () => {
    // What makes a pinch feel like grabbing the map rather than a slider.
    const seed = 'island-1';
    const [W, H] = [960, 540];
    const cam = islandCam(seed, W, H);
    const at = { x: 300, y: 200 };
    const before = toScene(cam, at);
    const after = toScene(zoomCam(cam, 1.5, at, seed, W, H), at);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('stops at the limits rather than sailing past them', () => {
    const seed = 'island-2';
    const [W, H] = [480, 860];
    const { min, max } = zoomLimits(seed, W, H);
    const cam = islandCam(seed, W, H);
    expect(zoomCam(cam, 100, { x: 10, y: 10 }, seed, W, H).scale).toBeCloseTo(max, 5);
    expect(zoomCam(cam, 0.001, { x: 10, y: 10 }, seed, W, H).scale).toBeCloseTo(min, 5);
  });
});

describe('panning', () => {
  for (const v of VIEWPORTS) {
    it(`${v.name}: cannot drag the island off the screen`, () => {
      for (const seed of SEEDS) {
        const cam = islandCam(seed, v.w, v.h);
        const b = boardBounds(seed);
        for (const [dx, dy] of [[1e6, 0], [-1e6, 0], [0, 1e6], [0, -1e6], [1e6, 1e6]]) {
          const c = panCam(cam, dx, dy, seed, v.w, v.h);
          // The lattice's edge may cross the screen's edge by a quarter of the
          // screen — enough to bring a coast to the middle — and no further.
          expect(c.x + c.scale * b.minX, seed).toBeLessThanOrEqual(v.w * 0.25 + 1e-6);
          expect(c.x + c.scale * b.maxX, seed).toBeGreaterThanOrEqual(v.w * 0.75 - 1e-6);
          expect(c.y + c.scale * b.minY, seed).toBeLessThanOrEqual(v.h * 0.25 + 1e-6);
          expect(c.y + c.scale * b.maxY, seed).toBeGreaterThanOrEqual(v.h * 0.75 - 1e-6);
        }
      }
    });
  }

  for (const v of VIEWPORTS) {
    it(`${v.name}: cannot drag the middle of the screen out over open sea`, () => {
      // The box above is mostly sea on a diamond; a corner drag against it left
      // a sliver of coast. Land has to stay within reach of the centre.
      for (const seed of SEEDS) {
        const land = landCentres(seed);
        for (const zoom of [1, 0.001]) {
          const cam = zoomCam(islandCam(seed, v.w, v.h), zoom, { x: v.w / 2, y: v.h / 2 }, seed, v.w, v.h);
          const b = boardBounds(seed);
          // Only where the island overflows BOTH axes: an axis it fits is
          // centred instead, and the rule cannot move the camera along it.
          if (b.w * cam.scale <= v.w || b.h * cam.scale <= v.h) continue;
          for (const [dx, dy] of [[1e6, 1e6], [-1e6, 1e6], [1e6, -1e6], [-1e6, -1e6], [1e6, 0], [0, -1e6]]) {
            const c = panCam(cam, dx, dy, seed, v.w, v.h);
            const centre = toScene(c, { x: v.w / 2, y: v.h / 2 });
            const d = Math.min(...land.map((q) => Math.hypot(q.x - centre.x, q.y - centre.y)));
            // Within a tile. The box rule is applied last and wins where the two
            // disagree — a coast pulled to the middle can still show more sea
            // than the box allows — which on a wide screen leaves the centre up
            // to ~1.4 half-tiles off the land, never out over open water.
            expect(d, `${seed} ${dx},${dy}`).toBeLessThanOrEqual(2 * LAND_REACH + 1e-6);
          }
        }
      }
    });
  }

  it('centres an axis the board no longer fills, instead of pinning it', () => {
    // Zoomed all the way out the lattice is smaller than the screen on one
    // axis; there is nothing to pan to there, so it sits in the middle.
    const seed = 'island-1';
    const [W, H] = [960, 540];
    const { min } = zoomLimits(seed, W, H);
    const b = boardBounds(seed);
    const c = clampCam({ scale: min, x: -5000, y: -5000 }, seed, W, H);
    const left = c.x + c.scale * b.minX;
    const right = c.x + c.scale * b.maxX;
    const top = c.y + c.scale * b.minY;
    const bottom = c.y + c.scale * b.maxY;
    // Whichever axis has slack is centred: equal margins either side.
    if (b.w * min < W - 1e-6) expect(left + right).toBeCloseTo(W, 5);
    if (b.h * min < H - 1e-6) expect(top + bottom).toBeCloseTo(H, 5);
  });
});
