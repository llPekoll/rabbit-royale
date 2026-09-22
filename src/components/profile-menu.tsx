'use client';

import { WoodlandClose as CloseButton, WoodlandSurface as NineSlicePanel } from '@/components/woodland/runtime';

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
// `dict`, not `t` and not `d`: in this file `t` is already the profile/history
// TAB in the tab row's map callback, and `d` is a history DAY in another —
// shadowing either would be a real bug.
import { useT, useLocale } from '@/i18n/provider';
import { groupDigits } from '@/i18n/format';
import { intlTag, type Locale } from '@/i18n/locales';
import type { Dict } from '@/i18n/dictionaries';
import { createPortal } from 'react-dom';

import { PanelTitle } from './pixel-text';
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

export interface RaidRow {
  id: string;
  /**
   * Where this happened: a burrow crossing, or a kill out on the island.
   *
   * Optional so a server that has not shipped the column yet reads as 'burrow',
   * which is what every row written before it was.
   */
  kind?: 'burrow' | 'shove' | 'lightning';
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
  /**
   * A guest's exit. Not `onLogout`: logging out keeps the row for a wallet
   * that can come back, and a guest's row without its cookie is a ghost — so
   * theirs is DELETED. The second press of the button calls this for a guest
   * and `onLogout` for everyone else.
   */
  onAbandon(): void;
  /**
   * Go and raid one of the players in the history, by id.
   *
   * The whole point of naming a raider is that you can answer them, and the
   * log is where a player reads the name. Optional: the panel opens on
   * screens with no board behind it (Storybook, the doorstep), and there the
   * rows simply carry no button.
   */
  onRevenge?: (defenderId: string) => void;
  /**
   * Where those players are standing, by id — pushed over the game socket
   * while this panel is open. Absent reads as `away`.
   */
  presence?: Record<string, 'away' | 'home' | 'digging'>;
  /**
   * Follow these players' presence for as long as the log is showing.
   *
   * Called with the ids in the history when the History tab opens, and with
   * nothing when the panel closes — the subscription is the server's, and it
   * should not outlive the thing looking at it.
   */
  onWatchPresence?: (ids: string[]) => void;
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
  onAbandon,
  onRevenge,
  presence,
  onWatchPresence,
}: ProfileMenuProps) {
  const dict = useT();
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

  /**
   * FOLLOW the raiders in the log, for as long as it is on screen.
   *
   * Only while the History tab is the one showing: the dots are the only
   * thing that reads this, and a subscription running behind the Profile tab
   * is a push nobody looks at. Dropped on unmount too — the panel closing is
   * the commonest way this ends.
   */
  useEffect(() => {
    if (!onWatchPresence) return;
    if (tab !== 'history' || !history) return;
    const ids = [...new Set(history.raids.against.map((r) => r.otherId))];
    onWatchPresence(ids);
    return () => onWatchPresence([]);
  }, [tab, history, onWatchPresence]);

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
        aria-label={dict.profile.title}
      >
        {/* The [x] rides the FRAME, not the header's flex row: it belongs to
            the panel's top-right corner, where a dialog's close always is, and
            a corner is not a thing the title can push around. `inline` keeps
            it in flow; dropping it lets the kit pin it (see runtime.tsx). */}
        <CloseButton className="rr-lb-close" onClick={onClose} aria-label={dict.chrome.close} />
        <header className="rr-lb-head">
          <strong><PanelTitle>{dict.profile.title}</PanelTitle></strong>
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
                <span style={{ ...pxLabel, fontSize: 14 }}>{t === 'profile' ? dict.profile.tabProfile : dict.profile.tabHistory}</span>
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
              {saving ? dict.profile.saving : dict.profile.save}
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
                    // The colour's name in this language; `a.label` is the key.
                    aria-label={dict.avatars[a.key as keyof typeof dict.avatars] ?? a.label}
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
                    {connecting ? dict.profile.waitingWallet : dict.auth.connect}
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
                    Their guest burrow is NOT destroyed by this (unlike
                    ABANDON below): it keeps its row, and this browser simply
                    stops being signed into it. */}
                {takenBy !== null && onSwitchToOwner && (
                  <PanelButton ghost onClick={onSwitchToOwner}>
                    {takenBy ? dict.profile.taken(takenBy) : dict.profile.signInWith}
                  </PanelButton>
                )}
              </PxPanel>
            ) : (
              <p className="rr-wallet-line" title={player.wallet ?? undefined}>
                {player.wallet?.slice(0, 4)}...{player.wallet?.slice(-4)}
              </p>
            )}
            {/* "Disconnect" is a wallet word, and a guest has no wallet to
                disconnect from — for them this ENDS the account: the row is
                deleted (see `onAbandon`), which is worth both naming plainly
                and asking twice about. */}
            <PanelButton
              ghost
              onClick={() => {
                if (!player.guest) return onLogout();
                if (confirmingAbandon) return onAbandon();
                setConfirmingAbandon(true);
              }}
            >
              {!player.guest
                ? dict.profile.disconnect
                : confirmingAbandon
                  ? dict.profile.abandonConfirm
                  : dict.profile.abandon}
            </PanelButton>
          </div>
        ) : (
          <HistoryTab
            history={history}
            failed={historyFailed}
            newCount={newRaids}
            presence={presence}
            onRevenge={
              onRevenge
                ? (id) => {
                    // The raid happens on the board behind this panel, so the
                    // panel gets out of the way. Closing is also the
                    // acknowledgement: the target list opens in its place.
                    onClose();
                    onRevenge(id);
                  }
                : undefined
            }
          />
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

/**
 * WHEN EACH RAIDER WAS LAST PAID BACK — the line under a struck-through row.
 *
 * A debt is settled by taking something off them: their carrots, or their
 * run. A crossing that came home empty (blocked, or nothing in the garden)
 * does not count — the whole point of the mark is that it says you GOT them,
 * and a mark you can earn by bouncing off a trap says nothing.
 *
 * Returns the time of the last such raid per player, so every attack of
 * theirs from BEFORE it reads as answered: three robberies in a week are one
 * grudge, and paying it back once settles the week. Attacks that land AFTER
 * are a new debt, which is why this compares dates rather than counting.
 */
export function avengedAt(raids: RaidRow[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const r of raids) {
    if (r.direction !== 'by') continue;
    const kind = r.kind ?? 'burrow';
    const got = kind === 'shove' || kind === 'lightning' || r.carrotsLooted > 0;
    if (!got) continue;
    const at = +new Date(r.createdAt);
    if (at > (last.get(r.otherId) ?? 0)) last.set(r.otherId, at);
  }
  return last;
}

function HistoryTab({
  history, failed, newCount = 0, presence, onRevenge,
}: {
  history: History | null;
  failed: boolean;
  newCount?: number;
  /** Where each raider is standing right now — pushed over the socket. */
  presence?: Record<string, 'away' | 'home' | 'digging'>;
  /** Go and raid them back. Absent when there is no board to do it on. */
  onRevenge?: (id: string) => void;
}) {
  const dict = useT();
  const { locale } = useLocale();
  // A history that failed to load is not a history that is empty, and neither
  // is one still in flight — saying "Loading..." forever is the worst of the
  // three, because it is the one the player waits on.
  if (failed) return <p className="rr-warn">{dict.profile.historyFailed}</p>;
  if (!history) return <p className="rr-empty">{dict.profile.loading}</p>;

  // Both directions on one timeline: a feud reads as a feud, not as two lists.
  const raids = [...history.raids.against, ...history.raids.by].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  const best = Math.max(1, ...history.days.map((d) => d.carrots));
  // The unread raids are the newest ones against this player (the API sends
  // them newest first).
  const fresh = new Set(history.raids.against.slice(0, newCount).map((r) => r.id));
  const bought = history.purchases ?? [];
  // Who has been paid back, and when. Read against each incoming row's own
  // date below, so the list settles line by line rather than by player.
  const settled = avengedAt(raids);

  return (
    <div className="rr-profile-body">
      <h3 className="rr-profile-h">Carrots dug</h3>
      {history.days.length === 0 ? (
        <p className="rr-empty">{dict.profile.noRuns}</p>
      ) : (
        <ul className="rr-days">
          {history.days.map((d) => (
            <li key={d.day}>
              <span className="rr-day">{shortDay(dict, locale, d.day)}</span>
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
        <p className="rr-empty">{dict.profile.noRaids}</p>
      ) : (
        <ul className="rr-raids">
          {raids.map((r) => {
            // Only a raid AGAINST us is a debt: our own rows are the ledger's
            // other side and have nothing to settle.
            const owed = r.direction === 'against';
            const paid = owed && +new Date(r.createdAt) < (settled.get(r.otherId) ?? 0);
            const where = presence?.[r.otherId] ?? 'away';
            return (
              <li
                key={r.id}
                className={`${owed ? 'hit' : 'mine'}${paid ? ' settled' : ''}`}
              >
                <span className="rr-raid-who">
                  {/* Struck through on the name AND the time, which together
                      are the thing being crossed off: "this player, that
                      night, answered". */}
                  <span className="rr-raid-label">{whoLine(dict, r)}</span>
                  {/* Where they are NOW — the one fact that decides whether
                      riposting tonight is a walk or a fight. Not shown on a
                      settled line: nothing is being decided there. */}
                  {owed && !paid && (
                    <i className={`rr-dot ${where}`} title={dict.raid.presence[where]} aria-hidden />
                  )}
                  {fresh.has(r.id) && <em className="rr-new-tag">NEW</em>}
                </span>
                <span className="rr-raid-what">{whatLine(dict, r)}</span>
                <span className="rr-raid-when">{ago(dict, r.createdAt)}</span>
                {/* The debt's own button, on its own row beneath. Gone once
                    the line is settled: a list of open scores is the useful
                    list, and a button on a crossed-out row invites paying a
                    debt twice. */}
                {owed && !paid && onRevenge && (
                  <PxButton
                    className="rr-revenge"
                    color={BTN}
                    textColor={CROWN}
                    // Two thirds of the panel's scale: the plank's own art
                    // sets this button's height, and at the dialog's usual
                    // 3px a row's button was as tall as the row itself.
                    pixelScale="2px"
                    onClick={() => onRevenge(r.otherId)}
                  >
                    <span style={{ ...pxLabel, fontSize: 9 }}>{dict.profile.revenge}</span>
                  </PxButton>
                )}
              </li>
            );
          })}
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
        <p className="rr-empty">{dict.profile.noPurchases}</p>
      ) : (
        <ul className="rr-raids">
          {bought.map((p) => (
            <li key={p.id} className="mine">
              <span className="rr-raid-who">
                {itemLabel(dict, p.kind)}
                {p.qty > 1 ? ` x${p.qty}` : ''}
              </span>
              <span className="rr-raid-what">{priceOf(dict, p)}</span>
              <span className="rr-raid-when">{ago(dict, p.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The shop's own names, so a receipt reads like the thing that was bought.
 *
 * Read straight off the dictionary's item table rather than copied: these were
 * a second list of the same five names, which is the shape that drifts the
 * first time one is renamed.
 */
function itemLabel(dict: Dict, kind: string): string {
  return dict.items[kind as keyof Dict['items']]?.name ?? kind;
}

/**
 * What a purchase cost, in the currency it was actually paid in.
 *
 * `cost` is stored in the smallest unit of whichever currency the row names, so
 * a USDC row is base units (6 dp) and has to come back to dollars here. Reading
 * one as the other would report a 40-cent bomb as 400 000 carrots.
 */
function priceOf(dict: Dict, p: Purchase): string {
  return p.currency === 'usdc'
    ? dict.profile.usd((p.cost / 1e6).toFixed(2))
    : dict.profile.spent(groupDigits(p.cost));
}

/**
 * "Mon 14" — the weekday is what a player actually remembers a run by.
 *
 * The locale is PASSED IN rather than left to `undefined`, which takes the
 * environment's: in a Chinese interface the row would still have come back as
 * "Mon 14" because the browser's own language had not changed.
 */
function shortDay(dict: Dict, locale: Locale, iso: string): string {
  const day = new Date(`${iso}T00:00:00`);
  const today = new Date();
  return day.toDateString() === today.toDateString()
    ? dict.profile.today
    : day.toLocaleDateString(intlTag(locale), { weekday: 'short', day: 'numeric' });
}

/** Coarse on purpose: "3d" is the answer, the exact minute never is. */
/**
 * WHO, on one line of the log.
 *
 * A burrow crossing names the other player and lets the right-hand column say
 * what it cost. An island kill has no such figure, so the verb goes here, with
 * the name: "Tim pushed you in the water" is one fact, and splitting it across
 * two columns would leave a bare name beside a bare verb.
 */
function whoLine(dict: Dict, r: RaidRow): string {
  const kind = r.kind ?? 'burrow';
  if (kind === 'burrow') {
    return r.direction === 'against' ? r.otherName : dict.profile.youHit(r.otherName);
  }
  if (r.direction === 'by') {
    return kind === 'shove'
      ? dict.profile.youShoved(r.otherName)
      : dict.profile.youStruck(r.otherName);
  }
  return r.otherName;
}

/**
 * WHAT it cost, on the right.
 *
 * An island kill takes a RUN, not carrots: `carrotsLooted` and `damage` are
 * both zero on those rows, and the crossing's usual figure would print "0 dmg"
 * — which reads as nothing having happened. Those lines say what was done
 * instead, and only a crossing shows a number.
 */
function whatLine(dict: Dict, r: RaidRow): string {
  const kind = r.kind ?? 'burrow';
  if (kind === 'shove') return dict.profile.shovedIn;
  if (kind === 'lightning') return dict.profile.struckDown;
  if (r.result === 'blocked') return 'blocked';
  if (r.carrotsLooted > 0) {
    return `${r.direction === 'against' ? '-' : '+'}${r.carrotsLooted} 🥕`;
  }
  return dict.profile.damage(r.damage);
}

function ago(dict: Dict, iso: string): string {
  const mins = Math.floor((Date.now() - +new Date(iso)) / 60_000);
  if (mins < 1) return dict.profile.now;
  if (mins < 60) return `${mins}${dict.units.m}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}${dict.units.h}`;
  return `${Math.floor(hrs / 24)}${dict.units.d}`;
}
