'use client';

/**
 * The season board, beside the burrow.
 *
 * On a wide screen it simply sits there — a column to the right of the burrow,
 * always visible. On a phone there is no room for that, so it collapses to a
 * tab on the right edge showing the crown and YOUR rank, and slides over when
 * tapped. Same component, same markup: the layout is a media query, not a
 * second implementation.
 *
 * Each row is a button that starts spectating — the front door to sabotage
 * (phase 5), not an ornament.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Entry {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  lifetime: number;
  burrowLevel: number;
  crowned: boolean;
}

export function LeaderboardDrawer({ token, playerId }: { token: string | null; playerId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [me, setMe] = useState<{ rank: number | null; score: number } | null>(null);
  const [season, setSeason] = useState<{ endsAt: string } | null>(null);

  useEffect(() => {
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch('/api/leaderboard?limit=50', { headers })
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries ?? []);
        setMe(d.me ?? null);
        setSeason(d.season ?? null);
      })
      .catch(() => {});
  }, [token]);

  const daysLeft = season
    ? Math.max(0, Math.ceil((new Date(season.endsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <>
      {/* The phone-sized handle. Carries the player's own rank, so the board is
          worth opening (or reassuringly not) without opening it. */}
      <button
        className="rr-lb-tab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="rr-leaderboard"
      >
        <span aria-hidden>👑</span>
        <small>{me?.rank ? `#${me.rank}` : '–'}</small>
      </button>

      <aside id="rr-leaderboard" className={`rr-lb${open ? ' open' : ''}`}>
        <header className="rr-lb-head">
          <strong>👑 Season</strong>
          {daysLeft !== null && <span style={{ color: 'var(--muted)' }}>{daysLeft}d</span>}
          {/* Closing is phone-only chrome; on a wide screen the panel is just
              part of the page and there is nothing to close. */}
          <button className="rr-lb-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </header>

        <div className="rr-lb-list">
          {entries.length === 0 && (
            <p style={{ color: 'var(--muted)', padding: 12, margin: 0 }}>
              Nobody has scored yet. Be the first.
            </p>
          )}
          {entries.map((e) => (
            <button
              key={e.playerId}
              className={`rr-lb-row${e.crowned ? ' crown' : ''}${e.playerId === playerId ? ' me' : ''}`}
              // Watching your own run from here would just be the game.
              disabled={e.playerId === playerId}
              onClick={() => router.push(`/play?spectate=${encodeURIComponent(e.playerId)}`)}
            >
              <span className="rr-lb-rank">{e.crowned ? '👑' : e.rank}</span>
              <span className="rr-lb-name">
                {e.name}
                <small>burrow {e.burrowLevel} · {e.lifetime} lifetime</small>
              </span>
              <span style={{ color: 'var(--carrot)' }}>{e.score}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Tap-away, phone only: a drawer with no way out but its own [x] is a trap. */}
      {open && <div className="rr-scrim" onClick={() => setOpen(false)} />}
    </>
  );
}
