'use client';

/**
 * The player's own panel, behind the wallet chip.
 *
 * The chip used to sign you out on click, which is the one thing a player
 * almost never wants from it and cannot undo without their wallet. Now it opens
 * the place where everything ABOUT you lives: your face, your name, what you
 * have been digging, and who has been robbing you.
 *
 * Two tabs, because the panel answers two different questions. "Profile" is
 * what you change; "History" is what happened to you — including the raids that
 * landed while you were away, which is the only way a player ever learns who
 * emptied their burrow overnight.
 *
 * Slides from the right and shares the season board's chrome (.rr-lb): this is
 * the second drawer in the game, and a second drawer that behaved differently
 * would just be a bug the player has to learn.
 */
import { useCallback, useEffect, useState } from 'react';
import { AVATARS, avatarSrc, AVATAR_FRAME } from '@/lib/game/avatars';
import { nameProblem, nameProblemMessage, NAME_MAX } from '@/lib/game/player-name';

type Tab = 'profile' | 'history';

interface Day {
  day: string;
  carrots: number;
  runs: number;
  tilesDug: number;
}

interface RaidRow {
  id: string;
  result: 'damaged' | 'looted' | 'blocked';
  damage: number;
  carrotsLooted: number;
  createdAt: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  direction: 'against' | 'by';
}

interface History {
  days: Day[];
  raids: { against: RaidRow[]; by: RaidRow[]; unseen: number };
}

export interface ProfileMenuProps {
  token: string;
  player: { id: string; name: string; wallet: string };
  /** Avatar as the server currently has it — null until the player picks one. */
  avatar?: string | null;
  /** Told the new name/avatar so the chip outside updates without a reload. */
  onUpdated(patch: { name?: string; avatar?: string; token?: string }): void;
  onClose(): void;
  onLogout(): void;
}

export function ProfileMenu({
  token,
  player,
  avatar,
  onUpdated,
  onClose,
  onLogout,
}: ProfileMenuProps) {
  const [tab, setTab] = useState<Tab>('profile');
  const [name, setName] = useState(player.name);
  const [picked, setPicked] = useState<string | null>(avatar ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);

  const auth = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    let alive = true;
    setHistoryFailed(false);
    fetch('/api/player/history', { headers: auth })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setHistory(d))
      .catch(() => alive && setHistoryFailed(true));
    return () => {
      alive = false;
    };
    // The token is the only thing that changes who this is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Opening the history is what marks the raids read — fetching the profile
  // must not clear a badge the player never looked at.
  useEffect(() => {
    if (tab !== 'history' || !history?.raids.unseen) return;
    fetch('/api/player/history', { method: 'POST', headers: auth }).catch(() => {});
    setHistory((h) => (h ? { ...h, raids: { ...h.raids, unseen: 0 } } : h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, history?.raids.unseen]);

  const save = useCallback(
    async (patch: { name?: string; avatar?: string }) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/api/player', {
          method: 'PATCH',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'save_failed');
        onUpdated({ ...patch, token: body.token });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'save_failed');
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, onUpdated],
  );

  const problem = nameProblem(name);
  const renamed = name.trim() !== player.name;

  return (
    <>
      <aside className="rr-lb rr-profile open" id="rr-profile">
        <header className="rr-lb-head">
          <strong>Your burrow</strong>
          <button className="rr-lb-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="rr-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'profile'}
            className={tab === 'profile' ? 'on' : ''}
            onClick={() => setTab('profile')}
          >
            Profile
          </button>
          <button
            role="tab"
            aria-selected={tab === 'history'}
            className={tab === 'history' ? 'on' : ''}
            onClick={() => setTab('history')}
          >
            History
            {!!history?.raids.unseen && <em className="rr-badge">{history.raids.unseen}</em>}
          </button>
        </div>

        {tab === 'profile' ? (
          <div className="rr-profile-body">
            <Avatar src={avatarSrc(picked ?? avatar)} size={4} />

            <label className="rr-field">
              <span>Name</span>
              <input
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
              />
            </label>
            {/* Only complain once they have typed something wrong, not while
                they are still on the way to something right. */}
            {renamed && problem && <p className="rr-warn">{nameProblemMessage(problem)}</p>}
            <button
              className="rr-btn"
              disabled={saving || !renamed || !!problem}
              onClick={() => save({ name: name.trim() })}
            >
              {saving ? 'Saving...' : 'Save name'}
            </button>

            <h3 className="rr-profile-h">Rabbit</h3>
            <div className="rr-avatar-grid">
              {AVATARS.map((a) => (
                <button
                  key={a.key}
                  className={`rr-avatar-pick${(picked ?? avatar) === a.key ? ' on' : ''}`}
                  aria-label={a.label}
                  aria-pressed={(picked ?? avatar) === a.key}
                  disabled={saving}
                  onClick={() => {
                    setPicked(a.key);
                    save({ avatar: a.key });
                  }}
                >
                  <Avatar src={a.src} size={2} />
                </button>
              ))}
            </div>
            {/* The minted NFTs land here later — the column already stores a
                plain key, so they are a second kind of value, not a migration. */}

            {error && <p className="rr-warn">{error}</p>}

            <p className="rr-wallet-line" title={player.wallet}>
              {player.wallet.slice(0, 4)}...{player.wallet.slice(-4)}
            </p>
            <button className="rr-btn ghost" onClick={onLogout}>
              Disconnect
            </button>
          </div>
        ) : (
          <HistoryTab history={history} failed={historyFailed} />
        )}
      </aside>
      <div className="rr-scrim" onClick={onClose} />
    </>
  );
}

/**
 * One frame of a bunny sheet, cropped to the first idle pose.
 *
 * The sheet is 8 frames wide at 32px, so showing frame 0 is a background sized
 * to the whole sheet with the window pinned top-left — no second asset, and no
 * canvas.
 *
 * The rabbit only occupies the BOTTOM of its cell (it stands on the tile's
 * floor, which is what the game wants and a portrait does not), so the window
 * is both shortened to the rabbit's own height and slid down onto it. Cropping
 * to the art rather than to the grid is what stops the avatar sitting in a
 * pocket of empty space.
 */
/**
 * Where the rabbit actually is inside frame 0, measured from the sheets (all
 * five are identical): x 8..22, y 18..32. Cropping to the ART rather than to
 * the 32px cell is what stops the avatar floating in a pocket of empty space.
 */
const ART = { x: 8, y: 18, w: 14, h: 14 };

function Avatar({ src, size }: { src: string; size: number }) {
  return (
    <span
      className="rr-avatar"
      style={{
        width: ART.w * size,
        height: ART.h * size,
        backgroundImage: `url('${src}')`,
        // The sheet is 8 frames wide and 8 tall, so it scales as a whole and
        // the window is slid onto the one frame we want.
        backgroundSize: `${AVATAR_FRAME * 8 * size}px auto`,
        backgroundPosition: `${-ART.x * size}px ${-ART.y * size}px`,
      }}
      aria-hidden
    />
  );
}

function HistoryTab({ history, failed }: { history: History | null; failed: boolean }) {
  // A history that failed to load is not a history that is empty, and neither
  // is one still in flight — saying "Loading..." forever is the worst of the
  // three, because it is the one the player waits on.
  if (failed) return <p className="rr-warn">Could not load your history.</p>;
  if (!history) return <p className="rr-empty">Loading...</p>;

  // Both directions on one timeline: a feud reads as a feud, not as two lists.
  const raids = [...history.raids.against, ...history.raids.by].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  const best = Math.max(1, ...history.days.map((d) => d.carrots));

  return (
    <div className="rr-profile-body">
      <h3 className="rr-profile-h">Carrots dug</h3>
      {history.days.length === 0 ? (
        <p className="rr-empty">No finished runs yet.</p>
      ) : (
        <ul className="rr-days">
          {history.days.map((d) => (
            <li key={d.day}>
              <span className="rr-day">{shortDay(d.day)}</span>
              {/* The bar is the comparison; the number is the fact. Scaled to
                  the player's own best day, because a fixed ceiling would make
                  every day look like nothing early on. */}
              <span className="rr-day-bar">
                <i style={{ width: `${(d.carrots / best) * 100}%` }} />
              </span>
              <span className="rr-day-n">{d.carrots}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="rr-profile-h">Raids</h3>
      {raids.length === 0 ? (
        <p className="rr-empty">Nobody has crossed your burrow yet.</p>
      ) : (
        <ul className="rr-raids">
          {raids.map((r) => (
            <li key={r.id} className={r.direction === 'against' ? 'hit' : 'mine'}>
              <span className="rr-raid-who">
                {r.direction === 'against' ? r.otherName : `You hit ${r.otherName}`}
              </span>
              <span className="rr-raid-what">
                {r.result === 'blocked'
                  ? 'blocked'
                  : r.carrotsLooted > 0
                    ? `${r.direction === 'against' ? '-' : '+'}${r.carrotsLooted} 🥕`
                    : `${r.damage} dmg`}
              </span>
              <span className="rr-raid-when">{ago(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Mon 14" — the weekday is what a player actually remembers a run by. */
function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday
    ? 'Today'
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/** Coarse on purpose: "3d" is the answer, the exact minute never is. */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - +new Date(iso)) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
