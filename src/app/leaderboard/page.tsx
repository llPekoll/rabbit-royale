'use client';

/**
 * The season board — and where you choose someone to spectate.
 *
 * Spectating is not a nicety: it is the front door to sabotage (phase 5). You
 * pick a target here, watch them dig, and decide whether to spend a bomb on
 * them. So a row is a BUTTON, not a line of text.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletLogin } from '@/components/use-wallet-login';
import { Nav } from '@/components/nav';

interface Entry {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  lifetime: number;
  burrowLevel: number;
  crowned: boolean;
}

export default function LeaderboardPage() {
  const { player, token } = useWalletLogin();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [me, setMe] = useState<{ rank: number | null; score: number } | null>(null);
  const [season, setSeason] = useState<{ endsAt: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch('/api/leaderboard?limit=50', { headers })
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries ?? []);
        setMe(d.me ?? null);
        setSeason(d.season ?? null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const daysLeft = season
    ? Math.max(0, Math.ceil((new Date(season.endsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <main className="rr-page">
      <div className="rr-card" style={{ marginBottom: 8 }}>
        <div className="rr-row" style={{ padding: 0 }}>
          <strong style={{ fontSize: 18 }}>👑 Season</strong>
          {daysLeft !== null && (
            <span style={{ color: 'var(--muted)' }}>{daysLeft}d left</span>
          )}
        </div>
        {me && (
          <div className="rr-row">
            <span>You</span>
            <span>
              {me.rank ? `#${me.rank}` : 'unranked'} · {me.score} 🥕
            </span>
          </div>
        )}
      </div>

      <div className="rr-scroll">
        {loading && <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Loading…</p>}
        {!loading && entries.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
            Nobody has scored yet. Be the first.
          </p>
        )}
        {entries.map((e) => (
          <button
            key={e.playerId}
            className={`rr-lb-row${e.crowned ? ' crown' : ''}${e.playerId === player?.id ? ' me' : ''}`}
            style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
            // Watching your own run from here would just be the game.
            disabled={e.playerId === player?.id}
            onClick={() => router.push(`/play?spectate=${encodeURIComponent(e.playerId)}`)}
          >
            <span className="rr-lb-rank">{e.crowned ? '👑' : e.rank}</span>
            <span>
              {e.name}
              <small style={{ display: 'block', color: 'var(--muted)' }}>
                burrow {e.burrowLevel} · {e.lifetime} lifetime
              </small>
            </span>
            <span style={{ color: 'var(--carrot)' }}>{e.score}</span>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              {e.playerId === player?.id ? '' : 'watch'}
            </span>
          </button>
        ))}
      </div>
      <Nav />
    </main>
  );
}
