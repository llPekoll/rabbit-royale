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
 * A centred modal over a dimmed board. It used to slide in from the right,
 * onto the same rail as the season board — two panels on one edge, where the
 * one about YOU read as a variant of the one about everybody else. Nothing on
 * screen matters while you are editing your own burrow, so this takes the
 * middle and dims the rest. It still borrows the board's surface (.rr-lb) so
 * the two feel like the same game.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton, NineSlicePanel, PanelTitle } from '@domin8/arcade-kit';
import { PxButton, PxPanel, pxLabel } from './px';
import { AVATARS, avatarSrc, AVATAR_FRAME } from '@/lib/game/avatars';
import { nameProblem, nameProblemMessage, NAME_MAX } from '@/lib/game/player-name';

type Tab = 'profile' | 'history';

/* ── The panel's colours, as they were ─────────────────────────────────────
   Now worn by the codex's pixel frame and bevelled buttons (see px.tsx). */
/** The season board's surface, which this panel borrows (`.rr-lb`). */
const PANEL = '#161b1f';
/** A plain button's face (`--panel`) and ink (`--text`). */
const BTN = '#161b22';
const INK = '#e6edf3';
const MUTED = '#8b949e';
const CROWN = '#ffd45c';
/** The selected tab: the board's zebra lift, so "on" is a lit board, not a new colour. */
const LIFT = '#22272b';
/** The chosen rabbit: the crown's 12% wash it always had. */
const PICKED = '#323129';
/** The name field's well. */
const WELL = '#0b0f14';
/** The guest note: 3% white over the panel. */
const NOTE = '#1c2125';

const btnText: CSSProperties = { ...pxLabel, fontSize: 13, whiteSpace: 'normal', lineHeight: 1.2 };

/** A full-width panel button: plain (bright ink) or ghost (the panel's own face, muted ink). */
function PanelButton({
  ghost = false, children, ...rest
}: { ghost?: boolean; children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <PxButton
      className={ghost ? 'rr-btn ghost' : 'rr-btn'}
      color={ghost ? PANEL : BTN}
      textColor={ghost ? MUTED : INK}
      style={{ width: '100%', flexShrink: 0 }}
      {...rest}
    >
      <span style={btnText}>{children}</span>
    </PxButton>
  );
}

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

interface Purchase {
  id: string;
  kind: 'trap' | 'bomb' | 'lightning' | 'shield' | 'energy';
  qty: number;
  currency: 'carrots' | 'usdc';
  /** Whole carrots, or USDC base units (6 dp) — whichever `currency` names. */
  cost: number;
  createdAt: string;
}

interface History {
  days: Day[];
  purchases: Purchase[];
  raids: { against: RaidRow[]; by: RaidRow[]; unseen: number };
}

export interface ProfileMenuProps {
  token: string;
  player: { id: string; name: string; wallet: string | null; guest: boolean };
  /** Take this player's guest account onto a real wallet. Null hides the offer
   *  (they already have one). Resolves true when the wallet was attached. */
  onConnectWallet?: (() => Promise<boolean>) | null;
  /** True while the wallet prompt is open, so the offer can say so. */
  connecting?: boolean;
  /**
   * Why the last attempt failed, straight from the session hook.
   *
   * A refused link used to leave this panel EXACTLY as it was — no wallet
   * found, wallet already taken, prompt dismissed, all of it looked identical
   * to not having pressed the button. The player's only reading of that is
   * "connecting is broken", so the reason has to land here, next to the button
   * that caused it.
   */
  connectError?: string | null;
  /**
   * The burrow that already holds the wallet they just tried to link, when
   * that is why the last attempt failed. Non-null turns the dead end into an
   * offer to sign into that burrow instead; an empty string is the same
   * refusal with no name to show.
   */
  takenBy?: string | null;
  /** Sign into the burrow that owns the wallet, abandoning this guest one. */
  onSwitchToOwner?: (() => void) | null;
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
  onConnectWallet,
  connecting = false,
  connectError = null,
  takenBy = null,
  onSwitchToOwner = null,
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
  /**
   * How many raids were UNREAD when the history loaded. Opening the tab marks
   * them read (and zeroes `history.raids.unseen`), so the count is kept here
   * to mark those rows NEW — the chip's red badge promised news, and the list
   * it opens onto has to say which rows it meant.
   */
  const [newRaids, setNewRaids] = useState(0);
  /**
   * Armed when a guest has pressed "abandon" once.
   *
   * A wallet player who disconnects can sign back in; a guest cannot — the
   * token in this browser IS the account, and dropping it strands the row for
   * good. So their exit takes two presses, and the second one says what it
   * does. No such gate for a wallet player: making the reversible action feel
   * dangerous is how a warning stops being read.
   */
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  /**
   * False for exactly one frame, so the open animation has a "from" to come
   * from. Mounting straight into `.open` means the browser only ever sees the
   * end state and the panel simply appears — the grow-in is the thing that
   * tells the player this box came from the chip they just pressed.
   */
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const auth = { Authorization: `Bearer ${token}` };

  // Escape closes it. Expected of anything modal, and it is the exit a
  // keyboard player reaches for before looking for an [x].
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setHistoryFailed(false);
    fetch('/api/player/history', { headers: auth })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        setHistory(d);
        setNewRaids(d?.raids?.unseen ?? 0);
      })
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

  // Portalled to <body>. The chip that opens this lives inside `.rr-topbar`,
  // which is positioned and so forms a stacking context — a modal rendered
  // there can never rise above the season board, whatever its z-index, and it
  // opened invisibly behind it. A dialog belongs at the top of the document,
  // not wherever its trigger happens to sit.
  return createPortal(
    <>
      {/* Tap-away. A dialog whose only exit is its own [x] is a trap, and the
          dimmed board behind this one is exactly what a player clicks to get
          back to — so clicking it has to work. */}
      <div className="rr-profile-scrim" onClick={onClose} aria-hidden />

      {/* The codex's frame, in the board's surface colour. Fixed and centred
          by `.rr-profile`, so the frame's own `position: relative` is
          overridden here. Same fixed height on both tabs (see globals.css). */}
      <NineSlicePanel
        color={PANEL}
        pixelScale="var(--rr-dlg-px, 3px)"
        className={`rr-lb rr-profile rr-px-dialog${shown ? ' open' : ''}`}
        style={{ position: 'fixed' }}
        id="rr-profile"
        role="dialog"
        aria-modal="true"
        aria-label="Your burrow"
      >
        <header className="rr-lb-head">
          <strong><PanelTitle>YOUR BURROW</PanelTitle></strong>
          <CloseButton inline className="rr-lb-close" onClick={onClose} aria-label="Close" style={{ minWidth: 44 }} />
        </header>

        {/* Two pixel buttons; the open tab is pressed INTO the board (the kit's
            sunken state) on the lifted face, in the crown ink it always wore. */}
        <div className="rr-tabs" role="tablist">
          {(['profile', 'history'] as const).map((t) => {
            const on = tab === t;
            return (
              <PxButton
                key={t}
                role="tab"
                aria-selected={on}
                className={on ? 'on nine-btn--pressed' : ''}
                color={on ? LIFT : PANEL}
                textColor={on ? CROWN : MUTED}
                onClick={() => setTab(t)}
              >
                <span style={{ ...pxLabel, fontSize: 14 }}>{t === 'profile' ? 'Profile' : 'History'}</span>
                {t === 'history' && !!history?.raids.unseen && <em className="rr-badge">{history.raids.unseen}</em>}
              </PxButton>
            );
          })}
        </div>

        {tab === 'profile' ? (
          <div className="rr-profile-body">
            <Avatar src={avatarSrc(picked ?? avatar)} size={4} />

            <label className="rr-field">
              <span>Name</span>
              {/* The field is a well: a nested panel in the dark it always was. */}
              <PxPanel color={WELL} className="rr-field-box">
                <input
                  value={name}
                  maxLength={NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  spellCheck={false}
                />
              </PxPanel>
            </label>
            {/* Only complain once they have typed something wrong, not while
                they are still on the way to something right. */}
            {renamed && problem && <p className="rr-warn">{nameProblemMessage(problem)}</p>}
            <PanelButton
              disabled={saving || !renamed || !!problem}
              onClick={() => save({ name: name.trim() })}
            >
              {saving ? 'Saving...' : 'Save name'}
            </PanelButton>

            <h3 className="rr-profile-h">Rabbit</h3>
            <div className="rr-avatar-grid">
              {AVATARS.map((a) => {
                const on = (picked ?? avatar) === a.key;
                return (
                  <PxButton
                    key={a.key}
                    className={`rr-avatar-pick${on ? ' on nine-btn--pressed' : ''}`}
                    color={on ? PICKED : BTN}
                    textColor={CROWN}
                    // Picking your rabbit is a small celebration, not a setting.
                    wiggle
                    aria-label={a.label}
                    aria-pressed={on}
                    disabled={saving}
                    style={avatarCell}
                    onClick={() => {
                      setPicked(a.key);
                      save({ avatar: a.key });
                    }}
                  >
                    <Avatar src={a.src} size={2} />
                  </PxButton>
                );
              })}
            </div>
            {/* The minted NFTs land here later — the column already stores a
                plain key, so they are a second kind of value, not a migration. */}

            {error && <p className="rr-warn">{error}</p>}

            {/* A guest is told the truth rather than shown a blank address:
                their burrow is real and it is also only in this browser, and
                the second half is the part they can do something about. The
                offer is right here, beside the name and the face, because this
                panel is already where a player comes to make their account
                theirs. */}
            {player.guest ? (
              <PxPanel color={NOTE} className="rr-guest-note">
                <p>
                  Guest burrow. It lives in this browser only: connect a wallet
                  to keep it, play on any device, and unlock the shop.
                </p>
                {onConnectWallet && (
                  <PanelButton
                    disabled={connecting}
                    onClick={() => {
                      void onConnectWallet();
                    }}
                  >
                    {connecting ? 'Waiting for wallet...' : 'Connect wallet'}
                  </PanelButton>
                )}
                {/* The refusal, where the press happened. Silence here reads as
                    a dead button, which is the one thing it must never do. */}
                {connectError && <p className="rr-warn">{connectError}</p>}
                {/* A refused link used to end here, on advice ("disconnect and
                    sign in with it") that the player had to carry out by hand
                    — so the honest thing to do was also the tedious thing, and
                    pressing Connect again was easier and could only fail. The
                    burrow they were sent to find is one press away instead.
                    Their guest burrow is NOT destroyed by this: it keeps its
                    row, and this browser simply stops being signed into it. */}
                {takenBy !== null && onSwitchToOwner && (
                  <PanelButton ghost onClick={onSwitchToOwner}>
                    {takenBy ? `Play as "${takenBy}"` : 'Sign in with that wallet'}
                  </PanelButton>
                )}
              </PxPanel>
            ) : (
              <p className="rr-wallet-line" title={player.wallet ?? undefined}>
                {player.wallet?.slice(0, 4)}...{player.wallet?.slice(-4)}
              </p>
            )}
            {/* "Disconnect" is a wallet word, and a guest has no wallet to
                disconnect from — for them this ENDS the account, which is worth
                both naming plainly and asking twice about. */}
            <PanelButton
              ghost
              onClick={() => {
                if (!player.guest) return onLogout();
                if (confirmingAbandon) return onLogout();
                setConfirmingAbandon(true);
              }}
            >
              {!player.guest
                ? 'Disconnect'
                : confirmingAbandon
                  ? 'Really abandon? This cannot be undone'
                  : 'Abandon this burrow'}
            </PanelButton>
          </div>
        ) : (
          <HistoryTab history={history} failed={historyFailed} newCount={newRaids} />
        )}
      </NineSlicePanel>
    </>,
    document.body,
  );
}

/** A rabbit's cell: square, sized by the grid rather than by the kit's unit height. */
const avatarCell: CSSProperties = {
  width: '100%',
  height: 'auto',
  aspectRatio: '1',
  minWidth: 0,
  minHeight: 0,
  padding: 0,
};

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

function HistoryTab({ history, failed, newCount = 0 }: { history: History | null; failed: boolean; newCount?: number }) {
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
  // The unread raids are the newest ones against this player (the API sends
  // them newest first).
  const fresh = new Set(history.raids.against.slice(0, newCount).map((r) => r.id));
  const bought = history.purchases ?? [];

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
                {fresh.has(r.id) && <em className="rr-new-tag">NEW</em>}
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

      {/* Where the carrots WENT. Digging is only half the ledger, and a player
          who spent thousands on traps had nothing to show for it but a smaller
          number. Reuses the raid list's chrome: both answer "what happened to
          my carrots", and a second list styled differently would read as a
          different KIND of thing. */}
      <h3 className="rr-profile-h">Bought</h3>
      {/* Defended against an older API: a client can outlive a deploy that has
          not shipped `purchases` yet, and an empty section is a better answer
          than a crashed panel. */}
      {bought.length === 0 ? (
        <p className="rr-empty">Nothing from the shed yet.</p>
      ) : (
        <ul className="rr-raids">
          {bought.map((p) => (
            <li key={p.id} className="mine">
              <span className="rr-raid-who">
                {ITEM_LABEL[p.kind] ?? p.kind}
                {p.qty > 1 ? ` x${p.qty}` : ''}
              </span>
              <span className="rr-raid-what">{priceOf(p)}</span>
              <span className="rr-raid-when">{ago(p.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The shop's own names, so a receipt reads like the thing that was bought. */
const ITEM_LABEL: Record<string, string> = {
  trap: 'Trap',
  bomb: 'Bomb',
  lightning: 'Lightning',
  shield: 'Shield',
  energy: 'Energy',
};

/**
 * What a purchase cost, in the currency it was actually paid in.
 *
 * `cost` is stored in the smallest unit of whichever currency the row names, so
 * a USDC row is base units (6 dp) and has to come back to dollars here. Reading
 * one as the other would report a 40-cent bomb as 400 000 carrots.
 */
function priceOf(p: Purchase): string {
  return p.currency === 'usdc'
    ? `$${(p.cost / 1e6).toFixed(2)}`
    : `-${p.cost.toLocaleString()} 🥕`;
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
