/**
 * The two blob sets on one island: which columns should draw the shore.
 *
 * The palette sheets are 9x6 and carry the SAME grass blob set twice. Columns
 * 0-3 have the surf painted into the tile; columns 5-8 have a plain rock edge.
 * `tileset.ts` takes 5-8 and the island animates its own foam over it — the
 * reasoning being that a painted surf plus a moving one is two coastlines.
 *
 * This story exists to check that reasoning against pixels rather than against
 * the comment. Both panels are the SAME seed, the same tier, the same animated
 * foam: the only difference is which four columns the tier's blob set is cut
 * from, so whatever changes between them is that choice and nothing else.
 *
 * Read the rim where land meets water. The question is whether 0-3's painted
 * white reinforces the moving surf or fights it — and whether 5-8's dark rock
 * edge is the hard line it looks like on the sheet.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Assets, Container, Graphics, Rectangle, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IsoIslandView,
  loadIslandTileset,
  TILE,
  type IslandTileset,
} from '@/game/island';

/** The flat sea the game shows behind the island, standing in for the shader. */
const SEA = '#0d8296';

/** One panel. Two of them sit side by side in the stage. */
const PANEL_W = 470;
const PANEL_H = 540;

/** The tier whose blob set gets swapped. 1-based, and 1 is the sea-level shelf. */
const TIER = 1;

/**
 * The SHIPPED sheet, now that the repaint is baked.
 *
 * It carries `tileset.ts`'s `TERRAIN_REV`, because that is the URL the game
 * actually serves and the browser has the old pixels cached under the previous
 * one. While a repaint is still in progress, point this at the `.png` working
 * file instead — Aseprite does not write webp, and `loadBlobSets` unloads
 * before loading so each look picks up the latest save.
 */
const SHEET = '/assets/terrain/palette-1.webp?v=5';

const PACK_FOAM = '/assets/terrain-iso/pack-foam.webp';
const PACK_FOAM_FRAME = 128;
const PACK_FOAM_FRAMES = 8;

const PALETTE_COLS = 9;
const PALETTE_ROWS = 6;

/** The two candidate origins, named for what they carry on the tile's edge. */
const ORIGINS = { surf: 0, rock: 5 } as const;
type Edge = keyof typeof ORIGINS;

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

/** Cut the 4x4 blob set starting at `origin`, which is the whole experiment. */
/**
 * Load the sheet once, fresh, and hand back both cuts of it.
 *
 * One load for the pair, deliberately: `Assets.unload` is what makes a repaint
 * visible, and calling it per panel would have the second panel drop the sheet
 * the first had just loaded. Both cuts share one GPU source, which is also
 * what guarantees the two panels differ by their COLUMNS and nothing else.
 */
async function loadBlobSets(): Promise<Record<Edge, Texture[][]>> {
  // Pixi caches by URL, and on a file being actively repainted that cache is
  // the one failure mode that looks like "my edit did nothing".
  await Assets.unload(SHEET).catch(() => {});
  const sheet = await Assets.load<Texture>(SHEET);
  const cells = sliceGrid(sheet, PALETTE_COLS, PALETTE_ROWS).slice(0, 4);
  const cut = (origin: number) => cells.map((line) => line.slice(origin, origin + 4));
  return { surf: cut(ORIGINS.surf), rock: cut(ORIGINS.rock) };
}

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
  /** Magnification. 1 fits the whole island in the panel; 6 reads pixels. */
  zoom: number;
  /** Which point of the island the zoom centres on, each 0..1 of its box. */
  focusX: number;
  focusY: number;
}

/**
 * Build one island into `stage` at `offsetX`, cut from `edge`'s columns.
 *
 * Everything but `edge` is shared with the other panel, which is what makes
 * the pair a comparison rather than two islands.
 */
function buildPanel(
  stage: import('pixi.js').Container,
  app: { ticker: { add: (f: (t: { deltaMS: number }) => void) => void; remove: (f: (t: { deltaMS: number }) => void) => void } },
  base: IslandTileset,
  blobs: Texture[][],
  args: Args,
  offsetX: number,
) {
  const tierGrass = base.tierGrass.map((set, i) => (i === TIER - 1 ? blobs : set));
  const tileset: IslandTileset = { ...base, tierGrass, foam: base.foam };

  // Each panel gets a clipped window of its own. Zoomed in, an island is wider
  // than its half of the stage and would otherwise spill across the divider
  // into its neighbour — which on a side-by-side comparison means reading one
  // set's rim and believing it is the other's.
  const frame = new Container();
  frame.x = offsetX;
  frame.boundsArea = new Rectangle(0, 0, PANEL_W, PANEL_H);
  const clip = new Graphics().rect(0, 0, PANEL_W, PANEL_H).fill(0xffffff);
  frame.addChild(clip);
  frame.mask = clip;
  stage.addChild(frame);

  const map = generateIsland({
    seed: args.seed,
    width: args.width,
    height: args.height,
    tiers: args.tiers,
    land: args.land,
    rise: args.rise,
    raggedness: args.raggedness,
  });

  const island = new IsoIslandView({
    map,
    tileset,
    ground: 'tiered',
    deco: args.deco,
    grass: args.grass,
    sea: false,
    foam: args.foam,
    groundScale: args.groundScale,
    foamScale: args.foamScale,
    metrics: { w: 64, h: 32, z: args.tileZ },
  });
  frame.addChild(island.view);

  // `fit` is the scale that shows the whole island, and `zoom` multiplies it.
  // Deriving the magnification from the fit rather than setting it absolutely
  // keeps the two panels locked together whatever the island's size: at any
  // zoom they are the same scale, which is the whole point of the pair.
  const fit = Math.min(PANEL_W / island.width, PANEL_H / island.height);
  const scale = fit * args.zoom;
  island.view.scale.set(scale);
  // Put the focus point at the panel's centre. At zoom 1 this is the ordinary
  // centred fit; past it the island grows past the panel and this is what
  // decides which part stays on screen — the rim, by default, since a shore
  // tile is what the story is for.
  // Panel-local, since the view now hangs off `frame` — which carries the
  // offset itself.
  island.view.position.set(
    PANEL_W / 2 - island.width * scale * args.focusX,
    PANEL_H / 2 - island.height * scale * args.focusY,
  );

  const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
  app.ticker.add(ticker);
  return () => {
    app.ticker.remove(ticker);
    island.destroy();
    frame.destroy({ children: true });
  };
}

function Scene(args: Args) {
  let base: IslandTileset | null = null;
  let surf: Texture[][] | null = null;
  let rock: Texture[][] | null = null;

  return (
    <PixiStage
      width={PANEL_W * 2}
      height={PANEL_H}
      background={SEA}
      prepare={async () => {
        const loaded = await loadIslandTileset();
        // The shipped `foam.webp` is a flat lozenge; the pack's strip is the
        // real animated surf, and the surf is the thing both edges are being
        // judged against.
        base = { ...loaded, foam: await loadPackFoam() };
        ({ surf, rock } = await loadBlobSets());
      }}
      setup={(stage, app) => {
        if (!base || !surf || !rock) return;
        // Left panel is columns 0-3, right is 5-8 — the same order as the
        // sheet, so the story reads the way the file does.
        const stopL = buildPanel(stage, app, base, surf, args, 0);
        const stopR = buildPanel(stage, app, base, rock, args, PANEL_W);
        return () => {
          stopL();
          stopR();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Shore Sets',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'harbour-9',
    width: 24,
    height: 24,
    tiers: 3,
    land: 0.46,
    rise: 0.55,
    raggedness: 0.4,
    deco: false,
    grass: false,
    foam: true,
    groundScale: 1.52,
    foamScale: 1.8,
    tileZ: 6,
    // Close enough to read individual pixels of the rim, which is the whole
    // question — the fitted island is far too small to judge a 2px liseré.
    zoom: 5,
    // The west shore: a long run of open rim with no cliff and no plateau
    // behind it, so nothing competes with the edge being compared.
    focusX: 0.28,
    focusY: 0.62,
  },
  argTypes: {
    zoom: { control: { type: 'range', min: 1, max: 12, step: 0.5 } },
    focusX: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    focusY: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
  },
};
export default meta;

/** Left: columns 0-3, surf painted in. Right: columns 5-8, rock edge. */
export const SurfVsRock: StoryObj<Args> = {};

/** The same pair with the animated foam off, to see each edge bare. */
export const NoFoam: StoryObj<Args> = { args: { foam: false } };
