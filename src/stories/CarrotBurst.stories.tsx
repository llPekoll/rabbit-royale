/**
 * Carrots landing in the counter.
 *
 * The burst is half a second long and fires on an event, so it cannot be judged
 * from a static screenshot of the real screen — this story replays it on demand
 * over the actual stat block it decorates.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CarrotBurst } from '@/components/carrot-burst';
import '@/app/globals.css';

function Harness({ amount = 24, start = 138 }: { amount?: number; start?: number }) {
  const [key, setKey] = useState(0);
  const [stock, setStock] = useState(start);

  return (
    <div style={{ background: '#2d5a27', padding: '60px 20px 20px', width: 340 }}>
      <div className="rr-stat">
        <CarrotBurst fireKey={key} amount={amount} />
        <span key={key} className={`rr-stat-value${key ? ' banked' : ''}`} style={{ color: 'var(--carrot)' }}>
          {stock}
        </span>
        <span className="rr-stat-label">🥕 carrots banked</span>
      </div>
      <h1 className="rr-burrow-title">🕳️ Your burrow</h1>
      <button
        style={{ width: '100%', marginTop: 16 }}
        onClick={() => {
          setStock((s) => s + amount);
          setKey((k) => k + 1);
        }}
      >
        Harvest
      </button>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'HUD/Carrot burst',
  component: Harness,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** An ordinary garden harvest. */
export const Harvest: Story = { args: { amount: 24 } };

/** A big haul — more sprites, but capped so it stays loot and not confetti. */
export const BigHaul: Story = { args: { amount: 400 } };

/** A couple of carrots still reads as carrots arriving. */
export const Tiny: Story = { args: { amount: 3 } };
