/**
 * Who draws in front of whom — every relief, side by side, board and all.
 *
 * "Les tiles s'overlap" is impossible to chase in a live run: the island is
 * 16x16, the pair that looks wrong is somewhere on a terrace edge, and by the
 * time you have found it the sheep have moved. Each case here is a handful of
 * cells and one answer, drawn by the same code the game uses — same
 * `IsoIslandView`, same `Tile`, same alignment, same veil-in-block mounting.
 *
 * ## The rulers
 *
 * Terrain and board sort against each other in the island scene, and they
 * MUST use the same scale or the interleave is arbitrary:
 *
 *     terrain    isoDepth(x, y, tier)      = (x + y) * 16 + tier
 *     board      tileDepth(i) * 16 + tier  = (col + row) * 16 + tier
 *
 * They agree — `tileDepth` is `col + row`. The `* 16` is what stops a tier from
 * outranking a whole diagonal. The `labels` control prints both numbers on
 * every cell and turns them red where they differ, which is the first thing
 * to look at when a pair looks wrong: white labels mean the sort is fine and
 * what you are seeing is the projection.
 *
 * ## What the projection does, and cannot not do
 *
 * A raised tile hides part of its lower neighbours — the right half of the
 * one to its west, the left half of the one to its north, most of the one
 * diagonally behind it. The `lift` slider shows this is a function of the
 * tier lift, not of the sort, and that no value hides nothing. What the game
 * can decide is what draws where: veils live inside their cell's block so they
 * never compound, hints float above everything so they stay readable, and the
 * pointer follows the veil so a wall lights nothing.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { IsoIslandView, loadIslandTileset, isoDepth, isoProject, type IslandTileset } from '@/game/island';
import { Tile } from '@/game/entities/Tile';
import { HALF_W, HALF_H, ISO_ORIGIN_X, ISO_ORIGIN_Y, tileDepth, tilePos, toIndex } from '@/config/gridConfig';
import { TIER_LIFT } from '@/lib/game/terrainBoard';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { pixelText } from '@/game/ui/PixelText';
import { initTileTextures } from '@/game/services/TileTextures';
import type { IslandMap } from '@/game/island/generate';

/**
 * A hand-built map, so each case is exactly the relief it claims to be.
 *
 * `rows` reads top-down as the player sees it: '0' is sea, '1' sea-level
 * ground, '2'+ a plateau. Written as strings because the whole point is that
 * the shape is legible in the source — a generated map would make these cases
 * a lottery.
 */
function mapFrom(rows: string[]): IslandMap {
  const height = rows.length;
  const width = rows[0].length;
  const level = new Int8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) level[y * width + x] = Number(rows[y][x]);
  }
  let tiers = 0;
  for (const v of level) if (v > tiers) tiers = v;
  return { seed: 'depth-lab', width, height, tiers, level };
}

interface Args {
  /** Which relief to draw. */
  shape: keyof typeof SHAPES;
  /** Lay the playable board (with its grey veil) over the terrain. */
  board: boolean;
  /** Veil every board cell, rather than leaving them dug. */
  fog: boolean;
  /** Draw each sprite's sort depth on top of it. */
  labels: boolean;
  /** Scatter trees, rocks and sheep, so their depths can be judged too. */
  deco: boolean;
  /** Contact shadow under everything that stands. */
  shadows: boolean;
  /**
   * How far one tier lifts a cell, in px. The game ships TIER_LIFT; this knob
   * exists because how much a raised tile covers of its lower neighbours is a
   * FUNCTION OF THIS NUMBER, not of the sort: at 2 * HALF_H (24) the diagonal
   * neighbours' tops tile exactly but the tile straight behind is fully
   * hidden; at HALF_H (12) it is the other way round. No value hides nothing.
   */
  lift: number;
  scale: number;
}

/**
 * The relief cases worth having an answer for.
 *
 * Each is small enough to read at a glance, and named after the question it
 * settles rather than after its geometry.
 */
/**
 * Every case is padded with a ring of sea.
 *
 * `buildGround` measures a cell's drop against its south and east neighbours,
 * and a cell OFF the map reads as level 0 — so a 3x3 case has its whole right
 * and bottom edge falling three storeys into nothing, and draws a forest of
 * rock that has nothing to do with the relief being tested. On the real island
 * that is correct (the land IS surrounded by sea); in a cropped case it is an
 * artefact of the crop.
 *
 * The ring makes the edge explicit, so what each case shows is its own steps.
 */
function padded(rows: readonly string[]): string[] {
  const width = rows[0].length;
  const sea = '0'.repeat(width + 2);
  return [sea, ...rows.map((r) => `0${r}0`), sea];
}

const SHAPES = {
  /** Flat ground: nothing should ever overlap. The control case. */
  flat: ['111', '111', '111'],
  /** One step up. The commonest edge, and the one in the screenshot. */
  oneStep: ['122', '122', '111'],
  /** Two storeys at once — where a column is more than one face tall. */
  twoStep: ['133', '133', '111'],
  /** A shelf standing on a shelf: the face depth has to stay inside its own
   *  diagonal or it slides under the terrace below. */
  staircase: ['123', '123', '111'],
  /** A single raised cell, so its column is visible on every side at once. */
  pillar: ['111', '121', '111'],
  /** A notch cut into a terrace: the inside corner is where edge masks and
   *  depths disagree most often. */
  notch: ['222', '212', '222'],
  /**
   * A step with GROUND on every side of it — the case that actually matters.
   *
   * The other shapes are all edge: their cliffs face the sea, where an
   * overshoot is invisible because there is nothing behind it to cover. Here
   * the terrace is surrounded, so a face that hangs too low lands squarely on
   * a neighbour's grass and the bug is unmissable.
   */
  inland: ['11111', '12221', '12321', '12221', '11111'],
  /** Two inland terraces side by side, so a column has another column in
   *  front of it rather than open ground. */
  twinSteps: ['11111', '12121', '11111', '12121', '11111'],
} as const;

const meta: Meta<Args> = {
  title: 'Island/TileDepth',
  parameters: {
    docs: {
      description: {
        component:
          'Every relief case with the board laid over it. Use it to settle ' +
          'which sprite draws in front, rather than hunting the pair in a run.',
      },
    },
  },
  args: { shape: 'oneStep', board: true, fog: true, labels: true, deco: true, shadows: true, scale: 3, lift: TIER_LIFT },
  argTypes: {
    shape: { control: 'select', options: Object.keys(SHAPES) },
    scale: { control: { type: 'range', min: 1, max: 5, step: 0.5 } },
    lift: { control: { type: 'range', min: 0, max: 32, step: 1 } },
  },
  render: (args) => (
    <PixiStage
      width={520}
      height={420}
      background="#2a8fa8"
      prepare={loadAllAssets}
      setup={(stage, app) => {
        const cleanups: Array<() => void> = [];
        const rows = SHAPES[args.shape];
        const map = mapFrom(padded(rows));

        (async () => {
          const tileset: IslandTileset = await loadIslandTileset();
          if (!app.renderer) return;
          initTileTextures(app.renderer);

          // One sorted container for everything, exactly as `IslandScene` has
          // it: terrain and board are SIBLINGS there, and a story that nested
          // them would be testing a layout the game does not use.
          const world = new Container();
          world.sortableChildren = true;
          world.scale.set(args.scale);
          /**
           * Centre on the MIDDLE CELL of whatever shape is loaded.
           *
           * The board's origin is tuned for a 16x16 island (ISO_ORIGIN_X is
           * 515), so a 3x3 case drawn at it lands off the right-hand edge of a
           * 520px canvas — which is exactly what "je sais pas ce qui se passe"
           * looked like. Panning by the centre cell keeps every shape framed
           * without touching the constants the game is aligned to.
           */
          const mid = tilePos(toIndex(Math.floor(map.width / 2), Math.floor(map.height / 2)));
          world.position.set(260 - mid.x * args.scale, 230 - mid.y * args.scale);
          stage.addChild(world);

          const island = new IsoIslandView({
            map,
            tileset,
            metrics: { w: HALF_W * 2, h: HALF_H * 2, z: args.lift },
            sea: false,
            deco: args.deco,
            // A handful, so each one is judgeable rather than a thicket.
            inhabitedShare: 0.25,
            decoLayer: world,
            decoShadows: args.shadows,
          });
          /**
           * Line the terrain up with the BOARD, exactly as the game does.
           *
           * Without this the two grids sit side by side: the terrain stays at
           * its own inner origin while the tiles follow `tilePos`, and the
           * story shows a landscape next to a board rather than one over the
           * other — which is not the arrangement whose depths are in question.
           *
           * Copied in shape from `TerrainBackground`: project the board's
           * origin cell through the terrain's projection and shift by the
           * difference.
           */
          const origin = isoProject(0.5, 0.5, 0, { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT });
          island.view.position.set(
            ISO_ORIGIN_X - origin.x - island.originX,
            ISO_ORIGIN_Y - origin.y - island.originY,
          );
          // The deported deco is not under `view`, so it needs the same shift.
          island.placeDeco(island.view.position.x, island.view.position.y);
          island.view.zIndex = -10;
          world.addChild(island.view);

          const tiles = new Map<number, Tile>();
          if (args.board) {
            for (let y = 0; y < map.height; y++) {
              for (let x = 0; x < map.width; x++) {
                const tier = map.level[y * map.width + x];
                if (tier === 0) continue;
                const index = toIndex(x, y);
                const tile = new Tile(index, undefined, tier * args.lift, tier);
                tiles.set(index, tile);
                world.addChild(tile.container);
                // As the scene does: the veil lives in the cell's block.
                tile.mountVeil((veil) => island.mountVeil(x, y, veil));
                // Dug tiles drop their veil, which is how a real board looks
                // once a run is under way.
                if (!args.fog) tile.revealContent('empty', 0, false);
                cleanups.push(() => tile.destroy());
              }
            }
          }

          if (args.labels) {
            // The two numbers that have to agree, printed on the cell that
            // carries them: terrain depth on top, board depth under it. This is
            // the whole diagnostic — when a pair looks wrong on screen, these
            // say whether the SORT is wrong or the geometry is.
            for (let y = 0; y < map.height; y++) {
              for (let x = 0; x < map.width; x++) {
                const tier = map.level[y * map.width + x];
                if (tier === 0) continue;
                const index = toIndex(x, y);
                const ground = isoDepth(x, y, tier);
                const board = tileDepth(index) * 16 + tier;
                const text = pixelText(0, 0, `${ground}/${board}`);
                text.anchor = 0.5;
                text.scale.set(0.34);
                // Through the game's OWN projection, not a hand-rolled copy of
                // it: the first cut left out ISO_ORIGIN and the labels floated
                // in the sea, a screenful from the cells they name.
                const at = tilePos(index);
                text.position.set(at.x, at.y - tier * args.lift);
                // Above everything the cell can draw, so a label is never the
                // thing that looks buried.
                text.zIndex = 9999;
                // Red when they disagree: that is the only case worth hunting.
                text.tint = ground === board ? 0xffffff : 0xff5555;
                world.addChild(text);
                cleanups.push(() => text.destroy());
              }
            }
          }

          // A probe for Playwright: what does Pixi's OWN hit test name at a
          // point given relative to a tile's centre? `tile-<index>` for a veil,
          // `wall` for a cliff face, null for nothing. This asks the event
          // system, not the geometry, so it catches a hit area that disagrees
          // with the picture.
          (window as unknown as { __tileDepth?: unknown }).__tileDepth = {
            hit(x: number, y: number, dx: number, dy: number): string | null {
              const t = tiles.get(toIndex(x, y));
              if (!t) return null;
              const g = t.container.toGlobal({ x: dx, y: dy });
              // The boundary is only anchored to the stage once a real
              // pointer event has gone through it; asked cold, it has no root.
              const boundary = app.renderer.events.rootBoundary;
              boundary.rootTarget ??= app.stage;
              const target = boundary.hitTest(g.x, g.y);
              return target?.label ?? null;
            },
          };

          const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
          app.ticker.add(ticker);
          /**
           * Unshifted, not pushed: this has to run LAST.
           *
           * `cleanups` is drained in reverse, so a pushed entry would tear the
           * world down BEFORE the tiles in it got their own `destroy()` — and a
           * Tile destroyed by its parent never kills its GSAP tweens. They go on
           * writing `y` into a container Pixi has already nulled, once per frame,
           * for the life of the page.
           */
          cleanups.unshift(() => {
            app.ticker.remove(ticker);
            island.destroy();
            world.destroy({ children: true });
          });
        })();

        return () => { for (const fn of cleanups.reverse()) fn(); };
      }}
    />
  ),
};

export default meta;
type Story = StoryObj<Args>;

/** Flat ground. Nothing may overlap here — if this one is wrong, the sort is. */
export const Flat: Story = { args: { shape: 'flat' } };

/** One step up: the edge in the bug report. */
export const OneStep: Story = { args: { shape: 'oneStep' } };

/** Two storeys, so the column is more than a single face tall. */
export const TwoStep: Story = { args: { shape: 'twoStep' } };

/** A shelf on a shelf — consecutive tiers, the hardest case for face depth. */
export const Staircase: Story = { args: { shape: 'staircase' } };

/** One raised cell, columns visible on every side. */
export const Pillar: Story = { args: { shape: 'pillar' } };

/** An inside corner, where the edge mask and the depth disagree most often. */
export const Notch: Story = { args: { shape: 'notch' } };

/** THE case: a terrace with ground on every side, so an overshooting cliff
 *  lands on a neighbour's grass instead of falling into invisible sea. */
export const Inland: Story = { args: { shape: 'inland', fog: false, deco: false } };

/** Two inland terraces, so a column faces another column. */
export const TwinSteps: Story = { args: { shape: 'twinSteps', fog: false, deco: false } };

/** The terrain alone, to see what the board is being judged against. */
export const TerrainOnly: Story = { args: { shape: 'staircase', board: false } };

/** The board with nothing dug — every cell veiled, which is a run's first
 *  second and the state the overlap was reported in. */
export const AllFogged: Story = { args: { shape: 'staircase', fog: true } };

/** The same board once it has been dug: no veil, so any overlap left is the
 *  terrain's own. */
export const NoFog: Story = { args: { shape: 'staircase', fog: false } };

/**
 * The contact shadows, on and off, over the same relief.
 *
 * Flip between these two: without one a tree stands between two lit diamonds
 * and the eye cannot say which cell it belongs to — the same reason the carrots
 * and chests on `Tile` have carried one all along.
 */
export const Shadows: Story = { args: { shape: 'oneStep', deco: true, shadows: true } };
export const NoShadows: Story = { args: { shape: 'oneStep', deco: true, shadows: false } };

/** Shadows on a staircase, where a sprite's shadow must land on its OWN shelf
 *  rather than on the terrace below it. */
export const ShadowsOnSteps: Story = {
  args: { shape: 'staircase', deco: true, shadows: true, fog: false },
};

/** The lift the game ships, side by side with the one where top diamonds tile
 *  exactly: flip between these and watch the veils stop overlapping — without
 *  a single change to the sort. */
export const LiftAsShipped: Story = { args: { shape: 'staircase', lift: TIER_LIFT, deco: false } };
export const LiftOneDiamond: Story = { args: { shape: 'staircase', lift: HALF_H * 2, deco: false } };
