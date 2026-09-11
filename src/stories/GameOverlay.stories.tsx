/**
 * The in-game overlay: what sits ON the board while a run is going.
 *
 * Worth a story of its own because it cannot be reached in a browser without a
 * wallet — the play screen gates on sign-in — and it is exactly the layer that
 * has to be right on a phone: HUD readable at the top, nav reachable at the
 * bottom, and the whole middle transparent to touch so the board still takes
 * every tap.
 *
 * The fake island underneath is a screenshot-grade stand-in, not the engine:
 * what is under test here is the CHROME.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EnergyBar } from '@/components/energy-bar';
import { ENERGY } from '@config/tuning';
import { GoButton } from '@/components/go-button';
import '@/app/globals.css';

interface Args {
  energy: number;
  carrots: number;
  rabbits: number;
  warnStage: number;
  spectating: boolean;
  recap: boolean;
}

function Overlay({ energy, carrots, rabbits, warnStage, spectating, recap }: Args) {
  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {/* Stand-in for the Pixi canvas, which is `position: fixed` in the app. */}
      <img
        src="/assets/island/land2.webp"
        alt=""
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', imageRendering: 'pixelated',
        }}
      />

      <div className="rr-overlay">
        <header className="rr-hud">
          <EnergyBar energy={energy} />
          <span style={{ color: 'var(--carrot)' }}>🥕 {carrots}</span>
          <span style={{ color: 'var(--muted)' }}>🐰 {rabbits}</span>
          {warnStage > 0 && (
            <span style={{ color: 'var(--danger)' }}>🌋 {'!'.repeat(warnStage)}</span>
          )}
          {spectating
            ? <strong style={{ color: 'var(--crown)' }}>👁</strong>
            : <small style={{ color: 'var(--muted)' }}>LuckyPaw42</small>}
        </header>

        <div style={{ flex: 1 }} />

        {recap && (
          <div className="rr-card" style={{ textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 4px' }}>Run over</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 10px' }}>
              🥕 {carrots} &middot; 34 dug &middot; 💣 3 &middot; 62s
            </p>
            <button style={{ width: '100%' }}>Again</button>
          </div>
        )}

        {/* The one way out. Not a nav bar: the game is two places, and each is
            one press from the other. */}
        <GoButton
          dir="down"
          label={spectating ? 'Stop watching' : 'Back home'}
          onClick={() => {}}
        />
      </div>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'HUD/Game overlay',
  render: (args) => <Overlay {...args} />,
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } },
  args: { energy: ENERGY.START, carrots: 12, rabbits: 3, warnStage: 0, spectating: false, recap: false },
  argTypes: {
    energy: { control: { type: 'range', min: 0, max: ENERGY.MAX, step: 1 } },
    warnStage: { control: { type: 'range', min: 0, max: 3, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Mid-run. The nav stays reachable — this is the check that matters. */
export const Playing: Story = {};

/** Nearly dead: the bar goes red and pulses, the volcano is smoking. */
export const AboutToDie: Story = { args: { energy: 5, warnStage: 3, carrots: 41 } };

/** The recap, sitting above the nav rather than replacing it. */
export const RunOver: Story = { args: { energy: 0, recap: true, carrots: 27 } };

/** Watching someone from the leaderboard. */
export const Spectating: Story = { args: { spectating: true, energy: 44 } };
