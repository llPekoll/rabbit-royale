/**
 * Le gris de fin de course, avec ses curseurs.
 *
 * Quand le lapin local depense son dernier point, la carte se vide de sa
 * couleur (`Drain`, un `ColorMatrixFilter` sur le conteneur de l'ile et la
 * mer derriere). Le recap DIT "Out of hearts" ; ce filtre est la partie qu'on
 * voit sans lire. Il se juge a l'oeil, sur la scene reelle, et c'est pour ca
 * que la story existe : `drainMatrix` a deux nombres, la progression et la
 * luminosite finale, et ni l'un ni l'autre ne se devine.
 *
 * ## Ce qu'il faut regarder
 *
 * A `progress` 1, le plateau doit rester LISIBLE sous le recap : on doit
 * encore voir ou la course s'est arretee. Gris, pas noir. Et a mi-chemin, la
 * carte ne doit pas etre grise mais encore pleine lumiere : la matrice melange
 * la desaturation et l'assombrissement du meme pas, le curseur permet de le
 * verifier.
 *
 * `bloom` superpose le vrai bloom du jeu (BLOOM_LOOK), parce qu'en jeu les
 * deux filtres s'empilent et qu'un gris juge sans le halo n'est pas celui que
 * le joueur voit.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorMatrixFilter, type Filter } from 'pixi.js';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { BloomFilter } from '@/game/fx/BloomFilter';
import { BLOOM_LOOK } from '@/config/bloomLook';
import { drainMatrix, DRAIN_BRIGHTNESS, DRAIN_SECONDS } from '@/game/fx/Drain';
import { generateIsland, IsoIslandView, loadIslandTileset } from '@/game/island';

const WIDTH = 960;
const HEIGHT = 540;
const SEA = '#0d8296';

interface Args {
  /** Le filtre, pour juger la scene sans lui. */
  enabled: boolean;
  /** 0 = pleine couleur, 1 = vide. Ignore quand `animate` tourne. */
  progress: number;
  /** La luminosite du gris final (DRAIN_BRIGHTNESS en jeu). */
  brightness: number;
  /** Rejoue le fondu 0 -> 1 en boucle, a la duree du jeu. */
  animate: boolean;
  seconds: number;
  /** Le bloom du jeu par-dessus, comme en jeu. */
  bloom: boolean;
  seed: string;
  land: number;
}

function Scene(args: Args) {
  let tileset: Awaited<ReturnType<typeof loadIslandTileset>> | null = null;

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
        const map = generateIsland({
          seed: args.seed, width: 24, height: 24, tiers: 3, land: args.land, rise: 0.55, raggedness: 0.4,
        });
        const island = new IsoIslandView({
          map, tileset, ground: 'tiered', deco: true, grass: true, sea: false, foam: true,
          groundScale: 1.52, foamScale: 1.8, metrics: { w: 64, h: 32, z: 26 },
        });
        stage.addChild(island.view);
        const scale = Math.min(WIDTH / island.width, HEIGHT / island.height);
        island.view.scale.set(scale);
        island.view.position.set((WIDTH - island.width * scale) / 2, (HEIGHT - island.height * scale) / 2);

        const filters: Filter[] = [];
        let bloom: BloomFilter | null = null;
        if (args.bloom) {
          bloom = new BloomFilter({ ...BLOOM_LOOK });
          bloom.setResolution(app.renderer.resolution);
          filters.push(bloom);
        }
        const drain = new ColorMatrixFilter();
        const state = { t: args.progress };
        const apply = () => {
          drain.matrix = drainMatrix(state.t, args.brightness) as ColorMatrixFilter['matrix'];
        };
        apply();
        if (args.enabled) filters.push(drain);
        stage.filters = filters;

        let tween: gsap.core.Tween | null = null;
        if (args.enabled && args.animate) {
          state.t = 0;
          tween = gsap.to(state, {
            t: 1, duration: args.seconds, ease: 'power2.out', repeat: -1, repeatDelay: 1.2, onUpdate: apply,
          });
        }

        const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
        app.ticker.add(ticker);
        return () => {
          app.ticker.remove(ticker);
          tween?.kill();
          stage.filters = [];
          drain.destroy();
          bloom?.destroy();
          island.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Drain',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  argTypes: {
    progress: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    brightness: { control: { type: 'range', min: 0.2, max: 1, step: 0.01 } },
    seconds: { control: { type: 'range', min: 0.2, max: 3, step: 0.1 } },
    seed: { control: 'text' },
    land: { control: { type: 'range', min: 0.15, max: 0.85, step: 0.01 } },
  },
  args: {
    enabled: true,
    progress: 1,
    brightness: DRAIN_BRIGHTNESS,
    animate: false,
    seconds: DRAIN_SECONDS,
    bloom: true,
    seed: 'harbour-9',
    land: 0.46,
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Le gris du jeu, tel qu'il ship : progression 1, luminosite 0.7, sous le bloom. */
export const Shipped: Story = {};

/** La reference : la meme scene sans le filtre. */
export const Reference: Story = { args: { enabled: false } };

/** Mi-chemin : la carte doit etre a moitie grise ET a moitie assombrie. */
export const Halfway: Story = { args: { progress: 0.5 } };

/** Le fondu du jeu, rejoue en boucle a la duree reelle. */
export const Fade: Story = { args: { animate: true } };
