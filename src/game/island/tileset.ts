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
const UNITS = '/assets/units';

export const ISLAND_SHEETS = {
  flat: `${TERRAIN}/tilemap-flat.webp`,
  elevation: `${TERRAIN}/tilemap-elevation.webp`,
  water: `${TERRAIN}/water.webp`,
  foam: `${TERRAIN}/foam.webp`,
  trees: `${DECO}/trees.png`,
} as const;

/**
 * The living sheets: sheep and soldiers.
 *
 * These are ANIMATION sheets, not terrain — a grid of `cell`-sized frames, one
 * row per animation. The numbers below were read off the art (each sheet's
 * pixel size divided by its cell), never guessed, same rule as the rest of this
 * file.
 *
 * They are copied into `public/assets/units/` from `art-source/`, because
 * nothing under `art-source/` is served to the browser.
 */
export const UNIT_SHEETS = {
  sheepIdle: `${UNITS}/sheep-idle.webp`,
  sheepBounce: `${UNITS}/sheep-bounce.webp`,
  pawnBlue: `${UNITS}/pawn-blue.webp`,
  pawnRed: `${UNITS}/pawn-red.webp`,
  warriorBlue: `${UNITS}/warrior-blue.webp`,
  warriorRed: `${UNITS}/warrior-red.webp`,
  archerBlue: `${UNITS}/archer-blue.webp`,
  torchRed: `${UNITS}/torch-red.webp`,
} as const;

/**
 * Frame geometry per sheet: cell size, columns, and the row to play.
 *
 * `foot` is how far down the art reaches inside its cell, in pixels — the same
 * idea as `PROP_FOOT_PX`. A unit anchored at its box's bottom floats; anchored
 * at its foot it stands on the ground.
 */
const UNIT_GEOMETRY = {
  sheepIdle:   { cell: 128, cols: 8, row: 0, foot: 86 },
  sheepBounce: { cell: 128, cols: 6, row: 0, foot: 86 },
  pawnBlue:    { cell: 192, cols: 6, row: 0, foot: 128 },
  // The classic pack's red pawn: 1536x192, so eight frames rather than six,
  // and its feet reach y=135 — both read off the art, not copied from blue.
  pawnRed:     { cell: 192, cols: 8, row: 0, foot: 135 },
  warriorBlue: { cell: 192, cols: 6, row: 0, foot: 136 },
  warriorRed:  { cell: 192, cols: 6, row: 0, foot: 136 },
  archerBlue:  { cell: 192, cols: 8, row: 0, foot: 134 },
  torchRed:    { cell: 192, cols: 7, row: 0, foot: 133 },
} as const satisfies Record<keyof typeof UNIT_SHEETS, { cell: number; cols: number; row: number; foot: number }>;

export type UnitKind = keyof typeof UNIT_SHEETS;

/** An animated character: its frames, and the anchor that stands it up. */
export interface UnitSprite {
  frames: Texture[];
  anchorY: number;
}

/** The eighteen loose props: mushrooms, stones, bushes, bones, a scarecrow. */
export const PROP_COUNT = 18;
export const propUrl = (n: number) => `${DECO}/prop-${String(n).padStart(2, '0')}.webp`;

/**
 * The classic pack's bushes: waist-high scenery a rabbit cannot walk through.
 *
 * Eight frames of 128 in a 1024x128 strip, sitting at y=79 — measured, like
 * every other number in this file. They are the reason `fadeTo` exists in
 * `blocking.ts`: tall enough to hide the player, too small to be worth losing
 * a cell to invisibly, so they block AND go see-through.
 */
export const BUSH_COUNT = 4;
export const bushUrl = (n: number) => `${DECO}/bushes/bushe${n}.webp`;
const BUSH_FRAME = 128;
const BUSH_FRAMES = 8;
const BUSH_FOOT_PX = 79;

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
/**
 * Foam is re-cut for the diamond by `tools/gen_iso_sheets.py`.
 *
 * The pack ships it as eight 192px frames around a 64px tile — three tiles
 * across, drawn for a top-down grid where the neighbours overdraw most of the
 * ring. The baked strip is eight TILE-sized frames with the surf already
 * projected onto the cell's diamond, so a shore cell's sprite is its own cell
 * plus a small ragged margin instead of a three-tile halo.
 */
const FOAM_FRAME = TILE;
const FOAM_FRAMES = 8;

/**
 * The tree sheet: four kinds of tree, each swaying over eight frames and
 * followed by the stump it leaves when felled.
 *
 * `trees.png` is an Aseprite atlas whose companion `trees.json` describes it,
 * but the pack is perfectly regular — 36 frames of 121x244 on a 10-wide grid,
 * every one trimmed by the same margin — so it slices like any other sheet
 * instead of pulling in an atlas parser. The numbers below were read out of
 * that JSON; re-read them there if the art is re-exported.
 *
 * Frames are TRIMMED: the art is a 121x244 window cut out of a 192x256 cel at
 * offset (37,5). Only the window is on the sheet, so a frame's own height is
 * 244 and the feet below are measured against that, not against 256.
 */
const TREE_FRAME = { w: 121, h: 244 } as const;
const TREE_SHEET_COLS = 10;
const TREE_PAD = 2;
const TREE_PITCH = { x: 123, y: 246 } as const;
/** Eight sway frames, then one stump, four times over. */
const TREE_SWAY_FRAMES = 8;
const TREE_VARIANT_STRIDE = TREE_SWAY_FRAMES + 1;
export const TREE_VARIANT_COUNT = 4;

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
/**
 * Where each tree and stump actually meets the ground, in pixels down its own
 * 244-tall frame — the lowest opaque row, measured per variant off the sheet.
 *
 * One shared number would not do here: these four trees are not one tree in
 * four palettes. The second fills its frame to the last row while the fourth
 * stops 17px short, so a single anchor would plant one of them and leave the
 * other hovering. Each stump is measured to its own tree's ground line.
 */
const TREE_FOOT_PX = [236, 244, 229, 227];
const STUMP_FOOT_PX = [235, 240, 227, 223];

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
  /** Four trees, eight sway frames each, every one with its own anchor. */
  trees: UnitSprite[];
  /** The stump each of those trees leaves, in the same order. */
  stumps: FootSprite[];
  /** Four rocks, eight bob frames each. */
  seaRocks: Texture[][];
  /** Sheep and soldiers, each a strip of frames with a standing anchor. */
  units: Record<UnitKind, UnitSprite>;
  /** Four bushes, eight sway frames each, sharing one standing anchor. */
  bushes: UnitSprite[];
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
    ...Array.from({ length: BUSH_COUNT }, (_, i) => bushUrl(i + 1)),
    ...Object.values(UNIT_SHEETS),
  ];
  const loaded = await Assets.load<Texture>(urls);

  const flatSheet = loaded[ISLAND_SHEETS.flat];
  const flatCells = sliceGrid(flatSheet, TILE, TILE, 10, 4);
  const blobSet = (originCol: number) =>
    flatCells.map((line) => line.slice(originCol, originCol + 4));

  // The tree atlas is padded: frames sit on a 123x246 pitch inset by 2px, so
  // it needs its own cut rather than the flush grid the terrain sheets use.
  const treeSheet = loaded[ISLAND_SHEETS.trees];
  const treeFrame = (i: number) =>
    new Texture({
      source: treeSheet.source,
      frame: new Rectangle(
        TREE_PAD + (i % TREE_SHEET_COLS) * TREE_PITCH.x,
        TREE_PAD + Math.floor(i / TREE_SHEET_COLS) * TREE_PITCH.y,
        TREE_FRAME.w,
        TREE_FRAME.h,
      ),
    });

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
    trees: Array.from({ length: TREE_VARIANT_COUNT }, (_, v) => ({
      frames: Array.from({ length: TREE_SWAY_FRAMES }, (_, i) =>
        treeFrame(v * TREE_VARIANT_STRIDE + i),
      ),
      anchorY: TREE_FOOT_PX[v] / TREE_FRAME.h,
    })),
    stumps: Array.from({ length: TREE_VARIANT_COUNT }, (_, v) => ({
      texture: treeFrame(v * TREE_VARIANT_STRIDE + TREE_SWAY_FRAMES),
      anchorY: STUMP_FOOT_PX[v] / TREE_FRAME.h,
    })),
    seaRocks: Array.from({ length: SEA_ROCK_COUNT }, (_, i) =>
      sliceStrip(loaded[seaRockUrl(i + 1)], SEA_ROCK_FRAME, SEA_ROCK_FRAMES),
    ),
    bushes: Array.from({ length: BUSH_COUNT }, (_, i) => ({
      frames: sliceStrip(loaded[bushUrl(i + 1)], BUSH_FRAME, BUSH_FRAMES),
      anchorY: BUSH_FOOT_PX / BUSH_FRAME,
    })),
    units: Object.fromEntries(
      (Object.keys(UNIT_SHEETS) as UnitKind[]).map((kind) => {
        const g = UNIT_GEOMETRY[kind];
        const sheet = loaded[UNIT_SHEETS[kind]];
        const frames = Array.from(
          { length: g.cols },
          (_, i) =>
            new Texture({
              source: sheet.source,
              frame: new Rectangle(i * g.cell, g.row * g.cell, g.cell, g.cell),
            }),
        );
        return [kind, { frames, anchorY: g.foot / g.cell }];
      }),
    ) as Record<UnitKind, UnitSprite>,
  };
}
