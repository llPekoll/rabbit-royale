/**
 * The window through whatever is drawn IN FRONT of the rabbit.
 *
 * What shipped before was a fade by kind: a tree the rabbit stood behind went
 * to 45% alpha, a bush to 40%. It only looked one row ahead, so a pine two
 * cells nearer the camera — still three cells tall, still over the player —
 * stayed opaque and swallowed the rabbit. And it faded, which is not a thing
 * pixel art does.
 *
 * `fx/DepthHole.ts` replaces it with a DEPTH TEST and a DISC: every sibling
 * that sorts after the rabbit and whose picture reaches a circle around it
 * has its pixels inside the circle removed. The rim is a gradient, and the
 * gradient is an ordered dither — a pixel is kept whole or dropped whole, in
 * the Bayer matrix's fixed order, so the ring is a stable stipple rather than
 * a blur.
 *
 * ## What to look at
 *
 * The rabbit walks down a column through a stand of pines and bushes, out
 * and back. Watch three things:
 *
 *   - the CENTRE: the rabbit is never lost, whatever is over it — the pine
 *     two rows ahead as much as the bush one row ahead.
 *   - the RIM: does the dither read as a graded edge, or as noise? `dot` is
 *     the grain, `matrix` how many steps the gradient has, `feather` how wide
 *     it is. The dots are sampled on the SCREEN's grid, so they stay square
 *     at any zoom; the `zoom` control is for checking exactly that.
 *   - the ring's SIZE against the rabbit: `radius` is in board pixels, and a
 *     cell is 44 wide. Too small and the ears stay behind the trunk; too
 *     large and the forest opens into a clearing that walks with the player.
 *
 * `showRing` draws the two circles so a number can be read off the picture.
 *
 * The world is arranged the way the game arranges it: the ground in one
 * container behind everything, the standing art deported to be SIBLINGS of
 * the rabbit in one sorted layer (`decoLayer`). That sibling sort is the
 * depth test's whole input, so a story that parented the rabbit differently
 * would be showing a different effect.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { DepthHole } from '@/game/fx/DepthHole';
import { DEPTH_HOLE_LOOK } from '@/config/depthHoleLook';
import { IsoIslandView, loadIslandTileset, type IslandTileset } from '@/game/island';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { islandCam } from '@/game/scenes/islandCamera';
import { HALF_W, HALF_H } from '@/config/gridConfig';
import { levelTierAt, spawnTile, terrainFor, TIER_LIFT } from '@/lib/game/terrainBoard';

const WIDTH = 960;
const HEIGHT = 540;
const SEA = '#1eaac4';

/**
 * The island every terrain story uses, and a column through its wood.
 *
 * Column 6 from row 17 to 25 passes a pine at (6,20), bushes at (5,22) and
 * (6,22), and pines at (5,23) and (6,23) — so on the way down the rabbit is
 * behind a tree two rows ahead, then a bush one row ahead, then two trees at
 * once. That is every case the old fade got wrong, on one straight walk.
 */
const SEED = 'harbour-9';

interface Args {
  /** Radius of the fully open disc, in board pixels (a cell is 44 wide). */
  radius: number;
  /** Width of the dithered rim past the radius, in board pixels. */
  feather: number;
  /** Size of one dither dot, in art pixels. 1 = one pixel of the sprite. */
  dot: number;
  /** Bayer matrix: 2x2 has three steps of grey, 4x4 fifteen, 8x8 sixty-three. */
  matrix: 2 | 4 | 8;
  /** Alpha left on a removed pixel: 0 is a clean hole, 0.1 a ghost of the cover. */
  ghost: number;
  /** Punch nothing — the picture without the effect, for comparison. */
  off: boolean;
  /** Draw the radius and the rim as circles, to read the numbers off the picture. */
  showRing: boolean;
  /** Stop the rabbit somewhere along its walk. */
  freeze: boolean;
  /** Where along the walk it stops, 0 = top of the column, 1 = bottom. */
  freezeAt: number;
  /** Seconds to walk the column one way. */
  walkSeconds: number;
  /** The camera, as a multiple of the game's own island zoom. */
  zoom: number;
  /** How large the scenery is drawn. 0.4 is the game's. */
  decoScale: number;
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
}

function Scene(args: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        await loadAllAssets();
        await loadIslandTileset();
      }}
      setup={(stage, app) => {
        let tileset: IslandTileset | null = null;
        let island: IsoIslandView | null = null;
        let rabbit: PlayerRabbit | null = null;
        const cleanups: Array<() => void> = [];
        let disposed = false;

        // One sorted world, terrain and rabbit as SIBLINGS — the game's own
        // arrangement, and the one the depth test reads.
        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);
        cleanups.push(() => world.destroy({ children: true }));

        const hole = new DepthHole({
          radius: args.radius,
          feather: args.feather,
          dot: args.dot,
          matrix: args.matrix,
          ghost: args.ghost,
          depthWindow: DEPTH_HOLE_LOOK.depthWindow,
        });
        cleanups.push(() => hole.destroy());

        // The two circles, over everything, in the world's own units so they
        // scale with the camera exactly as the hole does.
        const ring = new Graphics();
        ring.zIndex = 1e9;
        ring.visible = args.showRing;
        ring.circle(0, 0, args.radius).stroke({ color: 0xffffff, width: 1, alpha: 0.9 });
        ring.circle(0, 0, args.radius + args.feather).stroke({ color: 0xffffff, width: 1, alpha: 0.45 });
        world.addChild(ring);

        void loadIslandTileset().then((ts) => {
          if (disposed) return;
          tileset = ts;
          const { map, placements } = terrainFor(SEED);

          island = new IsoIslandView({
            map,
            tileset,
            metrics: { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT },
            placements,
            decoScale: args.decoScale,
            decoLayer: world,
            sea: false,
            foam: false,
            decoShadows: false,
          });
          // The terrain draws inside its own box, offset by its origin; the
          // rabbit is placed by raw projection. Cancelling the origin puts the
          // two in one space.
          island.view.position.set(-island.originX, -island.originY);
          island.placeDeco(-island.originX, -island.originY);
          island.view.zIndex = -10;
          world.addChild(island.view);

          rabbit = new PlayerRabbit(spawnTile(SEED), undefined, SEED);
          world.addChild(rabbit.container);

          // The game's own camera on the middle of the walk, times the zoom
          // control — so the dither is judged at the size a player sees it.
          const midCol = (args.fromCol + args.toCol) / 2;
          const midRow = (args.fromRow + args.toRow) / 2;
          const focus = {
            x: (midCol - midRow) * HALF_W,
            y: (midCol + midRow) * HALF_H - sampleTier(midCol, midRow) * TIER_LIFT,
          };
          const cam = islandCam(SEED, WIDTH, HEIGHT, focus);
          const scale = cam.scale * args.zoom;
          world.scale.set(scale);
          world.position.set(WIDTH / 2 - focus.x * scale, HEIGHT / 2 - focus.y * scale);

          cleanups.push(() => {
            island?.destroy();
            rabbit?.destroy();
          });
        });

        let elapsed = 0;
        const tick = (t: { deltaMS: number }) => {
          if (!island || !rabbit) return;
          island.update(t.deltaMS);
          elapsed += t.deltaMS;

          // Out and back, so the walk passes the same trees from both sides.
          const phase = args.freeze
            ? args.freezeAt
            : triangle((elapsed / 1000) / Math.max(0.5, args.walkSeconds));
          const col = args.fromCol + (args.toCol - args.fromCol) * phase;
          const row = args.fromRow + (args.toRow - args.fromRow) * phase;

          // A continuous sweep rather than `moveTo`'s hops, so the window is
          // seen opening and closing rather than snapping once per tile. The
          // height is blended across cell boundaries for the same reason.
          const tier = sampleTier(col, row);
          rabbit.container.position.set(
            (col - row) * HALF_W,
            (col + row) * HALF_H - tier * TIER_LIFT,
          );
          // Depth from the ROUNDED cell: sorting is per cell, and a fractional
          // depth would swap the rabbit in front of and behind one sprite
          // mid-cell.
          rabbit.container.zIndex =
            (Math.round(col) + Math.round(row)) * 16 + Math.round(tier) + 8;

          const centre = DepthHole.centreOf(rabbit);
          ring.position.set(centre.x, centre.y);
          if (args.off) hole.clear();
          else hole.update(world, rabbit.container.zIndex, centre, app.renderer);
        };

        app.ticker.add(tick);
        cleanups.push(() => app.ticker.remove(tick));

        return () => {
          disposed = true;
          cleanups.forEach((fn) => fn());
        };
      }}
    />
  );
}

/**
 * The terrain's tier at a FRACTIONAL cell, blended across the boundary, so
 * the rabbit walks up a step rather than teleporting onto it mid-cell.
 */
function sampleTier(col: number, row: number): number {
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const fc = col - c0;
  const fr = row - r0;
  const t00 = levelTierAt(SEED, c0, r0);
  const t10 = levelTierAt(SEED, c0 + 1, r0);
  const t01 = levelTierAt(SEED, c0, r0 + 1);
  const t11 = levelTierAt(SEED, c0 + 1, r0 + 1);
  return (
    t00 * (1 - fc) * (1 - fr) +
    t10 * fc * (1 - fr) +
    t01 * (1 - fc) * fr +
    t11 * fc * fr
  );
}

/** 0 → 1 → 0 over one unit of `t`, so the walk goes out and comes back. */
function triangle(t: number): number {
  const f = ((t % 1) + 1) % 1;
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

const meta: Meta<Args> = {
  title: 'FX/Depth hole',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    radius: DEPTH_HOLE_LOOK.radius,
    feather: DEPTH_HOLE_LOOK.feather,
    dot: DEPTH_HOLE_LOOK.dot,
    matrix: DEPTH_HOLE_LOOK.matrix,
    ghost: DEPTH_HOLE_LOOK.ghost,
    off: false,
    showRing: false,
    freeze: false,
    freezeAt: 0.5,
    walkSeconds: 6,
    zoom: 1,
    decoScale: 0.4,
    fromCol: 6,
    fromRow: 17,
    toCol: 6,
    toRow: 25,
  },
  argTypes: {
    radius: { control: { type: 'range', min: 0, max: 120, step: 1 } },
    feather: { control: { type: 'range', min: 0, max: 120, step: 1 } },
    dot: { control: { type: 'range', min: 1, max: 6, step: 1 } },
    matrix: { control: 'inline-radio', options: [2, 4, 8] },
    ghost: { control: { type: 'range', min: 0, max: 0.5, step: 0.01 } },
    freezeAt: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    walkSeconds: { control: { type: 'range', min: 1, max: 20, step: 0.5 } },
    zoom: { control: { type: 'range', min: 0.5, max: 4, step: 0.25 } },
    decoScale: { control: { type: 'range', min: 0.2, max: 1, step: 0.05 } },
    fromCol: { control: { type: 'range', min: 0, max: 31, step: 1 } },
    fromRow: { control: { type: 'range', min: 0, max: 31, step: 1 } },
    toCol: { control: { type: 'range', min: 0, max: 31, step: 1 } },
    toRow: { control: { type: 'range', min: 0, max: 31, step: 1 } },
  },
  parameters: {
    docs: {
      description: {
        component:
          'A dithered disc punched through everything drawn in front of the rabbit — '
          + 'a depth test on the sorted layer, not a fade by kind. The defaults are '
          + 'the game\'s (`config/depthHoleLook.ts`).',
      },
    },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The walk through the wood, with the game's numbers. */
export const Default: Story = {
  args: {
    ghost: 0.38
  }
};

/** Stopped with a pine two rows ahead over the rabbit — the case the fade missed. */
export const BehindThePine: Story = { args: { freeze: true, freezeAt: 0.3, showRing: true } };

/** Stopped between the two pines at the bottom of the column. */
export const BetweenTwoPines: Story = { args: { freeze: true, freezeAt: 0.72, showRing: true } };

/** Zoomed in on the rim, to judge the grain of the dither. */
export const Grain: Story = { args: { freeze: true, freezeAt: 0.3, zoom: 3 } };

/** The three matrices side by side is not possible; this is the coarse one. */
export const Coarse2x2: Story = { args: { matrix: 2, freeze: true, freezeAt: 0.3, zoom: 2 } };

/** The fine one. */
export const Fine8x8: Story = { args: { matrix: 8, freeze: true, freezeAt: 0.3, zoom: 2 } };

/** No feather at all: a hard-edged disc, for comparison. */
export const HardEdge: Story = { args: { feather: 0, freeze: true, freezeAt: 0.3 } };

/** The effect off — what the walk looked like before. */
export const Off: Story = { args: { off: true } };
