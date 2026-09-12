/**
 * How big the island is drawn, and whether it reaches the edges of the screen.
 *
 * Written after "sur mobile c'est vraiment trop petit". Two faults, and neither
 * one shows on a desktop, which is why both shipped:
 *
 * 1. The scene had NO CAMERA. The board was laid out around `ISO_ORIGIN_X`
 *    (515) and `ISO_ORIGIN_Y` (150) — numbers measured by hand against the
 *    960x540 LANDSCAPE canvas — and the whole design space was then fitted to
 *    the window. In portrait the design space is 480 wide, so the board's own
 *    origin sat past the right edge of the canvas it was measured in.
 *
 * 2. The fit was `Math.min(w/W, h/H)` — a CONTAIN. Whatever the board's shape,
 *    the difference between it and the window's came out as bands of bare sea.
 *
 * The `portrait` control is the whole point of this story. `GAME_W`/`GAME_H`
 * are swapped by `Application.resize`, which Storybook never runs, so a story
 * that did not pass the canvas size explicitly would report the landscape shot
 * whatever the frame looked like — and landscape is the one orientation where
 * the bug is mild. The scene takes a `canvas` override for exactly this.
 *
 * The `camera` control turns the fix off, so the two can be flipped between
 * rather than described. Off is what shipped.
 *
 * The readout is the measurement the complaint needed and nobody had: a tile's
 * size on a real phone, against the 36px it used to be. "It looks small" is not
 * something you can tune against.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { IslandScene } from '@/game/scenes/IslandScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { islandCamFraming } from '@/game/scenes/islandCamera';
import { ISO_TILE_W } from '@/config/gridConfig';

/** Open sea, the colour `Application` paints the whole viewport with. */
const SEA = '#1eaac4';

/** The two design canvases the game actually runs in — see Application. */
const LANDSCAPE = { width: 960, height: 540 };
const PORTRAIT = { width: 480, height: 860 };

/**
 * A real phone, for the "how big is it in the hand" number.
 *
 * The Telegram mini-app viewport the complaint came from. The design canvas is
 * itself fitted to this, so a tile's size on screen is the camera's scale times
 * that fit — which is the only figure a player actually experiences.
 */
const PHONE = { width: 390, height: 719 };

interface Args {
  /** Which island. The coastline is cut from this — see gridConfig.makeShape. */
  seed: string;
  /** Portrait phone canvas, or the landscape one. THE control of this story. */
  portrait: boolean;
  /** Off reproduces what shipped: no camera, the design-space fit alone. */
  camera: boolean;
}

/** A spread of real-shaped island ids. */
const SEEDS = ['island-1', 'island-2', 'seed:abc', 'default'] as const;

function Scene({ seed, portrait, camera }: Args) {
  const canvas = portrait ? PORTRAIT : LANDSCAPE;
  const f = islandCamFraming(seed, canvas.width, canvas.height);

  // What the canvas fit does on top of the camera, which is what turns design
  // pixels into pixels on the phone.
  const fit = Math.min(PHONE.width / canvas.width, PHONE.height / canvas.height);
  // What shipped: no camera, so the board is drawn at its own size (scale 1)
  // with only the canvas fit on top.
  const before = ISO_TILE_W * fit;
  // What is actually on screen right now — the toggle decides which.
  const shownScale = camera ? f.cam.scale : 1;
  const shownTile = ISO_TILE_W * shownScale;
  const shown = shownTile * fit;

  // Does the drawn ground reach EVERY edge? It does, on both axes — that is
  // what taking the cover against the full lattice rather than the walkable
  // box bought. With the camera off the board sits wherever ISO_ORIGIN_* put
  // it, which in portrait is partly off the right-hand side.
  const covers = camera
    && f.board.left <= 0.5 && f.board.top <= 0.5
    && f.board.right >= canvas.width - 0.5
    && f.board.bottom >= canvas.height - 0.5;

  return (
    <div style={{ position: 'relative', lineHeight: 0 }}>
      <PixiStage
        width={canvas.width}
        height={canvas.height}
        background={SEA}
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          void scenes.start(IslandScene, {
            seed,
            playerId: 'story',
            onMoveIntent: () => {},
            canvas,
            // The absence of a camera, not a differently-tuned one: the
            // identity transform, which is literally what shipped. Feeding
            // the camera the wrong canvas instead would draw a third shot
            // that never existed and prove nothing.
            noCamera: !camera,
          });
          return () => scenes.destroyCurrent();
        }}
      />
      {/* Floated over the canvas rather than stacked under it: in a short
          Storybook frame a block of text below the picture pushes the very
          thing the story exists to show up and out of view. */}
      <pre style={{
        position: 'absolute', left: 8, bottom: 8, margin: 0, zIndex: 2,
        color: covers ? '#cfe8ff' : '#ff9a9a',
        background: 'rgba(0,0,0,0.55)', padding: '6px 8px', borderRadius: 4,
        font: '11px ui-monospace, monospace', whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      }}>
{`canvas ${canvas.width}x${canvas.height} ${portrait ? '(portrait phone)' : '(landscape)'}   camera ${camera ? 'ON' : 'OFF - what shipped'}
scale ${shownScale.toFixed(2)}x   tile ${ISO_TILE_W}px in the art -> ${shownTile.toFixed(0)}px in design space
on a ${PHONE.width}x${PHONE.height} phone: ${shown.toFixed(0)}px per tile${camera ? `   (${before.toFixed(0)}px with the camera off -> ${(shown / before).toFixed(2)}x bigger)` : '   <- this is the complaint'}
${camera
  ? `board spans x ${f.board.left.toFixed(0)}..${f.board.right.toFixed(0)}  y ${f.board.top.toFixed(0)}..${f.board.bottom.toFixed(0)}`
  : 'board sits at the raw ISO_ORIGIN (515, 150) - measured for the 960-wide landscape canvas'}
${covers ? 'the ground reaches every edge - no bare sea' : 'BARE SEA - the ground stops short of an edge'}
${(canvas.width / shownTile).toFixed(1)} tiles across the frame   (no camera-follow: a tile off screen is a tile you cannot tap)`}
      </pre>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Island/Camera',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { seed: SEEDS[0], portrait: true, camera: true },
  argTypes: {
    seed: { control: 'select', options: SEEDS },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The fix, on the viewport it was asked for: a portrait phone.
 *
 * A tile lands near 73px against the 36px it used to be, and the ground reaches
 * every edge — no band of sea at the top.
 *
 * That pairing is the trade this shot makes on purpose. The lattice is 1.68:1
 * and the screen 0.56:1, so filling the height and shrinking the tiles pull
 * against each other; reaching the top costs holding about five columns in
 * frame. `islandCamera` has the table of what the other choices would give.
 */
export const Portrait: Story = { args: { portrait: true, camera: true } };

/**
 * The bug. Same seed, same canvas, camera off.
 *
 * This is what the complaint was about: the island sits small in the middle of
 * a tall blue field. Flip `camera` back on to see the difference directly.
 */
export const PortraitBefore: Story = { args: { portrait: true, camera: false } };

/**
 * Landscape, where the bug was mild and so went unnoticed.
 *
 * The whole lattice fits across the frame here (16 columns against portrait's
 * five), so landscape never had the conflict portrait does: the cover fills the
 * height at a scale that still shows everything.
 */
export const Landscape: Story = { args: { portrait: false, camera: true } };

/**
 * Every island is a different shape, so the framing is solved per seed.
 *
 * Flip `seed`: the coastline moves, and with it the board's bounding box and
 * the scale that frames it. A seed whose island came out unusually wide is
 * exactly the one a single hand-tuned constant would have failed for.
 */
export const AnotherIsland: Story = { args: { seed: SEEDS[2], portrait: true } };
