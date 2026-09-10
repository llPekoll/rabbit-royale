/**
 * The raid, from both ends: choosing a burrow, and standing inside one.
 *
 * The BOARD is a Pixi scene, so these stories cover the chrome around it — the
 * target list and the HUD. What they exist to answer is whether a raid reads as
 * dangerous rather than as a menu, and whether a smoke screen announces itself
 * clearly enough that a numberless board is understood as a defence somebody
 * paid for rather than as a broken game.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RaidHud, TargetList } from '@/components/raid-panel';
import type { RaidState, Target } from '@/components/use-raid';
import '@/app/globals.css';

const ART = '/assets/island/burrow_generated.webp';

const TARGETS: Target[] = [
  { id: 'a', name: 'Thistle', avatar: null, stock: 48_200, shielded: false },
  { id: 'b', name: 'Bramble', avatar: null, stock: 31_050, shielded: false },
  { id: 'c', name: 'Clover', avatar: null, stock: 12_400, shielded: true },
  { id: 'd', name: 'Sorrel', avatar: null, stock: 9_870, shielded: false },
];

const RAID: RaidState = {
  raidId: 'r1',
  defender: { id: 'a', name: 'Thistle', avatar: null },
  tile: 143,
  energy: 18,
  trapsSprung: 1,
  view: [],
  steps: [],
  smoked: false,
  finished: false,
  succeeded: false,
  carrotsLooted: 0,
};

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 900, height: 500, position: 'relative',
      overflow: 'hidden', background: '#2d5a27',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${ART})`, backgroundSize: 'cover',
        backgroundPosition: 'center', imageRendering: 'pixelated',
      }} />
      {children}
    </div>
  );
}

const meta: Meta = { title: 'Raid', parameters: { layout: 'centered' } };
export default meta;
type Story = StoryObj;

/** Who is worth robbing. Ordered by stock — that is the reason to go. */
export const ChooseTarget: Story = {
  render: () => {
    const Harness = () => {
      const [note, setNote] = useState<string | null>(null);
      return (
        <Stage>
          <TargetList
            targets={TARGETS}
            busy={false}
            note={note}
            onEnter={(id) => setNote(`Would enter ${id}`)}
            onClose={() => setNote('Closed')}
          />
        </Stage>
      );
    };
    return <Harness />;
  },
};

/** Mid-crossing. Energy is the widest thing: every step spends it. */
export const Walking: Story = {
  render: () => (
    <Stage>
      <RaidHud raid={RAID} outcome={null} busy={false} onLeave={() => {}} />
    </Stage>
  ),
};

/**
 * Under a smoke screen. The board behind this has no numbers at all, so the
 * HUD has to say why — otherwise a blank board reads as a bug.
 */
export const Smoked: Story = {
  render: () => (
    <Stage>
      <RaidHud raid={{ ...RAID, smoked: true }} outcome={null} busy={false} onLeave={() => {}} />
    </Stage>
  ),
};

/** Reached the field: the full share. */
export const Won: Story = {
  render: () => (
    <Stage>
      <RaidHud
        raid={{ ...RAID, finished: true, succeeded: true, carrotsLooted: 12_050, energy: 4 }}
        outcome={{ reachedField: true, loot: 12_050, damage: 42, progress: 1 }}
        busy={false}
        onLeave={() => {}}
      />
    </Stage>
  ),
};

/**
 * Out of energy on the way. Still pays a floor — attacking a defended burrow is
 * never pure loss, or nobody attacks one twice.
 */
export const RanOut: Story = {
  render: () => (
    <Stage>
      <RaidHud
        raid={{ ...RAID, finished: true, trapsSprung: 3, energy: 0, carrotsLooted: 1_420 }}
        outcome={{ reachedField: false, loot: 1_420, damage: 11, progress: 0.3 }}
        busy={false}
        onLeave={() => {}}
      />
    </Stage>
  ),
};
