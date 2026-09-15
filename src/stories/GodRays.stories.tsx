/**
 * Des rais de lumiere sur l'ile, accordes avec les ombres de nuages.
 *
 * La reference est la nef de Diablo II : quelques colonnes obliques, des
 * poussieres dedans, tout le reste dans le noir. Ici c'est la meme lecture en
 * plein jour — l'ile n'est pas une crypte, donc le rai est une eclaircie qui
 * passe et pas un projecteur.
 *
 * ## Les deux effets decrivent UN ciel
 *
 * C'est tout l'interet de cette story et ca ne se voit qu'en regardant les
 * deux ensemble : un rai est un trou dans la couverture nuageuse vu de cote,
 * une plaque d'ombre est le meme trou vu d'en dessous. Les deux shaders lisent
 * donc le meme `fbm`, avec les memes `coverage`/`edge`/`morph`/`octaves`, et
 * `matchCloudShadows()` fabrique les options du rai a partir de celles de
 * l'ombre pour qu'on ne puisse pas les desynchroniser en tournant un dial.
 *
 * Le resultat a chercher a l'oeil : la lumiere tombe sur le sol CLAIR, et
 * s'eteint quand elle arrive sur une plaque sombre. `04 · Desaccorde` montre
 * ce que ca donne quand on casse ce lien, et c'est la preuve que le lien sert
 * a quelque chose — deux ciels superposes, un rai en plein milieu d'une ombre.
 *
 * Il faut la regarder BOUGER. Les plaques se deforment en derivant et les
 * faisceaux avec elles ; une capture ne montre ni la respiration ni les
 * poussieres.
 */
import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  createGodRays, matchCloudShadows, GOD_RAYS_DEFAULTS, type GodRays,
} from '@/game/fx/GodRays';
import {
  createCloudShadowsNoise, CLOUD_SHADOW_NOISE_DEFAULTS, type CloudShadowsNoise,
} from '@/game/fx/CloudShadowsNoise';
import { generateIsland, IsoIslandView, loadIslandTileset, isoBounds } from '@/game/island';
import { HALF_W, HALF_H, TIER_LIFT } from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;
const SEA = '#0d8296';

/**
 * Le meme plateau que `Island/Cloud Shadows (noise)` et `Island/Godot Water`,
 * fixe et hors des controls : ce sont des dials d'ILE, et un panneau qui les
 * melange aux dials de lumiere invite a regler la lumiere en regenerant
 * l'ile. Fixe, une capture d'un changement de dial ne differe que par ce dial.
 */
const SEED = 'harbour-9';
const CELLS = 18;
const TIERS = 3;

interface Args {
  /** Ou est le soleil, en fractions de la frame. Negatif en Y = au-dessus. */
  sourceX: number;
  sourceY: number;
  /** Largeur de l'eventail, en tangente : 0.5 ouvre environ 27 degres. */
  spread: number;
  /** Combien de faisceaux se decoupent dedans. */
  scale: number;
  /** Etirement du bruit le long du rai. Grand = des colonnes franches. */
  softness: number;
  /** Jusqu'ou la lumiere porte, et ce qu'elle mange a son depart. */
  reach: number;
  near: number;
  falloff: number;
  /** Le grain qui vit dans le faisceau. */
  dust: number;

  /**
   * Partages avec les ombres de nuages — ces quatre-la vont AUX DEUX shaders.
   * Les bouger deplace le meme ciel des deux cotes.
   */
  coverage: number;
  edge: number;
  morph: number;
  octaves: number;

  color: string;
  alpha: number;
  pixel: number;

  /** Les ombres au sol, pour pouvoir juger le rai seul. */
  shadows: boolean;
  /** Le rai, pour pouvoir juger les ombres seules. */
  rays: boolean;
  /**
   * Casser l'accord : les ombres gardent leur seuil, le rai prend le sien.
   * Sert a montrer que l'accord se voit (story 04).
   */
  detune: number;
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
        let rays: GodRays | null = null;
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

          // Le ciel, ecrit UNE fois. Les ombres le lisent tel quel, les rais
          // le recoivent par `matchCloudShadows` — c'est ce passage qui
          // garantit que les deux parlent du meme nuage.
          const sky = {
            halfW: HALF_W,
            halfH: HALF_H,
            coverage: args.coverage,
            // Une seule valeur de couverture ici, pas la meteo qui derive
            // entre un min et un max : la story doit montrer un ciel STABLE
            // qu'on accorde, et une couverture qui bouge toute seule ferait
            // passer un desaccord pour de la meteo.
            coverageMin: args.coverage,
            coverageMax: args.coverage,
            edge: args.edge,
            morph: args.morph,
            octaves: args.octaves,
            pixel: args.pixel,
          };

          if (args.shadows) {
            shadows = createCloudShadowsNoise(WIDTH, HEIGHT, sky);
            stage.addChild(shadows.view);
          }

          if (args.rays) {
            rays = createGodRays(WIDTH, HEIGHT, matchCloudShadows(sky, {
              // La geometrie du faisceau, que les ombres n'ont pas.
              sourceX: args.sourceX,
              sourceY: args.sourceY,
              spread: args.spread,
              scale: args.scale,
              softness: args.softness,
              reach: args.reach,
              near: args.near,
              falloff: args.falloff,
              dust: args.dust,
              color: hex(args.color),
              alpha: args.alpha,
              // Applique APRES le `coverage` accorde, donc un detune non nul
              // est la seule facon de les faire diverger.
              coverage: args.coverage + args.detune,
            }));
            stage.addChild(rays.view);
          }

          tick.current = (ms) => {
            view?.update(ms);
            shadows?.update(ms);
            rays?.update(ms);
          };
        })();

        return () => {
          rays?.destroy();
          shadows?.destroy();
          rays = null;
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

const R = GOD_RAYS_DEFAULTS;
const C = CLOUD_SHADOW_NOISE_DEFAULTS;

const meta: Meta<Args> = {
  title: 'Island/God Rays',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  argTypes: {
    sourceX: { control: { type: 'range', min: -1, max: 2, step: 0.02 } },
    sourceY: { control: { type: 'range', min: -3, max: 0.5, step: 0.02 } },
    spread: { control: { type: 'range', min: 0.05, max: 2, step: 0.01 } },
    scale: { control: { type: 'range', min: 0.5, max: 12, step: 0.1 } },
    softness: { control: { type: 'range', min: 0.2, max: 10, step: 0.1 } },
    reach: { control: { type: 'range', min: 0.3, max: 4, step: 0.05 } },
    near: { control: { type: 'range', min: 0, max: 1.5, step: 0.01 } },
    falloff: { control: { type: 'range', min: 0.2, max: 4, step: 0.05 } },
    dust: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    coverage: { control: { type: 'range', min: 0.2, max: 0.9, step: 0.01 } },
    edge: { control: { type: 'range', min: 0.01, max: 0.4, step: 0.01 } },
    morph: { control: { type: 'range', min: 0, max: 0.5, step: 0.005 } },
    octaves: { control: { type: 'range', min: 1, max: 4, step: 0.1 } },
    color: { control: 'color' },
    alpha: { control: { type: 'range', min: 0, max: 0.8, step: 0.01 } },
    pixel: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    detune: { control: { type: 'range', min: -0.3, max: 0.3, step: 0.01 } },
  },
  args: {
    sourceX: R.sourceX,
    sourceY: R.sourceY,
    spread: R.spread,
    scale: R.scale,
    softness: R.softness,
    reach: R.reach,
    near: R.near,
    falloff: R.falloff,
    dust: R.dust,
    coverage: C.coverage,
    edge: R.edge,
    morph: C.morph,
    octaves: R.octaves,
    color: '#fff2cf',
    alpha: R.alpha,
    pixel: R.pixel,
    shadows: true,
    rays: true,
    detune: 0,
  },
  render: (args) => <Scene {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** Le reglage plein jour : les rais et leurs ombres, accordes. */
export const Accordes: Story = {
  name: '01 · Accordes',
  args: {},
};

/**
 * Les rais seuls, sans les plaques d'ombre.
 *
 * Ce qu'il faut y voir : le faisceau se decoupe quand meme, parce que c'est le
 * bruit du nuage qui le decoupe. Enlever les ombres n'enleve pas le ciel, ca
 * enleve juste sa trace au sol.
 */
export const RaisSeuls: Story = {
  name: '02 · Rais seuls',
  args: { shadows: false },
};

/**
 * La reference, en plus appuye : peu de faisceaux, longs, bien separes, avec
 * beaucoup de poussiere.
 *
 * `spread` serre et `scale` bas ne laissent passer que deux ou trois colonnes,
 * `softness` haut les tient droites sur toute leur longueur. C'est le reglage
 * "nef", garde comme borne haute — le defaut (story 01) est volontairement en
 * deca.
 */
export const Cathedrale: Story = {
  name: '03 · Cathedrale',
  args: {
    spread: 0.34,
    scale: 1.6,
    softness: 6,
    reach: 3.6,
    near: 0.9,
    falloff: 1.0,
    dust: 0.55,
    alpha: 0.34,
  },
};

/**
 * Le meme ciel, lu par deux shaders qui ne sont plus d'accord.
 *
 * `detune` decale le seuil du rai de celui de l'ombre : les faisceaux tombent
 * alors n'importe ou, y compris en plein milieu d'une plaque sombre, et ca se
 * lit tout de suite comme deux calques superposes. C'est la story qui justifie
 * `matchCloudShadows()`.
 */
export const Desaccorde: Story = {
  name: '04 · Desaccorde (contre-exemple)',
  args: { detune: 0.22 },
};

/**
 * Sans quantification : `pixel` a 0 laisse les bords lisses.
 *
 * Le defaut est a 3 pour que le fondu ait le meme grain en escalier que les
 * tuiles ; a 0 la lumiere est propre mais flotte au-dessus d'un pixel art au
 * lieu de reposer dedans.
 */
export const Lisse: Story = {
  name: '05 · Sans pixelisation',
  args: { pixel: 0 },
};
