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
import { useT } from '@/i18n/provider';
import { GOLD_CUP_URL } from '@domin8/arcade-kit';
import { PixelTitle } from './pixel-text';
import { HubIconButton, hubIconArt } from './hub-icon-button';
import { PX, PxPanel } from './px';
import { LeafFrame } from './leaf-frame';
import { PodiumRabbit } from './podium-rabbit';
import { FACE_COL, LEAD_SIZE, PODIUM, PODIUM_MIN_PANEL, PODIUM_SIZE, crownBox } from '@/lib/game/podium';

/** The board's surface (`.rr-lb`), now filling the codex's pixel frame. */
const BOARD = '#161b1f';
/** Your own row's warm cast (`.rr-lb-row.me`), now a nested panel of its own. */
const ME = '#2e2e24';

/** The width below which the board is a slide-over rather than a column. */
const WIDE = '(min-width: 860px)';

export interface Entry {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  lifetime: number;
  burrowLevel: number;
  /** Which rabbit they wear, or null for a player who never picked one. */
  avatar?: string | null;
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
  /**
   * The board was opened by hand. The quest "Look up" (config/quests.ts) is
   * done the first time this fires — the one fact about the board the server
   * cannot see for itself.
   */
  onOpen?: () => void;
}

/** The viewer's own standing, as `/api/leaderboard` reports it. */
export interface Me {
  rank: number | null;
  score: number;
  /** Season score needed to pass the player one place ahead; null when none. */
  toPass: number | null;
}

export function LeaderboardDrawer({ token, playerId, onSpectate, onMe, onOpen }: LeaderboardDrawerProps) {
  const t = useT();
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
     The poll is keyed on `[token, open]`, so it rebuilds only on those two;
     putting a callback in the deps would tear the interval down and rebuild it
     on every parent render (the page passes an inline arrow), and leaving it
     out of the deps would freeze the first render's closure. A ref is neither. */
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
    /**
     * TWO CADENCES, because the closed board and the open one need different
     * things.
     *
     * Scores barely move, but WHO IS DIGGING changes by the minute — and a
     * "watch" button pointing at someone who logged off ten minutes ago is
     * worse than no button. That freshness is only worth paying for while the
     * list is on screen, so the 20s beat is scoped to `open`.
     *
     * Shut, the board still owes three things their number: the trophy's rank
     * badge, the carrot pill's rank and gap (`onMe`), and the crown over the
     * home rabbit. None of them is urgent — a rank is hours of digging away
     * from changing — so they ride a slow beat instead of the board's.
     *
     * Fetched rather than pushed: the board is open for seconds at a time on a
     * phone, and a socket for it would cost more than the poll it replaces.
     *
     * Skipped on a hidden tab either way. Without this, a forgotten tab kept
     * asking all night for a board nobody was looking at — the browser throttles
     * a background timer, it does not stop it.
     */
    const every = open ? 20_000 : 5 * 60_000;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, every);
    return () => { alive = false; clearInterval(id); };
  }, [token, open]);

  const daysLeft = season
    ? Math.max(0, Math.ceil((new Date(season.endsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  /**
   * Whether the viewer's rank changed on the last poll — their row flashes
   * once. Compared against the previous poll, not against page load, so a
   * board opened for the first time does not flash a rank that did not move.
   */
  /**
   * Whether the list is wide enough to carry the podium's faces.
   *
   * Measured rather than assumed from the viewport: the board is a column on a
   * desktop and a slide-over on a phone, and it is the LIST's width that
   * decides whether a face fits beside a name and a score — see
   * `PODIUM_MIN_PANEL`.
   */
  const listRef = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(true);
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setRoomy(entry.contentRect.width >= PODIUM_MIN_PANEL);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lastRank = useRef<number | null | undefined>(undefined);
  const [rankMoved, setRankMoved] = useState(false);
  useEffect(() => {
    const now = me?.rank ?? null;
    if (lastRank.current !== undefined && lastRank.current !== now) {
      setRankMoved(true);
      const t = setTimeout(() => setRankMoved(false), 1000);
      lastRank.current = now;
      return () => clearTimeout(t);
    }
    lastRank.current = now;
  }, [me?.rank]);

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
          label={open ? t.board.hide : t.board.show}
          pressed={open}
          // A standing, not news: "#59" in the quiet chip. It was a bare red
          // "59", which read as fifty-nine unread things on the board.
          badge={me?.rank ? `#${me.rank}` : null}
          onClick={() => {
            if (!open) onOpen?.();
            setOpen((v) => !v);
          }}
        >
          {/* The kit's gold cup, in the same pixel as the rest of the chrome. */}
          <img src={GOLD_CUP_URL} alt="" draggable={false} style={hubIconArt} />
        </HubIconButton>
      </span>

      {/* `inert` while it is away, which is the whole difference between a
          drawer that is closed and one that is merely PARKED.

          It is put away with `transform: translateX(100%)` — off the right edge
          but still laid out, still focusable and still read out. So tabbing
          away from the burrow walked into a board nobody could see: the header's
          [x], then fifty rows, all announced at coordinates past the end of the
          screen. Screen-reader users got the whole season board read to them on
          a screen that was not showing it, and a keyboard player lost their
          focus off-stage with no visible ring to find it by.

          `inert` takes the subtree out of the tab order, out of the
          accessibility tree and out of hit testing in one attribute, so the
          slide-in animation is kept (which `display: none` would have cost) and
          the panel stops existing for everyone else while it is away. The CSS
          hides it from the picture with `visibility` on the same condition. */}
      {/* The codex's frame in the board's own colour. `position: fixed` passed
          through because the frame sets `relative` inline. */}
      {/* THE BOARD WEARS THE LEAF FRAME, at a SMALL CORNER — and the number is
          the whole lesson of this panel.

          It measures 333x700, which "fits" the art's full 90px corners by the
          floor in leaf-frame.tsx. It fits them and is ruined by them: a 90px
          corner costs 90px of border on EACH side, leaving 153px of the 333 to
          hold a rank, a face, a name and a score. Every name was clipped
          mid-word and the [x] landed on the title.

          So the floor is necessary and not sufficient: a frame must also leave
          the CONTENT its room. 34px corners leave 265px, against the 329 the
          drawer had bare — the leaves are small here, but the board is still
          a board. A wide panel like the shop can afford 90; a narrow column
          cannot, and that is a property of the column, not of the art. */}
      <LeafFrame
        corner={34}
        id="rr-leaderboard"
        className={`rr-lb rr-px-dialog${open ? ' open' : ''}`}
        style={{ position: 'fixed' }}
        inert={!open}
      >
        <header className="rr-lb-head">
          {/* SCALE 2, not `PanelTitle`'s 2.5. The board is ~234px wide and it
              still holds the crown, the title and the countdown; at 2.5 the
              atlas draws SEASON 120px wide and they crowd. It is worth knowing
              that the title CANNOT be squeezed by padding if it ever does: the
              atlas lays out fixed-width letter spans in a box that does not
              size to them, so the flex row measures 59px while 120 are drawn,
              and the overflow lands on whatever is beside it. Scale is the
              only honest lever. */}
          <strong className="rr-lb-title">
            <span aria-hidden>👑</span>
            <PixelTitle scale={2}>{t.chrome.season}</PixelTitle>
          </strong>
          {daysLeft !== null && <span style={{ color: 'var(--muted)' }}>{daysLeft}d</span>}
          {/* NO [x] HERE. The trophy that opens the board closes it — it stays
              on screen and lit while the panel is up, and its own click
              toggles. A [x] in this corner was a second control for the one
              action, sitting on the header it shared with the title and the
              countdown on a 234px panel. */}
        </header>

        <div className="rr-lb-list" ref={listRef}>
          {/* The empty note is the list's only content, so it takes the list's
              own inset rather than a literal of its own. */}
          {entries.length === 0 && (
            <p style={{ color: 'var(--muted)', padding: 'var(--rr-pad)', margin: 0 }}>
              Nobody has scored yet. Be the first.
            </p>
          )}
          {entries.map((e) => {
            // The head of the list is DRAWN, the tail stays text. A face on
            // every row would be a face on no row — and fifty cropped sheets
            // in a scrolling column is a cost paid for nothing below the top
            // few. See `lib/game/podium.ts`.
            const onPodium = roomy && e.rank <= PODIUM;
            const size = e.crowned ? LEAD_SIZE : PODIUM_SIZE;
            const row = (
            <button
              key={e.playerId}
              className={
                `rr-lb-row${e.crowned ? ' crown' : ''}`
                + `${e.playerId === playerId ? ' me' : ''}`
                + `${e.digging ? ' digging' : ''}`
                + `${e.playerId === playerId && rankMoved ? ' rr-rank-moved' : ''}`
              }
              // The face needs a column of its own, or it grows the rank slot
              // and the numbers below stop lining up. The leader's row also
              // reserves headroom for the crown, computed from the crown
              // itself so the two cannot drift apart — `.rr-lb-list` clips,
              // and row 1 has no row above it to bleed into.
              style={onPodium ? {
                gridTemplateColumns: `clamp(18px, 2.6svh, 30px) ${FACE_COL}px minmax(0, 1fr) auto`,
                paddingTop: e.crowned ? crownBox(size).rise + 4 : 8,
                paddingBottom: 8,
              } : undefined}
              // Watching your own run from here would just be the game, and
              // there is nothing to watch on someone who is not on an island —
              // a spectate that lands on an empty board is the server's
              // `not_playing` error dressed up as a feature.
              disabled={e.playerId === playerId || !onSpectate || !e.digging}
              title={e.digging ? t.board.watch(e.name) : t.board.notOut(e.name)}
              onClick={() => {
                onSpectate?.(e.playerId);
                // On a phone the board is covering the island, so leaving it up
                // would hide the run it just opened. On a wide screen it sits
                // beside the island rather than over it, and closing it there
                // would throw away a column the player put out on purpose.
                if (!window.matchMedia?.(WIDE).matches) setOpen(false);
              }}
            >
              {/* The rank column keeps the NUMBER, even for #1.
                  The crown used to live here as an emoji; it is worn on the
                  leader's own head now (see `PodiumRabbit`), which is both
                  where a crown goes and the same art the island puts on them.
                  Leaving the digit in place keeps the ranks a readable run of
                  numbers instead of a glyph followed by 2, 3, 4. */}
              <span className="rr-lb-rank">{e.rank}</span>
              {onPodium && (
                <PodiumRabbit avatar={e.avatar} size={size} crowned={e.crowned} />
              )}
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
                {e.digging && <small>{t.board.diggingNow}</small>}
              </span>
              <span style={{ color: 'var(--carrot)' }}>{e.score}</span>
            </button>
            );
            // YOUR row stands out as its own little framed board, in the warm
            // cast it always had — found at a glance in a list of fifty.
            return e.playerId === playerId
              ? <PxPanel key={e.playerId} color={ME} className="rr-lb-me-frame">{row}</PxPanel>
              : row;
          })}
        </div>
      </LeafFrame>

      {/* Tap-away, phone only: a drawer with no way out but its own [x] is a trap. */}
      {open && <div className="rr-scrim" onClick={() => setOpen(false)} />}
    </>
  );
}
