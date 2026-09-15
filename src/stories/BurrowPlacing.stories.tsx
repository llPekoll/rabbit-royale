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
 * 2. The board ran off the canvas. The origin and the grid size were tuned by
 *    eye against the painting, and a pass that grew the board without
 *    re-solving the origin pushed most of the cells past the right and bottom
 *    edges. On a 960x540 canvas the tiles were simply somewhere else.
 *
 * The second one is why this story reports the board's BOUNDS in numbers as
 * well as drawing it: "it looks off" is not something you can tune against, and
 * the overflow is invisible precisely because the tiles that are gone are the
 * ones you cannot see. Red numbers mean cells are off-screen.
 *
 * The painting those two faults were measured against is gone — the ground is
 * generated tiles now — but the question this story asks survives it intact,
 * and is if anything sharper: the board is a different shape for every player,
 * so "is it on screen, the right size, and can you click it" has to be true
 * for all of them rather than for one tuned layout.
 */
import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { BurrowScene } from '@/game/scenes/BurrowScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, setBurrowTileSize,
} from '@/config/burrowConfig';
import { burrowCell, isTrappable } from '@/game/burrow/board';
import { burrowTileScreen } from '@/game/burrow/screen';
import { GAME_W, GAME_H } from '@/game/Application';
import { boardCamFraming, placeCam } from '@/game/scenes/burrowCamera';

interface Args {
  /** Whose burrow. The ground is grown from it — see game/burrow/board. */
  seed: string;
  /** Placement mode. Off, the screen is a picture of a home — no grid at all. */
  placing: boolean;
  /**
   * The size of ONE CELL, in art pixels.
   *
   * THE knob for "make the tiles bigger". It changes how much ground one cell
   * covers, so the homestead keeps its shape and only the grid — and the
   * terrain drawn from it — gets coarser or finer.
   *
   * The camera fits the board again (it has to: every burrow is a different
   * shape), so this no longer changes the cell's size on screen the way it did
   * while the camera was a constant. What it changes is the RESOLUTION of the
   * homestead: bigger cells mean the same 19x19 island drawn larger, with the
   * camera pulling back to keep it framed.
   */
  tile: number;
  /**
   * Show a live readout of the camera, updated as it is dragged and zoomed.
   *
   * Off by default, because the other stories are about the BOARD and a set of
   * numbers over it is noise. On for `Gestures`, where the numbers ARE the
   * thing being checked: a camera that moved can be seen, but a camera that
   * stopped at the right limit cannot.
   */
  showCamera: boolean;
  /**
   * Traps already in the ground when the story opens, and how many of them are
   * still REARMING.
   *
   * The arming clock's client half is invisible without this: a sprung trap
   * keeps its tile and comes back on a timer, so the board has to draw a trap
   * that is present but not dangerous. Anything below `rearming` in the
   * pre-placed list is drawn down.
   */
  preplaced: number;
  rearming: number;
  /**
   * Seconds for a full rearm in THIS story, against three hours in the game.
   *
   * Compressed on purpose: the ramp is the thing being judged, and nobody can
   * judge a three-hour fade. The scene is handed the same shape the server
   * sends (`msLeft` out of `totalMs`), so what is shown here is the real
   * curve played at speed rather than a different animation.
   */
  rearmSeconds: number;
}

/**
 * Where the board actually lands, in canvas coordinates.
 *
 * Computed from the same config the scene reads, so it cannot drift from what
 * is drawn. This is the measurement the missing grid needed and nobody had.
 */
function boardReport(seed: string) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let cells = 0, trappable = 0;
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
    if (burrowCell(seed, i) === 'blocked') continue;
    cells++;
    if (isTrappable(seed, i)) trappable++;
    const { x, y } = burrowTileScreen(seed, i);
    minX = Math.min(minX, x - BURROW_HALF_W);
    maxX = Math.max(maxX, x + BURROW_HALF_W);
    minY = Math.min(minY, y - BURROW_HALF_H);
    maxY = Math.max(maxY, y + BURROW_HALF_H);
  }
  // The pulled-back shot is what placement actually uses, so the fit that
  // matters is measured through the camera rather than against the raw canvas.
  const framing = boardCamFraming(seed, GAME_W, GAME_H);
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

function Scene({ seed, placing, tile, preplaced, rearming, rearmSeconds, showCamera }: Args) {
  const [placed, setPlaced] = useState<number[]>([]);
  /** The live camera, polled while `showCamera` is on — see the readout below. */
  const [cam, setCam] = useState<{ scale: number; x: number; y: number } | null>(null);

  // The tiles the story pre-mines.
  //
  // Chosen by SCREEN POSITION rather than by tile index, which is the whole
  // difficulty: 236 cells are trappable, and most of them are behind a tree,
  // under a cliff or outside the camera's framing. Picking by index buried
  // bombs the story then could not show — eight traps in the scene graph, four
  // of them ever drawn — which looks exactly like the arming tint failing.
  //
  // So: keep the cells the placement camera actually frames, with a margin,
  // and walk them in a stride so the set is spread across the board rather
  // than clumped in one corner.
  const seeded = (() => {
    // The camera PLACEMENT opens on, which is twice as close as the fit
    // `boardCamFraming` reports — so the window this walks is the smaller one
    // the player actually sees. Selecting against the fit put most of the
    // pre-mined traps off the edge of the opening shot, which reads exactly
    // like the arming tint failing.
    const cam = placeCam(seed, GAME_W, GAME_H);
    const visible: number[] = [];
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (!isTrappable(seed, i)) continue;
      const { x, y } = burrowTileScreen(seed, i);
      // `cam.x`/`cam.y` are already the absolute offset the container is moved
      // by (W/2 - scale*centre), so a tile's screen point is cam + scale*tile —
      // the same form `framing.board` uses. Treating cam as a point to
      // subtract put every cell off-canvas and selected nothing at all.
      const sx = cam.x + cam.scale * x;
      const sy = cam.y + cam.scale * y;
      if (sx > 80 && sx < GAME_W - 80 && sy > 90 && sy < GAME_H - 90) visible.push(i);
    }
    const step = Math.max(1, Math.floor(visible.length / Math.max(1, preplaced)));
    const out: number[] = [];
    for (let n = 0; out.length < preplaced && n < visible.length; n++) {
      const t = visible[(n * step) % visible.length];
      if (!out.includes(t)) out.push(t);
    }
    return out;
  })();
  const down = seeded.slice(0, Math.min(rearming, seeded.length));
  const up = seeded.slice(down.length);
  /** How many rearming traps are full right now, so the line can follow. */
  const [charged, setCharged] = useState(0);
  // Before anything measures or draws. The story remounts on every arg change,
  // so this runs ahead of the scene each time the slider moves.
  setBurrowTileSize(tile);
  const r = boardReport(seed);
  const ok = r.onScreen;

  return (
    <div style={{ position: 'relative', lineHeight: 0 }}>
      <PixiStage
        width={GAME_W}
        height={GAME_H}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          let scene: BurrowScene | null = null;
          let stopLoop = () => {};
          void scenes.start(BurrowScene, {
            seed,
            // Handed in ARMED, then the down ones are repainted below. The
            // scene's mount path takes a plain tile list, and going through
            // `setTrapArmed` afterwards is what the app does too — so the
            // story exercises the same transition the poll drives.
            traps: [...up, ...down],
            placing,
            // No server here, so the story IS the authority — it answers a tap
            // the way the route does: a bare tile takes a bomb, a mined one
            // gives it back. Doing only half of that would leave the one
            // interaction this story exists to check untestable by hand.
            onToggle: (tile: number, mined: boolean) => {
              if (mined) {
                scene?.removeTrap(tile);
                setPlaced((prev) => prev.filter((t) => t !== tile));
                return;
              }
              scene?.addTrap(tile);
              setPlaced((prev) => [...prev, tile]);
            },
          }).then(() => {
            scene = scenes.currentScene as BurrowScene;
            if (!down.length) return;

            // The story LOOPS, and drives the charge itself.
            //
            // A single pass ends with a full board and nothing left to watch —
            // at four seconds it is over before the eye arrives. Refilling from
            // the top means the effect can be studied without reloading, and
            // driving it here rather than leaving it to the scene's own ramp
            // keeps the compressed clock in the one place that knows about it.
            //
            // Each bomb starts part-way up, a step apart, so every level is
            // moving at once — staggering them into a queue would leave most
            // sitting at zero with nothing to show.
            const totalMs = rearmSeconds * 1000;
            const startedAt = down.map((_, i) =>
              performance.now() - totalMs * (1 - (i + 1) / (down.length + 1)));

            let raf = 0;
            const tick = () => {
              const now = performance.now();
              let full = 0;
              down.forEach((tileIndex, i) => {
                const elapsed = (now - startedAt[i]) % totalMs;
                const msLeft = Math.max(0, totalMs - elapsed);
                if (msLeft < 80) full++;
                scene?.setTrapRearm(tileIndex, { msLeft, totalMs });
              });
              // So the line above the board tells the truth as the loop runs.
              // A fixed "0/8 armed" over a board of full bombs is what made
              // the effect look broken when it was not.
              setCharged(full);
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            stopLoop = () => cancelAnimationFrame(raf);
          });
          /* The camera readout, polled off the scene's own container.
             
             Polled rather than pushed because the gestures write the transform
             straight onto the container (a drag is continuous; a callback per
             pointermove would be the same numbers at a worse time). Reading it
             back each frame is also the honest test: it reports what is ON
             SCREEN, not what the camera code believes it asked for. */
          let camRaf = 0;
          if (showCamera) {
            const readCam = () => {
              const c = scenes.currentScene?.container;
              if (c) setCam({ scale: c.scale.x, x: c.position.x, y: c.position.y });
              camRaf = requestAnimationFrame(readCam);
            };
            camRaf = requestAnimationFrame(readCam);
          }

          const stopCam = () => cancelAnimationFrame(camRaf);
          const prevStop = stopLoop;
          stopLoop = () => { prevStop(); stopCam(); };

          return () => { stopLoop(); scenes.destroyCurrent(); };
        }}
      />
      {/* The defence line the app shows while placing, rendered here because
          this is the only story that draws the board it describes.
          
          It moved OUT of the shop (the shop sells traps; the board is where
          they are arranged) and the wording is the deliverable: it reports
          what is STANDING, names what is coming back and says it is free.
          Red only when nothing is armed — traps on their way back are not an
          alarm, which is the whole point of the arming clock. */}
      {placing && (
        <p style={{
          position: 'absolute', left: 0, right: 0, top: 8, margin: 0, zIndex: 2,
          textAlign: 'center', pointerEvents: 'none',
          font: '12px ui-monospace, monospace',
          color: up.length + placed.length + charged === 0 ? '#ff8a7a' : '#cfe8ff',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}>
          {up.length + placed.length + charged}/8 armed
          {down.length - charged > 0
            && ` · ${down.length - charged} rearming · looping every ${rearmSeconds}s`}
        </p>
      )}

      {/* Overlaid, not stacked underneath.
          In a short frame (Storybook's Seeker landscape is 800x360) a block of
          text below the canvas pushes the picture up and out, and the story
          then opens scrolled past the very thing it exists to show — which
          reads as "the tiles are gone" for the third time in a row. Floating it
          over the corner keeps the frame exactly one canvas tall. */}
      <pre style={{
        position: 'absolute', left: 8, bottom: 8, margin: 0, zIndex: 2,
        color: ok ? '#cfe8ff' : '#ff9a9a',
        background: 'rgba(0,0,0,0.55)', padding: '6px 8px', borderRadius: 4,
        font: '11px ui-monospace, monospace', whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      }}>
{`grid ${r.grid}   tile ${r.tile}   walkable ${r.cells}   trappable ${r.trappable}
board spans x ${r.minX.toFixed(0)}..${r.maxX.toFixed(0)}  y ${r.minY.toFixed(0)}..${r.maxY.toFixed(0)}   (canvas ${GAME_W}x${GAME_H})
zoomed OUT (the floor, = the old fit): x ${r.framing.board.left.toFixed(0)}..${r.framing.board.right.toFixed(0)}  y ${r.framing.board.top.toFixed(0)}..${r.framing.board.bottom.toFixed(0)}
cell ${tile}px in the art -> ${r.framing.tileWidth.toFixed(1)}px zoomed out, ${(r.framing.tileWidth * 2).toFixed(1)}px on the opening shot
zoom ${r.framing.cam.scale.toFixed(2)}x..${(r.framing.cam.scale * 2).toFixed(2)}x   drag to pan, wheel/pinch to zoom
${ok ? 'the whole board fits when zoomed out' : 'OFF SCREEN - cells fall outside the canvas, and those are the tiles that go missing'}
${up.length + placed.length} armed   ${down.length} rearming (drawn faint)   ${placed.length} placed by hand`}
      </pre>

      {/* THE CAMERA, LIVE — only for the gesture story.
          
          Top-right so it does not sit under the board report, and reading the
          container's transform straight back: `zoom` is where in the allowed
          range the camera is, so "1.00x of 1.35..2.71" says zoomed all the way
          out and "2.00x" says the shot it opened on. A drag that hits the pan
          limit shows as x/y that stop moving while the mouse keeps going,
          which is the one thing a screenshot cannot show. */}
      {showCamera && cam && (
        <pre style={{
          position: 'absolute', right: 8, top: 8, margin: 0, zIndex: 2,
          color: '#cfe8ff', background: 'rgba(0,0,0,0.55)',
          padding: '6px 8px', borderRadius: 4,
          font: '11px ui-monospace, monospace', whiteSpace: 'pre',
          pointerEvents: 'none', textAlign: 'right',
        }}>
{`zoom ${cam.scale.toFixed(3)}x   of ${r.framing.cam.scale.toFixed(2)}..${(r.framing.cam.scale * 2).toFixed(2)}
cell ${(BURROW_HALF_W * 2 * cam.scale).toFixed(1)}px on screen
pan  x ${cam.x.toFixed(0)}   y ${cam.y.toFixed(0)}
${cam.scale > r.framing.cam.scale * 1.99 ? 'at the opening shot (max zoom)'
  : cam.scale < r.framing.cam.scale * 1.01 ? 'zoomed out - the old fixed shot'
  : 'between the two'}`}
        </pre>
      )}
    </div>
  );
}

/** A few player ids to flip between — the ground is grown from these. */
const SEEDS = [
  'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk',
  'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b',
  'player-1',
  'player-2',
] as const;

const meta: Meta<Args> = {
  title: 'Burrow/Placing',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: SEEDS[0], placing: true, tile: 40,
    preplaced: 0, rearming: 0, rearmSeconds: 20,
    showCamera: false,
  },
  argTypes: {
    seed: { control: 'select', options: SEEDS },
    tile: { control: { type: 'range', min: 24, max: 80, step: 2 } },
    preplaced: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    rearming: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    rearmSeconds: { control: { type: 'range', min: 4, max: 90, step: 2 } },
    showCamera: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The grid up, ready to be clicked. This is the screen that was empty.
 *
 * Click a lit tile: it should take a trap, and the counter below should move.
 */
export const Placing: Story = { args: { tile: 40 } };

/**
 * Every burrow is a different shape — the reason the board is generated at all.
 *
 * Flip the `seed` control: the coastline, the cliffs, the door and the garden
 * all move. If two of these look like the same place with the traps shifted,
 * the generator is not doing its job.
 */
export const AnotherPlayer: Story = { args: { seed: SEEDS[2] } };

/** The same board with the grid down — a home, not a spreadsheet. */
export const AtRest: Story = { args: { placing: false } };

/**
 * ZOOM AND PAN — the placement camera, by hand.
 *
 * ## What changed, and why
 *
 * Placement used to be a FIT: the camera framed the whole homestead and held
 * there, with no way to move it. The homestead is a wide, flat isometric
 * diamond, so that fit is decided by the WIDTH on every screen and spends the
 * frame's height on sea — a 47-54px cell in landscape, on the one screen where
 * a cell is a tap target rather than scenery.
 *
 * So it now opens at TWICE the fit, and moves like the farm: drag to pan,
 * wheel or pinch to zoom.
 *
 * ## What to try
 *
 *  - **It opens close.** Cells are ~108px rather than ~54px. The readout in
 *    the top right says `at the opening shot (max zoom)`.
 *  - **Drag the board.** It follows the pointer and cannot be thrown away:
 *    keep dragging in one direction and `pan x/y` stops moving while the mouse
 *    keeps going. The board always stays on screen.
 *  - **Wheel down to zoom out.** It stops exactly at the OLD shot — the whole
 *    homestead framed, `zoomed out - the old fixed shot`. Nothing was taken
 *    away; the view the screen used to be nailed to is one gesture from where
 *    it now opens.
 *  - **Wheel up.** Nothing happens past the opening shot. Closer than that is
 *    a keyhole, and unlike the farm there is nothing to inspect up close — a
 *    cell either takes a trap or it does not.
 *  - **A drag must NOT bury a trap.** This is the one that would have shipped
 *    broken: Pixi fires a tile's `pointertap` at the end of a drag as readily
 *    as after a tap, and the board is panned by dragging across exactly those
 *    tiles. Drag from a lit cell and release: the counter under the board must
 *    stay put. Then click that same cell without moving — it must take a trap.
 *
 * `preplaced` is wound up so there is something to drag past, and the camera
 * readout is on because a camera that STOPPED at the right limit is invisible
 * in a screenshot.
 */
export const Gestures: Story = {
  args: { preplaced: 6, rearming: 0, showCamera: true },
};

/**
 * THE RECHARGE, PLAYED AT SPEED — watch the bombs fill back up.
 *
 * The story to WATCH rather than to look at: four traps sprung, coming back
 * over twenty seconds instead of three hours. Each one fades from a cold,
 * near-transparent blue up to the armed yellow, and they land one at a time
 * because the server staggers them — a board does not snap back to full.
 *
 * This is what two static treatments could not do. A trap drawn at a fixed
 * dim tint has to be compared against an armed neighbour to be read at all,
 * and on a board where the armed ones sit behind a tree there is nothing to
 * compare with. A value that CLIMBS reads on its own, and answers "how much
 * longer" instead of only "is this one down".
 *
 * What to judge: can you tell at a glance which bombs are live? Does the
 * climb read as recharging rather than as a rendering fault? Push
 * `rearmSeconds` up if it goes by too fast to see.
 */
export const Recharging: Story = {
  args: { preplaced: 8, rearming: 4, rearmSeconds: 20 },
};

/**
 * THE MORNING AFTER A RAID — five traps still standing, three coming back.
 *
 * The client half of the arming clock, and the only place it can be SEEN: a
 * sprung trap keeps its tile and is drawn faint rather than removed, because
 * removing it would read as "you lost it" and send the owner hunting for a
 * tile they cannot use anyway.
 *
 * What to judge: can you tell the faint bombs from the armed ones at a glance,
 * without being told? If they disappear into the ground the tint is too weak,
 * and a defender cannot see the shape of their own defence while it heals.
 */
export const Rearming: Story = {
  args: { preplaced: 8, rearming: 3, rearmSeconds: 600 },
};

/**
 * Walked end to end: every trap down, all of them coming back.
 *
 * The line turns red — a raider arriving this minute meets open ground, and
 * that is worth alarming about — but it still says the traps are on their way
 * and cost nothing. If this reads as punishment rather than as recovery, the
 * clock is failing at the job it was added for.
 */
export const FullyRearming: Story = {
  args: { preplaced: 8, rearming: 8, rearmSeconds: 600 },
};

/** The control: the same eight traps, all armed. */
export const FullyArmed: Story = { args: { preplaced: 8, rearming: 0 } };
