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
}

function Scene(args: Args) {
  const tick = useRef<((ms: number) => void) | null>(null);
  const {
    seed, cells, tiers, seaColor, foam, foamColor, foamAlpha, foamScale, foamFrameMs, foamPhase,
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

          // Surf at the waterline, then the land, then what stands on it.
          const holder = new Container();
          if (water) holder.addChild(water.view);
          holder.addChild(island.view);
          holder.position.set(ox, oy);
          stage.addChild(holder);

          deco.position.set(ox, oy);
          stage.addChild(deco);
          island.placeDeco(0, 0);

          tick.current = (ms) => {
            water?.update(ms);
            island?.update(ms);
          };
        })();

        return () => {
          water?.destroy();
          water = null;
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
  },
  args: {
    seed: 'harbour-9', cells: 18, tiers: 3, seaColor: '#47aba9',
    foam: true, foamColor: '#c6f0db', foamAlpha: 1, foamScale: 0.88, foamFrameMs: 140,
    foamPhase: 1,
  },
  render: (args) => <Scene {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** The sea alone: one colour, nothing on it. */
export const Sea: Story = {
  name: '01 · Aplat',
  args: { foam: false },
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
  args: {},
};

/** A bigger board, to see the coastline at length. */
export const Wide: Story = {
  name: 'Grande ile',
  args: { cells: 26, tiers: 4 },
};
