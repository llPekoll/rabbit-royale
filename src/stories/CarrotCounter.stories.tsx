/**
 * The banked-carrot counter, and what it does when a harvest lands.
 *
 * Framed as the SEEKER sees it: landscape, the panels in a column down the left
 * over the burrow art, no top-right bar. That is the device this game is built
 * for, so it is the shape the counter has to work in — judging it on a portrait
 * phone was judging it somewhere it will rarely be.
 *
 * The gain rises and fades in under a second, so it cannot be judged from a
 * still — press Harvest and watch.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CarrotCounter } from '@/components/carrot-counter';
import '@/app/globals.css';

const ART = '/assets/island/burrow_generated.webp';

function Harness({
  start = 237,
  gain = 14,
}: {
  start?: number;
  gain?: number;
}) {
  const [stock, setStock] = useState(start);
  const [fireKey, setFireKey] = useState(0);

  const harvest = () => {
    setStock((s) => s + gain);
    setFireKey((k) => k + 1);
  };

  return (
    // Seeker, landscape. The column is the real one (.rr-page, 480px) sitting
    // over the burrow art, which is what makes the counter's contrast a real
    // question rather than a theoretical one.
    <div
      style={{
        width: 900,
        height: 420,
        position: 'relative',
        overflow: 'hidden',
        background: '#2d5a27',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${ART})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          imageRendering: 'pixelated',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: 380,
          height: '100%',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'linear-gradient(90deg, rgba(13,17,23,0.82) 60%, rgba(13,17,23,0))',
        }}
      >
        <div className="rr-topbar" style={{ justifyContent: 'flex-start' }}>
          <CarrotCounter stock={stock} fireKey={fireKey} gain={gain} />
        </div>

        <h1 className="rr-burrow-title" style={{ margin: 0 }}>🕳️ Your burrow</h1>

        <div className="rr-card" style={{ margin: 0 }}>
          <div className="rr-row">
            <span>🌱 Garden</span>
            <span style={{ color: 'var(--carrot)' }}>+{gain}</span>
          </div>
          <small style={{ color: 'var(--muted)' }}>48 🥕/hour &middot; holds 576 (12h)</small>
          <button style={{ width: '100%' }} onClick={harvest}>
            Harvest
          </button>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'HUD/Carrot counter',
  component: Harness,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  argTypes: {
    start: { control: { type: 'number' } },
    gain: { control: { type: 'number' } },
  },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** Press Harvest. The number pops, "+14" rises off the right and fades. */
export const Playground: Story = { args: { start: 237, gain: 14 } };

/** A big haul — the gain is wider, and must still not push the layout around. */
export const BigGain: Story = { args: { start: 1240, gain: 576 } };

/** A five-digit balance: the counter has to hold its shape as digits are added. */
export const LongNumber: Story = { args: { start: 99994, gain: 6 } };

/** Press twice quickly: the second gain must replay, not be swallowed. */
export const RepeatHarvest: Story = { args: { start: 40, gain: 8 } };
