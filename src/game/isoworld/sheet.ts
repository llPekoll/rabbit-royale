/**
 * The isometric block sheets, sliced.
 *
 * Two sheets share one layout, so one slicer reads both:
 *
 *   - `pixel`: `public/assets/world/isometric-sandbox-sheet-32x32.png`, the
 *     sandbox pixel art, 32px cells, three materials (grass, stone, dirt);
 *   - `smooth`: `public/assets/world/iso-smooth-sheet-128.png`, drawn by
 *     `tools/gen_iso_smooth_sheet.py` in the flat outlined style of the
 *     "Nature and Frogs" reference, 128px cells, one material per level
 *     (moss, grass, sand) with tan cliffs.
 *
 * Six columns by nine rows of cells, three materials stacked three rows each.
 * Every number below was read off the pixel sheet's alpha, and the smooth sheet
 * was drawn to the same grid, minus the last two columns — it is terrain only,
 * so stairs are built as slopes and the block props are skipped:
 *
 *     col   0        1        2          3          4           5
 *     r0    cube     slab     slope W    slope N    stairs N    stairs W
 *     r1    turf     flat     slope S    slope E    block W     block E
 *     r2    *        *        *          *          block S     block N
 *
 * The smooth sheet adds columns 4-7 on rows 0 and 1: the INNER corner ramps
 * (climbing toward two adjacent sides) and the OUTER ones (rising to a single
 * corner point), in `Dir` order of their first side — see `rampHighSides`.
 *
 * Row 2's first four cells differ per sheet. Pixel: the grass set holds the
 * four water blocks and the dirt set has two posts. Smooth: the four RIM
 * pieces, N E S W — the dark outline along one edge of the top face — and a
 * tenth row shared by every material: the three vertical CORNER outlines
 * (left, right, front) and the post. The smooth cube carries no outline of its
 * own; a tile that did would draw ink across every interior seam. The renderer
 * lays rims and corners only on silhouette edges (see `IsoWorldView`).
 *
 * Every sprite is drawn bottom-aligned in its cell: the lowest pixel of a
 * block's BASE diamond is the cell's last row, whatever the block's height. A
 * cube's top face is the upper half of the cell and its sides run to the
 * bottom, so one block is `cell` wide, `cell / 2` deep and `cell / 2` tall.
 * That shared foot is what lets every piece — cube, slope, stairs, prop, rim —
 * be placed by the same rule.
 *
 * "Slope W" climbs toward -x: its high edge is the cell's upper-left side. The
 * two slopes climbing toward the camera (S and E) draw as a wall with a wedge
 * beside it, because their surface faces away; that is correct, not a bug.
 */
import { Assets, Rectangle, Texture } from 'pixi.js';
import type { Dir } from './terrain';
import { loadDecor, type DecorSet } from './decor';

export type IsoStyle = 'pixel' | 'smooth';
export const ISO_STYLES: readonly IsoStyle[] = ['smooth', 'pixel'];

export type Material = 'grass' | 'stone' | 'dirt' | 'moss' | 'sand';

interface SheetSpec {
  url: string;
  cell: number;
  /**
   * Gutter around every cell, filled with its own edge pixels. A filtered
   * sheet needs one: a frame cut flush against the next samples its
   * neighbour's transparent edge and draws a hairline seam down every wall.
   */
  pad: number;
  /** The three material sets, top row first. */
  materials: readonly [Material, Material, Material];
  /**
   * The surface material of each tier, tier 1 first; higher tiers keep the
   * last one. Only `smooth` colours the land by tier — `pixel` builds it in
   * layers instead (see `layered`).
   */
  tiers: readonly Material[];
  /**
   * Whether the land is built as grass turf over a dirt block over stone, with
   * a bare-dirt beach: the pixel sheet's look. A smooth tier is one material
   * through, coloured by its height.
   */
  layered: boolean;
  /** What a hedge and a boulder are made of. */
  hedge: Material;
  boulder: Material;
  /** Where the post is: [row, col]. Null when the sheet has none. */
  post: readonly [number, number] | null;
  /** Whether the sheet has water: the pixel sheet's flattened sea, or a drawn tile at [row, col]. */
  water: boolean | readonly [number, number];
  /**
   * Whether the water is a sheet over the whole floor, beach included, cut
   * at the waterline across the floor's ramps (the smooth sheet), rather
   * than a surface on sea cells only (the pixel sheet).
   */
  floodedFloor: boolean;
  /** Whether the sheet has the outline pieces: rims on row 2, corners on row 9. */
  outlines: boolean;
  /** Whether columns 4 and 5 exist: stairs, and the block props. */
  stairs: boolean;
  blocks: boolean;
  /** Whether the corner ramps exist (columns 4-7 of rows 0 and 1). */
  corners: boolean;
  /** Whether the hand-drawn decorations are planted on this sheet's land. */
  decor: boolean;
  /**
   * The tier drawn as a sheet with nothing under it. 0 on the pixel sheet:
   * the sea is the floor and land stands on it in blocks from the sea bed.
   * 1 on the smooth sheet: the sand IS the floor, a flat tile with no
   * thickness, and only the tiers above it have cliffs — as in the reference.
   */
  floor: number;
  /**
   * What lies under the island: one flat colour, or a vertical gradient as
   * `[offset 0..1, rgb]` stops. Only `smooth` has no sea, so its islands float
   * on the page.
   */
  background: number | ReadonlyArray<readonly [number, number]>;
}

export const SHEETS: Readonly<Record<IsoStyle, SheetSpec>> = {
  pixel: {
    url: '/assets/world/isometric-sandbox-sheet-32x32.png',
    cell: 32,
    pad: 0,
    materials: ['grass', 'stone', 'dirt'],
    tiers: ['grass'],
    layered: true,
    hedge: 'grass',
    boulder: 'stone',
    post: [8, 1],
    water: true,
    floodedFloor: false,
    outlines: false,
    stairs: true,
    blocks: true,
    corners: false,
    decor: false,
    floor: 0,
    background: 0x0b2233,
  },
  smooth: {
    // The query is a layout revision, bumped whenever the sheet's cells move:
    // browsers cache the file by URL, and a stale sheet sliced with the new
    // offsets shows pieces that no longer exist.
    url: '/assets/world/iso-smooth-sheet-128.png?layout=20',
    cell: 128,
    pad: 2,
    materials: ['moss', 'grass', 'sand'],
    tiers: ['sand', 'grass', 'moss'],
    layered: false,
    hedge: 'moss',
    boulder: 'sand',
    post: null,
    water: [9, 3],
    floodedFloor: true,
    outlines: true,
    stairs: false,
    blocks: false,
    corners: true,
    decor: true,
    floor: 1,
    // The reference's page, sampled every tenth of its height: teal at the
    // top, through spring green, to a dusty olive at the bottom.
    background: [
      [0, 0x69bfae],
      [0.1, 0x68bfa7],
      [0.2, 0x74c3a1],
      [0.3, 0x85c695],
      [0.4, 0x99cc8c],
      [0.5, 0xacd283],
      [0.6, 0xb6cd7b],
      [0.7, 0xb4c67f],
      [0.8, 0xabbb82],
      [0.9, 0xa5b388],
      [1, 0x9ead87],
    ],
  },
};

export const ISO_SHEET_URL = SHEETS.pixel.url;

/** Pixel sheet cell size, kept for callers that only ever used that sheet. */
export const CELL = SHEETS.pixel.cell;

/** One pixel-sheet block: diamond width and depth on screen, and its height. */
export const BLOCK = { w: 32, h: 16, z: 16 } as const;

/** What the pixel sea is laid over, so the translucent water becomes a solid colour. */
const DEEP = { r: 11, g: 34, b: 51 };

export const MATERIALS: readonly Material[] = ['grass', 'stone', 'dirt', 'moss', 'sand'];

export interface MaterialTiles {
  cube: Texture;
  /** Half a cube tall. */
  slab: Texture;
  /** A thin tile, for laying a surface over a different material. */
  turf: Texture;
  /** The top face alone, no thickness. */
  flat: Texture;
  /** One per direction the slope climbs toward. */
  slope: Readonly<Record<Dir, Texture>>;
  /**
   * The lace of this material's colour hanging over a cell along one of its
   * edges, and the darker patch of grass with its own lace. Smooth sheet only.
   */
  fringe?: Readonly<Record<Dir, Texture>>;
  patch?: Texture;
  patchFringe?: Readonly<Record<Dir, Texture>>;
  /** The lace wrapped around one corner, by corner (NE 0, SE 1, SW 2, NW 3), on the outer corner's slope. */
  laceCap?: Readonly<Record<Dir, Texture>>;
  /** The lace laid down a straight slope climbing toward that side. */
  slopeFringe?: Readonly<Record<Dir, Texture>>;
  /**
   * The ridge line along a sloped edge, by side, then by which end is a block
   * up: the edge's first corner clockwise, or its second. This material's
   * own colour, a shade darker.
   */
  fold?: Readonly<Record<Dir, readonly [Texture, Texture]>>;
  /** Corner ramps by their first side, on sheets that have them. */
  inner?: Readonly<Record<Dir, Texture>>;
  outer?: Readonly<Record<Dir, Texture>>;
  /** Only the two directions that climb away from the camera exist, and not on every sheet. */
  stairs: Readonly<Partial<Record<Dir, Texture>>>;
  /** A three-quarter block standing in the quarter of the cell on that side. Not on every sheet. */
  block?: Readonly<Record<Dir, Texture>>;
  /** The outline along one edge of the top face. Smooth sheet only. */
  rim?: Readonly<Record<Dir, Texture>>;
}

/** One texture per ramp shape: straight slopes, inner and outer corners, by `dir`. */
export interface RampPieces {
  slope: Readonly<Record<Dir, Texture>>;
  inner: Readonly<Record<Dir, Texture>>;
  outer: Readonly<Record<Dir, Texture>>;
}

/** The vertical outlines, one block tall, at a cell's left, right and front corner. */
export interface CornerTiles {
  left: Texture;
  right: Texture;
  front: Texture;
}

export interface IsoTileset {
  style: IsoStyle;
  spec: SheetSpec;
  /** Sheet cell size. Every sprite is one cell. */
  cell: number;
  /** One block: diamond width and depth on screen, and how tall it stands. */
  block: { w: number; h: number; z: number };
  /** How thick the turf tile is. */
  turfZ: number;
  materials: Readonly<Record<Material, MaterialTiles>>;
  /** The water surface, top face only and opaque — see `seaTile`. Null when the sheet has no sea. */
  water: Texture | null;
  /**
   * For a flooded floor ramp, by kind and `dir`: the water sheet cut at the
   * waterline over its submerged part, and its surface and faces above the
   * waterline, drawn again over the water. Smooth sheet only.
   */
  waterOver: RampPieces | null;
  emerged: RampPieces | null;
  /** The floor's ridge lines cut at the waterline, like `MaterialTiles.fold`. Smooth sheet only. */
  emergedFold: Readonly<Record<Dir, readonly [Texture, Texture]>> | null;
  /** The colour of that surface, for painting the sea beyond the grid. */
  seaColor: number;
  /** A short wooden post, standing in the middle of its cell. Not on every sheet. */
  post: Texture | null;
  /** Smooth sheet only. */
  corners: CornerTiles | null;
  /** The decorations, on sheets that plant them. */
  decor: DecorSet | null;
}

const cached = new Map<IsoStyle, Promise<IsoTileset>>();

/** Load and slice a sheet. Cached per style, so every workbench rebuild shares it. */
export function loadIsoTileset(style: IsoStyle = 'pixel'): Promise<IsoTileset> {
  let pending = cached.get(style);
  if (!pending) {
    pending = load(style).catch((err) => {
      cached.delete(style);
      throw err;
    });
    cached.set(style, pending);
  }
  return pending;
}

async function load(style: IsoStyle): Promise<IsoTileset> {
  const spec = SHEETS[style];
  const { cell, pad } = spec;
  const pitch = cell + 2 * pad;
  const sheet = await Assets.load<Texture>(spec.url);
  // Pixel art is sampled nearest, or every block edge smears when scaled; the
  // smooth sheet is meant to be filtered.
  sheet.source.scaleMode = style === 'pixel' ? 'nearest' : 'linear';

  const slice = (row: number, col: number) =>
    new Texture({ source: sheet.source, frame: new Rectangle(col * pitch + pad, row * pitch + pad, cell, cell) });

  const material = (index: number): MaterialTiles => {
    const r = index * 3;
    return {
      cube: slice(r, 0),
      slab: slice(r, 1),
      turf: slice(r + 1, 0),
      flat: slice(r + 1, 1),
      slope: { 0: slice(r, 3), 1: slice(r + 1, 3), 2: slice(r + 1, 2), 3: slice(r, 2) },
      ...(spec.corners
        ? {
            inner: { 0: slice(r, 4), 1: slice(r, 5), 2: slice(r, 6), 3: slice(r, 7) },
            outer: { 0: slice(r + 1, 4), 1: slice(r + 1, 5), 2: slice(r + 1, 6), 3: slice(r + 1, 7) },
          }
        : {}),
      stairs: spec.stairs ? { 0: slice(r, 4), 3: slice(r, 5) } : {},
      ...(spec.blocks
        ? { block: { 0: slice(r + 2, 5), 1: slice(r + 1, 5), 2: slice(r + 2, 4), 3: slice(r + 1, 4) } }
        : {}),
      ...(spec.outlines
        ? {
            rim: { 0: slice(r + 2, 0), 1: slice(r + 2, 1), 2: slice(r + 2, 2), 3: slice(r + 2, 3) },
            fringe: { 0: slice(r + 2, 4), 1: slice(r + 2, 5), 2: slice(r + 2, 6), 3: slice(r + 2, 7) },
            patch: slice(r + 2, 8),
            patchFringe: { 0: slice(r + 2, 9), 1: slice(r + 2, 10), 2: slice(r + 2, 11), 3: slice(r + 2, 12) },
            laceCap: { 0: slice(r + 2, 13), 1: slice(r + 2, 14), 2: slice(r + 2, 15), 3: slice(r + 2, 16) },
            slopeFringe: { 0: slice(r + 2, 17), 1: slice(r + 2, 18), 2: slice(r + 2, 19), 3: slice(r + 2, 20) },
            fold: {
              0: [slice(r + 2, 21), slice(r + 2, 22)],
              1: [slice(r + 2, 23), slice(r + 2, 24)],
              2: [slice(r + 2, 25), slice(r + 2, 26)],
              3: [slice(r + 2, 27), slice(r + 2, 28)],
            },
          }
        : {}),
    };
  };

  const materials = {} as Record<Material, MaterialTiles>;
  spec.materials.forEach((name, i) => {
    materials[name] = material(i);
  });
  // Every material name resolves to SOME set, so a ground picked for one sheet
  // still draws on the other rather than crashing on a missing key.
  for (const name of MATERIALS) materials[name] ??= materials[spec.materials[0]];

  const sea = spec.water === true ? seaTile(sheet, cell) : null;
  const waterTile = Array.isArray(spec.water) ? slice(spec.water[0], spec.water[1]) : null;
  const decor = spec.decor ? await loadDecor() : null;
  return {
    style,
    spec,
    cell,
    block: { w: cell, h: cell / 2, z: cell / 2 },
    turfZ: cell / 8,
    materials,
    water: sea?.texture ?? waterTile,
    waterOver: waterTile ? rampPieces(slice, 10, 12) : null,
    emerged: waterTile ? rampPieces(slice, 10, 0) : null,
    emergedFold: waterTile
      ? {
          0: [slice(10, 24), slice(10, 25)],
          1: [slice(10, 26), slice(10, 27)],
          2: [slice(10, 28), slice(10, 29)],
          3: [slice(10, 30), slice(10, 31)],
        }
      : null,
    seaColor: sea?.color ?? (typeof spec.background === 'number' ? spec.background : spec.background[0][1]),
    post: spec.post ? slice(spec.post[0], spec.post[1]) : null,
    corners: spec.outlines
      ? {
          left: slice(9, 0),
          right: slice(9, 1),
          front: slice(9, 2),
        }
      : null,
    decor,
  };
}

/**
 * Twelve ramp-shaped pieces laid out from `col` on `row`: straight slopes in
 * sheet order W N S E, then inner and outer corners in `Dir` order.
 */
function rampPieces(slice: (row: number, col: number) => Texture, row: number, col: number): RampPieces {
  return {
    slope: { 0: slice(row, col + 1), 1: slice(row, col + 3), 2: slice(row, col + 2), 3: slice(row, col) },
    inner: { 0: slice(row, col + 4), 1: slice(row, col + 5), 2: slice(row, col + 6), 3: slice(row, col + 7) },
    outer: { 0: slice(row, col + 8), 1: slice(row, col + 9), 2: slice(row, col + 10), 3: slice(row, col + 11) },
  };
}

/**
 * The water block's top face, flattened onto the deep colour and made opaque.
 *
 * The sheet's water is a translucent half-block with its front faces drawn in.
 * Laid edge to edge, those faces show through every neighbour's surface and
 * the sea comes out as a grid of glass boxes — the look for a pool, not for an
 * ocean. Keeping only the top face, composited over a fixed deep colour, gives
 * a sea that tiles seamlessly and a clean waterline where the land meets it:
 * each water cell covers the foot of the land block behind it.
 */
function seaTile(sheet: Texture, cell: number): { texture: Texture; color: number } {
  const canvas = document.createElement('canvas');
  canvas.width = cell;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas for the sea tile');
  // The filled water block: grass row 2, column 1.
  ctx.drawImage(sheet.source.resource as CanvasImageSource, cell, 2 * cell, cell, cell, 0, 0, cell, cell);

  const image = ctx.getImageData(0, 0, cell, cell);
  const px = image.data;

  // One colour for the whole surface, taken from the middle of the face. The
  // tile's rim pixels carry a different alpha — its outline — and kept, they
  // draw a grid over the whole sea.
  const mid = ((cell / 2) * cell + cell / 2) * 4;
  const a = px[mid + 3] / 255;
  const r = Math.round(px[mid] * a + DEEP.r * (1 - a));
  const g = Math.round(px[mid + 1] * a + DEEP.g * (1 - a));
  const b = Math.round(px[mid + 2] * a + DEEP.b * (1 - a));

  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const i = (y * cell + x) * 4;
      const inside = inWaterTop(x, y, cell);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = inside ? 255 : 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  const color = (r << 16) | (g << 8) | b;

  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return { texture, color };
}

/**
 * The water slab's top diamond: on the 32px sheet rows 8-23, widening two
 * pixels a row to full width at rows 15-16, then narrowing again. Read off the
 * tile, and scaled with the cell.
 */
function inWaterTop(x: number, y: number, cell: number): boolean {
  const k = cell / 32;
  const top = 8 * k;
  const bottom = 24 * k - 1;
  if (y < top || y > bottom) return false;
  const mid = 16 * k - 1;
  const half = y <= mid ? 1.5 * k + 2 * (y - top) : 15.5 * k - 2 * (y - mid - 1);
  return Math.abs(x - (cell / 2 - 0.5)) <= half;
}
