/**
 * The raid's victory ceremony.
 *
 * This is a TIMED, full-screen beat: a white burst, a hold, the light draining
 * onto a hopping rabbit, then the stamp and the confetti. None of that can be
 * judged from a screenshot of the real screen — by the time you have one, the
 * choreography is over — so every story here mounts it behind a REPLAY button
 * and remounts on a key, which is the only way to watch the same two seconds
 * as many times as it takes to decide whether they land.
 *
 * WHAT TO LOOK AT, in the order the eye should catch it:
 *   • The rays are the ISLAND's blue, not a rarity's. Alongside the hub's
 *     cabinet backdrop they should read as one palette; alongside the casino's
 *     chest reveal they should read as a deliberately different claim.
 *   • The rabbit jumps, and its shadow stays on the ground. If the shadow
 *     travels with it the jump collapses into a float.
 *   • The carrot count is the biggest orange thing on the stage — the reward
 *     has to beat the decoration.
 *   • The confetti is already falling when the light lets go, not raining in
 *     from a clean line at the top afterwards.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RaidVictory } from '@/components/raid-victory';
import { AVATARS } from '@/lib/game/avatars';
import '@/app/globals.css';

/**
 * The board the ceremony covers.
 *
 * A flat green rectangle would flatter it: the real thing is raised over a
 * burrow that is still rendering underneath, so the stage has to hold its own
 * against a busy picture. This stands in for that.
 */
function Board({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2d5a27', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/assets/island/burrow_generated.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          imageRendering: 'pixelated',
        }}
      />
      {children}
    </div>
  );
}

interface HarnessArgs {
  defender: string;
  carrots: number;
  avatar: string;
  trapsSprung: number;
}

function Harness({ defender, carrots, avatar, trapsSprung }: HarnessArgs) {
  // `run` keys the mount so REPLAY plays the choreography from its first frame
  // again; `open` is the dismissal the button itself performs.
  const [run, setRun] = useState(0);
  const [open, setOpen] = useState(true);

  return (
    <Board>
      <button
        style={replayStyle}
        onClick={() => { setOpen(true); setRun((r) => r + 1); }}
      >
        REPLAY
      </button>
      {open && (
        <RaidVictory
          key={run}
          defender={defender}
          carrots={carrots}
          avatar={avatar}
          trapsSprung={trapsSprung}
          onDone={() => setOpen(false)}
        />
      )}
    </Board>
  );
}

const replayStyle: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  top: 16,
  zIndex: 1002,
  padding: '8px 14px',
  font: '600 12px ui-monospace, monospace',
  letterSpacing: 1,
  color: '#0a2a3a',
  background: '#ff8c2e',
  border: '2px solid #9c4a0c',
  cursor: 'pointer',
};

const meta: Meta<typeof Harness> = {
  title: 'Raid/Victory',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  args: {
    defender: 'Thistle',
    carrots: 4820,
    avatar: 'brown',
    trapsSprung: 1,
  },
  argTypes: {
    avatar: { control: 'select', options: AVATARS.map((a) => a.key) },
    carrots: { control: { type: 'number', min: 0 } },
    trapsSprung: { control: { type: 'number', min: 0, max: 6 } },
  },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** The ordinary win: a good haul, one trap paid for on the way in. */
export const Won: Story = {};

/**
 * The raid that emptied somebody's season.
 *
 * Five digits is the widest the counter gets, and it is the case where the
 * number can crowd the carrot beside it or push past a phone's gutter.
 */
export const BigHaul: Story = { args: { carrots: 48_200, trapsSprung: 3 } };

/**
 * A clean run — nothing sprung.
 *
 * The trap line is absent, which is the point: an untriggered raid should not
 * show a "0 TRAPS" row that reads as a missing stat.
 */
export const Untouched: Story = { args: { carrots: 1_240, trapsSprung: 0 } };

/**
 * A defender who barely had anything, robbed by a white rabbit.
 *
 * Two jobs: the small number must still read as a reward rather than as an
 * apology, and a pale sprite has to survive being lit from behind by the
 * whiteout — the brown bunny hides a lot of contrast problems.
 */
export const ThinPickings: Story = {
  args: { carrots: 37, avatar: 'white', defender: 'Clover', trapsSprung: 2 },
};

/**
 * Won the raid, found nothing.
 *
 * Loot is a share of what the defender holds, floored, so a burrow somebody
 * already emptied pays zero — and the player still crossed the minefield to get
 * there. What must NOT appear is "+0", which reads as a broken counter or a
 * failed walk; the stage says the cupboard was bare and keeps the win.
 */
export const EmptyBurrow: Story = {
  args: { carrots: 0, defender: 'Sorrel', avatar: 'orange', trapsSprung: 2 },
};

/**
 * A name at the edge of what the bitmap font takes.
 *
 * `BitmapText` renders printable ASCII only and the component truncates at 20
 * characters, so this is where a long handle either wraps, overflows the
 * stage, or is cut somewhere ugly.
 */
export const LongName: Story = {
  args: { defender: 'BrambleTheMagnificent', carrots: 9_870, avatar: 'gray' },
};
