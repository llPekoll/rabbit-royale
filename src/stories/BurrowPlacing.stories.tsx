/**
 * The placement grid, on the real scene, with the numbers that decide whether
 * it is on screen at all.
 *
 * Written after the grid went MISSING in production: "Done placing" was up, the
 * instruction said to tap a tile, and there were no tiles. Two faults, neither
 * visible in a still and neither caught by a test:
 *
 * 1. The diamond texture is baked ONCE, at the island's tile size (44x24). The
 *    burrow's tile is 34x19, and nothing rescaled the sprite — so every cell
 *    was drawn a quarter too large, overlapping its neighbours instead of
 *    lining up with the ground it names.
 *
 * 2. The board ran off the canvas. `BURROW_ORIGIN_X/Y` and the grid size are
 *    tuned by eye against the painting, and a pass that grew the board without
 *    re-solving the origin pushed most of the cells past the right and bottom
 *    edges. On a 960x540 canvas the tiles were simply somewhere else.
 *
 * The second one is why this story reports the board's BOUNDS in numbers as
 * well as drawing it: "it looks off" is not something you can tune against, and
 * the overflow is invisible precisely because the tiles that are gone are the
 * ones you cannot see. Red numbers mean cells are off-screen.
 *
 * Burrow/Calibration answers a different question — does the board sit on the
 * right PAINTED ground. This one answers: is it on screen, the right size, and
 * can you click it.
 */
import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { BurrowScene } from '@/game/scenes/BurrowScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H,
  burrowCell, burrowTilePos, walkableTiles, isTrappable,
} from '@/config/burrowConfig';
import { GAME_W, GAME_H } from '@/game/Application';
import { boardCamFraming } from '@/game/scenes/burrowCamera';

interface Args {
  /** Placement mode. Off, the screen is a picture of a home — no grid at all. */
  placing: boolean;
}

/**
 * Where the board actually lands, in canvas coordinates.
 *
 * Computed from the same config the scene reads, so it cannot drift from what
 * is drawn. This is the measurement the missing grid needed and nobody had.
 */
function boardReport() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let cells = 0, trappable = 0;
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
    if (burrowCell(i) === 'blocked') continue;
    cells++;
    if (isTrappable(i)) trappable++;
    const { x, y } = burrowTilePos(i);
    minX = Math.min(minX, x - BURROW_HALF_W);
    maxX = Math.max(maxX, x + BURROW_HALF_W);
    minY = Math.min(minY, y - BURROW_HALF_H);
    maxY = Math.max(maxY, y + BURROW_HALF_H);
  }
  // The pulled-back shot is what placement actually uses, so the fit that
  // matters is measured through the camera rather than against the raw canvas.
  const framing = boardCamFraming(GAME_W, GAME_H);
  return {
    minX, maxX, minY, maxY, cells, trappable,
    grid: `${BURROW_COLS}x${BURROW_ROWS}`,
    tile: `${BURROW_HALF_W * 2}x${BURROW_HALF_H * 2}`,
    onScreen:
      framing.board.left >= 0 && framing.board.top >= 0
      && framing.board.right <= GAME_W && framing.board.bottom <= GAME_H,
    framing,
  };
}

function Scene({ placing }: Args) {
  const [placed, setPlaced] = useState<number[]>([]);
  const r = boardReport();
  const ok = r.onScreen;

  return (
    <div>
      <PixiStage
        width={GAME_W}
        height={GAME_H}
        background="#3f9142"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          let scene: BurrowScene | null = null;
          void scenes.start(BurrowScene, {
            traps: [],
            placing,
            onPlace: (tile: number) => {
              scene?.addTrap(tile);
              setPlaced((prev) => [...prev, tile]);
            },
          }).then(() => { scene = scenes.currentScene as BurrowScene; });
          return () => scenes.destroyCurrent();
        }}
      />
      <pre style={{
        color: ok ? '#8b949e' : '#ff6b6b',
        font: '12px ui-monospace, monospace',
        marginTop: 8, whiteSpace: 'pre-wrap',
      }}>
{`grid ${r.grid}   tile ${r.tile}   walkable ${r.cells}   trappable ${r.trappable}
board spans x ${r.minX.toFixed(0)}..${r.maxX.toFixed(0)}  y ${r.minY.toFixed(0)}..${r.maxY.toFixed(0)}   (canvas ${GAME_W}x${GAME_H})
through the placement camera: x ${r.framing.board.left.toFixed(0)}..${r.framing.board.right.toFixed(0)}  y ${r.framing.board.top.toFixed(0)}..${r.framing.board.bottom.toFixed(0)}
tile on screen ${r.framing.tileWidth.toFixed(1)}px
${ok ? 'the whole board is on screen' : 'OFF SCREEN - cells fall outside the canvas, and those are the tiles that go missing'}
${placed.length} traps placed`}
      </pre>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Burrow/Placing',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { placing: true },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The grid up, ready to be clicked. This is the screen that was empty.
 *
 * Click a lit tile: it should take a trap, and the counter below should move.
 */
export const Placing: Story = {};

/** The same board with the grid down — a home, not a spreadsheet. */
export const AtRest: Story = { args: { placing: false } };
