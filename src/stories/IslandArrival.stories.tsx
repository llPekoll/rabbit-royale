/**
 * The two vertical pans that bracket a run: the camera comes DOWN onto an
 * island, and rises OFF it when the island sinks.
 *
 * Asked for as "un petit pan vertical haut en bas a chaque fois qu'on va sur
 * ile, et qd l'ile sink pan up et transition" (2026-09-20). Both are camera
 * moves on `IslandScene`, and both exist for the same reason: an island used
 * to arrive and leave as a CUT. The scene was built, `solveCamera` set the
 * shot, and the first frame was already the one the player would still be
 * looking at a minute later — so a new island, a respawn and a window resize
 * were indistinguishable. Nothing in the picture said "you have arrived
 * somewhere", and four seconds later nothing said "this place is gone".
 *
 * ## What is being judged
 *
 * Neither of these is a thing a test can hold. The arithmetic IS tested —
 * `islandCamera` is pure and `IslandCamera.stories.tsx` measures the shot it
 * solves — but a test can only assert that the camera ended where it was
 * asked to. These two moves fail by FEELING WRONG on the way, in four ways:
 *
 *   - the drop has to SETTLE, not arrive. `power2.out` spends most of the
 *     travel in the first third and then eases in to a stop, which is a camera
 *     finding its frame. Linear over the same distance and time reads as the
 *     ground being dragged, and `power2.inOut` reads as a cutscene — the
 *     player cannot play during either.
 *   - it has to be SHORT. `ESTABLISH_SECONDS` is 1.1s and the island is
 *     playable throughout: a tap during the pan is a real move, and the pan
 *     lets go of the camera the moment a finger lands on the screen (it runs
 *     on `this.follow`, so `stopFollow` takes it). A move the player has to
 *     wait out is a loading screen with a parallax.
 *   - the sink has to read as the LAND leaving, not as the picture being
 *     dragged away. The camera rises while the sea and the sky hold still, so
 *     what moves through the frame is the island. This is the half that is
 *     easiest to get wrong and impossible to see in a screenshot.
 *   - the sink has to HANG first. `power2.in` holds the board almost still for
 *     a beat after the shaking stops, and then lets go. That pause is the
 *     weight; without it the island drops the instant the tremor ends and the
 *     whole thing reads as a scene transition rather than as land going under.
 *   - the arrival's fade has to be OVER before the player wants the board. It
 *     runs a third of the pan's length, so the island is fully lit while the
 *     camera is still settling: a tile that is still translucent when a thumb
 *     comes down for it is a tile the player does not trust. And it fades up
 *     from `ESTABLISH_FADE_FROM`, not from nothing — from zero the first
 *     frames have no island in them to be seen moving, and a pan nobody can
 *     see is just a load screen.
 *
 * ## Why it is on the real island
 *
 * The arrival is CLAMPED by the same rules that clamp a drag (`clampCam`): it
 * asks for `ESTABLISH_DROP_PX` of travel and takes whatever the land allows.
 * At 110px, measured, the clamp never bites — every seed in the list gives the
 * full move in both orientations, because the default zoom leaves more than
 * that much sea above any spawn. So the readout prints what the camera ASKED
 * for beside what it GOT, and today those agree. It is there to catch the day
 * they stop agreeing: raise the constant, or re-tune the default zoom, and
 * this is where a seed that can no longer afford the move shows up.
 *
 * The `seed` control earns its place on the picture rather than the number —
 * the coastline, the terraces and where the spawn sits in them are what the
 * camera sweeps past, and they are different on every one.
 *
 * The sink is deliberately NOT clamped — see `ERUPTION_RISE_PX`. The pan rules
 * exist to stop the player losing the island, and this is the one moment the
 * island is meant to be lost.
 *
 * `bun run storybook` (port 6007).
 */
import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { IslandScene, ESTABLISH_DROP_PX } from '@/game/scenes/IslandScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { islandCamFraming, clampCam } from '@/game/scenes/islandCamera';
import { spawnTile } from '@/lib/game/terrainBoard';

/** Open sea, the colour `Application` paints the whole viewport with. */
const SEA = '#1eaac4';

/** The two design canvases the game actually runs in — see Application. */
const LANDSCAPE = { width: 960, height: 540 };
const PORTRAIT = { width: 480, height: 860 };

/**
 * A spread of real-shaped island ids.
 *
 * The coastline and the terraces are cut from the seed, so this changes what
 * the camera sweeps past on the way down — not how far it travels. See the
 * header on why the clamp does not bite.
 */
const SEEDS = ['island-1', 'island-2', 'seed:abc', 'harbour-9', 'default'] as const;

const PLAYER = 'story-rabbit';

interface Args {
  /** Which island. The coastline the camera sweeps down over is cut from this. */
  seed: string;
  /** Portrait phone canvas, or the landscape one. */
  portrait: boolean;
  /** The server's beat between the last safe tile and the recap, in ms. */
  eruptionMs: number;
}

function Scene({ seed, portrait, eruptionMs }: Args) {
  const canvas = portrait ? PORTRAIT : LANDSCAPE;
  const sceneRef = useRef<IslandScene | null>(null);
  const [sunk, setSunk] = useState(false);

  // What the arrival ASKS for against what the land allows, per seed. The
  // resting shot is solved by the same function the scene calls, so this is a
  // measurement of the real thing rather than a second copy of the sum.
  const framing = islandCamFraming(seed, canvas.width, canvas.height);
  // The pan's start, clamped exactly as `establishingPan` clamps it — a camera
  // looking further UP the board is one with a LARGER y, see the scene. The
  // difference is the travel the camera actually gets on this seed, which on
  // an island with no sea above its spawn is a good deal less than it asked
  // for. Printed rather than described: the whole point of the seed control.
  const start = clampCam(
    { ...framing.cam, y: framing.cam.y + ESTABLISH_DROP_PX },
    seed, canvas.width, canvas.height,
  );
  const travel = start.y - framing.cam.y;

  /**
   * Replay the arrival the way the game does it: a rabbit appears.
   *
   * `addRabbit` is what the socket calls on a join and on a respawn, and it is
   * the call that re-opens the camera — so driving the story through it
   * exercises the same path the player gets, rather than reaching past it into
   * a private `solveCamera`. Removed first, because a rabbit the scene already
   * holds is repositioned rather than re-arrived.
   */
  const arrive = () => {
    const s = sceneRef.current;
    if (!s) return;
    s.resetEruption();
    setSunk(false);
    s.removeRabbit(PLAYER);
    s.addRabbit(PLAYER, 'you', spawnTile(seed), 0);
  };

  const sink = () => {
    const s = sceneRef.current;
    if (!s) return;
    s.playEruption(eruptionMs);
    setSunk(true);
  };

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
            playerId: PLAYER,
            onMoveIntent: () => {},
            canvas,
          }).then(() => {
            const s = scenes.currentScene as IslandScene | null;
            sceneRef.current = s;
            // A rabbit to arrive ON. Without one the scene opens on the spawn
            // anyway, but the respawn path — the one a player sees between
            // islands — is the one worth showing.
            s?.addRabbit(PLAYER, 'you', spawnTile(seed), 0);
          });
          return () => { sceneRef.current = null; scenes.destroyCurrent(); };
        }}
      />
      {/* Floated over the canvas rather than stacked under it: in a short
          Storybook frame a block of controls below the picture pushes the very
          thing the story exists to show up and out of view. */}
      <div style={{
        position: 'absolute', left: 8, top: 8, zIndex: 2, display: 'flex', gap: 6,
      }}>
        <button onClick={arrive} style={BTN}>▼ arrive</button>
        <button onClick={sink} style={BTN} disabled={sunk}>▲ sink</button>
      </div>
      <pre style={{
        position: 'absolute', left: 8, bottom: 8, margin: 0, zIndex: 2,
        color: '#cfe8ff', background: 'rgba(0,0,0,0.55)', padding: '6px 8px',
        borderRadius: 4, font: '11px ui-monospace, monospace', whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      }}>
{`canvas ${canvas.width}x${canvas.height} ${portrait ? '(portrait phone)' : '(landscape)'}   seed ${seed}
arrival: fades up, and the camera sweeps DOWN the island onto the shot, 1.1s
asked for ${ESTABLISH_DROP_PX}px of travel, the land allows ${travel.toFixed(0)}px${travel < ESTABLISH_DROP_PX - 1 ? '  <- clamped: little sea above this spawn' : '  <- the full move'}
resting shot  scale ${framing.cam.scale.toFixed(2)}x   spawn at ${framing.spawn.x.toFixed(0)},${framing.spawn.y.toFixed(0)}
sink: the camera rises off the board over the last 45% of ${eruptionMs}ms, fading out
tap the board DURING the arrival - the pan lets go, the move still lands`}
      </pre>
    </div>
  );
}

const BTN: React.CSSProperties = {
  font: '11px ui-monospace, monospace',
  padding: '5px 9px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(0,0,0,0.55)',
  color: '#cfe8ff',
  cursor: 'pointer',
};

const meta: Meta<Args> = {
  title: 'Island/Arrival and sink',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { seed: SEEDS[0], portrait: true, eruptionMs: 4000 },
  argTypes: {
    seed: { control: 'select', options: SEEDS },
    eruptionMs: { control: { type: 'range', min: 1500, max: 8000, step: 250 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The arrival, on a portrait phone: the camera opens above the rabbit, fades
 * the island up, and settles down onto it. Hit `▼ arrive` to replay it — that
 * button goes through `addRabbit`, which is the same call a respawn arrives on.
 *
 * The fade finishes first, well inside the pan. Watch for the moment the board
 * is fully lit and the camera is still moving — that gap is deliberate, and it
 * is what keeps this an opening shot rather than a cutscene.
 *
 * Tap a tile while it is still moving. The pan lets go and the tap lands.
 */
export const Arrival: Story = { args: { portrait: true } };

/**
 * The sink. Hit `▲ sink`: the ground shakes harder and harder, hangs for a
 * beat, and then the camera rises off it while the island slides down out of
 * the frame and fades out.
 *
 * The fade TRAILS the movement here — it starts at 60% of the sequence, when
 * the board is already on its way down — which is the opposite of the
 * arrival's, where the fade is done before the move is. A sink can afford to
 * dissolve; an arrival cannot.
 *
 * Watch the SEA, not the island — it holds still. That is what makes this read
 * as land going under rather than as the picture being pulled away. `▼ arrive`
 * puts the board back, which is what `resetEruption` does between islands.
 */
export const Sink: Story = { args: { portrait: true } };

/**
 * Landscape. The same two moves in the 960x540 design space — the distances
 * are in design px, so the drop is the same share of a shorter frame and comes
 * out proportionally bigger.
 */
export const Landscape: Story = { args: { portrait: false } };

/**
 * Another island. Same move, different ground going past it.
 *
 * The travel is identical — the clamp does not bite at 110px on any seed (see
 * the header) — so what changes is the coastline and the terraces the camera
 * sweeps down over. That is worth a look on its own: the pan is how most
 * players will see the top of an island, and on some seeds it is all they
 * ever see of it.
 */
export const AnotherIsland: Story = { args: { seed: SEEDS[2], portrait: true } };
