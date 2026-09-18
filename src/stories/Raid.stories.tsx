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

// Two shielded rows, and DELIBERATELY at opposite ends of the range a shield
// can run (6h for an item, up to 48h for a burrow that was sacked): the point
// of the clock is that it tells those two apart, so the story has to hold both.
/**
 * ALL THREE PRESENCES, plus the two shields. Ordered by stock, because that is
 * the reason to go — the badge is what tells you which kind of raid each row
 * actually is, and the story is only worth looking at if the three sit side by
 * side where their colours can be compared.
 *
 * The last row carries NEITHER field, which is the pre-`presence` server: it
 * has to fall back to "away" rather than render a blank badge.
 */
const TARGETS: Target[] = [
  { id: 'a', name: 'Thistle', avatar: null, stock: 48_200, shielded: false, presence: 'digging' },
  { id: 'b', name: 'Bramble', avatar: null, stock: 31_050, shielded: false, presence: 'home' },
  { id: 'c', name: 'Clover', avatar: null, stock: 12_400, shielded: true, shieldedFor: 5 * 60 * 60 * 1000, presence: 'away' },
  { id: 'd', name: 'Sorrel', avatar: null, stock: 9_870, shielded: false, presence: 'away' },
  { id: 'e', name: 'Nettle', avatar: null, stock: 7_320, shielded: true, shieldedFor: 41 * 60 * 60 * 1000, presence: 'digging' },
  { id: 'f', name: 'Bracken', avatar: null, stock: 4_010, shielded: false },
];

const RAID: RaidState = {
  raidId: 'r1',
  defender: { id: 'a', name: 'Thistle', avatar: null, level: 3 },
  tile: 143,
  energy: 18,
  trapsSprung: 1,
  view: [],
  walked: [143],
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
      <RaidHud raid={RAID} busy={false} onLeave={() => {}} />
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
      <RaidHud raid={{ ...RAID, smoked: true }} busy={false} onLeave={() => {}} />
    </Stage>
  ),
};

/**
 * Reached the field — and the HUD says NOTHING.
 *
 * That blank is the story. A win now raises the full-screen ceremony (see
 * `Raid/Victory`), so this bar deliberately prints no result line: a corner
 * label announcing the haul first would make the stage that follows a repeat.
 * What should be visible here is the live chrome only, with the board carrying
 * the moment underneath.
 */
export const Won: Story = {
  render: () => (
    <Stage>
      <RaidHud
        raid={{ ...RAID, finished: true, succeeded: true, carrotsLooted: 12_050, energy: 4 }}
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
        busy={false}
        onLeave={() => {}}
      />
    </Stage>
  ),
};
