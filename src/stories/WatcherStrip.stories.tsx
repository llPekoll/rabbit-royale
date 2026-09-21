/**
 * "0 ONLINE", over MARK A BOMB.
 *
 * The line exists because sabotage used to arrive with no warning at all: the
 * first sign a rival had opened your run was the bolt landing on your rabbit.
 * A watcher is a raider deciding which tile to spend a bomb on, so the count
 * is a THREAT LEVEL — and when one of them finally lands a hit, the same line
 * stops counting and names them.
 *
 * Shot against a dark board with the real plank under it, because the two are
 * one reading: the count says a rival is aiming and the button below it is the
 * answer. Anything that changes the gap between them changes the pair, and
 * that is what these stories are for.
 *
 * The HIT stories are on a TIMER — the sentence falls back to the count after
 * four seconds (`HIT_MS`). That is the behaviour, not a story artifact: reload
 * the story to see it again.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WatcherStrip } from '@/components/watcher-strip';
import { MarkBombButton } from '@/components/mark-bomb-button';

const RIVAL = 'player-rival';
const NAMES: Record<string, string> = { [RIVAL]: 'BlackPaw' };

interface Args {
  /** How many rivals are watching. */
  count: number;
  /** Which hit just landed, if any. */
  hit: 'none' | 'bolt' | 'bomb';
  /** Name the rival, or leave them unknown — a watcher who never took a turn. */
  known: boolean;
}

function Scene({ count, hit, known }: Args) {
  const [armed, setArmed] = useState(false);
  const at = Date.now();
  return (
    <div
      style={{
        position: 'relative',
        height: 320,
        // The board's own greens, so the strip's outline is judged on ground it
        // actually stands on rather than on a flat panel.
        background: 'linear-gradient(160deg, #3f6b34 0%, #2e5228 55%, #1d3a1c 100%)',
        overflow: 'hidden',
      }}
    >
      <WatcherStrip
        count={count}
        struckBy={hit === 'bolt' ? { by: RIVAL, at } : null}
        bombedBy={hit === 'bomb' ? { by: RIVAL, at } : null}
        nameOf={(id) => (known ? NAMES[id] ?? null : null)}
      />
      <MarkBombButton armed={armed} onToggle={setArmed} />
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'HUD/Watcher strip',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { count: 0, hit: 'none', known: true },
  argTypes: {
    count: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    hit: { control: { type: 'inline-radio' }, options: ['none', 'bolt', 'bomb'] },
  },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * NOBODY IS WATCHING — and it says so rather than saying nothing.
 *
 * The zero is printed on purpose. A line that only appears when a rival
 * arrives is a jump-scare that also shoves the button under it mid-run; a line
 * that is always there is a gauge the eye learns the position of. Dim grey at
 * zero, so the quiet state reads before the digits do.
 */
export const Quiet: Story = {};

/** One rival is in. The line goes gold — the colour a rival's move wears. */
export const OneWatching: Story = { args: { count: 1 } };

/** A run worth watching. The number is the part that has to stay legible. */
export const ACrowd: Story = { args: { count: 7 } };

/**
 * THE BOLT LANDED, and the strip names who threw it.
 *
 * Red, the X's own colour: the sentence says who, and the colour says which
 * kind of news it is before the name is read. This used to be a toast in the
 * middle of the screen AND nothing here, so the one place the player had
 * learned to watch for a rival stayed silent at the exact moment it mattered.
 */
export const StruckByARival: Story = { args: { count: 2, hit: 'bolt' } };

/** The quieter half: a buried bomb, stepped on. Same line, same red. */
export const SteppedOnTheirBomb: Story = { args: { count: 1, hit: 'bomb' } };

/**
 * A hit from somebody the board cannot name.
 *
 * A watcher who never took a turn is not in the island's roster, so the name
 * lookup fails and the line falls back to "a rival" rather than to a blank or
 * to a raw id. Worth a story of its own: it is the likeliest case in the wild,
 * since a saboteur has no rabbit on the board by definition.
 */
export const AnUnknownRival: Story = { args: { count: 3, hit: 'bolt', known: false } };
