/**
 * The BIG lightning bolt, landing on a rabbit.
 *
 * This exists to answer one question the sheet alone cannot: how large is the
 * strike NEXT TO A RABBIT? The art is 195x220 against a 44x24 tile and a
 * rabbit drawn at roughly 77px tall, so at 1:1 the bolt stands nearly three
 * rabbits high and swallows a quarter of the board. `scale` is the control
 * that matters here — the island, the tiles and the rabbit are all here to
 * give the eye something to judge that scale against, which is why this story
 * drives the REAL entities rather than a stand-in rectangle.
 *
 * Two things about the animation are easy to get wrong and only visible:
 *
 *   - it is anchored at its FOOT. The art splashes at the very bottom of its
 *     cell, so anchored centrally the whole strike floats half its height
 *     above the rabbit it is meant to hit. `CentreAnchored` keeps that bug as
 *     a story, for contrast.
 *   - frames 13 and 14 are BLANK on purpose — the sparks flicker out and come
 *     back. `Slow` ships so the gap can be seen to be the art's rather than
 *     the slicer's dropping frames.
 *
 * `bun run storybook` (port 6007).
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Container, Graphics } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import {
  loadAllAssets,
  getLightningBoltTextures,
  LIGHTNING_BOLT_FOOT,
  LIGHTNING_BOLT_FRAMES,
} from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createIslandBackground } from '@/game/services/IslandBackground';
import * as Keys from '@/config/assetKeys';
import { COLS, ROWS, SPAWN_INDEX, makeShape, isForbidden, tilePos } from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;
const SEED = 'storybook';

/** The tile the bolt aims at — the spawn, so the rabbit is already standing on it. */
const TARGET = SPAWN_INDEX;

interface Args {
  /** How large the bolt is drawn, as a multiple of its 195x220 art. */
  scale: number;
  /** Frames per second the strike plays at. */
  fps: number;
  /** Anchor the bolt at its foot (true) or its middle — the bug, for contrast. */
  footAnchor: boolean;
  /** Draw the board and a rabbit under it, for a sense of size. */
  rabbit: boolean;
  /** Outline the sprite's cell, so the art's true footprint is visible. */
  showBounds: boolean;
  /** The island art behind the board. */
  background: boolean;
  /** Seconds between repeats, so the story loops without a click. */
  every: number;
}

function Scene(args: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background="#1eaac4"
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        let bg: { destroy(): void } | null = null;
        if (args.background) {
          void createIslandBackground(stage, WIDTH / 2, HEIGHT / 2, SEED).then((b) => {
            bg = b;
            b.layout(WIDTH / 2, HEIGHT / 2, 1.75);
          });
        }

        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);

        const { x, y } = tilePos(TARGET);

        let victim: PlayerRabbit | null = null;
        if (args.rabbit) {
          // Tiles left in FOG on purpose. `revealContent('empty', 0)` — which
          // is what a story wanting a "clean" board reaches for — fades the
          // fog diamond away and, on an empty tile with no adjacent bombs,
          // draws nothing in its place: the board goes invisible and the bolt
          // appears to strike bare ground.
          const shape = makeShape(SEED);
          for (let i = 0; i < COLS * ROWS; i++) {
            if (isForbidden(i, shape)) continue;
            world.addChild(new Tile(i).container);
          }
          victim = new PlayerRabbit(TARGET, Keys.BUNNY_WHITE);
          world.addChild(victim.container);
          victim.playSpawnDrop();
        }

        // The sprite's own cell, drawn as a box. Without it the eye reads the
        // GLOW as the edge of the art and guesses the footprint too small.
        let bounds: Graphics | null = null;
        if (args.showBounds) {
          const w = 195 * args.scale;
          const h = 220 * args.scale;
          bounds = new Graphics()
            .rect(x - w / 2, y - h * LIGHTNING_BOLT_FOOT, w, h)
            .stroke({ width: 1, color: 0xff3355, alpha: 0.9 });
          bounds.zIndex = 200;
          world.addChild(bounds);
        }

        const timers = new Set<number>();
        const strike = () => {
          const textures = getLightningBoltTextures();
          if (textures.length === 0) return;
          const sprite = new AnimatedSprite(textures);
          sprite.anchor.set(0.5, args.footAnchor ? LIGHTNING_BOLT_FOOT : 0.5);
          sprite.position.set(x, y);
          sprite.scale.set(args.scale);
          sprite.zIndex = 60;
          sprite.animationSpeed = args.fps / 60;
          sprite.loop = false;
          sprite.onComplete = () => { world.removeChild(sprite); sprite.destroy(); };
          world.addChild(sprite);
          sprite.play();

          // The rabbit reacts on the frame the bolt actually LANDS rather than
          // on the first: the strike opens with a flash and the bolt arrives a
          // few frames in, and a rabbit flinching before it is hit reads as
          // the animation being out of sync with itself.
          if (victim) {
            const t = window.setTimeout(
              () => { timers.delete(t); victim?.playDamage(); },
              (5 / args.fps) * 1000,
            );
            timers.add(t);
          }
        };
        strike();
        const loop = window.setInterval(strike, args.every * 1000);

        return () => {
          window.clearInterval(loop);
          for (const t of timers) window.clearTimeout(t);
          victim?.destroy();
          bounds?.destroy();
          bg?.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Lightning bolt',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    scale: 0.5,
    fps: 24,
    footAnchor: true,
    rabbit: true,
    showBounds: false,
    background: true,
    every: 3,
  },
  argTypes: {
    scale: { control: { type: 'range', min: 0.1, max: 2, step: 0.05 } },
    fps: { control: { type: 'range', min: 4, max: 60, step: 1 } },
    every: { control: { type: 'range', min: 1, max: 10, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The strike on a rabbit at half size — roughly 98x110, so the bolt stands
 * about one and a half rabbits tall. This is the size to argue about.
 */
export const Default: Story = {};

/**
 * The art at 1:1, which is what the sheet ships: 195x220 against a 44x24 tile.
 * Kept as a story because the number only means something once seen — the bolt
 * covers a good part of the board and the rabbit under it disappears.
 */
export const FullSize: Story = { args: { scale: 1, showBounds: true } };

/**
 * Small enough to read as a tile effect rather than a set piece, for a strike
 * that might go off on several tiles at once without swamping the board.
 */
export const TileSized: Story = { args: { scale: 0.25 } };

/**
 * The anchor bug, kept because it is the failure that looks almost right:
 * anchored centrally the strike floats half its height up and the splash lands
 * in mid-air, well above the rabbit it is meant to hit.
 */
export const CentreAnchored: Story = { args: { footAnchor: false, showBounds: true } };

/**
 * Slowed right down, to look at all 27 frames one by one — the opening flash,
 * the bolt, the deliberate blank frames mid-run, and the sparks dying out.
 */
export const Slow: Story = { args: { fps: 6, every: Math.ceil(LIGHTNING_BOLT_FRAMES / 6) + 2 } };

/** The bare strike, with no board and no rabbit, for judging the art alone. */
export const ArtOnly: Story = { args: { rabbit: false, background: false, scale: 1, showBounds: true } };
