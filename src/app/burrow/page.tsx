'use client';

/**
 * The burrow — where carrots pile up and where you come back to.
 *
 * Phase 4's whole point: a reason to return. So the two things this screen does
 * are collect what accrued while you were away, and spend it on the one stat
 * the burrow has (its level, which is its HP).
 */
import { useCallback, useEffect, useState } from 'react';
import { useWalletLogin } from '@/components/use-wallet-login';
import { Nav } from '@/components/nav';

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

export default function BurrowPage() {
  const { player, token, login, busy } = useWalletLogin();
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

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/burrow', auth()).then((r) => r.json());
    if (res.burrow) setBurrow(res.burrow);
  }, [token, auth]);

  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (action: 'harvest' | 'upgrade') => {
    setPending(true);
    setNote(null);
    try {
      const res = await fetch('/api/burrow', auth({ method: 'POST', body: JSON.stringify({ action }) }))
        .then((r) => r.json());
      if (res.burrow) setBurrow(res.burrow);
      if (res.harvested) setNote(`+${res.harvested} 🥕 harvested`);
      if (res.spent) setNote(`Burrow upgraded — ${res.spent} 🥕 spent`);
      if (res.error === 'insufficient_carrots') setNote(`Need ${res.need - res.have} more 🥕`);
      else if (res.error === 'nothing_to_harvest') setNote('The garden is empty — come back later.');
      else if (res.error === 'max_level') setNote('Your burrow is as deep as it goes.');
    } finally {
      setPending(false);
    }
  };

  if (!player) {
    return (
      <main className="rr-page" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>🕳️</div>
        <p style={{ color: 'var(--muted)' }}>Sign in to see your burrow.</p>
        <button onClick={login} disabled={busy}>{busy ? 'Waiting for wallet…' : 'Connect wallet'}</button>
      </main>
    );
  }

  return (
    <main className="rr-page">
      <div className="rr-scroll">
        <div className="rr-card">
          <div className="rr-row">
            <strong style={{ fontSize: 18 }}>🕳️ Burrow</strong>
            <span style={{ color: 'var(--muted)' }}>
              Level {burrow?.level ?? '–'} / {burrow?.maxLevel ?? '–'}
            </span>
          </div>
          <div className="rr-row">
            <span>Hit points</span>
            <span>{burrow?.hp ?? '–'} / {burrow?.maxHp ?? '–'}</span>
          </div>
          <div className="rr-meter">
            <i style={{ width: `${burrow ? (burrow.hp / burrow.maxHp) * 100 : 0}%` }} />
          </div>
          {/* Repair is free and time-based, always. Charging for it would turn
              every raid into a bill and kill the revenge loop. */}
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 0' }}>
            Repairs itself over time. Always free.
          </p>
        </div>

        <div className="rr-card">
          <div className="rr-row">
            <strong>🥕 Stock</strong>
            <span style={{ color: 'var(--carrot)', fontSize: 20 }}>{burrow?.stock ?? 0}</span>
          </div>
          <div className="rr-row">
            <span>Garden ready</span>
            <span style={{ color: 'var(--carrot)' }}>+{burrow?.gardenReady ?? 0}</span>
          </div>
          <button
            style={{ width: '100%', marginTop: 8 }}
            disabled={pending || !burrow?.gardenReady}
            onClick={() => act('harvest')}
          >
            Harvest
          </button>
        </div>

        <div className="rr-card">
          <div className="rr-row">
            <strong>Dig deeper</strong>
            <span style={{ color: 'var(--muted)' }}>
              {burrow?.upgradeCost === null ? 'Max' : `${burrow?.upgradeCost ?? '–'} 🥕`}
            </span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 8px' }}>
            A deeper burrow holds more hit points — the only thing standing between
            your stock and a raider.
          </p>
          <button
            style={{ width: '100%' }}
            disabled={pending || !burrow?.canUpgrade}
            onClick={() => act('upgrade')}
          >
            Upgrade
          </button>
        </div>

        {note && <p style={{ textAlign: 'center', color: 'var(--muted)' }}>{note}</p>}
      </div>
      <Nav />
    </main>
  );
}
