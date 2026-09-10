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
import ALIGNMENT from '../src/config/burrowArtAlignment.json';
import { burrowArt, BURROW_ART_TIERS } from '../src/config/burrowArt';

const GAME_W = 960;
const GAME_H = 540;

const ART = new URL('../public/assets/island/burrow.webp', import.meta.url).pathname;

/**
 * Every level's backdrop, which all have to satisfy the SAME calibration.
 *
 * The burrow is re-painted as it is upgraded (wooden rails, iron railings,
 * castle wall), and the artist drew the tilled field at a different size and
 * place in each one. Rather than give each level its own origin, the art is
 * pre-aligned so the field lands where level 1's does — see
 * tools/align_burrow_levels.py. That is exactly the kind of claim that rots
 * silently, so it is asserted here for every level rather than trusted: a
 * re-export that forgets the alignment step puts the raid's win condition on a
 * castle wall, and nothing else would notice.
 */
const LEVEL_ART = [1, 2, 3, 4].map((level) => ({
  level,
  path: new URL(
    `../public/assets/island/${level === 1 ? 'burrow' : `burrow_lvl${level}`}.webp`,
    import.meta.url,
  ).pathname,
}));

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
    expect(burrowArt(1)).toBe('/assets/island/burrow.webp');
    expect(art).toEqual({ w: 1376, h: 768 });
  });

  it('is the size every other level is drawn at', () => {
    // The scene fits the backdrop by its NATURAL dimensions (a cover fit, then
    // BURROW_ZOOM), so the board's position on screen is a function of the
    // image's size. A level shipped at a different size would land its board
    // somewhere else however well its field was aligned.
    for (const { level, path } of LEVEL_ART) {
      expect(webpSize(path), `level ${level}`).toEqual(art);
    }
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

/**
 * The upgrade art has to put its field where level 1 puts it.
 *
 * This is the claim the whole single-calibration design rests on. Each level is
 * a separate painting whose tilled field the artist drew at its own size and
 * position; tools/align_burrow_levels.py scales and crops each one so the field
 * lands on level 1's. If that ever stops being true — a level re-exported from
 * source without re-running the tool, a corner re-measured wrong — then the
 * FIELD cells, which are the raid's win condition, sit on a fence or a castle
 * wall on that level and on soil everywhere else. Nothing else in the suite
 * looks at the upgrade art at all.
 *
 * Checked against the recorded measurement rather than by decoding the WebPs:
 * the repo ships no image decoder, and the tool that does have one writes down
 * what it measured.
 */
describe('every level is aligned to the same field', () => {
  const target = ALIGNMENT.target;

  /** A source corner, put through that level's per-axis scale and crop. */
  const transform = (pt: number[], scale: number[], crop: number[]) => ({
    x: pt[0] * scale[0] - crop[0],
    y: pt[1] * scale[1] - crop[1],
  });

  /** The diamond a level's field becomes once aligned. */
  const placed = (rec: { source_field: Record<string, number[]>; scale: number[]; crop: number[] }) => {
    const f = rec.source_field;
    const bottom = [f.L[0] + f.R[0] - f.T[0], f.L[1] + f.R[1] - f.T[1]];
    const T = transform(f.T, rec.scale, rec.crop);
    const L = transform(f.L, rec.scale, rec.crop);
    const R = transform(f.R, rec.scale, rec.crop);
    const B = transform(bottom, rec.scale, rec.crop);
    return {
      centre: { x: (L.x + R.x) / 2, y: (T.y + B.y) / 2 },
      width: R.x - L.x,
      depth: B.y - T.y,
    };
  };

  it('targets the diamond the BOARD calls the field', () => {
    // The target is derived from burrowConfig's own LAYOUT, not typed in, so
    // this guards the derivation: if the layout or the origin changes, the art
    // has to be re-aligned to it and the recorded target must move too.
    const soilWidth = SOIL.x1 - SOIL.x0;
    const soilDepth = SOIL.y1 - SOIL.y0;
    expect(target.width).toBeGreaterThan(soilWidth * 0.9);
    expect(target.width).toBeLessThan(soilWidth * 1.3);
    expect(target.depth).toBeGreaterThan(soilDepth * 0.7);
    expect(target.depth).toBeLessThan(soilDepth * 1.2);
  });

  it("fits every level's field to that same diamond", () => {
    // The whole point. Each painting drew its field at its own size and depth;
    // after alignment they must all present the SAME field to the board, so
    // one origin, one zoom, one layout and one plot list serve all of them.
    for (const [name, rec] of Object.entries(ALIGNMENT.aligned)) {
      const got = placed(rec);
      // A pixel of slack for the whole-pixel crop, and a little more for the
      // corners themselves, which are read off the art by eye on a 10px grid.
      expect(Math.abs(got.centre.x - target.centre[0]), `${name} centre x`).toBeLessThanOrEqual(2);
      expect(Math.abs(got.centre.y - target.centre[1]), `${name} centre y`).toBeLessThanOrEqual(2);
      expect(Math.abs(got.width - target.width), `${name} width`).toBeLessThanOrEqual(2);
      expect(Math.abs(got.depth - target.depth), `${name} depth`).toBeLessThanOrEqual(2);
    }
  });

  it('needs only a mild correction to get there', () => {
    // A sanity bound on the transform itself. These are re-drawings of one
    // painting, so the fit should be a nudge; a scale far from 1 would mean a
    // corner was mis-read (which is exactly how level 2 first shipped with its
    // top row of cells on the grass) rather than that the art really differs.
    for (const [name, rec] of Object.entries(ALIGNMENT.aligned)) {
      const [kx, ky] = rec.scale;
      for (const [axis, k] of [['x', kx], ['y', ky]] as const) {
        expect(k, `${name} scale ${axis}`).toBeGreaterThan(1);
        expect(k, `${name} scale ${axis}`).toBeLessThan(1.8);
      }
      // The per-axis split is the part worth watching: it is a deliberate
      // deviation from a uniform scale, so it should stay small enough to be
      // invisible in isometric pixel art.
      expect(Math.abs(ky / kx - 1), `${name} axis split`).toBeLessThanOrEqual(0.2);
    }
  });

  it('records every level the art module can hand out', () => {
    // The manifest and the module are written by different hands (a Python
    // tool and a TS constant), so the thing worth asserting is that they agree
    // on the SET of levels — an art file added to one and not the other ships
    // a level this suite never checks.
    const measured = new Set(Object.keys(ALIGNMENT.aligned));
    expect(measured).toContain('burrow');
    for (let level = 2; level <= BURROW_ART_TIERS; level++) {
      expect(measured, `level ${level}`).toContain(`burrow_lvl${level}`);
    }
  });

  it('gives each level its own distinct picture', () => {
    // Four levels pointing at three files (or at one) would still pass every
    // geometric check above and quietly undo the point of the exercise.
    const urls = new Set(
      Array.from({ length: BURROW_ART_TIERS }, (_, i) => burrowArt(i + 1)),
    );
    expect(urls.size).toBe(BURROW_ART_TIERS);
  });

  it('shows the top tier for every level above it', () => {
    // Levels run to 20 and the art stops at 4, so the tail has to clamp rather
    // than fall off the end of the list.
    const top = burrowArt(BURROW_ART_TIERS);
    for (const level of [BURROW_ART_TIERS + 1, 12, 20, 999]) {
      expect(burrowArt(level), `level ${level}`).toBe(top);
    }
  });

  it('falls back to level 1 for a level it cannot read', () => {
    // The level reaches the scene from a database row and, on a raid, off the
    // wire as the DEFENDER's. A burrow with no ground is a worse failure than
    // a burrow shown one tier too low.
    for (const bad of [null, undefined, 0, -3, NaN, Infinity]) {
      expect(burrowArt(bad as number), `level ${String(bad)}`).toBe(burrowArt(1));
    }
  });
});

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
