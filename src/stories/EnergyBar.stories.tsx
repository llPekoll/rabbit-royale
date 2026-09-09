/**
 * The energy bar at every level that matters.
 *
 * The states worth eyeballing are the thresholds, not the middle: full, the
 * amber warning, the critical pulse below one bomb's worth, and empty. A
 * screenshot of "50%" proves nothing.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EnergyBar } from '@/components/energy-bar';
import { ENERGY } from '@config/tuning';
import '@/app/globals.css';

const meta: Meta<typeof EnergyBar> = {
  title: 'HUD/Energy bar',
  component: EnergyBar,
  parameters: { backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div style={{ background: '#0d1117', padding: 20, width: 380 }}>
        <div className="rr-hud">
          <Story />
          <span style={{ color: 'var(--carrot)' }}>🥕 12</span>
        </div>
      </div>
    ),
  ],
  args: { energy: ENERGY.START },
  argTypes: { energy: { control: { type: 'range', min: 0, max: ENERGY.MAX, step: 1 } } },
};
export default meta;

type Story = StoryObj<typeof EnergyBar>;

/** A run's starting budget. */
export const Start: Story = {};

/** Fed on golden carrots — the bar's full scale is the CEILING, not the start,
 *  so doing well still moves it. */
export const Full: Story = { args: { energy: ENERGY.MAX } };

/** Amber: two bombs from the end. */
export const Warning: Story = { args: { energy: ENERGY.BOMB_LOSS * 2 } };

/** Critical — the next bomb ends the run, and the bar pulses to say so. */
export const Critical: Story = { args: { energy: ENERGY.BOMB_LOSS - 1 } };

/** Run over. */
export const Empty: Story = { args: { energy: 0 } };

/** Every state at once, for comparing the colour ladder. */
export const Ladder: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {[ENERGY.MAX, ENERGY.START, ENERGY.BOMB_LOSS * 2, ENERGY.BOMB_LOSS, 3, 0].map((e) => (
        <div key={e} className="rr-hud">
          <EnergyBar energy={e} />
        </div>
      ))}
    </div>
  ),
};
