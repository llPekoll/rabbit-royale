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
  toScene, MIN_TILE_PX, MAX_TILE_PX, DEFAULT_TILE_PX,
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
    it(`${v.name}: zoomed all the way out, the whole island is in frame`, () => {
      for (const seed of SEEDS) {
        const { min } = zoomLimits(seed, v.w, v.h);
        const b = boardBounds(seed);
        expect(b.w * min, seed).toBeLessThanOrEqual(v.w + 1e-6);
        expect(b.h * min, seed).toBeLessThanOrEqual(v.h + 1e-6);
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
