/**
 * The hand-painted dug pit, at the size the game actually draws it.
 *
 * This tile is not like the rest of the terrain. Everything else on
 * `tilemap-flat` is painted FLAT — a full-bleed 64x64 square that
 * `gen_iso_sheets.py` projects onto a 44x24 diamond and extrudes a rock band
 * under. Column 10 skips all of that: a dug pit is a hole, it has no
 * underside, and projecting one would bolt a block's rocky sides onto a shape
 * that should be sinking into the ground. So it is painted already-isometric,
 * straight into the baked sheet, against `04-feuilles/*x/tilemap-flat-iso-col10.png`.
 *
 * Which is exactly why it needs its own story. A tile that bypasses the
 * projector also bypasses everything the projector guarantees — that the art
 * lands on the lattice, that its grain matches its neighbours, that it is not
 * secretly drawn at four times the resolution it will be seen at. None of
 * that is visible in Aseprite at 800% zoom on a black background. It is
 * visible here, beside tiles that went through the pipeline.
 *
 * The question this story exists to answer is `grain`: pixel art has one
 * resolution, and a tile whose detail is finer than the sheet's reads as
 * noise rather than as texture once it is on a board. `Grain` puts the pit
 * next to a stock grass tile blown up to the same size — if the pit's
 * speckle is visibly denser than the grass's, it is painted too fine, and no
 * amount of colour work fixes that.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Assets, Container, Graphics, Rectangle, Sprite, Texture, Text } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IsoIslandView,
  loadIslandTileset,
  TILE,
  type IslandTileset,
} from '@/game/island';

/** The board colour behind the tiles — the game's sea, as in the other stories. */
const SEA = '#0d8296';

const WIDTH = 960;
const HEIGHT = 540;

/**
 * The working PNG, not the shipped webp.
 *
 * Aseprite does not write webp, so while the column is being painted the PNG
 * is the live file and the webp is a stale bake of it. Pixi caches by URL, so
 * `Assets.unload` runs first — without it a story keeps showing the sheet as
 * it was when Storybook booted, which on a file being actively repainted
 * looks exactly like "my edit did nothing".
 */
const SHEET = '/assets/terrain/tilemap-flat.png';

/** The sheet's grid. 11 columns since column 10 was appended for RR's tiles. */
const SHEET_COLS = 11;
const SHEET_ROWS = 4;
const CUSTOM_COL = 10;

/**
 * A stock tile to judge the pit against: the grass blob set's full tile.
 *
 * Column 3, row 3 is `sol-nesw` — the cell with neighbours on all four sides,
 * so it is pure surface with no edge treatment. That makes it the honest
 * reference for grain: whatever texture the pack puts on open ground is the
 * density the pit has to match.
 */
const REFERENCE = { col: 3, row: 3 } as const;

/**
 * The lattice, straight from `gridConfig.ts` by way of the other island
 * stories. A tile is 64px of sheet drawn onto a 44x24 diamond, so a board
 * steps by half of each.
 */
const DIAMOND = { w: 44, h: 24 } as const;

async function loadSheet(): Promise<Texture[][]> {
  await Assets.unload(SHEET).catch(() => {});
  const base = await Assets.load<Texture>(SHEET);
  return Array.from({ length: SHEET_ROWS }, (_, row) =>
    Array.from(
      { length: SHEET_COLS },
      (_, col) =>
        new Texture({
          source: base.source,
          frame: new Rectangle(col * TILE, row * TILE, TILE, TILE),
        }),
    ),
  );
}

/** A tile sprite at `scale`, centred on (x, y), nearest-neighbour. */
function tile(texture: Texture, x: number, y: number, scale: number): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.scale.set(scale);
  s.position.set(x, y);
  return s;
}

function label(text: string, x: number, y: number): Text {
  return new Text({
    text,
    x,
    y,
    style: { fill: '#ffffff', fontSize: 13, fontFamily: 'monospace' },
  });
}

interface Args {
  row: number;
  zoom: number;
  boardScale: number;
  cols: number;
  rows: number;
  showGrid: boolean;
}

/**
 * One pit repeated on a real lattice, with stock grass around it.
 *
 * Repetition is the point: a single tile is always forgivable, and a tiling
 * artefact — a seam, a bright pixel that lands on the same spot every time,
 * an edge that does not meet its neighbour — only becomes obvious once the
 * same cell is on screen twenty times.
 */
function board(cells: Texture[][], args: Args, custom: Texture): Container {
  const c = new Container();
  const { cols, rows, boardScale } = args;
  const grass = cells[REFERENCE.row][REFERENCE.col];
  const hw = (DIAMOND.w / 2) * boardScale;
  const hh = (DIAMOND.h / 2) * boardScale;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      // Every third cell is a pit, on an offset that does not line up into
      // rows — a grid of pits reads as a pattern and hides the seams.
      const dug = (col * 3 + r * 5) % 7 === 0;
      const x = (col - r) * hw;
      const y = (col + r) * hh;
      c.addChild(tile(dug ? custom : grass, x, y, boardScale));
    }
  }
  return c;
}

function Scene(args: Args) {
  let tileset: IslandTileset | null = null;
  let cells: Texture[][] | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        tileset = await loadIslandTileset();
        cells = await loadSheet();
      }}
      setup={(stage) => {
        if (!cells || !tileset) return;
        const custom = cells[args.row][CUSTOM_COL];

        const b = board(cells, args, custom);
        b.position.set(WIDTH / 2, HEIGHT / 2 - (b.height * 0.5) / 2);
        stage.addChild(b);

        stage.addChild(
          label(`tilemap-flat.png  col ${CUSTOM_COL}  row ${args.row}  —  x${args.boardScale}`, 12, 12),
        );
        return () => b.destroy({ children: true });
      }}
    />
  );
}

/**
 * The grain test: the pit beside stock grass, both blown up by the same
 * factor, so the two are compared at identical magnification.
 *
 * Read the speckle, not the colour. The pack's grass carries clumps two or
 * three pixels across; if the pit's detail is finer than that — single
 * scattered pixels, a rim one pixel wide — it was painted at a higher
 * resolution than the sheet, and on the board it will read as dirt-coloured
 * static rather than as a hole.
 */
function GrainScene(args: Args) {
  let cells: Texture[][] | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background="#1a1a1a"
      prepare={async () => {
        cells = await loadSheet();
      }}
      setup={(stage) => {
        if (!cells) return;
        const custom = cells[args.row][CUSTOM_COL];
        const grass = cells[REFERENCE.row][REFERENCE.col];
        const z = args.zoom;

        const c = new Container();
        c.addChild(tile(custom, WIDTH * 0.28, HEIGHT / 2, z));
        c.addChild(tile(grass, WIDTH * 0.72, HEIGHT / 2, z));
        stage.addChild(c);

        stage.addChild(label(`col 10 row ${args.row} — ta tuile`, WIDTH * 0.28 - 90, HEIGHT - 48));
        stage.addChild(label('grass sol-nesw — la reference', WIDTH * 0.72 - 100, HEIGHT - 48));
        stage.addChild(label(`zoom x${z}  —  compare la FINESSE du grain, pas la couleur`, 12, 12));
        return () => c.destroy({ children: true });
      }}
    />
  );
}

/**
 * One pit alone at exactly 1:1 — 64 screen pixels for 64 sheet pixels.
 *
 * The only view in which no scaling of any kind stands between the file and
 * the eye. Everything else here magnifies, and magnification flatters: it
 * makes a tile drawn too fine look merely detailed. This is the size the tile
 * really is.
 */
function NativeScene(args: Args) {
  let cells: Texture[][] | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        cells = await loadSheet();
      }}
      setup={(stage) => {
        if (!cells) return;
        const custom = cells[args.row][CUSTOM_COL];
        const grass = cells[REFERENCE.row][REFERENCE.col];
        const c = new Container();
        c.addChild(tile(custom, WIDTH / 2 - 60, HEIGHT / 2, 1));
        c.addChild(tile(grass, WIDTH / 2 + 60, HEIGHT / 2, 1));
        stage.addChild(c);
        stage.addChild(label('1:1 — la taille reelle de la tuile', 12, 12));
        return () => c.destroy({ children: true });
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Dug Tile (col 10)',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    row: 0,
    zoom: 6,
    // 1.52, the factor the island stories settled on: the art paints about 42
    // of every 64px, so a tile at native size leaves a gap at every seam.
    boardScale: 1.52,
    cols: 9,
    rows: 9,
    showGrid: false,
  },
  argTypes: {
    row: {
      control: { type: 'range', min: 0, max: 3, step: 1 },
      description: 'Which of the four cells of column 10 to show.',
    },
    zoom: { control: { type: 'range', min: 1, max: 12, step: 1 } },
    boardScale: { control: { type: 'range', min: 1, max: 2.5, step: 0.01 } },
    cols: { control: { type: 'range', min: 3, max: 16, step: 1 } },
    rows: { control: { type: 'range', min: 3, max: 16, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The pit on a REAL island, dug through `digCell` — the path the game takes.
 *
 * The three views above draw the tile straight from the sheet, which proves
 * the art and nothing else. This one goes through `IsoIslandView.digCell`,
 * the method the scene will call when a cell is opened, so it also proves the
 * wiring: that the pit lands on the cell that was dug, at the right tier, in
 * the right block, sorted with the ground rather than over it.
 *
 * `digCell` REPLACES the ground sprite's texture rather than laying the pit
 * on top. That is the whole reason it exists: the middle of the pit is a
 * hole, and a hole is transparent — an overlay would show the untouched
 * meadow through it.
 */
function IslandScene(args: Args) {
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        // The sheet is being repainted, so take the working PNG rather than
        // the baked webp `loadIslandTileset` would otherwise hand back.
        await Assets.unload(SHEET).catch(() => {});
        const base = await loadIslandTileset();
        const cells = await loadSheet();
        tileset = { ...base, custom: cells.map((line) => line[CUSTOM_COL]) };
      }}
      setup={(stage, app) => {
        if (!tileset) return;
        const map = generateIsland({
          seed: 'harbour-9',
          width: 20,
          height: 20,
          tiers: 3,
          land: 0.5,
          rise: 0.55,
          raggedness: 0.4,
        });
        const island = new IsoIslandView({
          map,
          tileset,
          ground: 'tiered',
          deco: false,
          grass: false,
          sea: false,
          foam: false,
        });
        stage.addChild(island.view);

        // Dig a scattered third of the land, once the ground exists.
        let dug = 0;
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            if ((x * 3 + y * 5) % 7 !== 0) continue;
            if (island.digCell(x, y, args.row)) dug++;
          }
        }

        const scale = Math.min(WIDTH / island.width, HEIGHT / island.height);
        island.view.scale.set(scale);
        island.view.position.set(
          (WIDTH - island.width * scale) / 2,
          (HEIGHT - island.height * scale) / 2,
        );

        stage.addChild(label(`digCell — ${dug} cases creusees`, 12, 12));
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

/** The pit scattered through stock grass on the real lattice. */
export const Default: Story = {};

/** A real island with cells dug through `digCell`, as the game will do it. */
export const OnIsland: Story = {
  render: (args) => <IslandScene key={JSON.stringify(args)} {...args} />,
};

/**
 * Craters side by side: the painted fallback against the hand-painted tile.
 *
 * `Tile.markBombSite` draws two translucent diamonds — burnt earth at the rim,
 * near-black in the pit — and that is what a bomb site looked like before this
 * tile existed. It is a good impression of a hole and it is still the fallback
 * for surfaces the art does not cover (the burrow, the farm), so it is worth
 * being able to see the two together rather than only remembering the old one.
 *
 * The difference that matters is not the drawing, it is the OPACITY: the
 * painted crater is translucent, so the grass beneath shows through and the
 * hole reads as a stain on the ground. The tile is opaque, and replaces the
 * ground rather than tinting it.
 */
function CraterScene(args: Args) {
  let cells: Texture[][] | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        cells = await loadSheet();
      }}
      setup={(stage) => {
        if (!cells) return;
        const grass = cells[REFERENCE.row][REFERENCE.col];
        const pit = cells[args.row][CUSTOM_COL];
        const z = 4;
        const c = new Container();

        // Left: grass with the painted crater's two diamonds over it, at the
        // same alphas `Tile.markBombSite` uses.
        const lx = WIDTH * 0.3;
        c.addChild(tile(grass, lx, HEIGHT / 2, z));
        // The two diamonds `Tile.markBombSite` draws, at its own colours and
        // alphas. Drawn as real diamonds rather than as tinted boxes: the
        // point of the comparison is the shape AND the translucency, and a
        // rectangle standing in for the rim misrepresents both.
        const crater = new Graphics();
        const hw = (DIAMOND.w * z) / 2;
        const hh = (DIAMOND.h * z) / 2;
        const diamond = (g: Graphics, sx: number, dy: number, colour: number, alpha: number) => {
          g.moveTo(0, -hh * sx + dy)
            .lineTo(hw * sx, dy)
            .lineTo(0, hh * sx + dy)
            .lineTo(-hw * sx, dy)
            .closePath()
            .fill({ color: colour, alpha });
        };
        diamond(crater, 1, 0, 0x1a100a, 0.55);
        diamond(crater, 0.72, z, 0x050302, 0.75);
        crater.position.set(lx, HEIGHT / 2);
        c.addChild(crater);

        // Right: the same grass cell replaced by the painted tile.
        c.addChild(tile(pit, WIDTH * 0.7, HEIGHT / 2, z));

        stage.addChild(c);
        stage.addChild(label('cratere peint (repli)', WIDTH * 0.3 - 70, HEIGHT - 48));
        stage.addChild(label('ta tuile (le jeu)', WIDTH * 0.7 - 55, HEIGHT - 48));
        stage.addChild(label('markBombSite — avant / apres', 12, 12));
        return () => c.destroy({ children: true });
      }}
    />
  );
}

/** The old painted crater beside the new tile. */
export const Crater: Story = {
  render: (args) => <CraterScene key={JSON.stringify(args)} {...args} />,
};

/** Side by side with the pack's grass, magnified: is the grain too fine? */
export const Grain: Story = {
  render: (args) => <GrainScene key={JSON.stringify(args)} {...args} />,
};

/** 1:1, nothing resampled — the tile at the size it truly is. */
export const Native: Story = {
  render: (args) => <NativeScene key={JSON.stringify(args)} {...args} />,
};

/**
 * A dense field of pits, barely any grass between them.
 *
 * Tiling artefacts compound: an edge that is one pixel short shows as a
 * hairline against grass and as a continuous crack against another pit.
 */
export const Dense: Story = { args: { cols: 13, rows: 13 } };

/**
 * Native size on the lattice, where the tiles do NOT cover their cells.
 *
 * Worth seeing once: at `boardScale` 1 the background shows through every
 * seam, which is a property of the pack's art and not of this tile. Knowing
 * what that looks like keeps it from being mistaken for a flaw in the pit.
 */
export const NativeBoard: Story = { args: { boardScale: 1 } };
