/**
 * The burrow as a PLACE, and the trap placement that happens on it.
 *
 * The screen has to answer a spatial question — which approach do I make
 * expensive? — so it is worth looking at with traps actually on it, and with
 * the placement grid both on and off. Outside placement the grid is invisible
 * on purpose: this is a picture of your home, not a spreadsheet.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { BurrowScene } from '@/game/scenes/BurrowScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { walkableTiles, isTrappable, entranceTile, shortestRaidPath } from '@/config/burrowConfig';
import { distanceToField } from '@/lib/game/raid';
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
