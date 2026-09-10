/**
 * Where the island's pixels come from.
 *
 * Every number in this file was read off the sheets themselves (see
 * `tools/consolidate_tiny_swords.py`, whose `manifest.json` records each
 * image's size and alpha bounds) rather than guessed. The two that matter:
 *
 *   tilemap-flat        640x256  — grass blob at columns 0-3, sand at 5-8,
 *                                  loose tufts at column 4 and 9
 *   tilemap-elevation   256x512  — 4 columns; surface rows 0/1/2 and 4,
 *                                  cliff faces on rows 3/5, stacking face row 7
 *   tilemap-color-1..5  576x384  — the same grass in five palettes, one per
 *                                  terrain tier; blob set at columns 5-8
 *
 * Loading is a single pass over a handful of sheets and slices them into
 * sub-textures that all share one GPU source, so the whole island draws from
 * about a dozen uploads no matter how many cells it has.
 */
import { Assets, Rectangle, Texture } from 'pixi.js';

/** Every terrain sheet in this pack is cut to 64px cells. */
export const TILE = 64;

/**
 * The sheets the island draws from. They are the CONSOLIDATED cut of the two
 * Tiny Swords packs, not the packs themselves — the raw art lives outside
 * `public/` in `art-source/tiny-swords/` (with the manifest recording every
 * sheet's size and alpha bounds) so the browser is only ever served the
 * three dozen files the island actually loads.
 */
const TERRAIN = '/assets/terrain';
const DECO = '/assets/deco';

export const ISLAND_SHEETS = {
  flat: `${TERRAIN}/tilemap-flat.webp`,
  elevation: `${TERRAIN}/tilemap-elevation.webp`,
  water: `${TERRAIN}/water.webp`,
  foam: `${TERRAIN}/foam.webp`,
  tree: `${DECO}/tree.webp`,
} as const;

/** The eighteen loose props: mushrooms, stones, bushes, bones, a scarecrow. */
export const PROP_COUNT = 18;
export const propUrl = (n: number) => `${DECO}/prop-${String(n).padStart(2, '0')}.webp`;

/** Four little rocks that bob in open water. */
export const SEA_ROCK_COUNT = 4;
export const seaRockUrl = (n: number) => `${TERRAIN}/sea-rock-0${n}.webp`;

/**
 * The free pack's five grass palettes — the same tiles painted five ways.
 *
 * This is where a terraced island gets its depth. Sampling the pack's own key
 * art shows two of them in use at once: the ground at sea level is palette 1
 * (#9bb94e), the shelf above it palette 2 (#85b156). Without that shift a
 * plateau is only legible where its cliff face happens to be visible, and the
 * rest of its outline dissolves into the ground it stands on.
 *
 * The rock is identical in both packs, so mixing the free pack's grass with
 * Update 010's cliffs costs nothing.
 */
export const TIER_PALETTE_COUNT = 5;
export const tierPaletteUrl = (n: number) => `${TERRAIN}/palette-${n}.webp`;

/**
 * The palette sheets are 9x6. Columns 0-3 are the shoreline set, whose white
 * surf is painted INTO the tiles; this island animates its own foam, so it
 * takes columns 5-8 instead — the same blob set with a plain grass edge.
 */
const PALETTE_GRASS_ORIGIN = 5;
const PALETTE_COLS = 9;
const PALETTE_ROWS = 6;

/** Column of the grass and sand blob sets inside the flat sheet. */
const FLAT_ORIGIN = { grass: 0, sand: 5 } as const;
export type GroundKind = keyof typeof FLAT_ORIGIN;

/** Foam is eight frames of 192x192, each centred on the 64px tile it edges. */
const FOAM_FRAME = 192;
const FOAM_FRAMES = 8;

/** The tree sways over six frames of 192x192, then row 2 opens with its stump. */
const TREE_FRAME = 192;
const TREE_SWAY_FRAMES = 6;
const TREE_COLS = 4;
const STUMP_CELL = { col: 0, row: 2 };

/** Sea rocks bob over eight frames of 128x128. */
const SEA_ROCK_FRAME = 128;
const SEA_ROCK_FRAMES = 8;

/**
 * How far down each prop's art reaches, in pixels from the top of its box.
 *
 * Read from the alpha bounds of the eighteen prop images. They are padded by
 * different amounts — a mushroom stops at y=43 in a 64px box, a signpost at
 * y=104 in a 128px one — so a shared 0.5 anchor would leave some of them
 * floating and bury others. Re-measure with the manifest if the art changes.
 */
const PROP_FOOT_PX = [43, 47, 49, 37, 40, 49, 43, 49, 53, 46, 50, 51, 55, 47, 44, 104, 105, 169];
const TREE_FOOT_PX = 178;
const STUMP_FOOT_PX = 176;

export interface FootSprite {
  texture: Texture;
  /** Anchor Y that puts the art's base, not its box's base, on the ground. */
  anchorY: number;
}

export interface IslandTileset {
  /** One 64px tile of open sea, meant to be tiled. */
  water: Texture;
  /** Shoreline froth, eight frames that every shore tile plays in step. */
  foam: Texture[];
  /** Flat ground blob sets, indexed `[row][col]` — see `blobRow` / `blobCol`. */
  flat: Record<GroundKind, Texture[][]>;
  /** One grass blob set per palette, so each terrain tier can have its own. */
  tierGrass: Texture[][][];
  /** The elevation sheet, indexed `[row][col]`: 8 rows, 4 columns. */
  elevation: Texture[][];
  props: FootSprite[];
  /** Six sway frames sharing one anchor. */
  tree: { frames: Texture[]; anchorY: number };
  stump: FootSprite;
  /** Four rocks, eight bob frames each. */
  seaRocks: Texture[][];
}

/** Cut a texture into `cols x rows` cells of `w x h`, row-major. */
function sliceGrid(base: Texture, w: number, h: number, cols: number, rows: number): Texture[][] {
  const out: Texture[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: Texture[] = [];
    for (let col = 0; col < cols; col++) {
      line.push(new Texture({ source: base.source, frame: new Rectangle(col * w, row * h, w, h) }));
    }
    out.push(line);
  }
  return out;
}

/** Cut a horizontal strip of `count` frames. */
function sliceStrip(base: Texture, size: number, count: number, height = size): Texture[] {
  return Array.from(
    { length: count },
    (_, i) => new Texture({ source: base.source, frame: new Rectangle(i * size, 0, size, height) }),
  );
}

/**
 * Load and slice everything the island draws.
 *
 * Safe to call more than once — Pixi's `Assets` caches by URL, so a second
 * island (or a story remounting) re-slices cheaply against textures already on
 * the GPU.
 */
export async function loadIslandTileset(): Promise<IslandTileset> {
  const urls = [
    ...Object.values(ISLAND_SHEETS),
    ...Array.from({ length: PROP_COUNT }, (_, i) => propUrl(i + 1)),
    ...Array.from({ length: SEA_ROCK_COUNT }, (_, i) => seaRockUrl(i + 1)),
    ...Array.from({ length: TIER_PALETTE_COUNT }, (_, i) => tierPaletteUrl(i + 1)),
  ];
  const loaded = await Assets.load<Texture>(urls);

  const flatSheet = loaded[ISLAND_SHEETS.flat];
  const flatCells = sliceGrid(flatSheet, TILE, TILE, 10, 4);
  const blobSet = (originCol: number) =>
    flatCells.map((line) => line.slice(originCol, originCol + 4));

  const treeSheet = loaded[ISLAND_SHEETS.tree];
  const treeCells = sliceGrid(treeSheet, TREE_FRAME, TREE_FRAME, TREE_COLS, 3);

  return {
    water: loaded[ISLAND_SHEETS.water],
    foam: sliceStrip(loaded[ISLAND_SHEETS.foam], FOAM_FRAME, FOAM_FRAMES),
    flat: {
      grass: blobSet(FLAT_ORIGIN.grass),
      sand: blobSet(FLAT_ORIGIN.sand),
    },
    tierGrass: Array.from({ length: TIER_PALETTE_COUNT }, (_, i) => {
      const cells = sliceGrid(loaded[tierPaletteUrl(i + 1)], TILE, TILE, PALETTE_COLS, PALETTE_ROWS);
      return cells
        .slice(0, 4)
        .map((line) => line.slice(PALETTE_GRASS_ORIGIN, PALETTE_GRASS_ORIGIN + 4));
    }),
    elevation: sliceGrid(loaded[ISLAND_SHEETS.elevation], TILE, TILE, 4, 8),
    props: Array.from({ length: PROP_COUNT }, (_, i) => {
      const texture = loaded[propUrl(i + 1)];
      return { texture, anchorY: PROP_FOOT_PX[i] / texture.height };
    }),
    tree: {
      frames: Array.from(
        { length: TREE_SWAY_FRAMES },
        (_, i) => treeCells[Math.floor(i / TREE_COLS)][i % TREE_COLS],
      ),
      anchorY: TREE_FOOT_PX / TREE_FRAME,
    },
    stump: {
      texture: treeCells[STUMP_CELL.row][STUMP_CELL.col],
      anchorY: STUMP_FOOT_PX / TREE_FRAME,
    },
    seaRocks: Array.from({ length: SEA_ROCK_COUNT }, (_, i) =>
      sliceStrip(loaded[seaRockUrl(i + 1)], SEA_ROCK_FRAME, SEA_ROCK_FRAMES),
    ),
  };
}
