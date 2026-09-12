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
 * ## The terrain is the game's, through the game's own service
 *
 * The ground, the trees, the flock and the sea come from `createTerrainBackground`
 * — the very call `IslandScene` makes — and each tile's veil is mounted inside
 * its cell's terrain block exactly as the scene mounts it. The story used to
 * build its own `IsoIslandView` and line the two grids up by hand, and the
 * hand was off by one cell: every veil sat on the cell diagonally above the
 * ground it covered, a row of them hung over the sea, and the shore row went
 * bare. A story that draws the island differently from the game is not
 * evidence, so it no longer draws it at all — it asks the game to.
 *
 * `terrainScale`, `tiers`, `land`, `rise`, `raggedness` and `clearBoard` are
 * left over from that era and change nothing today: the island is the one
 * `terrainBoard` cuts for the seed, at the game's own settings.
 *
 * ## What to look for
 *
 *   - does the board sit ON the ground, or float over a coastline it ignores?
 *   - is a face-down tile still readable against grass, as it was against paint?
 *   - does the rabbit read as standing on the island at this tile size?
 *   - do the terrain's trees fight the board for attention?
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, type Sprite } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import type { TileContent } from '@/lib/game/types';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createIslandBackground } from '@/game/services/IslandBackground';
import { createTerrainBackground } from '@/game/services/TerrainBackground';
import { COLS, ROWS, toColRow } from '@/config/gridConfig';
import { farmableTiles, levelTierAt, spawnTile, terrainNeighbors, tierLift } from '@/lib/game/terrainBoard';

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
  /**
   * Height of one terrain tier, in px.
   *
   * Only used by the PAINTED comparison arm now. The terrain arm draws at
   * `TIER_LIFT`, because the playable tiles are raised by that and the two
   * have to agree — see the note at the `metrics` below.
   */
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
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        await loadAllAssets();
      }}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        const cleanups: Array<() => void> = [];
        // The backgrounds resolve asynchronously; a story torn down before
        // they do must not build a board into a destroyed stage.
        let gone = false;
        cleanups.push(() => { gone = true; });

        /**
         * ONE sorted container for the board and everything standing on the
         * island, exactly as `IslandScene` has it. The terrain service puts the
         * trees, rocks and sheep in here as SIBLINGS of the tiles, so a sheep
         * sorts in front of the veil on its own cell instead of the whole
         * landscape landing entirely behind (or entirely before) the board.
         */
        const boardLayer = new Container();
        boardLayer.sortableChildren = true;
        stage.addChild(boardLayer);
        cleanups.push(() => boardLayer.destroy({ children: true }));

        /**
         * The real board: the same tile set, the same Tile entity and the same
         * veil mounting the scene uses, so what is judged here is what ships.
         *
         * `mountVeil` is the terrain's — it puts a tile's veil inside the
         * block of its cell, over that cell's grass. Over the painting there
         * is no block, and the veil stays on the tile.
         */
        const buildBoard = (mountVeil: (index: number, veil: Sprite) => boolean) => {
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
          // The TERRAIN decides where tiles exist, exactly as the game does:
          // every grass cell, minus the ones with a tree, a rock or a soldier
          // on them. A sheep's cell keeps its tile — the sheep walks off it.
          const land = farmableTiles(args.seed);

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
          content.set(spawnTile(args.seed), 'empty');

          /** Bombs among a tile's eight neighbours — the minesweeper hint. */
          const adjacentBombs = (index: number): number =>
            terrainNeighbors(args.seed, index)
              .filter((n) => content.get(n) === 'bomb').length;

          for (const i of land) {
            // The tier is the 4th argument and it is LOAD-BEARING: it breaks
            // the depth tie between a raised tile and a sea-level one on the
            // same diagonal. Left out, this story sorted differently from the
            // game and could not show the overlap it exists to show.
            const { col, row } = toColRow(i);
            const tile = new Tile(i, {
              color: parseInt(args.fogColor.replace('#', ''), 16),
              alpha: args.fogAlpha,
            }, tierLift(args.seed, i), levelTierAt(args.seed, col, row));
            boardLayer.addChild(tile.container);
            tile.mountVeil((veil) => mountVeil(i, veil));
            // Dug tiles cluster around the spawn, the way a real run spreads
            // outward from where the rabbit landed rather than at random.
            const spawn = toColRow(spawnTile(args.seed));
            const dist = Math.max(Math.abs(col - spawn.col), Math.abs(row - spawn.row));
            const reach = args.dug * Math.max(COLS, ROWS) * 0.7;
            const isDug = i === spawnTile(args.seed) || (dist < reach && rng() < 0.85);
            if (!isDug) continue;
            const what = content.get(i) ?? 'empty';
            // A dug bomb has already gone off, so it shows as spent ground.
            tile.revealContent(what === 'bomb' ? 'empty' : what, adjacentBombs(i), false);
          }

          if (args.rabbit) {
            const rabbit = new PlayerRabbit(spawnTile(args.seed));
            boardLayer.addChild(rabbit.container);
          }
        };

        if (args.painted) {
          // The comparison arm: the screen exactly as it shipped before.
          void createIslandBackground(stage, WIDTH / 2, HEIGHT / 2, args.seed).then((bg) => {
            if (gone) { bg.destroy(); return; }
            cleanups.push(() => bg.destroy());
            // The painting joined the stage after the board's container did;
            // the board goes back on top of it.
            stage.setChildIndex(boardLayer, stage.children.length - 1);
            if (args.board) buildBoard(() => false);
          });
        } else {
          // THE GAME'S terrain, through THE GAME'S service — the same call
          // `IslandScene` makes, into the same kind of container. It aligns
          // the terrain to the board's grid and hands back `mountVeil`, so
          // there is nothing left here to get wrong.
          void createTerrainBackground(boardLayer, args.seed, { decoScale: args.decoScale })
            .then((bg) => {
              if (gone) { bg.destroy(); return; }
              cleanups.push(() => bg.destroy());
              const ticker = (t: { deltaMS: number }) => bg.update(t.deltaMS);
              app.ticker.add(ticker);
              cleanups.push(() => app.ticker.remove(ticker));
              if (args.board) buildBoard((i, veil) => bg.mountVeil(i, veil));
            });
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
