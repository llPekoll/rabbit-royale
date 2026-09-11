/**
 * The isometric sandbox sheet, sliced.
 *
 * `public/assets/world/isometric-sandbox-sheet-32x32.png`, 192x288: six columns
 * by nine rows of 32px cells, three materials stacked three rows each. Every
 * number below was read off the sheet's alpha, not guessed:
 *
 *     col   0        1        2          3          4           5
 *     r0    cube     slab     slope W    slope N    stairs N    stairs W
 *     r1    turf     flat     slope S    slope E    block W     block E
 *     r2    (water)  (water)  (water)    (water)    block S     block N
 *
 * Grass is rows 0-2, stone 3-5, dirt 6-8. The grass set's row 2 holds the four
 * water blocks instead of anything grass; stone has nothing on row 5 but its
 * blocks, and dirt has two posts there.
 *
 * Every sprite is drawn bottom-aligned in its cell: the lowest pixel of a
 * block's BASE diamond is the cell's last row, whatever the block's height. A
 * cube's top face is rows 0-15 and its sides run to row 31, so one block is 32
 * wide, 16 deep and 16 tall. That shared foot is what lets every piece — cube,
 * slope, stairs, prop — be placed by the same rule.
 *
 * "Slope W" climbs toward -x: its high edge is the cell's upper-left side. The
 * two slopes climbing toward the camera (S and E) draw as a wall with a wedge
 * beside it, because their surface faces away; that is correct, not a bug.
 */
import { Assets, Rectangle, Texture } from 'pixi.js';
import type { Dir } from './terrain';

export const ISO_SHEET_URL = '/assets/world/isometric-sandbox-sheet-32x32.png';

/** Sheet cell size. Every sprite is one cell. */
export const CELL = 32;

/** One block: diamond width and depth on screen, and how tall it stands. */
export const BLOCK = { w: 32, h: 16, z: 16 } as const;

/** How thick the turf tile is (its opaque rows start at 12 instead of 16). */
export const TURF_Z = 4;

/** How high the water surface stands: the water blocks are half-height slabs. */
export const WATER_Z = 8;

/** What the sea is laid over, so the translucent water becomes a solid colour. */
const DEEP = { r: 11, g: 34, b: 51 };

export type Material = 'grass' | 'stone' | 'dirt';
export const MATERIALS: readonly Material[] = ['grass', 'stone', 'dirt'];

const MATERIAL_ROW: Readonly<Record<Material, number>> = { grass: 0, stone: 3, dirt: 6 };

export interface MaterialTiles {
  cube: Texture;
  /** Half a cube tall. */
  slab: Texture;
  /** A 4px-thick tile, for laying a surface over a different material. */
  turf: Texture;
  /** The top face alone, no thickness. */
  flat: Texture;
  /** One per direction the slope climbs toward. */
  slope: Readonly<Record<Dir, Texture>>;
  /** Only the two directions that climb away from the camera exist. */
  stairs: Readonly<Partial<Record<Dir, Texture>>>;
  /** A three-quarter block standing in the quarter of the cell on that side. */
  block: Readonly<Record<Dir, Texture>>;
}

export interface IsoTileset {
  materials: Readonly<Record<Material, MaterialTiles>>;
  /** The water surface, top face only and opaque — see `seaTile`. */
  water: Texture;
  /** The colour of that surface, for painting the sea beyond the grid. */
  seaColor: number;
  /** A short wooden post, standing in the middle of its cell. */
  post: Texture;
}

let cached: Promise<IsoTileset> | null = null;

/** Load and slice the sheet. Cached, so every workbench rebuild shares it. */
export function loadIsoTileset(): Promise<IsoTileset> {
  cached ??= load().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

async function load(): Promise<IsoTileset> {
  const sheet = await Assets.load<Texture>(ISO_SHEET_URL);
  // Pixel art: sampled nearest, or every block edge smears when scaled.
  sheet.source.scaleMode = 'nearest';

  const cell = (row: number, col: number) =>
    new Texture({ source: sheet.source, frame: new Rectangle(col * CELL, row * CELL, CELL, CELL) });

  const material = (m: Material): MaterialTiles => {
    const r = MATERIAL_ROW[m];
    return {
      cube: cell(r, 0),
      slab: cell(r, 1),
      turf: cell(r + 1, 0),
      flat: cell(r + 1, 1),
      slope: { 0: cell(r, 3), 1: cell(r + 1, 3), 2: cell(r + 1, 2), 3: cell(r, 2) },
      stairs: { 0: cell(r, 4), 3: cell(r, 5) },
      block: { 0: cell(r + 2, 5), 1: cell(r + 1, 5), 2: cell(r + 2, 4), 3: cell(r + 1, 4) },
    };
  };

  const { texture: water, color: seaColor } = seaTile(sheet);
  return {
    materials: { grass: material('grass'), stone: material('stone'), dirt: material('dirt') },
    water,
    seaColor,
    post: cell(8, 1),
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
function seaTile(sheet: Texture): { texture: Texture; color: number } {
  const canvas = document.createElement('canvas');
  canvas.width = CELL;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas for the sea tile');
  // The filled water block: grass row 2, column 1.
  ctx.drawImage(sheet.source.resource as CanvasImageSource, CELL, 2 * CELL, CELL, CELL, 0, 0, CELL, CELL);

  const image = ctx.getImageData(0, 0, CELL, CELL);
  const px = image.data;

  // One colour for the whole surface, taken from the middle of the face. The
  // tile's rim pixels carry a different alpha — its outline — and kept, they
  // draw a grid over the whole sea.
  const mid = (16 * CELL + 16) * 4;
  const a = px[mid + 3] / 255;
  const r = Math.round(px[mid] * a + DEEP.r * (1 - a));
  const g = Math.round(px[mid + 1] * a + DEEP.g * (1 - a));
  const b = Math.round(px[mid + 2] * a + DEEP.b * (1 - a));

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = (y * CELL + x) * 4;
      const inside = inWaterTop(x, y);
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
 * The water slab's top diamond: rows 8-23, widening two pixels a row to full
 * width at rows 15-16, then narrowing again. Read off the tile.
 */
function inWaterTop(x: number, y: number): boolean {
  if (y < 8 || y > 23) return false;
  const half = y <= 15 ? 1.5 + 2 * (y - 8) : 15.5 - 2 * (y - 16);
  return Math.abs(x - 15.5) <= half;
}
