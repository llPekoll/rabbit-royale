/**
 * The end of a run, and the way out of it.
 *
 * The question these answer: does the screen offer something a player can
 * actually DO? The recap used to end every run with a single "Again" button,
 * including the runs that ended because the tank ran dry — where digging again
 * is precisely the one thing that is not possible.
 *
 * Framed over the island, at the bottom of the overlay, because that is where
 * it appears: a card judged in the middle of an empty page is judged somewhere
 * it never is.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Recap } from '@/components/run-recap';
import '@/app/globals.css';

const ART = '/assets/island/land1.webp';

function Harness({ energy }: { energy: number | null }) {
  return (
    <div style={{
      width: 760, height: 420, position: 'relative',
      overflow: 'hidden', background: '#081120',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${ART})`, backgroundSize: 'cover',
        backgroundPosition: 'center', imageRendering: 'pixelated', opacity: 0.9,
      }} />
      {/* The overlay layer the recap really sits in: pushed to the bottom. */}
      <div style={{
        position: 'relative', height: '100%', display: 'flex',
        flexDirection: 'column', padding: 12,
      }}>
        <div style={{ flex: 1 }} />
        <Recap
          recap={{ carrots: 42, tilesDug: 78, bombsHit: 3, durationMs: 214_000 }}
          energy={energy}
          onAgain={() => {}}
          onShop={() => {}}
          onHome={() => {}}
        />
      </div>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Island/Run recap',
  component: Harness,
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** Energy left: another run is possible, so "Again" leads. */
export const CanDigAgain: Story = { args: { energy: 24 } };

/**
 * The tank is empty — the case the old recap had no answer for. "Again" would
 * be a button that cannot work, so it is replaced by the two things that can:
 * buy a refill, or go home and let the garden fill the bar for free.
 */
export const OutOfEnergy: Story = { args: { energy: 0 } };

/**
 * The burrow has not answered yet. Null is "not known", NOT "empty" — pitching
 * a refill at a player who has energy would be a shop ad dressed as help, so
 * this state behaves as if a run is still possible.
 */
export const BurrowStillLoading: Story = { args: { energy: null } };
