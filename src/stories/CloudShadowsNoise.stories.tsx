/**
 * Cloud shadows from noise, over the island — the procedural counterpart of
 * `Island/Cloud Shadows`, on the same fixed board so the two can be compared
 * with nothing else different.
 *
 * Judge it MOVING: the point of this one over the texture is that the
 * plaques change shape as they drift, and a screenshot cannot show that.
 */
import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  createCloudShadowsNoise, CLOUD_SHADOW_NOISE_DEFAULTS, type CloudShadowsNoise,
} from '@/game/fx/CloudShadowsNoise';
import { generateIsland, IsoIslandView, loadIslandTileset, isoBounds } from '@/game/island';
import { HALF_W, HALF_H, TIER_LIFT } from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;
const SEA = '#0d8296';

const SEED = 'harbour-9';
const CELLS = 18;
const TIERS = 3;

interface Args {
  iso: number;
  scale: number;
  speed: number;
  angle: number;
  morph: number;
  octaves: number;
  warp: number;
  coverage: number;
  coverageMin: number;
  coverageMax: number;
  weatherPeriod: number;
  edge: number;
  pixel: number;
  color: string;
  alpha: number;
}

const hex = (s: string) => Number(s.replace('#', '0x'));

function Scene(args: Args) {
  const tick = useRef<((ms: number) => void) | null>(null);

  return (
    <PixiStage
      key={JSON.stringify(args)}
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={loadIslandTileset}
      setup={(stage) => {
        let shadows: CloudShadowsNoise | null = null;
        let view: IsoIslandView | null = null;

        void (async () => {
          const tileset = await loadIslandTileset();
          const map = generateIsland({
            seed: SEED, tiers: TIERS,
            width: CELLS, height: Math.round(CELLS * 0.8),
          });
          const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };
          const bounds = isoBounds(map.width, map.height, map.tiers, metrics, HALF_H * 2);
          const ox = Math.round((WIDTH - bounds.width) / 2);
          const oy = Math.round((HEIGHT - bounds.height) / 2);

          const deco = new Container();
          view = new IsoIslandView({ map, tileset, metrics, decoLayer: deco });
          const holder = new Container();
          holder.addChild(view.view);
          holder.position.set(ox, oy);
          stage.addChild(holder);
          deco.position.set(ox, oy);
          stage.addChild(deco);
          view.placeDeco(0, 0);

          shadows = createCloudShadowsNoise(WIDTH, HEIGHT, {
            halfW: HALF_W,
            halfH: HALF_H,
            iso: args.iso,
            scale: args.scale,
            speed: args.speed,
            angle: args.angle,
            morph: args.morph,
            octaves: args.octaves,
            warp: args.warp,
            coverage: args.coverage,
            coverageMin: args.coverageMin,
            coverageMax: args.coverageMax,
            weatherPeriod: args.weatherPeriod,
            edge: args.edge,
            pixel: args.pixel,
            color: hex(args.color),
            alpha: args.alpha,
          });
          stage.addChild(shadows.view);

          tick.current = (ms) => {
            view?.update(ms);
            shadows?.update(ms);
          };
        })();

        return () => {
          shadows?.destroy();
          shadows = null;
          view = null;
          tick.current = null;
        };
      }}
      onTick={(ms) => tick.current?.(ms)}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

const D = CLOUD_SHADOW_NOISE_DEFAULTS;

const meta: Meta<Args> = {
  title: 'Island/Cloud Shadows (noise)',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  argTypes: {
    iso: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    scale: { control: { type: 'range', min: 0.5, max: 6, step: 0.1 } },
    speed: { control: { type: 'range', min: 0, max: 0.2, step: 0.005 } },
    angle: { control: { type: 'range', min: 0, max: 360, step: 5 } },
    morph: { control: { type: 'range', min: 0, max: 0.3, step: 0.005 } },
    octaves: { control: { type: 'range', min: 1, max: 4, step: 0.1 } },
    warp: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    coverage: { control: { type: 'range', min: 0.3, max: 0.8, step: 0.01 } },
    coverageMin: { control: { type: 'range', min: 0.2, max: 0.9, step: 0.01 } },
    coverageMax: { control: { type: 'range', min: 0.2, max: 0.9, step: 0.01 } },
    weatherPeriod: { control: { type: 'range', min: 5, max: 600, step: 5 } },
    edge: { control: { type: 'range', min: 0, max: 0.3, step: 0.01 } },
    pixel: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    color: { control: 'color' },
    alpha: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
  },
  args: {
    iso: D.iso,
    scale: D.scale,
    speed: D.speed,
    angle: D.angle,
    morph: D.morph,
    octaves: D.octaves,
    warp: D.warp,
    coverage: D.coverage,
    coverageMin: D.coverageMin,
    coverageMax: D.coverageMax,
    weatherPeriod: D.weatherPeriod,
    edge: D.edge,
    pixel: D.pixel,
    color: '#10203a',
    alpha: D.alpha,
  },
  render: (args) => <Scene {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** What ships: the tuned look, with the weather wandering over four minutes. */
export const AuSol: Story = { name: '01 - Au sol', args: {} };

/** The weather cycle sped up to twenty seconds, to watch a whole swing. */
export const Meteo: Story = { name: '02 - Meteo rapide', args: { weatherPeriod: 20 } };

/** Sky held at the top of the range: as clear as it ever gets. */
export const Clair: Story = {
  name: '03 - Clair',
  args: { coverage: 0.8, coverageMin: 0.8, coverageMax: 0.8 },
};

/** Sky held at the bottom of the range: as overcast as it ever gets. */
export const Couvert: Story = {
  name: '04 - Couvert',
  args: { coverage: 0.3, coverageMin: 0.3, coverageMax: 0.3 },
};

/** Bigger and fewer: one cloud at a time crosses the island. */
export const Grands: Story = { name: '05 - Grands nuages', args: { scale: 1.2 } };

/** Frozen shapes, drift only - to see what the morphing was adding. */
export const SansMorph: Story = { name: '06 - Sans morphing', args: { morph: 0 } };

/** The two ends `iso` sits between: full ground projection, and screen space. */
export const IsoPlein: Story = { name: '07 - Iso plein', args: { iso: 1 } };
export const EspaceEcran: Story = { name: '08 - Espace ecran', args: { iso: 0 } };
