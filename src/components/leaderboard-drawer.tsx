'use client';

/**
 * The season board, beside the burrow.
 *
 * On a wide screen it is a column to the right of the burrow, out by default;
 * on a phone there is no room for that, so it starts away and slides over the
 * island. Same markup either way: the layout is a media query, not a second
 * implementation.
 *
 * Both widths can put it away and bring it back — a tab on the right edge
 * showing the crown and YOUR rank, and an [x] in the header. The board used to
 * be nailed open above 860px, which left no way to see the whole burrow on the
 * screens with the most of it to see.
 *
 * Each row is a button that starts spectating — the front door to sabotage
 * (phase 5), not an ornament.
 *
 * Picking a row REPORTS a target; it does not navigate. Spectating used to
 * `router.push('/play?spectate=...')`, which was wrong twice over: there is no
 * `/play` route (the game is one page and two Pixi scenes, so every crossing is
 * a wipe rather than a navigation) so it 404'd, and the id it put in the query
 * string was `sol:<address>` — a live wallet in the address bar, in history, in
 * the referrer of every later request, and in any screenshot of the run.
 *
 * Handing the id upward keeps both problems from existing: the page swaps
 * scenes the way it already does for the island, and the wallet never leaves
 * the tab.
 */
import { useEffect, useRef, useState } from 'react';
import { HubIconButton } from './hub-icon-button';

/** The width below which the board is a slide-over rather than a column. */
const WIDE = '(min-width: 860px)';

export interface Entry {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  lifetime: number;
  burrowLevel: number;
  crowned: boolean;
  /** Out on an island right now — the only column that is live. */
  digging?: boolean;
}

export interface LeaderboardDrawerProps {
  token: string | null;
  playerId?: string;
  /**
   * Watch this player's run. Called with the target's id; the page decides what
   * that means (cross to the island, join as a viewer). Optional: the board is
   * also shown while a run is not startable, and a row that cannot be acted on
   * is simply inert rather than absent.
   */
  onSpectate?: (targetId: string) => void;
  /**
   * Reports the viewer's own standing upward as it is fetched.
   *
   * The carrot pill shows the rank and the gap to the place above, and this
   * drawer is already polling the board that carries both. A second fetch from
   * the page would ask the same endpoint twice on the same timer — so the one
   * request that already happens hands its answer up instead.
   */
  onMe?: (me: Me | null) => void;
}

/** The viewer's own standing, as `/api/leaderboard` reports it. */
export interface Me {
  rank: number | null;
  score: number;
  /** Season score needed to pass the player one place ahead; null when none. */
  toPass: number | null;
}

export function LeaderboardDrawer({ token, playerId, onSpectate, onMe }: LeaderboardDrawerProps) {
  // One piece of state for both layouts. It only differs in where it STARTS:
  // on a wide screen the board is furniture and begins out, on a phone it
  // covers the island and begins away. Either way the handle and the [x] move
  // it, so the column can now be put away on a desktop too.
  //
  // `false` on the first render everywhere, because the server has no viewport
  // and a `matchMedia` read during render would make the markup disagree with
  // the HTML it hydrates into. The wide default is applied in an effect, one
  // frame later; the board slides in instead of appearing, which is the same
  // motion it makes when opened by hand.
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [season, setSeason] = useState<{ endsAt: string } | null>(null);

  /* CLOSED ON EVERY WIDTH, and it used to open itself on a wide one.
     The board is a third of the screen; opening it unasked meant a desktop
     player arrived at their burrow with the island already crowded, and had to
     put away a panel they never opened. The trophy button in the corner is the
     way in — see `HubIconButton` — and it carries a badge so the board is worth
     a tap without having to be showing. */

  /* `onMe` through a ref, not through the effect's deps.
     The poll is keyed on `[token]` so it is set up once; putting a callback in
     the deps would tear the interval down and rebuild it on every parent
     render (the page passes an inline arrow), and leaving it out of the deps
     would freeze the first render's closure. A ref is neither. */
  const onMeRef = useRef(onMe);
  onMeRef.current = onMe;

  useEffect(() => {
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    let alive = true;

    const load = () => {
      fetch('/api/leaderboard?limit=50', { headers })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setEntries(d.entries ?? []);
          setMe(d.me ?? null);
          onMeRef.current?.(d.me ?? null);
          setSeason(d.season ?? null);
        })
        .catch(() => {});
    };

    load();
    // Scores barely move, but WHO IS DIGGING changes by the minute — and a
    // "watch" button pointing at someone who logged off ten minutes ago is
    // worse than no button. Fetched rather than pushed: the board is open for
    // seconds at a time on a phone, and a socket for it would cost more than
    // the poll it replaces.
    const id = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  const daysLeft = season
    ? Math.max(0, Math.ceil((new Date(season.endsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <>
      {/* The way in: a square slab in the top-right corner beside the other
          chrome, as the mock draws it. It replaces `.rr-lb-tab`, a half-pill
          welded to the middle of the right edge — the one control on the
          screen shaped like nothing else.

          The badge is the player's own RANK, which is what makes a closed
          board worth a glance: "#5" says where you stand without opening
          anything, and the pill under the carrot count says what it would take
          to move. */}
      <span className="rr-lb-launch">
        <HubIconButton
          label={open ? 'Hide the season board' : 'Show the season board'}
          pressed={open}
          count={me?.rank ?? 0}
          onClick={() => setOpen((v) => !v)}
        >
          🏆
        </HubIconButton>
      </span>

      <aside id="rr-leaderboard" className={`rr-lb${open ? ' open' : ''}`}>
        <header className="rr-lb-head">
          <strong>👑 Season</strong>
          {daysLeft !== null && <span style={{ color: 'var(--muted)' }}>{daysLeft}d</span>}
          {/* Every screen can put the board away now — on a phone it is covering
              the island, on a desktop it is eating a third of the burrow. */}
          <button className="rr-lb-close" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
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
              className={
                `rr-lb-row${e.crowned ? ' crown' : ''}`
                + `${e.playerId === playerId ? ' me' : ''}`
                + `${e.digging ? ' digging' : ''}`
              }
              // Watching your own run from here would just be the game, and
              // there is nothing to watch on someone who is not on an island —
              // a spectate that lands on an empty board is the server's
              // `not_playing` error dressed up as a feature.
              disabled={e.playerId === playerId || !onSpectate || !e.digging}
              title={e.digging ? `Watch ${e.name} dig` : `${e.name} is not out right now`}
              onClick={() => {
                onSpectate?.(e.playerId);
                // On a phone the board is covering the island, so leaving it up
                // would hide the run it just opened. On a wide screen it sits
                // beside the island rather than over it, and closing it there
                // would throw away a column the player put out on purpose.
                if (!window.matchMedia?.(WIDE).matches) setOpen(false);
              }}
            >
              <span className="rr-lb-rank">{e.crowned ? '👑' : e.rank}</span>
              <span className="rr-lb-name">
                {e.name}
                {/* The live dot rides the NAME, not the rank column: it is a
                    fact about the player, and the rank column is a fixed-width
                    slot that a second glyph would blow out. */}
                {e.digging && <i className="rr-live" aria-hidden />}
                {/* The separator stays an ENTITY, as it was before: a raw
                    middot in a template literal is not decoded by anything and
                    the bitmap atlas (ASCII 32-126) cannot draw it — it ships as
                    a blank. So the two halves are JSX, not one string. */}
                {/* The sub-line is now ONLY for a live run.
                    It used to carry "burrow 4 · 7313 lifetime" on every row —
                    two facts about a stranger that change nothing the reader
                    can act on, doubling the height of a twelve-row list. The
                    mock's rows are one line each: a rank, a name, a score.
                    What survives is the one line worth a tap, because it is an
                    invitation rather than a description. */}
                {e.digging && <small>digging now &middot; tap to watch</small>}
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
