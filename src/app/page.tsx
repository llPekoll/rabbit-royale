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

interface Burrow {
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
  stock: number;
  gardenReady: number;
  upgradeCost: number | null;
  canUpgrade: boolean;
}

export default function Home() {
  const { player, token } = useWalletLogin();
  const router = useRouter();
  const [burrow, setBurrow] = useState<Burrow | null>(null);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
      if (res.harvested) setNote(`+${res.harvested} 🥕`);
      else if (res.spent) setNote(`Burrow deepened — ${res.spent} 🥕`);
      else if (res.error === 'insufficient_carrots') setNote(`Need ${res.need - res.have} more 🥕`);
      else if (res.error === 'nothing_to_harvest') setNote('The garden is empty — come back later.');
      else if (res.error === 'max_level') setNote('Your burrow is as deep as it goes.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="rr-home">
      <div className="rr-topbar">
        <WalletButton />
      </div>

      <LeaderboardDrawer token={token} playerId={player?.id} />

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
            <h1 className="rr-burrow-title">🕳️ Your burrow</h1>

            <div className="rr-stat">
              <span className="rr-stat-value" style={{ color: 'var(--carrot)' }}>
                {burrow?.stock ?? 0}
              </span>
              <span className="rr-stat-label">🥕 carrots banked</span>
            </div>

            <div className="rr-card">
              <div className="rr-row">
                <span>Hit points</span>
                <span>{burrow?.hp ?? '–'} / {burrow?.maxHp ?? '–'}</span>
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
                <span>Dig deeper — level {burrow?.level ?? '–'}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {burrow?.upgradeCost === null ? 'Max' : `${burrow?.upgradeCost ?? '–'} 🥕`}
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

      {/* The one way out, and the only thing to press when you are done here. */}
      <button className="rr-go" onClick={() => router.push('/play')} disabled={!player}>
        <span className="rr-go-label">Go farm</span>
        <span className="rr-go-arrow" aria-hidden>▼</span>
      </button>
    </main>
  );
}
