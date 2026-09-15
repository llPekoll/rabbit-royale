/**
 * The hand-drawn decorations of the smooth sheet: plants, tufts, hills.
 *
 * `tools/split_decor_elements.py` cuts them out of the artist's scatter sheet
 * into `public/assets/world/decor/`, one PNG each, and writes a manifest:
 * where each piece stands on the ground (its anchor) and how many cells its
 * base covers. Every piece is drawn at one scale — a one-cell base is about
 * `SHEET_CELL` pixels wide — so one factor fits them all to the tileset.
 */
import { Assets, Texture } from 'pixi.js';

export const DECOR_URL = '/assets/world/decor';
export const DECOR_MANIFEST_URL = `${DECOR_URL}/manifest.json?v=6`;

/** How wide a one-cell base is drawn on the artist's sheet, in pixels. */
export const SHEET_CELL = 130;

export interface DecorManifestEntry {
  name: string;
  file: string;
  width: number;
  height: number;
  /** The pixel that stands on the cell's bottom corner. */
  anchor: [number, number];
  /** Width of the base, in sheet pixels. */
  base: number;
  /** The base covers `cells` x `cells` cells. */
  cells: number;
}

export interface DecorPiece extends DecorManifestEntry {
  texture: Texture;
}

export interface DecorSet {
  pieces: readonly DecorPiece[];
  byName: ReadonlyMap<string, DecorPiece>;
}

/**
 * How often each piece is planted, relative to the others, and whether it
 * is BARE — a stem or a tuft that can grow straight out of the turf, and
 * only sometimes on a patch of darker grass. The rest — hills, bushes, the
 * flower beds — always stand on a patch the size of their footprint: the
 * sheet draws no ground under them, and the tileset's patch is the base
 * that lines up with the grid. Tufts are the grass of the place; the hills
 * are landmarks, one or two an island.
 */
export const DECOR_WEIGHTS: Readonly<Record<string, { weight: number; bare?: boolean }>> = {
  'tuft-small': { weight: 5, bare: true },
  'tuft-left': { weight: 4, bare: true },
  'tuft-right': { weight: 4, bare: true },
  'meadow-tuft': { weight: 3, bare: true },
  'flowers-small': { weight: 3 },
  'flowers-patch': { weight: 3 },
  'bush-small': { weight: 3 },
  'bush-round': { weight: 3 },
  'flower-tall': { weight: 2, bare: true },
  'flower-leafy': { weight: 2, bare: true },
  'hill-big': { weight: 1 },
  'hill-wide': { weight: 1 },
};

let cached: Promise<DecorSet> | null = null;

export function loadDecor(): Promise<DecorSet> {
  cached ??= load().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

async function load(): Promise<DecorSet> {
  const response = await fetch(DECOR_MANIFEST_URL);
  if (!response.ok) throw new Error(`decor manifest: ${response.status}`);
  const entries = (await response.json()) as DecorManifestEntry[];
  const pieces = await Promise.all(
    entries.map(async (entry) => {
      const texture = await Assets.load<Texture>(`${DECOR_URL}/${entry.file}?v=6`);
      texture.source.scaleMode = 'linear';
      return { ...entry, texture };
    }),
  );
  return { pieces, byName: new Map(pieces.map((p) => [p.name, p])) };
}
