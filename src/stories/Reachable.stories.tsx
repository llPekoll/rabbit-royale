/**
 * The reachable ring: yellow tiles around the rabbit, a sweep travelling
 * round them, and direction marks on the four a key press covers.
 *
 * This is the game's whole affordance. On an isometric board "which squares can
 * I click?" is not obvious from the geometry, and lighting them answers it with
 * no tutorial. It is also the CLICK target — the Seeker is a touch device, so
 * tapping a lit tile is how the game is really played.
 *
 * Lit means CLICKABLE, not merely adjacent — and that is what these stories are
 * for. The interesting cases are the ones where the two diverge (no energy, a
 * bomb stun), which in a real run last a second and cost a life to reach. Here
 * they are a slider, so the ring can be judged in the states a playtest never
 * holds still long enough to look at.
 *
 * Driven by the real `Tile`, `MoveArrows` and `reachableTiles` — the same rule
 * the scene runs, so a story cannot drift from the game. What is faked is the
 * server: the energy and the stun are the controls.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { MoveArrows } from '@/game/ui/MoveArrows';
import { reachableTiles } from '@/lib/game/reachable';
import { ENERGY } from '@config/tuning';
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
  /**
   * The rabbit's energy. Below one dig's cost the ring can only light ground
   * that is already dug, because that is the only move the server still takes.
   */
  energy: number;
  /**
   * How many of the rabbit's neighbours start already dug, and so stay free to
   * walk onto whatever the energy is.
   *
   * A COUNT rather than a flag, because the case worth looking at is the mixed
   * one: dig all eight and a spent rabbit sees a full ring, dig none and it
   * sees an empty one, and neither picture shows the ring actually choosing.
   */
  dugNeighbours: number;
  /** Hold the rabbit stunned, as a bomb does — the ring stays fully dark. */
  stunned: boolean;
}

function Scene({ seed, background, arrows, sweepStep, energy, dugNeighbours, stunned }: Args) {
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
          void createIslandBackground(stage, 480, 270, seed).then((b) => { bg = b; });
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

        // The live state the ring follows. `left` is the story's stand-in for
        // the server's energy: a dig spends it, and the ring narrows as it runs
        // down — which is the whole thing these stories exist to show.
        let at = SPAWN_INDEX;
        let left = energy;
        let lit: number[] = [];
        let sweep: gsap.core.Tween | null = null;

        // Pre-dig SOME of the spawn's neighbours. Those stay free to walk onto,
        // so on a spent rabbit they are the tiles that stay lit while the rest
        // of the ring goes dark — which is the filter, made visible.
        for (const i of neighbors(SPAWN_INDEX, shape).slice(0, dugNeighbours)) {
          tiles.get(i)?.revealContent('empty', 1 + (i % 3), false);
        }

        const stopSweep = () => { sweep?.kill(); sweep = null; };
        const clear = () => {
          stopSweep();
          for (const i of lit) tiles.get(i)?.setHighlight(false);
          lit = [];
        };

        const refresh = () => {
          clear();
          // The REAL rule, not a copy of it. A story that reimplemented the
          // filter could agree with itself while disagreeing with the game.
          lit = reachableTiles({
            tile: at,
            energy: left,
            alive: true,
            stunnedUntil: stunned ? Date.now() + 60_000 : 0,
            isRevealed: (i) => tiles.get(i)?.revealed ?? false,
          }, shape);
          for (const i of lit) tiles.get(i)?.setHighlight(true);
          marks.update(lit.length > 0 ? at : null, lit);

          // Nothing lit: no sweep to run. The board is legitimately dark, and a
          // sweep with no tiles under it would throw on the modulo below.
          if (lit.length === 0) return;

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
            // A dark tile is not clickable, and the story honours that — the
            // point is a ring you can trust, so it must refuse here too.
            if (!lit.includes(index)) return;
            tile.flash();
            // Digging costs; walking ground already dug is free. Same split the
            // server makes, which is what makes the ring narrow as you go.
            if (!tile.revealed) {
              left -= ENERGY.DIG_COST;
              tile.revealContent('empty', 1 + (index % 3), true);
            }
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
  args: {
    seed: 'reachable',
    background: true,
    arrows: true,
    sweepStep: 0.25,
    energy: 10,
    dugNeighbours: 0,
    stunned: false,
  },
  argTypes: {
    seed: { control: 'text' },
    sweepStep: { control: { type: 'range', min: 0.05, max: 1, step: 0.05 } },
    energy: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    dugNeighbours: { control: { type: 'range', min: 0, max: 8, step: 1 } },
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

/**
 * THE case: three neighbours already dug, and no energy left to dig a fourth.
 *
 * Those three stay lit — walking dug ground is free — and the other five go
 * dark. Half a ring, which is the filter doing its job in the only picture that
 * actually shows it: a full ring and an empty one both look like a rule that
 * isn't being applied.
 *
 * Drag `dugNeighbours` to watch the lit arc grow and shrink.
 */
export const PartiallyLit: Story = { args: { energy: 0, dugNeighbours: 3 } };

/**
 * Two energy left: two digs, and the ring goes out.
 *
 * Walk it down and watch the board close in. This is the story to look at when
 * judging whether running dry READS as a rule the game is applying, or as the
 * game breaking — the difference is entirely in whether the ring dims before
 * the taps stop working, rather than after.
 */
export const RunningLow: Story = { args: { energy: 2, dugNeighbours: 2 } };

/**
 * No energy on a board nobody has dug. Every neighbour costs a dig the rabbit
 * cannot pay, so the ring is fully dark and no tile takes a tap.
 *
 * The ring used to light all eight here — the tap was accepted by the UI, sent,
 * and silently refused, which on a phone is indistinguishable from a dropped
 * input.
 */
export const OutOfEnergy: Story = { args: { energy: 0 } };

/**
 * No energy, but every neighbour is already dug — and dug ground is free to
 * walk. So the whole ring stays lit, and those moves still work.
 *
 * The far end of `PartiallyLit`, and the reason the rule is per-tile rather
 * than a blanket "no energy, no ring": darkening these would strand the player
 * on a board that still had legal moves on it.
 */
export const OutOfEnergyOnDugGround: Story = {
  args: { energy: 0, dugNeighbours: 8 },
};

/**
 * Stunned, as a bomb leaves you. Nothing is clickable for the duration — not
 * even the free moves over dug ground, because a stun refuses those too.
 *
 * Deliberately shares `PartiallyLit`'s board: same three dug tiles, and here
 * they are dark as well. That is the difference between the two gates —
 * no-energy filters the ring, a stun switches it off.
 *
 * Held open here; in a run it lasts BOMB.STUN_MS and re-lights itself.
 */
export const Stunned: Story = {
  args: { stunned: true, dugNeighbours: 3 },
};
