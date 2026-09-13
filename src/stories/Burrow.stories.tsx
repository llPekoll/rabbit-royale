/**
 * The burrow as a PLACE, and the trap placement that happens on it.
 *
 * The screen has to answer a spatial question — which approach do I make
 * expensive? — so it is worth looking at with traps actually on it, and with
 * the placement grid both on and off. Outside placement the grid is invisible
 * on purpose: this is a picture of your home, not a spreadsheet.
 */
import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { BurrowScene } from '@/game/scenes/BurrowScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import {
  walkableTiles, isTrappable, entranceTile, shortestRaidPath, burrowNeighbors,
} from '@/game/burrow/board';
import { distanceToField, trapClues, raiderView } from '@/lib/game/raid';
import { BURROW, TRAPS } from '@config/tuning';

/**
 * A handful of burrows to flip between.
 *
 * Shaped like real player ids, because that is what the seed is — and looking
 * at four of them side by side is the only way to see whether the generator
 * makes PLACES or makes noise.
 */
const SEEDS = [
  'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk',
  'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b',
  'player-1',
  'player-2',
  'player-3',
] as const;

interface Args {
  /**
   * Whose burrow to look at.
   *
   * The ground is grown from this (see `game/burrow/board`), so changing it is
   * the point of the control: a burrow is no longer one picture every player
   * shares, and the only way to judge a GENERATOR is to look at several of
   * what it makes.
   */
  seed: string;
  /** How many traps are already down. */
  traps: number;
  /** Placement mode: the grid appears only while it is on. */
  placing: boolean;
  /** Which building stands on it — the burrow's level. */
  level: number;
  /**
   * How full the garden is, 0..1.
   *
   * The crop's density is scaled by the LEVEL and its fullness by this, and the
   * two are easy to confuse by eye — a busier field could be either. Pinning
   * fullness makes the level's effect the only thing moving, which is what lets
   * "does an upgrade actually show in the field?" be answered by looking.
   */
  garden: number;
  /**
   * Minutes of shield left on the burrow — 0 for none.
   *
   * The sign is drawn over the BUILDING, so the thing worth looking at here is
   * whether it clears the roofline at every level rather than sinking into the
   * art: the silhouette grows with the upgrade and the badge has to ride it.
   */
  shieldMins: number;
}

/**
 * Where a competent owner mines: the ground nearest the field, measured in
 * STEPS. Sorting by tile index (the first cut) is not distance at all — it put
 * traps beside the door instead of across the approach.
 */
function defaultTraps(seed: string, n: number): number[] {
  const dist = distanceToField(seed);
  return walkableTiles(seed)
    .filter((t) => isTrappable(seed, t))
    .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))
    .slice(0, n);
}

function Scene({ seed, traps, placing, level, garden, shieldMins }: Args) {
  const [placed, setPlaced] = useState<number[]>(defaultTraps(seed, traps));

  return (
    <div>
      <PixiStage
        width={960}
        height={540}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          let scene: BurrowScene | null = null;

          void scenes.start(BurrowScene, {
            seed,
            level,
            gardenProgress: garden,
            traps: defaultTraps(seed, traps),
            placing,
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
            // Exposed for the same reason PixiStage exposes `__PIXI_APP__`:
            // a raid is a SEQUENCE, and the faults worth catching live several
            // steps in. Driving the real scene from a script is the only way
            // to look at step 7 without clicking to it by hand.
            (globalThis as { __BURROW_SCENE?: BurrowScene }).__BURROW_SCENE = scene;
            scene.setShield(shieldMins > 0 ? shieldMins * 60_000 : null);
          });

          return () => {
            delete (globalThis as { __BURROW_SCENE?: BurrowScene }).__BURROW_SCENE;
            scenes.destroyCurrent();
          };
        }}
      />
      <p style={{ color: '#8b949e', font: '12px ui-monospace, monospace', marginTop: 8 }}>
        {placed.length} traps down &middot; cap {TRAPS.MAX_PLACED} &middot; entrance tile{' '}
        {entranceTile(seed)} &middot; shortest crossing {shortestRaidPath(seed)} steps
      </p>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Burrow/Board',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { seed: SEEDS[0], traps: 0, placing: false, level: 1, garden: 1, shieldMins: 0 },
  argTypes: {
    seed: { control: 'select', options: SEEDS },
    traps: { control: { type: 'range', min: 0, max: TRAPS.MAX_PLACED, step: 1 } },
    level: { control: { type: 'range', min: 1, max: BURROW.MAX_LEVEL, step: 1 } },
    garden: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    shieldMins: { control: { type: 'range', min: 0, max: 720, step: 5 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * Freshly raided: the shield sign stands over the burrow.
 *
 * The badge replaced a HIT POINTS bar in the side column. HP defended nothing
 * — traps are what a raider fights — so what the player needs on the BOARD is
 * the one thing the bar ever decided: how long until raids can land again.
 */
export const Shielded: Story = { args: { shieldMins: 252 } };

/** The same sign on the biggest silhouette, which is what it has to clear. */
export const ShieldedMaxLevel: Story = {
  args: { shieldMins: 45, level: BURROW.MAX_LEVEL },
};

/** How the burrow looks when you are just visiting it: no grid at all. */
export const AtRest: Story = {};

/** Placement mode — click a lit tile to drop a trap. */
export const Placing: Story = { args: { placing: true } };

/** A defended burrow, seen by its owner. A raider is sent none of this. */
export const Defended: Story = { args: { traps: TRAPS.MAX_PLACED } };

/**
 * The camera, which is the thing that has to be WATCHED rather than described.
 *
 * `AtRest` and `Placing` each show one framing, already arrived at — and a
 * still frame is exactly what cannot tell you whether the pull-back reads as a
 * camera moving or as the picture being resized. The two states have to be
 * reachable from each other, on the same mounted scene, at the press of a
 * button. That is also the only way to catch the faults that live in the
 * TRANSITION and nowhere else: the sky sliding across the garden mid-tween, a
 * re-entry that re-tweens from where it already sits, a raid that flies home
 * and straight back out.
 *
 * Both routes into the pulled-back shot are here, because they are different
 * code paths onto one camera — the owner's `setPlacing`, and a raider's
 * `setRaid` — and only the second one has to get its ordering right.
 */
function CameraHarness({ loop, seed = SEEDS[0] }: { loop: boolean; seed?: string }) {
  const sceneRef = useRef<BurrowScene | null>(null);
  const [mode, setMode] = useState<'home' | 'placing' | 'raiding'>('home');

  const traps = defaultTraps(seed, 4);

  /**
   * A raid several steps in, so the overlay is a SHAPE rather than one tile.
   *
   * The first cut stepped once off the entrance and drew almost nothing — which
   * told you nothing about whether the pulled-back board is readable, and being
   * readable is the entire reason the camera pulls back. So the raider walks
   * greedily towards the field, which is both what a real one does and what
   * puts clue numbers across the middle of the board where they can be judged.
   */
  const raid = () => {
    const dist = distanceToField(seed);
    const start = entranceTile(seed);
    const visited = [start];
    let at = start;
    for (let i = 0; i < 4; i++) {
      const next = burrowNeighbors(seed, at)
        .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))[0];
      if (next === undefined || (dist.get(next) ?? 99) >= (dist.get(at) ?? 99)) break;
      at = next;
      visited.push(at);
    }
    const view = raiderView(seed, visited, trapClues(seed, traps), false);
    // The harness raids the SAME burrow it is standing in, which no real raid
    // ever does — it is the camera being judged here, not the ground.
    return {
      view, at, seed, walked: visited,
      steps: burrowNeighbors(seed, at),
      onStep: () => {},
    };
  };

  const go = (next: 'home' | 'placing' | 'raiding') => {
    const scene = sceneRef.current;
    if (!scene) return;
    setMode(next);
    // Leaving a raid has to be told to the scene explicitly — the raid overlay
    // is what is holding the camera out, not the placing flag.
    void scene.setRaid(next === 'raiding' ? raid() : null);
    scene.setPlacing(next === 'placing');
  };

  /**
   * Play the move on a loop, so it can be WATCHED rather than triggered.
   *
   * The buttons alone make the pull-back something you cause and then try to
   * catch out of the corner of your eye — and half a second of easing is
   * exactly the sort of thing you miss while your hand is still on the mouse.
   * Looping puts the movement itself on screen, both directions, repeatedly,
   * which is the only way to judge whether it reads as a camera or as a resize.
   *
   * The dwell is longer than the 0.55s tween on purpose: arriving and SITTING
   * is part of what is being judged, and a cycle that turned round the instant
   * it landed would only ever show motion.
   */
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!loop) return;
    // Kicks off once the scene exists; before that `go` is a no-op and the
    // cycle simply picks it up on the next turn.
    let n = 0;
    const CYCLE: ('home' | 'placing')[] = ['placing', 'home'];
    const id = setInterval(() => {
      goRef.current(CYCLE[n % CYCLE.length]);
      n++;
    }, 1800);
    return () => clearInterval(id);
  }, [loop]);

  return (
    <div>
      <PixiStage
        width={960}
        height={540}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          void scenes.start(BurrowScene, {
            seed,
            traps,
            placing: false,
            onToggle: (tile: number, mined: boolean) => {
              const scene = sceneRef.current;
              if (mined) scene?.removeTrap(tile);
              else scene?.addTrap(tile);
            },
          }).then(() => {
            sceneRef.current = scenes.currentScene as BurrowScene;
          });
          return () => {
            sceneRef.current = null;
            scenes.destroyCurrent();
          };
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {(['home', 'placing', 'raiding'] as const).map((m) => (
          <button
            key={m}
            onClick={() => go(m)}
            style={{
              font: '12px ui-monospace, monospace',
              padding: '6px 12px',
              cursor: 'pointer',
              background: mode === m ? '#ffd45c' : '#21262d',
              color: mode === m ? '#1a1a1a' : '#c9d1d9',
              border: '1px solid #30363d',
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <p style={{ color: '#8b949e', font: '12px ui-monospace, monospace', marginTop: 8 }}>
        Pulled back for a decision, close for the place. Press the same button
        twice: the camera must NOT re-tween.{loop ? ' Playing on a loop.' : ''}
      </p>
    </div>
  );
}

/**
 * The move itself, played on a loop: pull back, sit, come home, repeat.
 *
 * This is the one to open to judge the FEEL of it — the easing, how far it
 * goes, whether the ground stays legible at the far end. Nothing to press.
 */
export const CameraLoop: StoryObj = { render: () => <CameraHarness loop /> };

/**
 * The same camera, driven by hand.
 *
 * For the cases a loop cannot show: the raid route into the pulled-back shot
 * (a different code path from the owner's), and pressing one button twice to
 * check the camera does not re-tween when it is already where it is going.
 */
export const Camera: StoryObj = { render: () => <CameraHarness loop={false} /> };
