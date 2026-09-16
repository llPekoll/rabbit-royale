/**
 * The loose grass tufts scattered over the island's turf.
 *
 * These are RR's own pixel art (`public/assets/bunnies/grass.*`), not part of
 * the Tiny Swords pack the rest of the terrain comes from, and they are the
 * only scatter in `IsoIslandView` that is TEXTURE rather than scenery: a tuft
 * claims no cell, blocks nothing, and is not an occupant the board knows about.
 * A rabbit hops straight through one.
 *
 * Which makes the failures here eye problems, not assertions — hence a story:
 *
 *   - **Parcimonie.** Grass is free (it costs no playable cell), so nothing but
 *     taste holds it back — `GRASS_CHANCE` is the dial, and `WholeIsland` is
 *     where too much would show.
 *   - **Scale.** The art is 32px where the pack's props are 64, and it rides
 *     `decoScale` unchanged — so a tuft draws at half a prop's height, the
 *     smallest thing on the island. Take it up and it starts competing with the
 *     board; take it as far as `TooBig` and it reads as an obstacle.
 *   - **Planting.** The frames are trimmed by different amounts, so a tuft that
 *     is anchored wrong floats above its cell or sinks into it.
 *   - **Sway.** The four frames are an ANIMATION (the atlas gives each a
 *     `duration`), played on the wind phase like the trees — so the sway should
 *     cross the island as a gust, never the whole meadow blinking together.
 *   - **Off the lattice.** A tuft is jittered off its cell's centre and may sit
 *     on the seam between two. Centred, the grass would line up on the same
 *     grid as the tiles and make the turf look gridded — which is the opposite
 *     of what ground cover is for.
 *   - **No two alike.** Four frames of art furnish a whole island, so each tuft
 *     also takes its own green (the sprite is unicolour, so a `tint` replaces
 *     the colour outright) and its own size wobble. What should read is that
 *     neighbours differ — never that there are several kinds of plant.
 *   - **No contact shadow**, unlike every other standing thing here. The
 *     ellipse is sized against the CELL, so under a tuft this small it is wider
 *     than the plant and reads as spilled dirt.
 *
 * The metrics are the BOARD's (44x24, `decoScale` 0.4), not the 64px workbench
 * default, because the size question only has an answer at the scale the thing
 * actually ships at.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IsoIslandView,
  loadIslandTileset,
  type IslandTileset,
} from '@/game/island';
import { HALF_W, HALF_H, TIER_LIFT } from '@/config/gridConfig';

/** Open sea, so the canvas outside the island matches the water tile. */
const SEA = '#0d8296';

const WIDTH = 960;
const HEIGHT = 540;

/** The board's own scenery size — see `TerrainBackground`'s `DECO_SCALE`. */
const BOARD_DECO_SCALE = 0.4;

interface Args {
  seed: string;
  grass: boolean;
  deco: boolean;
  decoScale: number;
  zoom: number;
  width: number;
  height: number;
}

function Scene(args: Args) {
  const { seed, grass, deco, decoScale, zoom, width, height } = args;
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
        const map = generateIsland({ seed, width, height, tiers: 3 });
        const island = new IsoIslandView({
          map,
          tileset,
          ground: 'tiered',
          deco,
          grass,
          decoScale,
          // The board's metrics, not the workbench's 64px diamond: a tuft is
          // judged against the cell a rabbit actually stands on.
          metrics: { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT },
        });
        stage.addChild(island.view);

        // Fit, then magnify by `zoom`. Grass is small on purpose, and the
        // whole-island view is where "is it too much?" is answerable while the
        // zoomed view is where "is it planted?" is — so the story does both
        // rather than picking one.
        const fit = Math.min(WIDTH / island.width, HEIGHT / island.height);
        const scale = fit * zoom;
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
  title: 'Island/Grass tufts',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'harbour-9',
    grass: true,
    deco: true,
    decoScale: BOARD_DECO_SCALE,
    zoom: 1,
    width: 24,
    height: 24,
  },
  argTypes: {
    seed: { control: 'text' },
    decoScale: { control: { type: 'range', min: 0.2, max: 1.4, step: 0.05 } },
    zoom: { control: { type: 'range', min: 1, max: 4, step: 0.25 } },
    width: { control: { type: 'range', min: 8, max: 40, step: 1 } },
    height: { control: { type: 'range', min: 8, max: 40, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The island as it ships: tufts at a twelfth of the free cells, at the board's
 * own scale. They should read as turf having some texture — not as a lawn, and
 * not as a set of objects lying about.
 */
export const Default: Story = {};

/**
 * The same island, same seed, grass off. This is the comparison that matters:
 * flip between this and `Default` and the ground should go from having a
 * surface to being a flat green sheet — with nothing ELSE moving, because the
 * tufts draw from their own `${seed}:grass` RNG stream and cannot disturb the
 * trees and props already scattered.
 */
export const NoGrass: Story = { args: { grass: false } };

/**
 * Grass with the rest of the scatter off, which is how the ships-everywhere
 * path looks: on the real board `placements` switches trees, props and
 * livestock off (the server owns those) and grass alone survives.
 */
export const GrassOnly: Story = { args: { deco: false } };

/**
 * Close enough to see a single tuft plant itself, and to watch it sway.
 *
 * What to check: the base of each clump sits ON the ground, neither hovering
 * above the turf nor buried in it, and the clumps sit at DIFFERENT places
 * within their cells rather than on a lattice. The four frames are trimmed by
 * different amounts, so a wrong anchor shows up as some tufts planted and
 * others not — a failure invisible at the whole-island zoom.
 *
 * The sway only exists in motion: a screenshot of this story is a still, and
 * several tufts should be caught on different frames of the cycle.
 */
export const CloseUp: Story = { args: { zoom: 3, width: 12, height: 12 } };

/**
 * What too much looks like, via scale: `decoScale` at 1, two and a half times
 * the board's own 0.4.
 *
 * The tufts come out around bush height, and that is the real cost — the bushes
 * on this island DO block a cell while grass does not. Scenery that looks like
 * an obstacle and isn't one is worse than either.
 */
export const TooBig: Story = { args: { decoScale: 1, zoom: 2, width: 14, height: 14 } };

/**
 * A big island at the shipping settings — the view that answers "is it sparse
 * enough?" honestly, since sparseness only reads across a lot of ground.
 */
export const WholeIsland: Story = { args: { width: 34, height: 34 } };
