/**
 * A repainted grass palette, on a real generated island.
 *
 * `palette-2` is the shelf immediately above sea level, and it is the one
 * palette whose job is comparative: tier 1 and tier 2 sit side by side over
 * most of a coastline, and the ONLY thing that separates them where no cliff
 * face is visible is the shift in green. A repainted sheet can therefore be
 * perfectly pretty in isolation and still fail, by landing too close to the
 * palette below it — which is invisible on a 9x6 sheet and obvious on a
 * shoreline. So the test is an island, not a swatch.
 *
 * `source` swaps the SAME tier between the working PNG and the shipped webp
 * against an unchanged seed, so the two islands differ in nothing but the
 * pixels under review. Flip it back and forth on `Shoreline` and watch the
 * tier-2 outline: if it holds when the cliff is edge-on, the repaint works.
 *
 * The PNG is deliberate, not an oversight — Aseprite does not write webp, so
 * the sheet stays PNG while it is being worked. Bake it to webp (and bump
 * `TERRAIN_REV` in `tileset.ts`, since it overwrites a cached URL) only once
 * the colour is settled.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Assets, Rectangle, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IsoIslandView,
  loadIslandTileset,
  TILE,
  type IslandTileset,
} from '@/game/island';

/**
 * The backdrop, standing in for the water shader.
 *
 * The tile sea is off here, so this flat colour is all there is behind the
 * island — which is what the game shows too, give or take the shader's
 * movement. It matters to a palette story: a green is judged against what
 * surrounds it, and judging one over a checkerboard of sea tiles would be
 * judging it against a backdrop the player never sees.
 */
const SEA = '#0d8296';

const WIDTH = 960;
const HEIGHT = 540;

/** The tier this story repaints. 1-based, as the tiers are everywhere else. */
const TIER = 2;

/**
 * The two cuts of the same sheet.
 *
 * The webp carries `tileset.ts`'s cache-busting `?v=`, because it is the file
 * the game actually ships and browsers have it cached under that URL. The PNG
 * is a working file that has never been served, so it needs no revision — but
 * it DOES need to miss Pixi's own cache between edits, which is what
 * `reload` below is for.
 */
const SOURCES = {
  png: '/assets/terrain/palette-2.png',
  webp: '/assets/terrain/palette-2.webp?v=2',
} as const;
type Source = keyof typeof SOURCES;

/**
 * The pack's own animated surf, sheared onto the diamond.
 *
 * NOT `/assets/terrain/foam.webp`, which the game loads today: that file is
 * 200 bytes of a single colour (#C6F0DB) repeated over eight identical
 * frames — a flat lozenge that cannot animate, because there is nothing to
 * animate between. This sheet is the real one `tools/gen_iso_sheets.py`
 * bakes from `Water Foam.png`: eight distinct frames, two colours, ragged.
 */
const PACK_FOAM = '/assets/terrain-iso/pack-foam.webp';
/**
 * Sixteen frames on a 128px pitch — twice the tile, to carry the overspill.
 *
 * Sixteen, not eight: `FOAM_PACK_FRAMES` in the generator. Cutting it as
 * eight 256px frames also "works" — the strip divides evenly and every frame
 * differs — but each one then holds two surfs side by side and the animation
 * runs at half speed over doubled art.
 */
const PACK_FOAM_FRAMES = 16;
const PACK_FOAM_FRAME = 128;

// The surf is baked for a 44x24 diamond (`DIAMOND_W`/`DIAMOND_H` in
// `tools/gen_iso_sheets.py`), not this story's 64x32 — hence the `foamScale`
// default below, and why anything under ~1.45 leaves each shore cell's surf
// sitting in the middle of its cell as a separate lozenge.

/**
 * The palette sheet's grid — the same numbers `tileset.ts` slices with, which
 * are private to that module. Repeated here rather than exported because this
 * story is precisely the place where a sheet that does NOT match them should
 * be caught: if a repaint moves the tiles, the island below breaks visibly
 * instead of the constants quietly following the art.
 *
 * 9x6 cells of 64px. Columns 0-3 are the shoreline set with surf painted in;
 * the island animates its own foam, so it takes columns 5-8, rows 0-3.
 */
const PALETTE_COLS = 9;
const PALETTE_ROWS = 6;
const PALETTE_GRASS_ORIGIN = 5;

/** Cut a sheet into `cols x rows` cells of `TILE`, top-left first. */
function sliceGrid(base: Texture, cols: number, rows: number): Texture[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from(
      { length: cols },
      (_, col) =>
        new Texture({
          source: base.source,
          frame: new Rectangle(col * TILE, row * TILE, TILE, TILE),
        }),
    ),
  );
}

/**
 * Load one palette sheet and cut the 4x4 blob set the island draws from.
 *
 * `Assets.unload` first: Pixi caches by URL and a story would otherwise keep
 * showing the sheet as it was when Storybook started, which on a file being
 * actively repainted is the one failure mode that looks like "my edit did
 * nothing" rather than like a cache.
 */
async function loadBlobSet(url: string): Promise<Texture[][]> {
  await Assets.unload(url).catch(() => {});
  const sheet = await Assets.load<Texture>(url);
  return sliceGrid(sheet, PALETTE_COLS, PALETTE_ROWS)
    .slice(0, 4)
    .map((line) => line.slice(PALETTE_GRASS_ORIGIN, PALETTE_GRASS_ORIGIN + 4));
}

/**
 * Cut the pack foam strip into its eight frames.
 *
 * Each frame is 128px square with the surf centred in it, so it is placed by
 * its centre like any other flat sprite and its overhang falls where the
 * generator meant it to: a few pixels past the cell on every side, which is
 * what joins neighbouring shore cells into one coastline instead of a quilt
 * of separate lozenges.
 */
async function loadPackFoam(): Promise<Texture[]> {
  const sheet = await Assets.load<Texture>(PACK_FOAM);
  return Array.from(
    { length: PACK_FOAM_FRAMES },
    (_, i) =>
      new Texture({
        source: sheet.source,
        frame: new Rectangle(i * PACK_FOAM_FRAME, 0, PACK_FOAM_FRAME, PACK_FOAM_FRAME),
      }),
  );
}

interface Args {
  source: Source;
  seed: string;
  width: number;
  height: number;
  tiers: number;
  land: number;
  rise: number;
  raggedness: number;
  deco: boolean;
  grass: boolean;
  foam: boolean;
  groundScale: number;
  foamScale: number;
  tileZ: number;
}

function Scene(args: Args) {
  const { source, seed, width, height, tiers, land, rise, raggedness, deco, grass, foam } = args;
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        const base = await loadIslandTileset();
        const blobs = await loadBlobSet(SOURCES[source]);
        // Swap ONE tier and leave the rest of the tileset untouched: the
        // neighbours are the reference the repaint is judged against, so they
        // have to stay the shipped art.
        const tierGrass = base.tierGrass.map((set, i) => (i === TIER - 1 ? blobs : set));
        // The shipped `foam.webp` is a flat one-colour lozenge; swap in the
        // pack's real animated surf so the coast moves.
        tileset = { ...base, tierGrass, foam: await loadPackFoam() };
      }}
      setup={(stage, app) => {
        if (!tileset) return;
        const map = generateIsland({ seed, width, height, tiers, land, rise, raggedness });
        const island = new IsoIslandView({
          map,
          tileset,
          ground: 'tiered',
          deco,
          grass,
          // No tile sea: the game draws its own water as a shader behind the
          // island (see `Water.stories.tsx`), and a checkerboard of lighter
          // diamonds is the wrong backdrop for judging a green.
          //
          // Foam stays, though, and is not decoration here. It is drawn from
          // its own 8-frame sheet ON the water plane, and it is what the
          // island's edge actually looks like in the game — a coastline read
          // against bare background is a harder, and falser, test of a shore
          // tile than one read against its own surf.
          sea: false,
          foam,
          groundScale: args.groundScale,
          foamScale: args.foamScale,
          metrics: { w: 64, h: 32, z: args.tileZ },
        });
        stage.addChild(island.view);

        // Fit rather than scroll — same camera as the other island stories, so
        // a palette judged here is judged at the scale the game draws it.
        const scale = Math.min(WIDTH / island.width, HEIGHT / island.height);
        island.view.scale.set(scale);
        island.view.position.set(
          (WIDTH - island.width * scale) / 2,
          (HEIGHT - island.height * scale) / 2,
        );

        const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
        app.ticker.add(ticker);
        return () => {
          app.ticker.remove(ticker);
          island.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Palette 2 (PNG)',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    source: 'png',
    seed: 'harbour-9',
    width: 24,
    height: 24,
    tiers: 3,
    land: 0.46,
    rise: 0.55,
    raggedness: 0.4,
    deco: true,
    grass: true,
    foam: true,
    // The settled look, and what `IsoIslandView` now derives by default for
    // a 64px cell — spelled out here so the sliders start where the game is.
    groundScale: 1.52,
    // Well past 64/44 (~1.45), which only LANDS the surf on its cell. The
    // ground is grown to cover that same cell, so at 1.45 it hides all but a
    // 3px sliver of rim; the surf reads as surf only once it clears the grass
    // by ~10px a side, which the 48px painted frame reaches at about 1.8.
    foamScale: 1.8,
    tileZ: 26,
  },
  argTypes: {
    source: {
      control: 'inline-radio',
      options: ['png', 'webp'],
      description: 'png = the file being repainted, webp = what ships today.',
    },
    seed: { control: 'text' },
    width: { control: { type: 'range', min: 8, max: 48, step: 1 } },
    height: { control: { type: 'range', min: 8, max: 48, step: 1 } },
    tiers: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    land: { control: { type: 'range', min: 0.15, max: 0.85, step: 0.01 } },
    rise: { control: { type: 'range', min: 0.1, max: 0.9, step: 0.01 } },
    raggedness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    groundScale: {
      control: { type: 'range', min: 1, max: 2, step: 0.01 },
      description:
        'Tile size as a multiple of its own pixels. 1 is native and leaves ' +
        'gaps (the art paints ~42 of every 64px); ~1.52 closes them.',
    },
    foamScale: {
      control: { type: 'range', min: 0.5, max: 2.5, step: 0.01 },
      description:
        'Surf size. ~1.45 lands the 44x24-baked sheet on this 64x32 cell, but ' +
        'the grown ground then covers it; ~1.8 shows a 10px rim. Below 1.45 ' +
        'each cell paints a separate lozenge.',
    },
    tileZ: { control: { type: 'range', min: 0, max: 64, step: 2 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The repainted sheet on the standard island. Flip `source` to compare. */
export const Default: Story = {};

/**
 * The gap, at native size — and the reason a palette cannot be judged yet.
 *
 * `groundScale` 1 is the art exactly as the pack draws it, and the island
 * comes out as a checkerboard: every tile paints about 42 of its 64px box, so
 * once the boxes are projected into diamonds their transparent margins meet
 * and the background shows through every seam. Nothing here is a colour
 * problem, which is worth seeing before blaming a repaint for it.
 */
export const NativeSize: Story = { args: { groundScale: 1, deco: false, grass: false } };

/**
 * The same island with the tiles grown to cover their cells.
 *
 * 1.52 is 64/42 — measured off the sheet's own alpha bounds, not guessed, and
 * the point where a typical tile's painted area spans the whole diamond. The
 * surface closes. Look at what it costs before accepting it: the art is
 * resampled off its own pixel grid, so edges that were crisp go soft and the
 * pack's 1px outlines thicken unevenly. Drag the slider between the two and
 * the trade is the whole decision.
 */
export const Covered: Story = { args: { groundScale: 1.52, deco: false, grass: false } };

/**
 * Three tiers, no trees and no tufts: the bare terraces.
 *
 * Deco hides turf, and turf is the whole subject — a tree canopy covering the
 * middle of a shelf is exactly where a too-dark palette stops being visible.
 */
export const BareTerraces: Story = { args: { deco: false, grass: false } };

/**
 * The hard case: `tileZ` at 0 flattens the island, so tier 2 has no cliff
 * face and no cast volume to give it away. All that separates it from the
 * ground at sea level is its colour. If the shelf still reads as a shelf
 * here, the repaint carries its own weight; if the outline dissolves, the
 * green is too close to palette 1 no matter how good it looks alone.
 */
export const Flat: Story = { args: { tileZ: 0, deco: false, grass: false } };

/**
 * A long, ragged coastline at low land share — as much tier-1/tier-2 border
 * as the generator will make, which is the boundary this palette exists to
 * draw. The more of it on screen, the smaller a mismatch has to be to show.
 *
 * Foam on, at the covering scale: the shore as the game actually draws it.
 */
export const Shoreline: Story = {
  args: {
    seed: 'reef-3',
    land: 0.34,
    raggedness: 0.72,
    width: 30,
    height: 30,
    deco: false,
  },
};

/**
 * The surf at its own size against a covered island, side by side.
 *
 * The two sheets are cut to different measures and each needs its own factor:
 * `groundScale` 1.52 to cover the cell, `foamScale` ~1.45 to land on it. This
 * is the story for checking they agree — the surf should meet the grass at
 * the shoreline, with neither a gap of background between them nor a band of
 * foam climbing onto the turf.
 */
export const FoamFit: Story = {
  args: {
    seed: 'reef-3',
    land: 0.34,
    raggedness: 0.72,
    width: 30,
    height: 30,
    deco: false,
    grass: false,
  },
};

/**
 * The same coast with the surf switched off.
 *
 * Worth having beside `Shoreline` because foam is generous: it spills a tile
 * past the land on every side and softens whatever it covers, which can hide
 * a shore tile whose edge does not resolve. If the outline holds here, it
 * holds for the right reason rather than because the surf papered over it.
 */
export const ShorelineNoFoam: Story = {
  args: { ...Shoreline.args, foam: false },
};

/**
 * Close enough that individual cells are legible: the 16 blob tiles of the
 * set, in situ. Corners and single-width spurs are where a repaint that
 * shifted a tile by a pixel shows as a seam rather than as a colour.
 */
export const CloseUp: Story = { args: { width: 12, height: 12, tiers: 3 } };

/** Every tier in play, so palette 2 is judged against 1 below and 3 above. */
export const Mountain: Story = {
  args: { tiers: 5, width: 34, height: 34, rise: 0.62, land: 0.55 },
};
