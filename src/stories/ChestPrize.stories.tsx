/**
 * The prize overlay as the GAME drives it — the last link, in isolation.
 *
 * `ChestOpening.stories` exercises the ceremony with arguments chosen by hand.
 * This one feeds `ChestPrize` the exact shape `use-game-socket` builds from a
 * `move_result`, so what is on trial here is the mapping the running game does:
 * a rolled kind becoming art, a stamp and a caption.
 *
 * The cases that matter are the awkward ones — a crown chest's piece arriving
 * on top of an item, a kind this client has never heard of, and the split that
 * decides WHICH celebration runs at all: a chest the player could see on the
 * board earns the full take-over, a buried one hands the item up and gets out
 * of the way.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChestPrize } from '@/components/chest-prize';
import type { ChestPrize as Prize } from '@/components/use-game-socket';

function Replayable({ prize }: { prize: Omit<Prize, 'at'> }) {
  const [shown, setShown] = useState<Prize | null>(null);
  return (
    <div style={{ minHeight: 420, background: '#0d1b12', display: 'grid', placeItems: 'center' }}>
      {shown ? (
        <ChestPrize prize={shown} onDone={() => setShown(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setShown({ ...prize, at: Date.now() })}
          style={{
            font: '14px ui-monospace, monospace', padding: '10px 18px', cursor: 'pointer',
            background: '#1a2a1a', color: '#c8d6c8', border: '2px solid #3f7d3a',
          }}
        >
          DIG THE CHEST
        </button>
      )}
    </div>
  );
}

const meta = {
  title: 'Chests/Prize overlay',
  component: Replayable,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Replayable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A silver chest's watering — the ordinary case. */
export const Watering: Story = {
  args: { prize: { kind: 'water', amount: 2, nft: false, announced: true } },
};

/** A gold chest's raid item. */
export const Shield: Story = {
  args: { prize: { kind: 'shield', amount: 1, nft: false, announced: true } },
};

/**
 * The same win, out of a chest nobody could SEE.
 *
 * No ceremony: the fertiliser rises off the board with its name and the run
 * never stops. This is the case that sent the feature back — a take-over for a
 * find the player was not even walking towards, several times a run.
 */
export const HiddenFertiliser: Story = {
  args: { prize: { kind: 'fertiliser', amount: 1, nft: false, announced: false } },
};

/** A hidden stack, to check the count reads as "3x BOMB" rather than bare art. */
export const HiddenStack: Story = {
  args: { prize: { kind: 'bomb', amount: 3, nft: false, announced: false } },
};

/**
 * A piece out of a chest nobody could see.
 *
 * Still the full ceremony. `announced` loses to the piece on purpose: one turns
 * up in a session or two, and it is worth any interruption wherever it was
 * buried.
 */
export const HiddenGenesis: Story = {
  args: { prize: { kind: 'shield', amount: 1, nft: true, announced: false } },
};

/**
 * A crown chest: the piece AND the item it came with.
 *
 * The stamp says RR GENESIS rather than a rarity — at the moment of the drop
 * the piece is not minted and its rarity is genuinely unknown, so naming one
 * would be a guess the player would read as the chest's tier.
 */
export const GenesisPiece: Story = {
  args: { prize: { kind: 'lightning', amount: 1, nft: true, announced: true } },
};

/**
 * A kind this client does not know — a server newer than the page.
 *
 * Renders nothing at all rather than an empty ceremony over a missing image:
 * the run carries on, and the item is still in the bag when the player gets
 * home. Pinned because the failure it replaces is a black take-over the player
 * has to tap through.
 */
export const UnknownKind: Story = {
  args: { prize: { kind: 'moon-cheese', amount: 1, nft: false, announced: true } },
};
