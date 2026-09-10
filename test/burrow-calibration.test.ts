/**
 * The burrow's board has to land on the ground the ART draws.
 *
 * `BURROW_ORIGIN_X/Y`, `BURROW_ZOOM` and the LAYOUT were calibrated by eye
 * against one backdrop, and nothing tied them to it — so when the art was
 * redrawn they went on pointing confidently at the wrong grass, with no crash
 * and nothing obviously wrong on screen. Every FIELD cell, which is the raid's
 * win condition, ended up on a lawn and no test anywhere noticed.
 *
 * So the alignment is asserted rather than eyeballed. The landmarks are boxes
 * measured off the image by flood fill, so this checks the board against the
 * PAINTING and not against numbers typed from a screenshot. Redraw the art and
 * this fails and says so.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H,
  BURROW_ORIGIN_X, BURROW_ORIGIN_Y, BURROW_ZOOM,
  burrowCell, fieldTiles, entranceTile,
} from '../src/config/burrowConfig';
import PLOTS from '../src/config/carrotPlots.json';

const GAME_W = 960;
const GAME_H = 540;

const ART = new URL('../public/assets/island/burrow.webp', import.meta.url).pathname;

/** WebP dimensions, straight out of the header — no decoder needed. */
function webpSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  expect(b.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(b.subarray(8, 12).toString('ascii')).toBe('WEBP');
  const fourcc = b.subarray(12, 16).toString('ascii');
  if (fourcc === 'VP8X') {
    return {
      w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  if (fourcc === 'VP8 ') {
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unexpected WebP chunk ${fourcc} in ${path}`);
}

/**
 * Where a board cell lands in the ART's own pixels.
 *
 * The inverse of what BurrowScene does: it scales the art to COVER the canvas
 * and then zooms past it, so this undoes both to ask "which pixel of the
 * painting is under this cell?".
 */
function cellInArt(
  index: number,
  art: { w: number; h: number },
  originX = BURROW_ORIGIN_X,
  originY = BURROW_ORIGIN_Y,
  zoom = BURROW_ZOOM,
) {
  const col = index % BURROW_COLS;
  const row = Math.floor(index / BURROW_COLS);
  const cx = originX + (col - row) * BURROW_HALF_W;
  const cy = originY + (col + row) * BURROW_HALF_H;

  const cover = Math.max(GAME_W / art.w, GAME_H / art.h);
  const w = art.w * cover * zoom;
  const h = art.h * cover * zoom;
  const left = GAME_W / 2 - w / 2;
  const top = GAME_H / 2 - h / 2;
  return { x: (cx - left) * (art.w / w), y: (cy - top) * (art.h / h) };
}

/** The bottom edge of what the canvas actually shows, in art pixels. */
function viewportBottom(art: { w: number; h: number }, zoom = BURROW_ZOOM) {
  const cover = Math.max(GAME_W / art.w, GAME_H / art.h);
  const h = art.h * cover * zoom;
  const top = GAME_H / 2 - h / 2;
  return (GAME_H - top) * (art.h / h);
}

describe('the shipping backdrop', () => {
  const art = webpSize(ART);

  it('is the art the scene actually loads', () => {
    // A guard on the PAIR, not on the file: the origin, zoom and layout below
    // are all solved against THIS image, so a different one silently
    // invalidates every one of them.
    const scene = readFileSync(
      new URL('../src/game/scenes/BurrowScene.ts', import.meta.url).pathname, 'utf8',
    );
    expect(scene).toMatch(/BACKDROP_URL = '\/assets\/island\/burrow\.webp'/);
    expect(art).toEqual({ w: 1376, h: 768 });
  });

  it('is smaller than the JPEG it was converted from', () => {
    // The point of converting at all. An earlier pass at quality 92 produced a
    // WebP LARGER than the source, which defeats it.
    const jpg = new URL('../public/assets/island/burrow.jpg', import.meta.url).pathname;
    if (!existsSync(jpg)) return;
    expect(readFileSync(ART).length).toBeLessThan(readFileSync(jpg).length);
  });

  it('keeps every playable cell inside the image', () => {
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(i) === 'blocked') continue;
      const { x, y } = cellInArt(i, art);
      expect(x, `cell ${i} x`).toBeGreaterThanOrEqual(0);
      expect(y, `cell ${i} y`).toBeGreaterThanOrEqual(0);
      expect(x, `cell ${i} x`).toBeLessThanOrEqual(art.w);
      expect(y, `cell ${i} y`).toBeLessThanOrEqual(art.h);
    }
  });

  it('keeps the whole board inside what the CANVAS shows', () => {
    // Inside the image is not enough: the scene zooms past the canvas, so a
    // cell can be on the painting and still off-screen. A raider spawns on the
    // entrance, so an off-screen cell there is a raid that cannot begin.
    const bottom = viewportBottom(art);
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(i) === 'blocked') continue;
      expect(cellInArt(i, art).y, `cell ${i}`).toBeLessThanOrEqual(bottom);
    }
  });
});

/**
 * The landmarks, as boxes measured off the art by flood fill (see
 * tools/plant_carrots.py for the soil, and the same technique for the path).
 *
 * Boxes rather than exact masks because a test should fail on a REAL drift, not
 * on a one-pixel re-encode. They are tight enough that the previous art's
 * numbers — which put every field cell on grass — would not pass.
 */
const SOIL = { x0: 555, x1: 815, y0: 440, y1: 590 };
const PATH = { x0: 743, x1: 1084, y0: 485, y1: 647 };

describe('the board lands on the ground it names', () => {
  const art = webpSize(ART);
  const inside = (p: { x: number; y: number }, b: typeof SOIL) =>
    p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

  it('puts every field cell on the tilled soil', () => {
    // Reaching the field is how a raid is WON. With the previous art's numbers
    // all nine of them sat on a lawn, and nothing anywhere complained.
    for (const tile of fieldTiles()) {
      expect(inside(cellInArt(tile, art), SOIL), `field tile ${tile}`).toBe(true);
    }
  });

  it('has a field big enough to be the field the art draws', () => {
    // The old 3x3 block was sized for a smaller painting and covered a corner
    // of this one. If this collapses back to nine, the layout has regressed.
    expect(fieldTiles().length).toBeGreaterThan(20);
  });

  it('puts the entrance on the stone path', () => {
    expect(inside(cellInArt(entranceTile(), art), PATH)).toBe(true);
  });

  it('leaves the field and the entrance well apart', () => {
    // They are the two ends of the crossing; if they ever coincide the raid is
    // over before it starts.
    const e = cellInArt(entranceTile(), art);
    expect(inside(e, SOIL)).toBe(false);
  });
});

/**
 * The CROP and the BOARD are calibrated independently — the carrots from the
 * painting's soil, the board from burrowConfig's origin and layout — so the
 * fact that they agree is a real check rather than a tautology.
 *
 * If they ever drift apart, the player sees carrots growing on a square the
 * game does not call a field, or a field square with nothing on it. Both read
 * as the burrow being subtly wrong in a way that is hard to name.
 */
describe('the crop stands on the board it shares a field with', () => {
  const art = webpSize(ART);

  /** Scene-space position of a plot, exactly as CarrotCrop places it. */
  function plotInScene(p: { x: number; y: number }) {
    const cover = Math.max(GAME_W / art.w, GAME_H / art.h);
    const scale = cover * BURROW_ZOOM;
    return {
      x: GAME_W / 2 - (art.w * scale) / 2 + p.x * scale,
      y: GAME_H / 2 - (art.h * scale) / 2 + p.y * scale,
    };
  }

  /** Scene-space position of a board cell. */
  function cellInScene(index: number) {
    const col = index % BURROW_COLS;
    const row = Math.floor(index / BURROW_COLS);
    return {
      x: BURROW_ORIGIN_X + (col - row) * BURROW_HALF_W,
      y: BURROW_ORIGIN_Y + (col + row) * BURROW_HALF_H,
    };
  }

  it('grows every carrot on a tile the game calls a field', () => {
    for (const p of PLOTS.plots) {
      const at = plotInScene(p);
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
        const c = cellInScene(i);
        const d = Math.hypot(c.x - at.x, c.y - at.y);
        if (d < bd) { bd = d; best = i; }
      }
      expect(burrowCell(best), `carrot at ${p.x},${p.y}`).toBe('field');
    }
  });

  it('keeps the whole crop on screen', () => {
    for (const p of PLOTS.plots) {
      const at = plotInScene(p);
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(GAME_W);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(GAME_H);
    }
  });
});
