/**
 * The tile island, projected isometrically.
 *
 * Same map, same sheets, same `generateIsland` as `Island.stories.tsx` — the
 * only thing that changes is where the tiles go. That is the claim worth
 * looking at here: the Tiny Swords terrain is drawn TOP-DOWN, flat squares
 * facing the camera, and none of it is redrawn as a rhombus. What makes the
 * result read as isometric is the lattice plus the VOLUME under each plateau,
 * not the art.
 *
 * Which means the failures are eye problems and belong in a story:
 *
 *   - does a raised cell sit on a column of rock, or hover over a hole?
 *   - does a near tree draw in front of the cliff behind it?
 *   - does a column reach all the way down when a shelf meets open sea?
 *
 * None of those throw. Flip `tileZ` to 0 on `Volume` and the island falls flat
 * without a single error, which is exactly why the picture is the test.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IsoIslandView,
  loadIslandTileset,
  type GroundKind,
  type IslandTileset,
} from '@/game/island';

/** Open sea, so the canvas outside the island matches the water tile. */
const SEA = '#0d8296';

const WIDTH = 960;
const HEIGHT = 540;

interface Args {
  seed: string;
  width: number;
  height: number;
  tiers: number;
  land: number;
  rise: number;
  raggedness: number;
  ground: 'tiered' | GroundKind;
  deco: boolean;
  sea: boolean;
  tileW: number;
  tileH: number;
  tileZ: number;
}

function Scene(args: Args) {
  const { seed, width, height, tiers, land, rise, raggedness, ground, deco, sea } = args;
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        tileset = await loadIslandTileset();
      }}
      setup={(stage, app) => {
        if (!tileset) return;
        const map = generateIsland({ seed, width, height, tiers, land, rise, raggedness });
        const island = new IsoIslandView({
          map,
          tileset,
          ground,
          deco,
          sea,
          metrics: { w: args.tileW, h: args.tileH, z: args.tileZ },
        });
        stage.addChild(island.view);

        // Fit rather than scroll: the thing under review is the SHAPE of an
        // island, and that is only judgeable whole. Same camera as `/island`.
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
  title: 'Island/Iso island',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'harbour-9',
    width: 24,
    height: 24,
    tiers: 3,
    land: 0.46,
    rise: 0.55,
    raggedness: 0.4,
    ground: 'tiered',
    deco: true,
    sea: true,
    tileW: 64,
    tileH: 32,
    tileZ: 32,
  },
  argTypes: {
    seed: { control: 'text' },
    width: { control: { type: 'range', min: 8, max: 48, step: 1 } },
    height: { control: { type: 'range', min: 8, max: 48, step: 1 } },
    tiers: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    land: { control: { type: 'range', min: 0.15, max: 0.85, step: 0.01 } },
    rise: { control: { type: 'range', min: 0.1, max: 0.9, step: 0.01 } },
    raggedness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    ground: { control: 'inline-radio', options: ['tiered', 'grass', 'sand'] },
    tileW: { control: { type: 'range', min: 32, max: 96, step: 2 } },
    tileH: { control: { type: 'range', min: 12, max: 96, step: 2 } },
    tileZ: { control: { type: 'range', min: 0, max: 64, step: 2 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The classic 2:1 diamond, three tiers, deco on. */
export const Default: Story = {};

/**
 * The claim the whole module rests on, and the only way to see it: drag
 * `tileZ` from 32 down to 0. At 0 the projection is still isometric — the
 * lattice does not change — and the island goes completely flat, because the
 * lift is the only thing separating a shelf from the ground it stands on.
 * Between them, at 8 or 12, is a plateau with a visible but shallow side.
 */
export const Volume: Story = { args: { tiers: 4, rise: 0.62, width: 28, height: 28 } };

/**
 * A tall lift on few tiers: the columns stretch and the cliff face repeats to
 * fill them. This is where a gap between two stacked faces would show up as a
 * seam of open sea running through solid rock.
 */
export const TallCliffs: Story = { args: { tileZ: 56, tiers: 3 } };

/**
 * `tileH` at the full tile width, so the lattice is a plain 45-degree rotation
 * with no tilt at all. Worth a look because it is what isometric ISN'T: the
 * cells are square-on diamonds, the ground reads as a wall, and every plateau
 * loses its footing. The tilt is doing more work than the rotation.
 */
export const NoTilt: Story = { args: { tileH: 64 } };

/** A shallower tilt than 2:1 — further from the viewer, more ground visible. */
export const ShallowTilt: Story = { args: { tileH: 20, tileZ: 20 } };

/** No trees, props or rocks: the bare terrain, for judging the columns. */
export const NoDeco: Story = { args: { deco: false } };

/**
 * The island with the sea tiles off, on the story's flat background. The
 * silhouette is the point — with nothing behind it, a column that fails to
 * reach the ground shows as a hole rather than as water.
 */
export const NoSea: Story = { args: { sea: false } };

/**
 * Small enough that the 64px tiles are legible cell by cell. This is the scale
 * at which the rock rim surviving around each grass tile is visible, and where
 * the draw order along `x + y` can be checked tile by tile.
 */
export const CloseUp: Story = { args: { width: 12, height: 12, tiers: 3 } };

/** As many tiers as the generator will grant, stacked into a proper mountain. */
export const Mountain: Story = {
  args: { tiers: 5, width: 34, height: 34, rise: 0.62, land: 0.55 },
};
