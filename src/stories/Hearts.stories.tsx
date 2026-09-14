/**
 * The run's hearts at every count that matters: full, one bomb in, the last
 * heart, and none. There is nothing between two hearts to screenshot.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Hearts } from '@/components/hearts';
import { ENERGY, HEARTS } from '@config/tuning';
import '@/app/globals.css';

const meta: Meta<typeof Hearts> = {
  title: 'HUD/Hearts',
  component: Hearts,
  parameters: { backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div style={{ background: '#0d1117', padding: 20, width: 380 }}>
        <div className="rr-hud">
          <Story />
          <span style={{ color: 'var(--carrot)' }}>🥕 +12</span>
          <span style={{ color: 'var(--muted)' }}>🐰 3</span>
        </div>
      </div>
    ),
  ],
  args: { energy: ENERGY.START },
  argTypes: { energy: { control: { type: 'range', min: 0, max: ENERGY.MAX, step: 1 } } },
};
export default meta;

type Story = StoryObj<typeof Hearts>;

/** A fresh run: every heart. */
export const Full: Story = {};

/** One bomb taken. */
export const OneDown: Story = { args: { energy: ENERGY.START - ENERGY.BOMB_LOSS } };

/** The last heart: the next bomb ends the run. */
export const LastHeart: Story = { args: { energy: ENERGY.BOMB_LOSS } };

/** Run over. */
export const Empty: Story = { args: { energy: 0 } };

/** Every count at once. */
export const Ladder: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: HEARTS + 1 }, (_, i) => (HEARTS - i) * ENERGY.BOMB_LOSS).map((e) => (
        <div key={e} className="rr-hud">
          <Hearts energy={e} />
        </div>
      ))}
    </div>
  ),
};
