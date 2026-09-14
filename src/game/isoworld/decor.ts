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
export const DECOR_MANIFEST_URL = `${DECOR_URL}/manifest.json?v=1`;

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
 * How often each piece is planted, relative to the others. Tufts are the
 * grass of the place; the hills are landmarks, one or two an island.
 */
export const DECOR_WEIGHTS: Readonly<Record<string, number>> = {
  'tuft-small': 5,
  'tuft-left': 4,
  'tuft-right': 4,
  'meadow-tuft': 3,
  'flowers-small': 3,
  'flowers-patch': 3,
  'bush-small': 3,
  'flower-tall': 2,
  'flower-leafy': 2,
  'hill-big': 1,
  'hill-wide': 1,
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
      const texture = await Assets.load<Texture>(`${DECOR_URL}/${entry.file}?v=1`);
      texture.source.scaleMode = 'linear';
      return { ...entry, texture };
    }),
  );
  return { pieces, byName: new Map(pieces.map((p) => [p.name, p])) };
}
