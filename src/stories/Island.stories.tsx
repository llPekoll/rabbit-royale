/**
 * Paul's tile island, in isolation.
 *
 * `test/island-tiles.test.ts` already pins the two halves that can be checked
 * without a canvas — the autotiler's sheet lookup and the generator's shape.
 * What it cannot check is the half that fails by DRAWING THE WRONG PICTURE:
 * whether a cliff face lands under the shelf it holds up, whether the rock rim
 * survives around the grass laid over it, whether a plateau still reads as
 * raised. All three are eye problems, so they belong here.
 *
 * The stories drive the real `generateIsland` / `IslandView` — the same code
 * `/island` runs — so a story remains evidence of what ships. `/island` is the
 * workbench with every knob; these are the handful of settings that are worth
 * looking at on purpose, one claim from the module's README each.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IslandView,
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
}

function Scene({ seed, width, height, tiers, land, rise, raggedness, ground, deco }: Args) {
  // Loaded once per mount and handed to `setup` — `loadIslandTileset` caches by
  // URL, so a story re-mounting on an arg change re-slices against sheets that
  // are already on the GPU rather than re-uploading them.
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
        const island = new IslandView({ map, tileset, ground, deco });
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
  title: 'Island/Tile island',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'harbour-9',
    width: 34,
    height: 24,
    tiers: 3,
    land: 0.46,
    rise: 0.55,
    raggedness: 0.4,
    ground: 'tiered',
    deco: true,
  },
  argTypes: {
    seed: { control: 'text' },
    width: { control: { type: 'range', min: 12, max: 60, step: 1 } },
    height: { control: { type: 'range', min: 10, max: 44, step: 1 } },
    tiers: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    land: { control: { type: 'range', min: 0.15, max: 0.85, step: 0.01 } },
    rise: { control: { type: 'range', min: 0.1, max: 0.9, step: 0.01 } },
    raggedness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    ground: { control: 'inline-radio', options: ['tiered', 'grass', 'sand'] },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The defaults, and the seed the workbench opens on: three tiers, deco on. */
export const Default: Story = {};

/**
 * The claim the whole palette scheme rests on, and the only way to see it: a
 * cliff face is drawn on a shelf's SOUTHERN edge only. Paint every tier the
 * same green and the other three sides dissolve into the ground below, and a
 * terraced island reads as a flat one with walls lying on it. Flip `ground`
 * between `tiered` and `grass` on this story and the plateaus vanish.
 */
export const FlatGrass: Story = { args: { ground: 'grass' } };

/** The same island in sand — the flat set, no tier colouring. */
export const Sand: Story = { args: { ground: 'sand' } };

/**
 * One tier: ground at sea level and nothing above it. No rock pass at all, so
 * this is where a beach meeting the water with nothing but foam between them
 * is judgeable — and where the foam animation is unobstructed.
 */
export const Flat: Story = { args: { tiers: 1 } };

/**
 * As many tiers as the generator will grant. `tiers` is a request: each shelf
 * is eroded out of the one below, so a small island runs out of room and stops
 * climbing. Widen it and the fifth palette appears.
 */
export const Terraced: Story = { args: { tiers: 5, width: 46, height: 32, rise: 0.62 } };

/** No trees, props or sea rocks: the bare terrain, for judging the tiling. */
export const NoDeco: Story = { args: { deco: false } };

/**
 * Ragged at 1 leans entirely on the noise: a coastline of bays and spits, with
 * the elliptical falloff out of the picture. 0 is the round blob at the other
 * end. This is the dial to watch for one-cell spits the despeckler let through.
 */
export const RaggedCoast: Story = { args: { raggedness: 1, land: 0.5 } };

/** A small grid, so the 64px tiles are legible cell by cell at this scale. */
export const CloseUp: Story = { args: { width: 16, height: 12, tiers: 3 } };
