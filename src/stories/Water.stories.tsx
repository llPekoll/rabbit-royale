/**
 * The sea: a flat colour, with the island's water effects laid on as SPRITES.
 *
 * An earlier pass built this as a seventeen-step fragment shader, following
 * Fred Ström's water breakdown. It grew three different mechanisms — a shader
 * for the flat colour, a RenderTexture sprite for the cast shadow, a second
 * shader pass for ring particles so they would sort above that sprite — and
 * nearly every bug came from the seams between them: a halo where a
 * full-screen plane leaked, a shadow whose dials stopped responding because
 * another layer painted over it, a foam ring that no blend mode would hollow.
 *
 * So: no shader here. The canvas background IS the sea, and everything else is
 * a sprite placed on a cell, the way the island already draws its trees and
 * its rocks. One mechanism, one coordinate space, and the draw order is just
 * the display list. Shaders come back later, UNDERNEATH this, for surface
 * texture — the part that genuinely wants a fragment program.
 *
 * The cast shadow went too. It worked, but on this sea it was one effect too
 * many: the surf already reads as the island meeting the water, and a dark
 * shape under it only muddied that line. `fx/IslandShadow.ts` is still there
 * for whatever wants it.
 */
import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { createPackWater, loadPackWater, type PackWater } from '@/game/fx/PackWater';
import { createSurfaceTexture, type SurfaceTexture } from '@/game/fx/SurfaceTexture';
import { createDucks, loadDucks, type Ducks } from '@/game/fx/Ducks';
import {
  generateIsland, levelAt, IsoIslandView, loadIslandTileset, isoBounds,
} from '@/game/island';
import { HALF_W, HALF_H, TIER_LIFT } from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;

interface Args {
  seed: string;
  /** Grid size, in cells. */
  cells: number;
  tiers: number;
  /** The sea. Painted as the canvas background — there is nothing else to it. */
  seaColor: string;

  /** Surf: the pack's sixteen-frame foam, one sprite per shore cell. */
  foam: boolean;
  foamColor: string;
  foamAlpha: number;
  /** Extra scale on each foam sprite; the overhang is already baked in. */
  foamScale: number;
  /** Milliseconds per surf frame. */
  foamFrameMs: number;
  /** How far neighbouring cells are pushed out of step, 0 to 1. */
  foamPhase: number;

  /** Surface: pale contour lines on the open water, under everything else. */
  surface: boolean;
  surfaceColor: string;
  /** How strongly the lines show, 0 to 1. */
  surfaceOpacity: number;
  /** Size of one blob of the field, in pixels. */
  surfaceScale: number;
  /** Size of a patch, as a share of one cell. */
  surfaceRadius: number;
  /** Strength of the fainter second outline, 0 to 1. */
  surfaceLevels: number;
  /** How irregular a patch's outline is. */
  surfaceWobble: number;
  /** Share of cells that carry a patch at all, 0 to 1. */
  surfaceDensity: number;
  /** Line thickness, in field units. */
  surfaceWidth: number;
  /** How fast the whole field slides. */
  surfaceDrift: number;
  /** How fast it changes shape in place. */
  surfaceMorph: number;

  /** Ducks paddling about on the open water. */
  ducks: boolean;
  duckCount: number;
  /** Cells per second. */
  duckSpeed: number;
  duckScale: number;
}

function Scene(args: Args) {
  const tick = useRef<((ms: number) => void) | null>(null);
  const {
    seed, cells, tiers, seaColor, foam, foamColor, foamAlpha, foamScale, foamFrameMs, foamPhase,
    surface, surfaceColor, surfaceOpacity, surfaceScale, surfaceRadius, surfaceLevels,
    surfaceWobble, surfaceDensity, surfaceWidth, surfaceDrift, surfaceMorph,
    ducks, duckCount, duckSpeed, duckScale,
  } = args;

  return (
    <PixiStage
      key={JSON.stringify(args)}
      width={WIDTH}
      height={HEIGHT}
      background={seaColor}
      prepare={loadIslandTileset}
      setup={(stage, app) => {
        let water: PackWater | null = null;
        let island: IsoIslandView | null = null;
        let sea: SurfaceTexture | null = null;
        let flock: Ducks | null = null;

        void (async () => {
          const tileset = await loadIslandTileset();
          const map = generateIsland({
            seed, tiers, width: cells, height: Math.round(cells * 0.8),
          });
          const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };
          const bounds = isoBounds(map.width, map.height, map.tiers, metrics, HALF_H * 2);
          const ox = Math.round((WIDTH - bounds.width) / 2);
          const oy = Math.round((HEIGHT - bounds.height) / 2);

          // Trees and props to their own layer so they sort above the surf.
          const deco = new Container();
          island = new IsoIslandView({
            map, tileset, metrics, sea: false, foam: false, decoLayer: deco,
          });

          if (foam) {
            water = createPackWater(
              await loadPackWater(), map.width, map.height,
              (x, y) => levelAt(map, x, y) > 0,
              (x, y) => {
                const tier = Math.max(1, levelAt(map, x, y));
                return {
                  x: bounds.originX + (x - y) * HALF_W,
                  y: bounds.originY + (x + y) * HALF_H - (tier - 1) * TIER_LIFT,
                };
              },
              {
                foamAlpha, foamColor: Number(foamColor.replace('#', '0x')),
                overlap: foamScale, frameMs: foamFrameMs, phase: foamPhase,
              },
            );
          }

          // The moving surface, UNDER everything and over the background.
          //
          // Its own plane in the display list rather than a filter on the
          // scene: a filter is padded and clipped to whatever region Pixi
          // chose, which is what put a halo round the last attempt. A mesh is
          // just a child, and "under" is simply the order it was added in.
          if (surface) {
            sea = createSurfaceTexture(WIDTH, HEIGHT, {
              sea: Number(seaColor.replace('#', '0x')),
              lineColor: Number(surfaceColor.replace('#', '0x')),
              opacity: surfaceOpacity,
              scale: surfaceScale,
              radius: surfaceRadius,
              levels: surfaceLevels,
              wobble: surfaceWobble,
              density: surfaceDensity,
              width: surfaceWidth,
              drift: surfaceDrift,
              morph: surfaceMorph,
            });
            stage.addChild(sea.view);
          }

          if (ducks) {
            // Seeded from the island's own seed, so the same island always
            // puts its ducks in the same places and a screenshot is
            // comparable.
            let n = 0;
            for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
            const rng = () => {
              n = (n * 1664525 + 1013904223) >>> 0;
              return n / 4294967296;
            };
            flock = createDucks(
              await loadDucks(), map.width, map.height,
              (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height
                && levelAt(map, x, y) === 0,
              (x, y) => ({
                x: bounds.originX + (x - y) * HALF_W,
                y: bounds.originY + (x + y) * HALF_H,
              }),
              rng,
              { count: duckCount, speed: duckSpeed, scale: duckScale },
            );
          }

          // Surf at the waterline, then the land, then what stands on it.
          const holder = new Container();
          if (water) holder.addChild(water.view);
          // Ducks over the surf but UNDER the island, so one swimming behind
          // the coast goes behind it rather than over the grass.
          if (flock) holder.addChild(flock.view);
          holder.addChild(island.view);
          holder.position.set(ox, oy);
          stage.addChild(holder);

          deco.position.set(ox, oy);
          stage.addChild(deco);
          island.placeDeco(0, 0);

          tick.current = (ms) => {
            sea?.update(ms);
            flock?.update(ms);
            water?.update(ms);
            island?.update(ms);
          };
        })();

        return () => {
          water?.destroy();
          sea?.destroy();
          flock?.destroy();
          water = null;
          sea = null;
          flock = null;
          island = null;
          tick.current = null;
        };
      }}
      onTick={(ms) => tick.current?.(ms)}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Water',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  argTypes: {
    cells: { control: { type: 'range', min: 8, max: 30, step: 1 } },
    tiers: { control: { type: 'range', min: 1, max: 4, step: 1 } },
    seaColor: { control: 'color' },
    foam: { control: 'boolean' },
    foamColor: { control: 'color' },
    foamAlpha: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    foamScale: { control: { type: 'range', min: 0.6, max: 1.8, step: 0.05 } },
    foamFrameMs: { control: { type: 'range', min: 60, max: 400, step: 10 } },
    foamPhase: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    surface: { control: 'boolean' },
    surfaceColor: { control: 'color' },
    surfaceOpacity: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    surfaceScale: { control: { type: 'range', min: 20, max: 200, step: 2 } },
    surfaceRadius: { control: { type: 'range', min: 0.05, max: 0.8, step: 0.01 } },
    surfaceLevels: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    surfaceWobble: { control: { type: 'range', min: 0, max: 0.8, step: 0.02 } },
    surfaceDensity: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    surfaceWidth: { control: { type: 'range', min: 0, max: 0.12, step: 0.002 } },
    surfaceDrift: { control: { type: 'range', min: 0, max: 0.3, step: 0.005 } },
    surfaceMorph: { control: { type: 'range', min: 0, max: 1.5, step: 0.05 } },
    ducks: { control: 'boolean' },
    duckCount: { control: { type: 'range', min: 1, max: 12, step: 1 } },
    duckSpeed: { control: { type: 'range', min: 0.5, max: 6, step: 0.5 } },
    duckScale: { control: { type: 'range', min: 0.5, max: 2.5, step: 0.1 } },
  },
  args: {
    seed: 'harbour-9', cells: 18, tiers: 3, seaColor: '#47aba9',
    foam: true, foamColor: '#c6f0db', foamAlpha: 1, foamScale: 0.88, foamFrameMs: 140,
    foamPhase: 1,
    surface: true, surfaceColor: '#9fd9cf', surfaceOpacity: 0.55, surfaceScale: 58,
    surfaceRadius: 0.34, surfaceLevels: 0.55, surfaceWobble: 0.22, surfaceDensity: 0.62, surfaceWidth: 0.035,
    surfaceDrift: 0.06, surfaceMorph: 0.35,
    ducks: true, duckCount: 4, duckSpeed: 2, duckScale: 1.2,
  },
  render: (args) => <Scene {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** The sea alone: one colour, nothing on it. */
export const Sea: Story = {
  name: '01 · Aplat',
  args: { foam: false, surface: false },
};

/**
 * The pack's surf, one sprite per shore cell.
 *
 * Sheared onto the diamond at its own size, so each sprite spills a few pixels
 * past its cell and neighbours join into a coastline. Animated by the pack's
 * own sixteen frames — no displacement map, no ring to hollow.
 */
export const Foam: Story = {
  name: '02 · Ecume',
  args: { surface: false },
};

/**
 * Step 6: surface texture, as pale contour lines.
 *
 * A three-octave noise field cut into bands, with only the crossings drawn —
 * so the result is thin closed curves that drift and change shape, rather than
 * the noise wash that painting the field straight would give.
 *
 * Under the surf and over the background, as its own plane in the display
 * list. Shown here WITHOUT the surf, so the lines are the only thing moving.
 */
export const Surface: Story = {
  name: '03 · Texture de surface',
  args: { foam: false },
};

/** The two together, which is what ships. */
export const All: Story = {
  name: '04 · Ensemble',
  args: {},
};

/**
 * Ducks, on the water and nothing else.
 *
 * They are not stamped on cells the way the trees and sea rocks are: a duck
 * keeps a fractional position and swims across the lattice, testing only the
 * cell it is heading FOR. Placed above the surf and under the island, so one
 * paddling behind the coast passes behind it.
 */
export const DuckPond: Story = {
  name: '05 · Canards',
  args: { surface: false, foam: true, duckCount: 6 },
};

/** A bigger board, to see the coastline at length. */
export const Wide: Story = {
  name: 'Grande ile',
  args: { cells: 26, tiers: 4 },
};
