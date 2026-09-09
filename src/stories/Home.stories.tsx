/**
 * The home screen: your burrow, with the season board beside it.
 *
 * Not reachable in a browser without a wallet, so it gets a story — and this is
 * the layout worth checking on both a phone and a desktop, because the board
 * changes from a slide-over to a permanent column between the two.
 *
 * The markup mirrors the page; what is faked is only the data and the router.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { GoButton } from '@/components/go-button';
import '@/app/globals.css';

interface Args {
  signedIn: boolean;
  stock: number;
  hp: number;
  maxHp: number;
  gardenReady: number;
  level: number;
  upgradeCost: number;
  boardOpen: boolean;
}

const ENTRIES = [
  { rank: 1, name: 'GoldenThumper7', score: 8420, burrow: 9, lifetime: 40311, crowned: true },
  { rank: 2, name: 'AshenBramble3', score: 7180, burrow: 8, lifetime: 33900, crowned: false },
  { rank: 3, name: 'SilentWarren21', score: 5990, burrow: 7, lifetime: 28755, crowned: false },
  { rank: 4, name: 'LuckyPaw42', score: 5210, burrow: 6, lifetime: 21400, crowned: false },
  { rank: 5, name: 'GrimWhisker88', score: 4870, burrow: 6, lifetime: 19980, crowned: false },
  { rank: 6, name: 'RustyClover5', score: 3110, burrow: 4, lifetime: 12050, crowned: false },
];

function Home({ signedIn, stock, hp, maxHp, gardenReady, level, upgradeCost, boardOpen }: Args) {
  const [open, setOpen] = useState(boardOpen);

  return (
    <main className="rr-home" style={{ height: '100dvh' }}>
      {/* The burrow behind everything, exactly as the page draws it. */}
      <div
        className="rr-home-art"
        style={{ backgroundImage: 'url(/assets/island/burrow_generated.webp)' }}
        aria-hidden
      />
      <div className="rr-topbar">
        <button className={`rr-wallet${signedIn ? ' connected' : ''}`}>
          {signedIn ? <><span aria-hidden>🐰</span> LuckyPaw42</> : 'Connect wallet'}
        </button>
      </div>

      {signedIn && (
        <button className="rr-lb-tab" onClick={() => setOpen((v) => !v)}>
          <span aria-hidden>👑</span>
          <small>#4</small>
        </button>
      )}

      {signedIn && (
      <aside className={`rr-lb${open ? ' open' : ''}`}>
        <header className="rr-lb-head">
          <strong>👑 Season</strong>
          <span style={{ color: 'var(--muted)' }}>9d</span>
          <button className="rr-lb-close" onClick={() => setOpen(false)}>&times;</button>
        </header>
        <div className="rr-lb-list">
          {ENTRIES.map((e) => (
            <button
              key={e.rank}
              className={`rr-lb-row${e.crowned ? ' crown' : ''}${e.name === 'LuckyPaw42' ? ' me' : ''}`}
            >
              <span className="rr-lb-rank">{e.crowned ? '👑' : e.rank}</span>
              <span className="rr-lb-name">
                {e.name}
                <small>burrow {e.burrow} &middot; {e.lifetime} lifetime</small>
              </span>
              <span style={{ color: 'var(--carrot)' }}>{e.score}</span>
            </button>
          ))}
        </div>
      </aside>
      )}
      {signedIn && open && <div className="rr-scrim" onClick={() => setOpen(false)} />}

      <section className="rr-burrow">
        {!signedIn ? (
          <div className="rr-empty">
            <div style={{ fontSize: 64 }}>🕳️</div>
            <h1 style={{ margin: '10px 0 4px' }}>Rabbit Royale</h1>
            <p style={{ color: 'var(--muted)', margin: 0 }}>The Cursed Crown</p>
            <p style={{ color: 'var(--muted)', maxWidth: 300 }}>
              Connect your wallet to claim a burrow. Nothing to remember, nothing to lose.
            </p>
          </div>
        ) : (
          <>
            <h1 className="rr-burrow-title">🕳️ Your burrow</h1>
            {/* The count lives in the topbar now (see .rr-carrots), not in a
                block of its own. */}
            <div className="rr-card">
              <div className="rr-row"><span>Hit points</span><span>{hp} / {maxHp}</span></div>
              <div className="rr-meter"><i style={{ width: `${(hp / maxHp) * 100}%` }} /></div>
              <small style={{ color: 'var(--muted)' }}>Repairs itself over time. Always free.</small>
            </div>
            <div className="rr-card">
              <div className="rr-row">
                <span>🌱 Garden</span>
                <span style={{ color: 'var(--carrot)' }}>+{gardenReady}</span>
              </div>
              <button style={{ width: '100%' }} disabled={!gardenReady}>Harvest</button>
            </div>
            <div className="rr-card">
              <div className="rr-row">
                <span>Dig deeper &middot; level {level}</span>
                <span style={{ color: 'var(--muted)' }}>{upgradeCost} 🥕</span>
              </div>
              <button style={{ width: '100%' }} disabled={stock < upgradeCost}>Upgrade</button>
            </div>
          </>
        )}
      </section>

      {signedIn && <GoButton dir="down" label="Go farm" onClick={() => {}} />}
    </main>
  );
}

const meta: Meta<Args> = {
  title: 'Home/Burrow',
  render: (args) => <Home key={JSON.stringify(args)} {...args} />,
  parameters: { layout: 'fullscreen' },
  args: {
    signedIn: true, stock: 1240, hp: 430, maxHp: 600,
    gardenReady: 186, level: 6, upgradeCost: 2185, boardOpen: false,
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Coming back after a night away: carrots waiting, one press to go farm. */
export const Playing: Story = {};

/** The board opened over the burrow — the phone layout. */
export const BoardOpen: Story = { args: { boardOpen: true } };

/** First visit: the only thing to do is connect. */
export const SignedOut: Story = { args: { signedIn: false } };

/** Raided overnight: the burrow is hurt and repairing itself for free. */
export const Raided: Story = { args: { hp: 74, stock: 310, gardenReady: 0 } };
