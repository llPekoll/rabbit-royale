'use client';

/**
 * The burrow — and the home screen.
 *
 * There is no menu, deliberately. The game is two places (your burrow, the
 * island) and one is reached from the other, so a nav bar would be three tabs
 * for two destinations. You land here, see what accrued while you were away,
 * and press the arrow to go farm.
 *
 * The season board lives beside this: a column on a wide screen, a slide-over
 * on a phone. See LeaderboardDrawer.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletLogin } from '@/components/use-wallet-login';
import { WalletButton } from '@/components/wallet-button';
import { LeaderboardDrawer } from '@/components/leaderboard-drawer';
import { GoButton } from '@/components/go-button';
import { CarrotBurst } from '@/components/carrot-burst';
import { LoadingScreen } from '@/components/loading-screen';

interface Burrow {
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
  stock: number;
  gardenReady: number;
  yieldPerHour: number;
  capHours: number;
  gardenCapacity: number;
  upgradeCost: number | null;
  canUpgrade: boolean;
  next: { hp: number; yieldPerHour: number } | null;
}

export default function Home() {
  const { player, token } = useWalletLogin();
  const router = useRouter();
  const [burrow, setBurrow] = useState<Burrow | null>(null);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Bumped on every successful harvest: it both replays the burst and re-keys
  // the number, so the figure pops at the moment the carrots land in it.
  const [burstKey, setBurstKey] = useState(0);
  const [burstAmount, setBurstAmount] = useState(0);
  // The burrow painting is 150KB and IS this screen's background, so the page
  // is not ready until it has decoded — showing the panels over a black
  // rectangle first is exactly the flicker the loading screen exists to hide.
  const [artReady, setArtReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = BURROW_ART;
    img.decode().then(() => setArtReady(true)).catch(() => setArtReady(true));
  }, []);

  const auth = useCallback(
    (init?: RequestInit) => ({
      ...init,
      headers: { ...init?.headers, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }),
    [token],
  );

  useEffect(() => {
    if (!token) return;
    fetch('/api/burrow', auth())
      .then((r) => r.json())
      .then((d) => d.burrow && setBurrow(d.burrow))
      .catch(() => {});
  }, [token, auth]);

  const act = async (action: 'harvest' | 'upgrade') => {
    setPending(true);
    setNote(null);
    try {
      const res = await fetch('/api/burrow', auth({ method: 'POST', body: JSON.stringify({ action }) }))
        .then((r) => r.json());
      if (res.burrow) setBurrow(res.burrow);
      if (res.harvested) {
        setNote(`+${res.harvested} 🥕`);
        setBurstAmount(res.harvested);
        setBurstKey((k) => k + 1);
      }
      else if (res.spent) setNote(`Burrow deepened: ${res.spent} 🥕`);
      else if (res.error === 'insufficient_carrots') setNote(`Need ${res.need - res.have} more 🥕`);
      else if (res.error === 'nothing_to_harvest') setNote('The garden is empty. Come back later.');
      else if (res.error === 'max_level') setNote('Your burrow is as deep as it goes.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="rr-home">
      {/* Your burrow, drawn behind everything. This screen is a PLACE — the
          panels are notes pinned on it, which is why they sit to one side
          rather than filling the middle. */}
      <div
        className="rr-home-art"
        style={{ backgroundImage: `url(${BURROW_ART})` }}
        aria-hidden
      />

      <div className="rr-topbar">
        <WalletButton />
      </div>

      {/* Nothing but the wallet button until you are in. A season board and a
          way onto the island are meaningless without an account behind them,
          and showing them first invites a tap that can only fail. */}
      {player && <LeaderboardDrawer token={token} playerId={player.id} />}

      <section className="rr-burrow">
        {!player ? (
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
            {/* The count leads. It is the one number the player came to see,
                and the title only says where they are — which the art behind
                it already said. */}
            <div className="rr-stat">
              {/* The burst is positioned relative to this block, so the carrots
                  fly INTO the figure they are changing. */}
              <CarrotBurst fireKey={burstKey} amount={burstAmount} />
              <span
                key={burstKey}
                className={`rr-stat-value${burstKey ? ' banked' : ''}`}
                style={{ color: 'var(--carrot)' }}
              >
                {burrow?.stock ?? 0}
              </span>
              <span className="rr-stat-label">🥕 carrots banked</span>
            </div>

            <h1 className="rr-burrow-title">🕳️ Your burrow</h1>

            <div className="rr-card">
              <div className="rr-row">
                <span>Hit points</span>
                <span>{burrow?.hp ?? '-'} / {burrow?.maxHp ?? '-'}</span>
              </div>
              <div className="rr-meter">
                <i style={{ width: `${burrow ? (burrow.hp / burrow.maxHp) * 100 : 0}%` }} />
              </div>
              {/* Repair is free and time-based, always. Charging for it would
                  turn every raid into a bill and kill the revenge loop. */}
              <small style={{ color: 'var(--muted)' }}>Repairs itself over time. Always free.</small>
            </div>

            <div className="rr-card">
              <div className="rr-row">
                <span>🌱 Garden</span>
                <span style={{ color: 'var(--carrot)' }}>+{burrow?.gardenReady ?? 0}</span>
              </div>
              <button
                style={{ width: '100%' }}
                disabled={pending || !burrow?.gardenReady}
                onClick={() => act('harvest')}
              >
                Harvest
              </button>
            </div>

            <div className="rr-card">
              <div className="rr-row">
                <span>Dig deeper &middot; level {burrow?.level ?? '-'}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {burrow?.upgradeCost === null ? 'Max' : `${burrow?.upgradeCost ?? '-'} 🥕`}
                </span>
              </div>
              <button
                style={{ width: '100%' }}
                disabled={pending || !burrow?.canUpgrade}
                onClick={() => act('upgrade')}
              >
                Upgrade
              </button>
            </div>

            {note && <p className="rr-note">{note}</p>}
          </>
        )}
      </section>

      {/* The one way out, and the only thing to press when you are done here.
          Absent rather than disabled when signed out: a greyed button is an
          invitation the game cannot honour yet. */}
      {player && (
        <GoButton dir="down" label="Go farm" onClick={() => router.push('/play')} />
      )}

      <LoadingScreen ready={artReady} label="Waking the warren" />
    </main>
  );
}

/** The burrow, painted. Also preloaded above, so the panels never flash over
 *  an empty background. */
const BURROW_ART = '/assets/island/burrow_generated.webp';
