/**
 * The sea's DEPTH: a gradient under the island, radial or linear.
 *
 * `Island/Water` settled what the water does — the surf on the coast, the
 * contour lines drifting on it, the ducks. All of that happens on a flat
 * colour, and on a wide screen that flatness is what reads as wrong: the
 * island is pasted onto blue paper rather than floating in water. This story
 * is for choosing the shape of the depth that fixes it.
 *
 * Both gradients are shown against the REAL island, with the real surf and
 * the real surface texture on top. A gradient judged on an empty canvas is a
 * gradient judged without the thing it exists to sit under — the darkening
 * that looks right alone is invariably too strong once a coastline is on it.
 *
 * The dial that matters most is `strength`, and the second is `softness`. The
 * failure mode of this effect is a visible EDGE — a disc of darker blue with
 * the island in it, which reads as a shadow cast on the water by something
 * off-screen. Softness near 1 and a radius past the island's own footprint is
 * what turns the disc back into depth.
 */
import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { createSeaGradient, type SeaGradient } from '@/game/fx/SeaGradient';
import { createPackWater, loadPackWater, type PackWater } from '@/game/fx/PackWater';
import { createSurfaceTexture, type SurfaceTexture } from '@/game/fx/SurfaceTexture';
import {
  generateIsland, levelAt, IsoIslandView, loadIslandTileset, isoBounds,
} from '@/game/island';
import { HALF_W, HALF_H, TIER_LIFT } from '@/config/gridConfig';
import { WATER_LOOK } from '@/config/waterLook';

const WIDTH = 960;
const HEIGHT = 540;

interface Args {
  seed: string;
  /** Grid size, in cells. */
  cells: number;
  tiers: number;

  /** The far water. Also the canvas background — the two must agree. */
  seaColor: string;

  /** The depth under the island. */
  gradient: boolean;
  /** 'radial' pools it under the island; 'linear' sinks it downward. */
  mode: 'radial' | 'linear';
  /** The colour at its strongest: darker and bluer than the sea. */
  deepColor: string;
  /** How much of that colour is allowed in, 0 to 1. */
  strength: number;
  /** How gradual the ramp is. Low values draw a visible disc. */
  softness: number;
  /** How far the deep reaches, as a share of the frame. Radial only. */
  radius: number;
  /** X stretch of the falloff. 44/24 matches the board's own diamond. */
  aspect: number;
  /** Where the deep sits, as a share of the frame. */
  centerX: number;
  centerY: number;
  /**
   * Degrees, for the slider.
   *
   * Radial: the tilt of the ellipse, which is the dial that puts the pool in
   * PERSPECTIVE — laid along the island's diagonal instead of square to the
   * screen. Linear: 0 puts the deep at the bottom.
   */
  angle: number;
  /** Palette steps in the ramp. 0 leaves it smooth, which reads as CGI. */
  steps: number;

  /**
   * Les trainees : le dust des rais, couche sur la mer et lu au sol.
   * 0 les eteint ; le plan redevient le degrade immobile qu'il etait.
   */
  streaks: number;
  streakScale: number;
  streakStretch: number;
  streakSpeed: number;
  streakMorph: number;
  streakColor: string;
  /** L'une ou l'autre diagonale du sol. */
  streakAxis: 'x' | 'y';
  /** Snap du bruit en pixels, 0 = lisse. */
  streakPixel: number;

  /** The surf and the contour lines, so the gradient is judged in context. */
  foam: boolean;
  surface: boolean;
}

function Scene(args: Args) {
  const tick = useRef<((ms: number) => void) | null>(null);
  const {
    seed, cells, tiers, seaColor,
    gradient, mode, deepColor, strength, softness, radius, aspect,
    centerX, centerY, angle, steps,
    foam, surface,
  } = args;

  return (
    <PixiStage
      key={JSON.stringify(args)}
      width={WIDTH}
      height={HEIGHT}
      background={seaColor}
      prepare={loadIslandTileset}
      setup={(stage) => {
        let depth: SeaGradient | null = null;
        let water: PackWater | null = null;
        let island: IsoIslandView | null = null;
        let sea: SurfaceTexture | null = null;

        void (async () => {
          const tileset = await loadIslandTileset();
          const map = generateIsland({
            seed, tiers, width: cells, height: Math.round(cells * 0.8),
          });
          const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };
          const bounds = isoBounds(map.width, map.height, map.tiers, metrics, HALF_H * 2);
          const ox = Math.round((WIDTH - bounds.width) / 2);
          const oy = Math.round((HEIGHT - bounds.height) / 2);

          // FIRST child: the depth is the ground everything else lies on.
          if (gradient) {
            depth = createSeaGradient(WIDTH, HEIGHT, {
              mode,
              sea: Number(seaColor.replace('#', '0x')),
              deep: Number(deepColor.replace('#', '0x')),
              center: [centerX, centerY],
              radius,
              aspect,
              softness,
              strength,
              angle: (angle * Math.PI) / 180,
              steps,
              streaks: args.streaks,
              streakScale: args.streakScale,
              streakStretch: args.streakStretch,
              streakSpeed: args.streakSpeed,
              streakMorph: args.streakMorph,
              streakColor: Number(args.streakColor.replace('#', '0x')),
              streakAxis: args.streakAxis,
              streakPixel: args.streakPixel,
              // La demi-dalle du plateau, la meme que `metrics` : c'est ce
              // qui fait longer aux trainees EXACTEMENT les diagonales des
              // tuiles dessinees, au lieu de courir de travers.
              halfTile: [HALF_W, HALF_H],
            });
            stage.addChild(depth.view);
          }

          // The moving surface over it.
          //
          // `SurfaceTexture` is OPAQUE — it mixes its lines into its own `sea`
          // colour and fills the plane with the result — so laid on normally
          // it would simply repaint the gradient away. Its base is set to
          // BLACK and the layer blended additively instead: black adds
          // nothing, so what survives is only the lines themselves, and the
          // depth underneath reads through everywhere between them.
          //
          // The game will want the same trick when this lands for real, which
          // is why it is done here rather than by giving the gradient a pass
          // of its own above the water.
          if (surface) {
            sea = createSurfaceTexture(WIDTH, HEIGHT, { sea: 0x000000 });
            sea.view.blendMode = 'add';
            stage.addChild(sea.view);
          }

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
              WATER_LOOK,
            );
          }

          const holder = new Container();
          if (water) holder.addChild(water.view);
          holder.addChild(island.view);
          holder.position.set(ox, oy);
          stage.addChild(holder);

          deco.position.set(ox, oy);
          stage.addChild(deco);
          island.placeDeco(0, 0);

          tick.current = (ms) => {
            // Le degrade aussi, depuis qu'il porte les trainees.
            depth?.update(ms);
            sea?.update(ms);
            water?.update(ms);
            island?.update(ms);
          };
        })();

        return () => {
          depth?.destroy();
          water?.destroy();
          sea?.destroy();
          depth = null;
          water = null;
          sea = null;
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
  title: 'Island/Sea gradient',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  argTypes: {
    cells: { control: { type: 'range', min: 8, max: 30, step: 1 } },
    tiers: { control: { type: 'range', min: 1, max: 4, step: 1 } },
    seaColor: { control: 'color' },
    gradient: { control: 'boolean' },
    mode: { control: 'inline-radio', options: ['radial', 'linear'] },
    deepColor: { control: 'color' },
    strength: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    softness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    radius: { control: { type: 'range', min: 0.1, max: 1.5, step: 0.02 } },
    aspect: { control: { type: 'range', min: 0.5, max: 4, step: 0.05 } },
    centerX: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    centerY: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    angle: { control: { type: 'range', min: -180, max: 180, step: 1 } },
    steps: { control: { type: 'range', min: 0, max: 40, step: 1 } },
    streaks: { control: { type: 'range', min: 0, max: 0.8, step: 0.01 } },
    streakScale: { control: { type: 'range', min: 0.1, max: 3, step: 0.05 } },
    streakStretch: { control: { type: 'range', min: 1, max: 12, step: 0.5 } },
    streakSpeed: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    streakMorph: { control: { type: 'range', min: 0, max: 0.5, step: 0.01 } },
    streakColor: { control: 'color' },
    streakAxis: { control: 'inline-radio', options: ['x', 'y'] },
    streakPixel: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    foam: { control: 'boolean' },
    surface: { control: 'boolean' },
  },
  args: {
    seed: 'harbour-9', cells: 18, tiers: 3,
    // The game's own BG_COLOR, so what is tuned here is what the island sits on.
    // The DARK open sea: this is what the frame's edges are, and what the game
    // now clears the viewport to. The pale teal is the pool under the island.
    seaColor: '#0d5f8c',
    gradient: true, mode: 'radial', deepColor: '#1eaac4',
    // Tuned on the real island, in Storybook. These are the numbers that ship
    // — `config/waterLook.ts` holds the same ones for the game.
    strength: 1, softness: 0.56, radius: 0.5, aspect: 3.25,
    centerX: 0.5, centerY: 0.55, angle: 175, steps: 40,
    // Les trainees. Les memes nombres que `SEA_GRADIENT_LOOK` dans le jeu.
    streaks: 0.18, streakScale: 0.55, streakStretch: 4,
    streakSpeed: 0.12, streakMorph: 0.05, streakColor: '#5fd3e0',
    streakAxis: 'y', streakPixel: 3,
    // Les anneaux de `SurfaceTexture` ETEINTS par defaut. Ils ne sont pas dans
    // le jeu — seule cette story les montait — et allumes ils recouvrent la
    // mer de cercles clairs qui noient tout ce que le plan dessous fait. Le
    // toggle reste pour qui veut les revoir.
    foam: true, surface: false,
  },
  render: (args) => <Scene {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/**
 * What shipped BEFORE: one colour, edge to edge, nothing under the island.
 *
 * The sea colour is overridden back to the old teal here. With the gradient
 * off, the story's `seaColor` is the only thing painting the water, and that
 * is now the dark open sea — leaving it would show a navy frame rather than
 * the flat teal this story exists to be compared against.
 */
export const Flat: Story = {
  name: '01 · Aplat (avant)',
  args: { gradient: false, seaColor: '#1eaac4' },
};

/**
 * The radial pool, alone.
 *
 * No surf and no surface lines, so the only thing on screen is the shape of
 * the darkening. This is the view for setting `radius` and `softness`: the
 * ellipse should reach past the coast on every side and have no edge you can
 * point at.
 */
export const RadialAlone: Story = {
  name: '02 · Radial nu',
  args: { foam: false, surface: false },
};

/** The radial pool with the water on it — the real comparison against 01. */
export const Radial: Story = {
  name: '03 · Radial',
  args: {},
};

/** The linear reading: the water simply deepens toward the bottom. */
export const Linear: Story = {
  name: '04 · Lineaire',
  args: { mode: 'linear', angle: 0, softness: 0.85, strength: 0.6, centerY: 0.5 },
};

/** Linear along the other axis, for a sea that deepens away from the camera. */
export const LinearUp: Story = {
  name: '05 · Lineaire inverse',
  args: { mode: 'linear', angle: 180, softness: 0.85, strength: 0.6, centerY: 0.5 },
};

/**
 * Hard steps, to see what the quantisation is doing.
 *
 * Four bands rather than twelve. Worth looking at once: it shows that the
 * ramp is the thing being stepped, and it is a legitimate look in its own
 * right if the game ever wants its water banded like a paint-by-numbers.
 */
export const Banded: Story = {
  name: '06 · Bandes',
  args: { steps: 4, softness: 1, strength: 0.85 },
};

/**
 * The ellipse square to the screen, for comparison with the tilted default.
 *
 * This is what the pool looked like before `angle` reached radial mode: a
 * horizontal lozenge under a board whose own axes run on the diagonal. Side
 * by side with `03` it is the clearest picture of what the tilt buys.
 */
export const Untilted: Story = {
  name: '06b · Sans inclinaison',
  args: { angle: 0 },
};

/** Both extremes at once: a strong, tight pool. What NOT to ship, usually. */
export const TooMuch: Story = {
  name: '07 · Trop (contre-exemple)',
  args: { strength: 1, softness: 0.25, radius: 0.45 },
};

/** A bigger board, to check the pool still covers a long coastline. */
export const Wide: Story = {
  name: 'Grande ile',
  args: { cells: 26, tiers: 4, radius: 0.8 },
};
