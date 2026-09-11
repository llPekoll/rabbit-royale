/**
 * The lightning strike, on the board it lands on.
 *
 * Art fails by LOOKING WRONG rather than by throwing, and this one has three
 * ways to do it that no test can catch:
 *
 *   - the bolt is anchored at its FOOT, because the art draws it falling from
 *     the top of its cell and splashing at the bottom. Anchored centrally it
 *     hovers half a tile up.
 *   - a strike covers several tiles, and bolts going off on the same frame
 *     read as one big sprite rather than as a strike spreading.
 *   - two shapes ship, picked by tile index, so neighbouring tiles rarely get
 *     the same silhouette. One shape reads as a stamp.
 *
 * All three are eye problems, so they belong here.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { loadAllAssets, getLightningTextures, LIGHTNING_FOOT, LIGHTNING_SHAPES } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { Tile } from '@/game/entities/Tile';
import { LIGHTNING } from '@config/tuning';
import { farmableTiles, tierLift, terrainFor } from '@/lib/game/terrainBoard';
import { strikeArea } from '@/lib/game/lightning';
import { tilePos } from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;
const SEED = 'harbour-9';

interface Args {
  /** Frames per second the bolt plays at. */
  fps: number;
  /** Milliseconds between each tile in the area going off. */
  stagger: number;
  /** Anchor the bolt at its foot (true) or its middle — the bug, for contrast. */
  footAnchor: boolean;
  /** Draw the board under it. */
  board: boolean;
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
        terrainFor(SEED);

        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);

        if (args.board) {
          for (const i of farmableTiles(SEED)) {
            const tile = new Tile(i, undefined, tierLift(SEED, i));
            tile.revealContent('empty', 0, false);
            world.addChild(tile.container);
          }
        }

        // A strike in the middle of the island, so the whole area is on screen.
        const playable = farmableTiles(SEED);
        const target = playable[Math.floor(playable.length / 2)];
        const area = strikeArea(SEED, target);

        const timers = new Set<number>();
        const bolt = (index: number) => {
          const textures = getLightningTextures(index % LIGHTNING_SHAPES);
          if (textures.length === 0) return;
          const { x, y } = tilePos(index);
          const sprite = new AnimatedSprite(textures);
          sprite.anchor.set(0.5, args.footAnchor ? LIGHTNING_FOOT : 0.5);
          sprite.position.set(x, y - tierLift(SEED, index));
          sprite.zIndex = 60;
          sprite.animationSpeed = args.fps / 60;
          sprite.loop = false;
          sprite.onComplete = () => { world.removeChild(sprite); sprite.destroy(); };
          world.addChild(sprite);
          sprite.play();
        };

        const fire = () => {
          area.forEach((index, i) => {
            const t = window.setTimeout(() => { timers.delete(t); bolt(index); }, i * args.stagger);
            timers.add(t);
          });
        };
        fire();
        const loop = window.setInterval(fire, args.every * 1000);

        return () => {
          window.clearInterval(loop);
          for (const t of timers) window.clearTimeout(t);
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Lightning',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    fps: 14,
    stagger: LIGHTNING.STAGGER_MS,
    footAnchor: true,
    board: true,
    every: 3,
  },
  argTypes: {
    fps: { control: { type: 'range', min: 4, max: 30, step: 1 } },
    stagger: { control: { type: 'range', min: 0, max: 200, step: 10 } },
    every: { control: { type: 'range', min: 1, max: 8, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** A strike on the middle of the island, repeating. */
export const Default: Story = {};

/**
 * The anchor bug, kept as a story because it is the failure that looks almost
 * right: anchored centrally, every bolt floats half a tile above the ground it
 * is supposed to be hitting, and the splash lands in mid-air.
 */
export const CentreAnchored: Story = { args: { footAnchor: false } };

/**
 * No stagger. Every bolt on the same frame, which is what a naive
 * implementation does — and it reads as one big sprite rather than as a strike
 * spreading outward from where it hit.
 */
export const NoStagger: Story = { args: { stagger: 0 } };

/** The bare bolts, with no board under them, for judging the art alone. */
export const NoBoard: Story = { args: { board: false } };

/** Slowed right down, to look at the six frames one by one. */
export const Slow: Story = { args: { fps: 5, stagger: 200, every: 6 } };
