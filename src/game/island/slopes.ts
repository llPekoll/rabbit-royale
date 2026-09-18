/**
 * Two ways of joining one terrain tier to the next WITHOUT a cliff.
 *
 * Today a raised cell is a block: its baked tile carries a `LIFT`-tall band of
 * rock under its two visible edges (`tools/gen_iso_sheets.py`, `add_volume`),
 * and the lower neighbour's diamond meets that band. Every terrace edge is
 * therefore a step. The game lets a rabbit walk straight over it, so the art
 * says "wall" where the rules say "path". This module is the trial of two
 * alternatives, both built at load time from the SHIPPED sheets so the
 * retouched palettes carry through and nothing new is baked until one wins:
 *
 *   bevel  the rock band is replaced by grass, the bottom rows of the tile
 *          stretched down over it and shaded. Same geometry, every cell stays
 *          flat, only the step's face changes colour. Cheap, and not really a
 *          slope: it reads as a green kerb.
 *
 *   ramp   heights move from CELLS to VERTICES. A vertex takes the highest of
 *          the four cells around it, so a low cell beside a plateau has one or
 *          more corners lifted and its diamond is warped up to meet the
 *          plateau's edge; the plateau itself stays flat. The tile's pixels
 *          are displaced vertically by the bilinear blend of its corner lifts
 *          and shaded by the slope they make. Only the coast, where the sea is
 *          not drawn, keeps a rock face.
 *
 * Everything here is pixel arithmetic on a 64px cell holding a 44x24 diamond
 * — the geometry the sheets are baked to — plus the small Pixi glue to read a
 * texture's pixels and hand a new one back.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { TILE } from './tileset';

/** The diamond the sheets are baked for, inside their 64px cell. */
const DIAMOND_W = 44;
const DIAMOND_H = 24;
const OX = (TILE - DIAMOND_W) / 2;
const OY = (TILE - DIAMOND_H) / 2;

/** How tall the rock band under every shipped tile is — `LIFT` in the baker. */
export const BAKED_LIFT = 6;

/**
 * The row of the diamond's lower edge at `col` (0..43), inside the cell.
 * Same formula as `add_volume` / `trim_iso_lift.py`, so a band found here is
 * the band those tools wrote.
 */
function edgeY(col: number): number {
  const t = Math.abs(col - DIAMOND_W / 2) / (DIAMOND_W / 2);
  return OY + Math.floor(DIAMOND_H - 1 - t * (DIAMOND_H / 2 - 1));
}

export { cornerLifts, meanLift, surfaceLift } from './relief';
export type { CornerLifts } from './relief';

// ---------------------------------------------------------------------------
// Pixel work
// ---------------------------------------------------------------------------

/**
 * How a ramp is shaded, by the DIRECTION it faces and nothing else.
 *
 * Not a lit surface: Lambert shading made a mitred corner piece — steeper
 * than the two straight ramps it joins — darker than both, and the corner
 * read as a wall end. A hand-drawn tileset shades a slope by which way it
 * faces, so that is what this does. Every slope is a step darker than flat
 * ground (the ring around a plateau reads as its shadow, the same way the
 * coast's rock does), a slope facing the camera darker than one facing away
 * — the pack's own cliffs are dark on the faces we see — and a slope facing
 * south-east a touch lighter than one facing south-west, the pack's
 * convention for a block's two faces. A corner piece faces between its two
 * neighbours and lands between their shades, which is what joins them.
 */
const SLOPE_SHADE = 0.79;
/** Darker facing the camera (+x, +y), lighter facing away. */
const SLOPE_FACING = 0.07;
/** South-east (+x) a touch lighter than south-west (+y). */
const SLOPE_SIDE = 0.03;


/**
 * Replace the rock band under a cell with grass sloping down from its edge.
 *
 * The `BAKED_LIFT` rows the baker hung under the diamond are cleared, then
 * the bottom `GRASS_ROWS` rows of the diamond are stretched to cover them
 * plus `lift` more, column by column along the edge, and darkened per side
 * like the rock they replace. The tile's own outline lands at the bottom of
 * the bevel, so the diamond still closes against its lower neighbour.
 */
const GRASS_ROWS = 6;
const BEVEL_SHADE = { sw: 0.72, se: 0.86 };

export function bevelCell(src: ImageData, lift: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const S = src.data;
  const D = out.data;
  const W = src.width;

  for (let col = 0; col < DIAMOND_W; col++) {
    const x = OX + col;
    const edge = edgeY(col);
    // Only where the tile has ground in this column — a cut-corner blob
    // variant has no band in mid-air and gets no bevel there either.
    let ground = false;
    for (let y = OY; y <= edge; y++) if (S[(y * W + x) * 4 + 3] > 0) { ground = true; break; }
    // Clear the baked band whatever happens, so a shorter lift leaves no rock.
    for (let dy = 1; dy <= BAKED_LIFT; dy++) {
      const y = edge + dy;
      if (y < src.height) D.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
    }
    if (!ground) continue;

    const shade = col < DIAMOND_W / 2 ? BEVEL_SHADE.sw : BEVEL_SHADE.se;
    const top = edge - GRASS_ROWS + 1;
    const rows = GRASS_ROWS + lift;
    for (let j = 0; j < rows; j++) {
      const y = top + j;
      if (y >= src.height) break;
      const sy = top + Math.floor((j * GRASS_ROWS) / rows);
      const si = (sy * W + x) * 4;
      const di = (y * W + x) * 4;
      // Below the original edge the stretch is the slope's face: shaded, and
      // a touch darker toward the bottom so it reads as turning under.
      const k = y > edge ? shade * (1 - 0.15 * ((y - edge) / Math.max(1, lift))) : 1;
      D[di] = S[si] * k;
      D[di + 1] = S[si + 1] * k;
      D[di + 2] = S[si + 2] * k;
      D[di + 3] = S[si + 3];
    }
  }
  return out;
}

/**
 * Warp a flat cell into a ramp: every pixel moves UP by the height of the
 * cell's surface at its place in the diamond, and the surface is shaded by
 * the slope it makes there.
 *
 * ## Half tiles
 *
 * The surface is not the bilinear blend of the four corners. That blend is a
 * saddle wherever the corners disagree, and at a plateau's corners — one
 * corner lifted outside, three lifted inside — it came out as a soft tent
 * with a vertical crease where the two straight ramps met. So the cell is cut
 * along the diagonal whose two ends stand at the SAME height, into two
 * planar triangles: one holds the odd corner and slopes, the other is flat.
 * An outside corner is half a flat tile and half a mitred ramp turning the
 * corner at 45 degrees; an inside corner is half plateau and half ramp. A
 * straight ramp (two adjacent corners up) is one plane whichever way it is
 * cut. The facets are planar, so the shade is constant per facet and the
 * crease between them is crisp — which is how a tileset would draw it.
 *
 * Solved backwards, per output pixel: the source row is the one that lands
 * here once displaced. Points outside the diamond — the band under an edge,
 * the transparent corners — take the displacement of the nearest edge, so
 * the rock band follows the edge it hangs from, and they are NOT shaded: the
 * band is the coast's rock, and it stays rock under a ramp.
 */
/** Which of a cell's two lower edges face LAND — the only ones that need rock. */
export interface BandSides {
  /** The south-west edge, toward the south neighbour. */
  sw: boolean;
  /** The south-east edge, toward the east neighbour. */
  se: boolean;
}

export function rampCell(
  src: ImageData,
  lifts: readonly [number, number, number, number],
  /** The pack's cliff face, for the rock hung under the cell — see `ensureBand`. */
  rock?: ImageData,
  /** How tall that rock must be, in px: at least one tier's lift. */
  bandRows = 0,
  sides: BandSides = { sw: true, se: true },
): ImageData {
  const rows = Math.max(bandRows, ...lifts);
  const base = rock && rows > 0 && (sides.sw || sides.se) ? ensureBand(src, rows, rock, sides) : src;
  return warpToRamp(base, lifts, { cx: TILE / 2, cy: TILE / 2, w: DIAMOND_W, h: DIAMOND_H, shade: true });
}

/** How much the two visible faces darken — the baker's `FACE_SHADE`, verbatim. */
const FACE_SHADE = { sw: 0.62, se: 0.8 };

/**
 * Make sure `rows` of rock hang under the cell's two lower edges.
 *
 * The shipped sheets are uneven here: the plateau palettes carry a 6-row
 * band under every tile, the sea-level palette none at all (its edge is the
 * shore, not a cliff). A ramp needs one whatever its palette: where it meets
 * a CLIFF along the same edge, its lifted corner leaves a wedge open under
 * its lower edge, and the band is what fills it — the ramp's own side,
 * showing as rock. Where the band is not needed, the neighbour drawn after
 * this cell covers it, as the baked ones always were.
 *
 * Pixels already there are kept; only transparent ones under a column that
 * has ground are filled, from the top rows of the pack's face tile (the
 * solid part — the baker's `rock_band`), shaded per side like the bake.
 */
function ensureBand(src: ImageData, rows: number, rock: ImageData, sides: BandSides): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const D = out.data;
  const R = rock.data;
  const W = src.width;
  for (let col = 0; col < DIAMOND_W; col++) {
    // Toward the sea the shore is the edge, not a cliff — the sea-level
    // palette hangs nothing there, and a ramp at the coast should not either.
    if (!(col < DIAMOND_W / 2 ? sides.sw : sides.se)) continue;
    const x = OX + col;
    const edge = edgeY(col);
    // Hang from the LAST PAINTED row, not from the diamond's computed edge:
    // the art paints ~42 of the 44px and stops a row short of the formula
    // at its sides, and a band hung from the formula left that row open —
    // a one-pixel slit of sea along every ramp that met a flat neighbour.
    let last = -1;
    for (let y = Math.min(src.height, edge + rows + 1) - 1; y >= OY; y--) {
      if (D[(y * W + x) * 4 + 3] > 0) { last = y; break; }
    }
    if (last < 0) continue;
    const shade = col < DIAMOND_W / 2 ? FACE_SHADE.sw : FACE_SHADE.se;
    for (let y = last + 1; y <= edge + rows && y < src.height; y++) {
      const di = (y * W + x) * 4;
      // The face is baked at the diamond's width in the same 64px box, so
      // the same column serves; the row is the band's own depth.
      const ri = (Math.min(rock.height - 1, y - last - 1) * rock.width + x) * 4;
      if (R[ri + 3] === 0) continue;
      D[di] = R[ri] * shade;
      D[di + 1] = R[ri + 1] * shade;
      D[di + 2] = R[ri + 2] * shade;
      D[di + 3] = R[ri + 3];
    }
  }
  return out;
}

/** Where a cell's diamond sits in the pixels being warped, and whether to shade. */
export interface WarpGeometry {
  /** Centre of the cell's diamond, in pixels. */
  cx: number;
  cy: number;
  /** The CELL's diamond — not the art's, which may be inset inside it. */
  w: number;
  h: number;
  shade: boolean;
}

/** The warp itself, for any pixels laid over a cell: ground, or the overlays on it. */
export function warpToRamp(
  src: ImageData,
  lifts: readonly [number, number, number, number],
  geo: WarpGeometry,
): ImageData {
  const out = new ImageData(src.width, src.height);
  const S = src.data;
  const D = out.data;
  const W = src.width;
  const H = src.height;
  const [n, e, s, w] = lifts;
  const maxLift = Math.max(n, e, s, w);
  const { cx, cy } = geo;
  const DIAMOND_W = geo.w;
  const DIAMOND_H = geo.h;

  // Cut along the diagonal whose ends agree: top-bottom when they do (or
  // when neither pair does), left-right otherwise.
  const cutTB = n === s || e !== w;

  // Grid coordinates (u along +x, v along +y, both 0..1 across the cell) of
  // a pixel centre, unclamped.
  const uv = (X: number, Y: number): [number, number] => {
    const sx = X + 0.5 - cx;
    const sy = Y + 0.5 - cy;
    return [sx / DIAMOND_W + sy / DIAMOND_H + 0.5, sy / DIAMOND_H - sx / DIAMOND_W + 0.5];
  };
  /** Height and gradient of the facet under (u, v), u and v clamped. */
  const facet = (u0: number, v0: number): [number, number, number] => {
    const u = Math.min(1, Math.max(0, u0));
    const v = Math.min(1, Math.max(0, v0));
    if (cutTB) {
      // Diagonal top-bottom (u = v). Right of it holds the right corner.
      return u >= v
        ? [n + (e - n) * u + (s - e) * v, e - n, s - e]
        : [n + (s - w) * u + (w - n) * v, s - w, w - n];
    }
    // Diagonal left-right (u + v = 1). Above it holds the top corner.
    return u + v <= 1
      ? [n + (e - n) * u + (w - n) * v, e - n, w - n]
      : [s + (s - w) * (u - 1) + (s - e) * (v - 1), s - w, s - e];
  };

  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      // The source row that displaces onto this one.
      let best = -1;
      let bestErr = Infinity;
      let bestUV: [number, number] = [0, 0];
      for (let Ys = Y; Ys <= Y + maxLift + 1 && Ys < H; Ys++) {
        const p = uv(X, Ys);
        const err = Math.abs(Ys - facet(p[0], p[1])[0] - Y);
        if (err < bestErr) { bestErr = err; best = Ys; bestUV = p; }
      }
      if (best < 0 || bestErr > 0.75) continue;
      const si = (best * W + X) * 4;
      if (S[si + 3] === 0) continue;

      // Shade the surface by its facet's gradient, in grid units: a cell is
      // DIAMOND_W/2 px along each grid axis on screen. The rock band and
      // anything else outside the diamond keep their own colour.
      const [u, v] = bestUV;
      let k = 1;
      if (geo.shade && u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const [, gu, gv] = facet(u, v);
        const g = Math.hypot(gu, gv);
        if (g > 0) {
          // The facet's normal, horizontal part, as a unit direction: it
          // points DOWNHILL, i.e. toward where the ground it faces lies.
          const nx = -gu / g;
          const ny = -gv / g;
          k = SLOPE_SHADE - SLOPE_FACING * (nx + ny) + SLOPE_SIDE * (nx - ny);
        }
      }

      const di = (Y * W + X) * 4;
      D[di] = S[si] * k;
      D[di + 1] = S[si + 1] * k;
      D[di + 2] = S[si + 2] * k;
      D[di + 3] = S[si + 3];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pixi glue
// ---------------------------------------------------------------------------

let scratch: CanvasRenderingContext2D | null = null;

/** The pixels of one cell-sized texture, read off its sheet. */
export function readCell(texture: Texture): ImageData {
  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
  }
  const ctx = scratch!;
  const { x, y, width, height } = texture.frame;
  ctx.clearRect(0, 0, TILE, TILE);
  ctx.drawImage(texture.source.resource as CanvasImageSource, x, y, width, height, 0, 0, width, height);
  return ctx.getImageData(0, 0, TILE, TILE);
}

/** A texture of its own for `pixels`, sampled like `like`. */
export function textureFrom(pixels: ImageData, like: Texture): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext('2d')!.putImageData(pixels, 0, 0);
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: like.source.scaleMode }) });
}

const rampCache = new Map<string, Texture>();

/**
 * `texture` warped into the ramp `lifts` (in tiers) at `z` px per tier, with
 * `z` px of `rock` hung under it. All-zero lifts is a flat cell that only
 * needs the rock — a cliff edge at a lift taller than the bake. Cached.
 */
export function rampTexture(
  texture: Texture,
  lifts: readonly [number, number, number, number],
  z: number,
  rock?: Texture,
  sides: BandSides = { sw: true, se: true },
): Texture {
  const px = lifts.map((l) => l * z) as [number, number, number, number];
  const k = `${texture.uid}:${px.join(',')}:${z}:${rock?.uid ?? '-'}:${+sides.sw}${+sides.se}`;
  let out = rampCache.get(k);
  if (!out || out.destroyed) {
    out = textureFrom(rampCell(readCell(texture), px, rock && readCell(rock), z, sides), texture);
    rampCache.set(k, out);
  }
  return out;
}

const overlayCache = new Map<string, { texture: Texture; anchorY: number }>();

/**
 * A flat overlay — a fog lid, a reachable-ring diamond — warped onto the
 * ramp `lifts` at `z` px per tier, for a texture drawn centred on its cell
 * and used with anchor (0.5, 0.5).
 *
 * The texture is smaller than the cell (the diamonds are inset by 0.88, see
 * `TileTextures`), so it is laid in a canvas with `maxLift` rows of room
 * above and warped against the CELL's diamond, `cell`, centred on it. The
 * returned `anchorY` keeps the sprite's centre where the flat one's was, so a
 * caller positions it exactly as before and the lift is in the pixels.
 */
export function rampOverlay(
  texture: Texture,
  /**
   * The texture's pixels, as something a canvas can draw. Passed in because
   * these overlays are baked by the renderer (`TileTextures`) and a render
   * texture has no image behind it — `renderer.extract.canvas(texture)` is
   * how a caller gets one.
   */
  pixels: CanvasImageSource,
  lifts: readonly [number, number, number, number],
  z: number,
  cell: { w: number; h: number },
): { texture: Texture; anchorY: number } {
  const px = lifts.map((l) => Math.round(l * z)) as [number, number, number, number];
  const k = `${texture.uid}:${px.join(',')}:${cell.w}x${cell.h}`;
  let out = overlayCache.get(k);
  if (out && !out.texture.destroyed) return out;

  const room = Math.max(...px);
  const tw = texture.width;
  const th = texture.height;
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th + room;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(pixels, 0, room, tw, th);
  const flat = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const warped = warpToRamp(flat, px, {
    cx: tw / 2, cy: room + th / 2, w: cell.w, h: cell.h, shade: false,
  });
  out = { texture: textureFrom(warped, texture), anchorY: (room + th / 2) / (th + room) };
  overlayCache.set(k, out);
  return out;
}

/** Every cell of a blob set, bevelled. */
export function bevelSet(set: Texture[][], lift: number): Texture[][] {
  return set.map((line) => line.map((t) => textureFrom(bevelCell(readCell(t), lift), t)));
}
