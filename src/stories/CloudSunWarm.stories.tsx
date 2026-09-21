/**
 * Le soleil entre les nuages — la couche CLAIRE posee sur les ombres.
 *
 * Meme ile fixe et memes dials de bruit que `Island/Cloud Shadows (noise)`,
 * avec en plus un second plan qui lit le meme champ a l'envers : la ou le
 * nuage ne couvre pas. Il est monte en `overlay`, donc il rechauffe l'ile au
 * lieu de l'eclairer — voir l'en-tete de `mountSunWarm`.
 *
 * Les deux lectures a trancher sont `rim` :
 *
 *   - `rim` 0   : tout le champ degage. De la meteo, l'ile respire.
 *   - `rim` 2-4 : un liseré dore le long de la plaque. Plus graphique.
 *
 * Le ciel est FIGE par defaut (`weatherPeriod` sans derive) pour qu'on puisse
 * juger l'accord des deux couches sans que la couverture bouge sous l'oeil.
 * Mets `06 - Meteo` pour la voir vivre.
 *
 * A juger EN MOUVEMENT : une capture ne montre pas la frange qui se deforme,
 * et c'est elle qui vend l'effet.
 */
import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  createCloudShadowsNoise, CLOUD_SHADOW_NOISE_DEFAULTS, CLOUD_LIGHT_DEFAULTS,
  type CloudShadowsNoise, type CloudShadowNoiseOptions,
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
  /** Le champ de bruit, partage par les deux couches. */
  scale: number;
  speed: number;
  angle: number;
  morph: number;
  coverage: number;
  edge: number;
  /** L'ombre. */
  shadowColor: string;
  shadowAlpha: number;
  /** La lumiere. */
  sun: boolean;
  sunColor: string;
  sunColorB: string;
  gradient: number;
  breath: number;
  sunAlpha: number;
  rim: number;
  /** Seconde a zero = ciel fige. */
  weatherPeriod: number;
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
        let sun: CloudShadowsNoise | null = null;
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

          // Le champ de bruit, ecrit UNE fois : les deux couches doivent lire
          // le meme ciel, sinon la lumiere ne tombe pas ou l'ombre s'arrete.
          const field: CloudShadowNoiseOptions = {
            halfW: HALF_W,
            halfH: HALF_H,
            iso: CLOUD_SHADOW_NOISE_DEFAULTS.iso,
            scale: args.scale,
            speed: args.speed,
            angle: args.angle,
            morph: args.morph,
            octaves: CLOUD_SHADOW_NOISE_DEFAULTS.octaves,
            warp: CLOUD_SHADOW_NOISE_DEFAULTS.warp,
            coverage: args.coverage,
            edge: args.edge,
            pixel: CLOUD_SHADOW_NOISE_DEFAULTS.pixel,
            // Un ciel fige par defaut : coverageMin === coverageMax coupe la
            // derive, et le seuil reste celui du slider.
            coverageMin: args.weatherPeriod > 0 ? 0.3 : args.coverage,
            coverageMax: args.weatherPeriod > 0 ? 0.8 : args.coverage,
            weatherPeriod: args.weatherPeriod || 240,
          };

          shadows = createCloudShadowsNoise(WIDTH, HEIGHT, {
            ...field,
            color: hex(args.shadowColor),
            alpha: args.shadowAlpha,
            // L'ombre respire AUSSI, en sens contraire de la lumiere (le
            // shader s'en charge via `lit`) : couvert, elle pese plus au
            // moment ou le soleil s'eteint. Moins fort que la lumiere, parce
            // qu'une ombre qui double d'opacite bouche l'ile alors que la
            // chaleur peut se permettre de disparaitre tout a fait.
            breath: args.breath * 0.6,
          });
          stage.addChild(shadows.view);

          if (args.sun) {
            sun = createCloudShadowsNoise(WIDTH, HEIGHT, {
              ...field,
              lit: 1,
              rim: args.rim,
              color: hex(args.sunColor),
              colorB: hex(args.sunColorB),
              gradient: args.gradient,
              breath: args.breath,
              alpha: args.sunAlpha,
            });
            sun.view.blendMode = 'overlay';
            stage.addChild(sun.view);
          }

          tick.current = (ms) => {
            view?.update(ms);
            shadows?.update(ms);
            sun?.update(ms);
            // La couverture vivante de l'ombre recopiee dans la lumiere : sans
            // ca les deux couches decrivent deux ciels des que la meteo bouge.
            if (sun && shadows) sun.set('coverage', shadows.coverage);
          };
        })();

        return () => {
          shadows?.destroy();
          sun?.destroy();
          shadows = null;
          sun = null;
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
const L = CLOUD_LIGHT_DEFAULTS;

const meta: Meta<Args> = {
  title: 'Island/Cloud Sun Warm',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  argTypes: {
    scale: { control: { type: 'range', min: 0.5, max: 6, step: 0.1 } },
    speed: { control: { type: 'range', min: 0, max: 0.2, step: 0.005 } },
    angle: { control: { type: 'range', min: 0, max: 360, step: 5 } },
    morph: { control: { type: 'range', min: 0, max: 0.3, step: 0.005 } },
    coverage: { control: { type: 'range', min: 0.3, max: 0.8, step: 0.01 } },
    edge: { control: { type: 'range', min: 0.01, max: 0.3, step: 0.01 } },
    shadowColor: { control: 'color' },
    shadowAlpha: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    sun: { control: 'boolean' },
    sunColor: { control: 'color' },
    sunColorB: { control: 'color' },
    gradient: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    breath: { control: { type: 'range', min: 0, max: 1.5, step: 0.05 } },
    sunAlpha: { control: { type: 'range', min: 0, max: 0.8, step: 0.01 } },
    rim: { control: { type: 'range', min: 0, max: 8, step: 0.5 } },
    weatherPeriod: { control: { type: 'range', min: 0, max: 300, step: 5 } },
  },
  args: {
    scale: D.scale,
    speed: D.speed,
    angle: D.angle,
    morph: D.morph,
    coverage: D.coverage,
    edge: D.edge,
    shadowColor: '#10203a',
    shadowAlpha: D.alpha,
    sun: true,
    sunColor: '#ffe9a8',
    sunColorB: '#ff9d5c',
    gradient: L.gradient,
    breath: L.breath,
    sunAlpha: L.alpha,
    rim: 0,
    weatherPeriod: 0,
  },
  render: (args) => <Scene {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** Le champ degage entier rechauffe : de la meteo, l'ile respire. */
export const Champ: Story = { name: '01 - Champ clair', args: { rim: 0 } };

/** Un liseré dore le long de la plaque : plus graphique, plus pixel art. */
export const Lisere: Story = { name: '02 - Lisere', args: { rim: 3, sunAlpha: 0.3 } };

/** La meme sans la couche claire — le temoin, pour voir ce qu'elle apporte. */
export const SansSoleil: Story = { name: '03 - Sans soleil', args: { sun: false } };

/** Pousse a bout : ou le jaune commence a mentir. */
export const Force: Story = { name: '04 - Force', args: { sunAlpha: 0.5 } };

/** Un seul grand nuage en travers, pour lire la frange sur un long bord. */
export const Grand: Story = {
  name: '05 - Grand nuage',
  args: { scale: 1.2, rim: 3, sunAlpha: 0.3 },
};

/** La meteo relachee sur vingt secondes : les deux couches doivent rester accordees. */
export const Meteo: Story = { name: '06 - Meteo', args: { weatherPeriod: 20 } };

/**
 * Le degrade seul, pousse a fond et sans respiration — pour lire la rampe
 * jaune-orange de haut en bas sans que rien d'autre ne bouge.
 */
export const Degrade: Story = {
  name: '07 - Degrade fort',
  args: { gradient: 1, breath: 0, sunAlpha: 0.32, weatherPeriod: 0 },
};

/** Le temoin du degrade : teinte plate, meme alpha. Compare avec 07. */
export const SansDegrade: Story = {
  name: '08 - Sans degrade',
  args: { gradient: 0, breath: 0, sunAlpha: 0.32, weatherPeriod: 0 },
};

/**
 * Ciel CHARGE, fige. Beaucoup de nuages, donc pas de soleil : l'ombre pese
 * et la couche claire doit etre presque eteinte.
 *
 * C'est la moitie de la preuve — a lire avec `10 - Ciel degage`, ou c'est
 * l'inverse. Le ciel est fige expres pour que les deux captures soient
 * comparables ; sur une meteo qui tourne on ne saurait pas a quel instant
 * du cycle on regarde.
 */
export const CielCharge: Story = {
  name: '09 - Ciel charge',
  args: { coverage: 0.34, breath: 1.2, weatherPeriod: 0 },
};

/** Ciel DEGAGE, fige. Peu de nuages, donc le soleil tape franc. */
export const CielDegage: Story = {
  name: '10 - Ciel degage',
  args: { coverage: 0.76, breath: 1.2, weatherPeriod: 0 },
};

/** Le cycle entier en vingt secondes, respiration appuyee — a regarder bouger. */
export const Respiration: Story = {
  name: '11 - Respiration',
  args: { breath: 1.2, weatherPeriod: 20 },
};
