/**
 * The burrow as a PLACE, and the trap placement that happens on it.
 *
 * The screen has to answer a spatial question — which approach do I make
 * expensive? — so it is worth looking at with traps actually on it, and with
 * the placement grid both on and off. Outside placement the grid is invisible
 * on purpose: this is a picture of your home, not a spreadsheet.
 */
import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { BurrowScene } from '@/game/scenes/BurrowScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import {
  walkableTiles, isTrappable, entranceTile, shortestRaidPath, burrowNeighbors,
} from '@/config/burrowConfig';
import { distanceToField, trapClues, raiderView } from '@/lib/game/raid';
import { TRAPS } from '@config/tuning';

interface Args {
  /** How many traps are already down. */
  traps: number;
  /** Placement mode: the grid appears only while it is on. */
  placing: boolean;
}

/**
 * Where a competent owner mines: the ground nearest the field, measured in
 * STEPS. Sorting by tile index (the first cut) is not distance at all — it put
 * traps beside the door instead of across the approach.
 */
function defaultTraps(n: number): number[] {
  const dist = distanceToField();
  return walkableTiles()
    .filter(isTrappable)
    .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))
    .slice(0, n);
}

function Scene({ traps, placing }: Args) {
  const [placed, setPlaced] = useState<number[]>(defaultTraps(traps));

  return (
    <div>
      <PixiStage
        width={960}
        height={540}
        background="#3f9142"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          let scene: BurrowScene | null = null;

          void scenes.start(BurrowScene, {
            traps: defaultTraps(traps),
            placing,
            onPlace: (tile: number) => {
              scene?.addTrap(tile);
              setPlaced((prev) => [...prev, tile]);
            },
          }).then(() => {
            scene = scenes.currentScene as BurrowScene;
          });

          return () => scenes.destroyCurrent();
        }}
      />
      <p style={{ color: '#8b949e', font: '12px ui-monospace, monospace', marginTop: 8 }}>
        {placed.length} traps down &middot; cap {TRAPS.MAX_PLACED} &middot; entrance tile{' '}
        {entranceTile()} &middot; shortest crossing {shortestRaidPath()} steps
      </p>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Burrow/Board',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { traps: 0, placing: false },
  argTypes: { traps: { control: { type: 'range', min: 0, max: TRAPS.MAX_PLACED, step: 1 } } },
};
export default meta;

type Story = StoryObj<Args>;

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
function CameraHarness() {
  const sceneRef = useRef<BurrowScene | null>(null);
  const [mode, setMode] = useState<'home' | 'placing' | 'raiding'>('home');

  const traps = defaultTraps(4);

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
    const dist = distanceToField();
    const start = entranceTile();
    const visited = [start];
    let at = start;
    for (let i = 0; i < 4; i++) {
      const next = burrowNeighbors(at)
        .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))[0];
      if (next === undefined || (dist.get(next) ?? 99) >= (dist.get(at) ?? 99)) break;
      at = next;
      visited.push(at);
    }
    const view = raiderView(visited, trapClues(traps), false);
    return { view, at, steps: burrowNeighbors(at), onStep: () => {} };
  };

  const go = (next: 'home' | 'placing' | 'raiding') => {
    const scene = sceneRef.current;
    if (!scene) return;
    setMode(next);
    // Leaving a raid has to be told to the scene explicitly — the raid overlay
    // is what is holding the camera out, not the placing flag.
    scene.setRaid(next === 'raiding' ? raid() : null);
    scene.setPlacing(next === 'placing');
  };

  return (
    <div>
      <PixiStage
        width={960}
        height={540}
        background="#3f9142"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          void scenes.start(BurrowScene, {
            traps,
            placing: false,
            onPlace: (tile: number) => sceneRef.current?.addTrap(tile),
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
        twice: the camera must NOT re-tween.
      </p>
    </div>
  );
}

/** Watch the camera pull back and come home. Press the buttons. */
export const Camera: StoryObj = { render: () => <CameraHarness /> };
