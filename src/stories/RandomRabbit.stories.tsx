/**
 * A rabbit on a real island, walking on its own.
 *
 * This is the harness we tune against. It drives the REAL entities — the same
 * `Tile`, `PlayerRabbit` and `gridConfig` the game runs — because a story that
 * reimplements what it illustrates stops being evidence. What it fakes is only
 * the SERVER: a local island with local bombs, so the whole loop is watchable
 * without a socket, a database or a login.
 *
 * `bun run storybook` (port 6007).
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Assets, Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { getExplosionTextures } from '@/game/services/AssetLoader';
import { createIslandBackground } from '@/game/services/IslandBackground';
import * as Keys from '@/config/assetKeys';
import {
  COLS, ROWS, SPAWN_INDEX, makeShape, isForbidden, neighbors, playableTiles, tilePos,
} from '@/config/gridConfig';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import type { TileContent } from '@/lib/game/types';

const SHEETS = [
  Keys.BUNNY_WHITE, Keys.BUNNY_BROWN, Keys.BUNNY_GRAY,
  Keys.BUNNY_ORANGE, Keys.BUNNY_YELLOW,
];

/**
 * A local stand-in for the server's island. Same idea as the real generator —
 * seeded, so a story reproduces exactly — but deliberately separate: the real
 * one is server-only because it knows where the bombs are.
 */
function fakeIsland(seed: string, bombDensity: number) {
  const shape = makeShape(seed);
  const rng = mulberry32(seedFrom(`content:${seed}`));
  const content = new Map<number, TileContent>();

  for (let i = 0; i < COLS * ROWS; i++) {
    if (isForbidden(i, shape) || i === SPAWN_INDEX) continue;
    const roll = rng();
    if (roll < bombDensity) content.set(i, 'bomb');
    else if (roll < bombDensity + 0.10) content.set(i, 'carrot');
    else if (roll < bombDensity + 0.115) content.set(i, 'golden');
    else content.set(i, 'empty');
  }

  /** Bombs among the 8 neighbours — the number the whole game is read from. */
  const adjacent = (i: number) =>
    neighbors(i, shape).filter((n) => content.get(n) === 'bomb').length;

  return { shape, content, adjacent };
}

interface Args {
  seed: string;
  bombDensity: number;
  rabbits: number;
  stepMs: number;
  /** How far the island backdrop is zoomed past the canvas. */
  islandZoom: number;
  /** Off to inspect the board geometry without the art under it. */
  background: boolean;
}

function Scene({ seed, bombDensity, rabbits, stepMs, islandZoom, background }: Args) {
  return (
    <PixiStage
      width={960}
      height={540}
      background="#1eaac4"
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        // The real backdrop — the same video-plus-overlay the game builds, at
        // the zoom the game uses, so the board is judged against the art it
        // will actually sit on rather than against flat blue.
        let bg: { destroy(): void } | null = null;
        if (background) {
          void createIslandBackground(stage, 960 / 2, 540 / 2).then((b) => {
            bg = b;
            b.layout(960 / 2, 540 / 2, islandZoom);
          });
        }

        const island = fakeIsland(seed, bombDensity);
        const board = new Container();
        board.sortableChildren = true;
        stage.addChild(board);

        const tiles = new Map<number, Tile>();
        for (let i = 0; i < COLS * ROWS; i++) {
          if (isForbidden(i, island.shape)) continue;
          const tile = new Tile(i);
          tiles.set(i, tile);
          board.addChild(tile.container);
        }
        tiles.get(SPAWN_INDEX)?.markSpawn();

        // The rabbits. Each wanders on its own, digging what it steps on —
        // enough to watch the reveal, the hint numbers and the death play out.
        const walkers = Array.from({ length: rabbits }, (_, n) => {
          const rabbit = new PlayerRabbit(SPAWN_INDEX, SHEETS[n % SHEETS.length]);
          board.addChild(rabbit.container);
          rabbit.playSpawnDrop();
          return { rabbit, at: SPAWN_INDEX, alive: true, rng: mulberry32(seedFrom(`${seed}:${n}`)) };
        });

        const timer = setInterval(() => {
          for (const w of walkers) {
            if (!w.alive) continue;
            const options = neighbors(w.at, island.shape);
            if (options.length === 0) continue;
            const to = options[Math.floor(w.rng() * options.length)];

            const tile = tiles.get(to);
            const content = island.content.get(to) ?? 'empty';
            if (tile && !tile.revealed) {
              tile.revealContent(content, island.adjacent(to));
            }

            if (content === 'bomb') {
              // The blast, exactly as the scene plays it — a story that faked
              // this would stop being evidence of what the game does.
              const textures = getExplosionTextures();
              if (textures.length > 0) {
                const pos = tilePos(to);
                const boom = new AnimatedSprite(textures);
                boom.anchor.set(0.5);
                boom.position.set(pos.x, pos.y - 20);
                boom.scale.set(1.6);
                boom.zIndex = 55;
                boom.animationSpeed = 20 / 60;
                boom.loop = false;
                boom.onComplete = () => { board.removeChild(boom); boom.destroy(); };
                board.addChild(boom);
                boom.play();
              }
              // Dying is the interesting animation, so the walker stays dead:
              // a rabbit that respawned instantly would never let you watch it.
              w.alive = false;
              w.rabbit.playDeath();
              continue;
            }
            w.rabbit.moveTo(to);
            w.at = to;
          }
        }, stepMs);

        return () => {
          clearInterval(timer);
          bg?.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Random rabbit',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'storybook', bombDensity: 0.14, rabbits: 1, stepMs: 320,
    islandZoom: 1.75, background: true,
  },
  argTypes: {
    seed: { control: 'text', description: 'Cuts the coastline AND the bomb layout.' },
    bombDensity: { control: { type: 'range', min: 0, max: 0.4, step: 0.01 } },
    rabbits: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    stepMs: { control: { type: 'range', min: 80, max: 800, step: 20 } },
    islandZoom: { control: { type: 'range', min: 1, max: 2.6, step: 0.05 } },
    background: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** One rabbit, default densities. The baseline. */
export const OneRabbit: Story = {};

/** Four rabbits — the drop-in cap, and the reason the board was enlarged. */
export const FourRabbits: Story = { args: { rabbits: 4, stepMs: 260 } };

/** A late-tier island: rich and lethal. Runs end fast. */
export const Minefield: Story = { args: { bombDensity: 0.3, rabbits: 4, stepMs: 200 } };

/** Almost no bombs — good for watching the hint numbers fill in. */
export const Peaceful: Story = { args: { bombDensity: 0.03, stepMs: 160 } };

/** The bare board, no art beneath it: for judging tile geometry and hint
 *  legibility without the island's colour interfering. */
export const NoBackground: Story = { args: { background: false, rabbits: 4 } };

/**
 * Carrots and blasts, dense and fast — the story for judging the two props
 * this game is actually made of: does a carrot read as pick-up-able from
 * across the board, and does a bomb going off register?
 */
export const CarrotsAndBombs: Story = {
  args: { seed: 'props', bombDensity: 0.2, rabbits: 5, stepMs: 180 },
};

/**
 * Every coastline the generator makes, side by side. The island's silhouette is
 * cut from a seed now rather than hand-drawn, so this is how you check it still
 * looks like an island and not like noise.
 */
export const Coastlines: Story = {
  render: () => {
    const seeds = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, background: '#081120', padding: 12 }}>
        {seeds.map((s) => {
          const shape = makeShape(s);
          return (
            <div key={s} style={{ color: '#8b949e', font: '12px ui-monospace, monospace' }}>
              <div style={{ marginBottom: 4 }}>{s} — {playableTiles(shape)} tiles</div>
              <pre style={{ margin: 0, lineHeight: 1, color: '#3ecf7f' }}>
                {Array.from({ length: ROWS }, (_, r) =>
                  Array.from({ length: COLS }, (_, c) => {
                    const i = r * COLS + c;
                    return isForbidden(i, shape) ? ' ·' : (i === SPAWN_INDEX ? ' S' : ' █');
                  }).join(''),
                ).join('\n')}
              </pre>
            </div>
          );
        })}
      </div>
    );
  },
};
