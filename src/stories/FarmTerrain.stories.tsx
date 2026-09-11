/**
 * The generated terrain UNDER the real playing grid — what "Go farm" could be.
 *
 * Today that screen is `IslandBackground`: one painting picked by seed
 * (`land1/2/3.webp`) with the 16x16 board laid over it. The terrain in
 * `IsoIslandView` is the alternative — ground generated tile by tile, with
 * plateaus and cliff faces instead of a flat picture.
 *
 * This story is the evidence to judge that swap ON, before any of it is wired
 * into the game. Nothing here imports the scene or the socket: it puts the
 * REAL `makeShape` board, the REAL `Tile` entity and a REAL `PlayerRabbit` on
 * the generated ground, at the game's own metrics, and lets the eye decide.
 *
 * ## The two grids have to agree, and they already do
 *
 * The game's `tilePos` is `(col - row) * HALF_W`, `(col + row) * HALF_H` —
 * character for character the projection in `iso.ts`. So the terrain is built
 * at the BOARD's metrics (44x24, not the module's 64x32 default) and its
 * origin is pinned to the board's, which is what makes a terrain cell and a
 * playable tile the same diamond rather than two grids that merely look alike.
 *
 * `terrainScale` is the one knob that matters: the board is 16x16, the terrain
 * grid is larger so that land runs past the playable area instead of stopping
 * at it. Take it to 1 and the island ends exactly where the board does, which
 * is the failure this story exists to make visible.
 *
 * ## What to look for
 *
 *   - does the board sit ON the ground, or float over a coastline it ignores?
 *   - is a face-down tile still readable against grass, as it was against paint?
 *   - does the rabbit read as standing on the island at this tile size?
 *   - do the terrain's trees fight the board for attention?
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IsoIslandView,
  loadIslandTileset,
  type IslandTileset,
} from '@/game/island';
import { Tile } from '@/game/entities/Tile';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import type { TileContent } from '@/lib/game/types';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createIslandBackground } from '@/game/services/IslandBackground';
import {
  COLS, ROWS, HALF_W, HALF_H,
  SPAWN_INDEX, isForbidden, makeShape, toIndex, toColRow, tilePos,
} from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;

/** The sea the game already draws behind its island. */
const SEA = '#1eaac4';

interface Args {
  seed: string;
  /** Terrain grid size as a multiple of the 16x16 board. */
  terrainScale: number;
  tiers: number;
  land: number;
  rise: number;
  raggedness: number;
  /** Height of one terrain tier, in px. 0 is flat ground. */
  tileZ: number;
  deco: boolean;
  /**
   * How large the terrain's scenery is drawn, as a multiple of its own pixels.
   * The art is cut for 64px tiles and the board's are 44x24, so at 1 a tree is
   * three times a playable tile and hides the ground under it.
   */
  decoScale: number;
  /** Keep trees and props OUT of the playable area, so they frame it. */
  clearBoard: boolean;
  /** Draw the playable board over the terrain. */
  board: boolean;
  /** Put a rabbit on the spawn tile. */
  rabbit: boolean;
  /**
   * Share of the board already dug, 0..1 — the thing a farming run actually
   * looks like. At 0 every tile is face-down, which is only ever the first
   * second of a run.
   */
  dug: number;
  /** Share of the island's tiles that hide a bomb. The hints count these. */
  bombs: number;
  /** Share of tiles that hide a carrot, golden ones included. */
  carrots: number;
  /** Share of the inhabitants' budget. 0 empties the island of livestock. */
  inhabitedShare: number;
  /**
   * How dark the lid over an undug tile is, 0..1.
   *
   * The game's 0.55 was calibrated against the PAINTED backdrop. Over grass
   * that same navy veil reads as a patch of darker ground rather than as a
   * covered tile — which is the point of this control: an undug tile has to
   * say "a bomb could be here", and on generated terrain it stops saying it.
   */
  fogAlpha: number;
  /** Tint of that lid. Darker or colder separates it further from the grass. */
  fogColor: string;
  /** Use the PAINTING instead of the terrain — the A/B this story is for. */
  painted: boolean;
}

function Scene(args: Args) {
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        await loadAllAssets();
        tileset = await loadIslandTileset();
      }}
      setup={(stage, app) => {
        if (!tileset) return;
        initTileTextures(app.renderer);

        const cleanups: Array<() => void> = [];

        if (args.painted) {
          // The comparison arm: the screen exactly as it ships today.
          void createIslandBackground(stage, WIDTH / 2, HEIGHT / 2, args.seed).then((bg) => {
            cleanups.push(() => bg.destroy());
          });
        } else {
          // The terrain, built at the BOARD's metrics so a terrain cell and a
          // playable tile are the same diamond.
          const size = Math.round(COLS * args.terrainScale);
          const map = generateIsland({
            seed: args.seed,
            width: size,
            height: size,
            tiers: args.tiers,
            land: args.land,
            rise: args.rise,
            raggedness: args.raggedness,
          });
          // The board occupies the middle COLS x ROWS of the terrain grid, so
          // that is the region scenery has to leave alone.
          const off = Math.round((size - COLS) / 2);
          const island = new IsoIslandView({
            map,
            tileset,
            metrics: { w: HALF_W * 2, h: HALF_H * 2, z: args.tileZ },
            deco: args.deco,
            decoScale: args.decoScale,
            inhabitedShare: args.inhabitedShare,
            keepClear: args.clearBoard
              ? (x, y) => x >= off && x < off + COLS && y >= off && y < off + ROWS
              : undefined,
          });

          // Line the two grids up by their CENTRES.
          //
          // Both use the same projection, so this is one subtraction rather
          // than a fudge: project the board's middle cell through the game's
          // `tilePos`, project the terrain's middle cell through the terrain's
          // own origin, and shift by the difference. The terrain grid can then
          // grow around the board without the playable area sliding off the
          // land — which is the whole point of `terrainScale`.
          const boardMid = tilePos(toIndex(Math.round((COLS - 1) / 2), Math.round((ROWS - 1) / 2)));
          const mid = (size - 1) / 2;
          const terrainMid = {
            x: (mid - mid) * HALF_W,        // centre of a square grid: always 0
            y: (mid + mid) * HALF_H,
          };
          island.view.position.set(
            boardMid.x - terrainMid.x - island.originX,
            boardMid.y - terrainMid.y - island.originY,
          );
          stage.addChild(island.view);

          const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
          app.ticker.add(ticker);
          cleanups.push(() => {
            app.ticker.remove(ticker);
            island.destroy();
          });
        }

        if (args.board) {
          // The real board: the same shape cutter and the same Tile entity the
          // scene uses, so what is judged here is what would ship.
          const shape = makeShape(args.seed);
          const boardLayer = new Container();
          boardLayer.sortableChildren = true;
          stage.addChild(boardLayer);

          // What a run in progress looks like.
          //
          // The board is not the point on its own — a grid of face-down tiles
          // is the first second of a run and nothing else. What has to be
          // judged against generated ground is the board a player actually
          // stares at: dug tiles showing HINTS, carrots waiting to be taken,
          // the odd bomb. The hint numbers are counted from the bombs that
          // were rolled rather than invented, so the picture is a legal board
          // and not a plausible-looking one.
          const rng = mulberry32(seedFrom(`${args.seed}:farm`));
          const land: number[] = [];
          for (let i = 0; i < COLS * ROWS; i++) if (!isForbidden(i, shape)) land.push(i);

          const content = new Map<number, TileContent>();
          for (const i of land) {
            const roll = rng();
            if (roll < args.bombs) content.set(i, 'bomb');
            else if (roll < args.bombs + args.carrots) {
              content.set(i, rng() < 0.12 ? 'golden' : 'carrot');
            } else if (roll < args.bombs + args.carrots + 0.03) content.set(i, 'chest');
            else content.set(i, 'empty');
          }
          // The spawn is where the rabbit stands; a bomb under it would be a
          // board the server would never deal.
          content.set(SPAWN_INDEX, 'empty');

          /** Bombs among a tile's eight neighbours — the minesweeper hint. */
          const adjacentBombs = (index: number): number => {
            const { col, row } = toColRow(index);
            let n = 0;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (!dr && !dc) continue;
                const c = col + dc;
                const r = row + dr;
                if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
                if (content.get(toIndex(c, r)) === 'bomb') n++;
              }
            }
            return n;
          };

          for (const i of land) {
            const tile = new Tile(i, {
              color: parseInt(args.fogColor.replace('#', ''), 16),
              alpha: args.fogAlpha,
            });
            boardLayer.addChild(tile.container);
            // Dug tiles cluster around the spawn, the way a real run spreads
            // outward from where the rabbit landed rather than at random.
            const { col, row } = toColRow(i);
            const spawn = toColRow(SPAWN_INDEX);
            const dist = Math.max(Math.abs(col - spawn.col), Math.abs(row - spawn.row));
            const reach = args.dug * Math.max(COLS, ROWS) * 0.7;
            const isDug = i === SPAWN_INDEX || (dist < reach && rng() < 0.85);
            if (!isDug) continue;
            const what = content.get(i) ?? 'empty';
            // A dug bomb has already gone off, so it shows as spent ground.
            tile.revealContent(what === 'bomb' ? 'empty' : what, adjacentBombs(i), false);
          }
          cleanups.push(() => boardLayer.destroy({ children: true }));

          if (args.rabbit) {
            const rabbit = new PlayerRabbit(SPAWN_INDEX);
            boardLayer.addChild(rabbit.container);
          }
        }

        return () => cleanups.forEach((fn) => fn());
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Farm terrain',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'harbour-9',
    terrainScale: 1.75,
    tiers: 2,
    land: 0.62,
    rise: 0.4,
    raggedness: 0.3,
    tileZ: 24,
    deco: true,
    decoScale: 0.4,
    clearBoard: true,
    board: true,
    rabbit: true,
    dug: 0.45,
    bombs: 0.14,
    carrots: 0.2,
    inhabitedShare: 0.025,
    fogAlpha: 0.55,
    fogColor: '#1a2a3a',
    painted: false,
  },
  argTypes: {
    seed: { control: 'text' },
    terrainScale: { control: { type: 'range', min: 1, max: 3, step: 0.25 } },
    tiers: { control: { type: 'range', min: 1, max: 4, step: 1 } },
    land: { control: { type: 'range', min: 0.3, max: 0.95, step: 0.01 } },
    rise: { control: { type: 'range', min: 0.1, max: 0.9, step: 0.01 } },
    raggedness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    tileZ: { control: { type: 'range', min: 0, max: 48, step: 2 } },
    decoScale: { control: { type: 'range', min: 0.2, max: 1, step: 0.05 } },
    dug: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    bombs: { control: { type: 'range', min: 0, max: 0.4, step: 0.01 } },
    carrots: { control: { type: 'range', min: 0, max: 0.5, step: 0.01 } },
    inhabitedShare: { control: { type: 'range', min: 0, max: 0.12, step: 0.005 } },
    fogAlpha: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    fogColor: { control: 'color' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The proposal: generated terrain under a run already half dug. */
export const Default: Story = {};

/** The first second of a run: every tile face-down, nothing revealed yet. */
export const Untouched: Story = { args: { dug: 0 } };

/**
 * Late in a run — most of the board open. This is the densest the screen ever
 * gets, and so the real test of whether hints stay readable over grass: a
 * number that is legible against flat paint can still be lost in a tuft.
 */
export const MostlyDug: Story = { args: { dug: 0.95 } };

/** No livestock at all, for judging the board against bare terrain. */
export const NoLivestock: Story = { args: { inhabitedShare: 0 } };

/**
 * The fog as the game ships it, over a board with nothing dug.
 *
 * This is the problem, not a demonstration: `0x1a2a3a` at 0.55 was calibrated
 * against the painted backdrop, and over grass it reads as a patch of slightly
 * darker ground. An undug tile has to say "a bomb could be under here", and
 * here it does not — the covered tiles and the open ones look like two kinds
 * of lawn. Compare with `FogReadable` below.
 */
export const FogAsShipped: Story = { args: { dug: 0 } };

/**
 * The same board with the lid turned up. Darker, colder and more opaque, so a
 * covered tile reads as covered against grass rather than as terrain variation.
 * The numbers here are a starting point to tune by eye, not a verdict — that is
 * what the `fogAlpha` and `fogColor` controls are for.
 */
export const FogReadable: Story = {
  args: { dug: 0, fogAlpha: 0.72, fogColor: '#0d1420' },
};

/**
 * The same screen as it ships TODAY — the painting, the same board over it.
 * This is the arm to flip back and forth against `Default`. Everything else in
 * both pictures is identical, so whatever changes between them is the swap.
 */
export const PaintedToday: Story = { args: { painted: true } };

/** The terrain alone. Is the ground worth looking at before anything is on it? */
export const TerrainOnly: Story = { args: { board: false, rabbit: false } };

/**
 * Flat ground, no tiers. The board is a FLAT 16x16 and always will be until the
 * server generates terrain too, so this is the honest version of the swap:
 * generated coastline and grass, no relief under the playable tiles.
 */
export const FlatGround: Story = { args: { tiers: 1, tileZ: 0 } };

/**
 * Terrain exactly the size of the board. The failure this story exists to show:
 * the island stops where the playable area stops, so the board has no shore
 * around it and reads as a grid floating in open sea rather than as ground.
 */
export const TooSmall: Story = { args: { terrainScale: 1 } };

/** Plenty of land around the board — where the coastline stops mattering. */
export const WideShore: Story = { args: { terrainScale: 2.75, land: 0.7 } };

/** No trees or props: do they fight the board's tiles for attention or not? */
export const NoDeco: Story = { args: { deco: false } };

/**
 * Scenery at native size, growing over the playable area — the first thing
 * this story showed, and the reason `decoScale` and `clearBoard` exist. The
 * trees are cut for 64px tiles and the board's are 44x24, so each one stands
 * three playable tiles high and the ground the player walks on disappears
 * underneath them. Nothing errors; the screen is simply unplayable.
 */
export const DecoTooBig: Story = { args: { decoScale: 1, clearBoard: false } };

/** Relief under a flat board, pushed hard. Does the board still read as level? */
export const Terraced: Story = { args: { tiers: 3, tileZ: 32, rise: 0.5 } };
