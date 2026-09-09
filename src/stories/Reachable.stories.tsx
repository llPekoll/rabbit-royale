/**
 * The reachable ring: yellow tiles around the rabbit, a sweep travelling
 * round them, and direction marks on the four a key press covers.
 *
 * This is the game's whole affordance. On an isometric board "which squares can
 * I click?" is not obvious from the geometry, and lighting them answers it with
 * no tutorial. It is also the CLICK target — the Seeker is a touch device, so
 * tapping a lit tile is how the game is really played.
 *
 * Driven by the real `Tile` and `MoveArrows`; what is faked is the server.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { MoveArrows } from '@/game/ui/MoveArrows';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createIslandBackground } from '@/game/services/IslandBackground';
import { CloudField } from '@/game/fx/Clouds';
import * as Keys from '@/config/assetKeys';
import {
  COLS, ROWS, SPAWN_INDEX, makeShape, isForbidden, neighbors, toColRow,
} from '@/config/gridConfig';

interface Args {
  seed: string;
  /** Off to judge the ring's contrast against the art. */
  background: boolean;
  /** Off to see the ring without the keyboard marks. */
  arrows: boolean;
  /** Seconds between blinks as the sweep travels. */
  sweepStep: number;
}

function Scene({ seed, background, arrows, sweepStep }: Args) {
  return (
    <PixiStage
      width={960}
      height={540}
      background="#1eaac4"
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);
        const shape = makeShape(seed);

        let bg: { destroy(): void } | null = null;
        if (background) {
          void createIslandBackground(stage, 480, 270).then((b) => { bg = b; });
        }

        // The sky. Driven by the story's own ticker below, exactly as the scene
        // drives it from Pixi's.
        const sky = new CloudField(stage, { width: 960, height: 540 });
        const ticker = (t: { deltaTime: number }) => sky.update(t.deltaTime * (1000 / 60));
        app.ticker.add(ticker);

        const board = new Container();
        board.sortableChildren = true;
        stage.addChild(board);

        const tiles = new Map<number, Tile>();
        for (let i = 0; i < COLS * ROWS; i++) {
          if (isForbidden(i, shape)) continue;
          const tile = new Tile(i);
          tiles.set(i, tile);
          board.addChild(tile.container);
        }

        const marks = new MoveArrows(board, shape);
        marks.setVisible(arrows);

        const rabbit = new PlayerRabbit(SPAWN_INDEX, Keys.BUNNY_WHITE);
        board.addChild(rabbit.container);

        // The live state the ring follows.
        let at = SPAWN_INDEX;
        let lit: number[] = [];
        let sweep: gsap.core.Tween | null = null;

        const stopSweep = () => { sweep?.kill(); sweep = null; };
        const clear = () => {
          stopSweep();
          for (const i of lit) tiles.get(i)?.setHighlight(false);
          lit = [];
        };

        const refresh = () => {
          clear();
          for (const i of neighbors(at, shape)) {
            tiles.get(i)?.setHighlight(true);
            lit.push(i);
          }
          marks.update(at);

          // Blink round the rabbit by ANGLE, so it reads as a rotating sweep
          // rather than an uncoordinated twinkle.
          const { col: rc, row: rr } = toColRow(at);
          const ring = [...lit].sort((a, b) => {
            const p = toColRow(a); const q = toColRow(b);
            return Math.atan2(p.row - rr, p.col - rc) - Math.atan2(q.row - rr, q.col - rc);
          });
          let step = 0;
          const tick = () => {
            tiles.get(ring[step % ring.length])?.blink();
            step++;
            sweep = gsap.delayedCall(sweepStep, tick);
          };
          tick();
        };

        // Clicking a lit tile moves there — the loop under test.
        for (const [index, tile] of tiles) {
          tile.container.on('pointertap', () => {
            if (!lit.includes(index)) return;
            tile.flash();
            if (!tile.revealed) tile.revealContent('empty', 1 + (index % 3), true);
            rabbit.moveTo(index);
            at = index;
            refresh();
          });
        }

        refresh();
        return () => {
          app.ticker.remove(ticker);
          sky.destroy();
          clear();
          marks.destroy();
          bg?.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Reachable tiles',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { seed: 'reachable', background: true, arrows: true, sweepStep: 0.25 },
  argTypes: {
    seed: { control: 'text' },
    sweepStep: { control: { type: 'range', min: 0.05, max: 1, step: 0.05 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Click a glowing tile to walk onto it — the ring follows. */
export const ClickToMove: Story = {};

/** The ring alone, against flat colour: for judging its contrast. */
export const NoBackground: Story = { args: { background: false } };

/** Without the keyboard marks — the touch-only presentation. */
export const NoArrows: Story = { args: { arrows: false } };
