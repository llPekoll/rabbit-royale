'use client';

/**
 * THE CARROT PILL — the banked total, and what it would take to climb.
 *
 * WHAT IT REPLACES. `CarrotCounter` drew a bare figure over the sky: a big
 * number with "carrots" under it, held legible by a text-shadow because it had
 * no ground of its own. The mock gives it a panel — the same dark slab the
 * burrow cards wear — with the carrot at the left.
 *
 * THE [+] OPENS THE SHOP, as the mock draws it. The launcher row along the
 * bottom has a SHOP tile too — two doors to one place — and that is the mock's
 * call rather than a slip: the row is where you go to browse, the [+] is where
 * you go when the number beside it is too small for what you wanted to buy.
 *
 * THE RANK LINE IS NOT IN THE MOCK. It is the one addition here, and it earns
 * its row: a rank alone ("#5") says where you stand, which the season drawer
 * already tells you. What it does not say is what to DO, and the gap to the
 * player one place ahead is the smallest actionable target the season has.
 * "#5 · 340 to pass" is a goal; "#5" is a scoreboard.
 *
 * TWO UNITS, ON PURPOSE. The big figure is BANKED CARROTS — the pile you spend
 * on upgrades. The gap is in SEASON SCORE, because that is what the ranking is
 * made of. They move together but are not the same quantity, and quoting the
 * target in the wrong one would send the player after the wrong number. The
 * line says "to pass" rather than "carrots" for exactly that reason.
 *
 * NO "carrots" LABEL. The sprite beside the number already names the unit, and
 * a word under a figure that is only ever carrots is a caption on a picture
 * that was never ambiguous. What sits there now is the rank line, which says
 * something the number cannot.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { CarrotBurst } from '@/components/carrot-burst';
import { groupDigits } from './hub-card';
import { PxPanel } from './px';

export interface CarrotPillProps {
  /** Carrots banked, as the server has them. */
  stock: number;
  /** Bumped once per harvest — drives the burst and the number's pop. */
  fireKey: number;
  /** How many carrots just landed. */
  gain: number;
  /** Season rank, or null when unranked (no score yet, or no board). */
  rank: number | null;
  /**
   * Season score needed to pass the player one place ahead, or null when
   * there is nobody to chase — #1, unranked, or the board is unavailable.
   */
  toPass: number | null;
  /** Opens the shop. The [+] is the pill's one control, as in the mock. */
  onAdd?(): void;
  /**
   * Bumped when a press was refused for want of carrots: the pill shakes and
   * its rim flushes red — the number that said no, saying it.
   */
  denyKey?: number;
  /**
   * Carrots dug this run and not home yet. A small chip BESIDE the stock, not
   * a second figure the size of it: they join the stock on the walk home, and
   * a bomb-ending run still banks them, but until then they are a haul, not a
   * balance. Re-keyed per gain so each dig pops it. Hidden at 0 and off-run.
   */
  carrying?: number | null;
}

/* ── Sampled from the reference ────────────────────────────────────────── */
const FACE_TOP = '#3a2415';
/** The figure — cream, the same ink the cards give a live value. */
const INK = '#fde7bd';
/** "carrots", and the rank line: a step quieter than the number. */
const SUB = '#a28b7b';
/** The rank chip: the gold badge the season board gives your own row. */
const RANK_GOLD = '#ffd138';
/** The carrying chip's glass — the island captions' ground. */
const CARRY_GLASS = 'rgba(13, 17, 23, 0.82)';

/**
 * A season gap, short enough to always fit the pill's rank line: whole with
 * separators below 10,000, then "12.3k", "123k", "1.2M".
 */
export function shortGap(n: number): string {
  const v = Math.max(0, Math.ceil(n));
  if (v < 10_000) return groupDigits(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 100_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

function Carrot({ height }: { height: number }) {
  // Width follows the sprite's own aspect, so it is never squashed.
  const width = Math.round((CARROT_SIZE.width / CARROT_SIZE.height) * height);
  return (
    <img
      className="rr-carrot-px"
      src={CARROT_URL}
      alt=""
      aria-hidden
      draggable={false}
      width={width}
      height={height}
    />
  );
}

export function CarrotPill({
  stock, fireKey, gain, rank, toPass, onAdd, denyKey = 0, carrying = null,
}: CarrotPillProps) {
  const ref = useRef<HTMLDivElement>(null);
  // The shake rides `translate`, not `transform`: the stylesheet centres the
  // pill with a transform, and animating that would fling it off its centre.
  // Web Animations rather than a class, so a second refusal replays it.
  useEffect(() => {
    if (!denyKey || !ref.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    ref.current.animate(
      [{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }],
      { duration: 360, easing: 'ease-out' },
    );
  }, [denyKey]);

  return (
    <div ref={ref} className="rr-carrot-pill" style={pill} title={`${stock} carrots banked`}>
      {/* THE PLATE: the codex's pixel frame in the pill's own soil. Inside the
          fixed box rather than being it, so the plate can drop in on arrival
          (`.rr-pill-plate`, px-top-floor.css) without touching the transform
          that centres the pill. */}
      <PxPanel color={FACE_TOP} className="rr-pill-plate" style={plate}>
      {denyKey > 0 && <span key={denyKey} className="rr-pill-deny" aria-hidden />}
      {carrying ? (
        <span
          key={carrying}
          className="rr-pill-carrying"
          title="Carried this run: banked when you walk home"
          aria-label={`${carrying} carrots carried, not banked yet`}
        >
          <PxPanel color={CARRY_GLASS} style={carryPlate}>+{groupDigits(carrying)}</PxPanel>
        </span>
      ) : null}
      {/* Carrots fly up behind the figure as it climbs — the loot arriving,
          with the number as its result. */}
      <CarrotBurst fireKey={fireKey} amount={gain} />

      {/* 80% of the pill's height, measured off the mock. The mock's carrot is
          also a WIDE, reclining sprite (aspect 1.78) where the game's own is
          tall and narrow (13x29) — that difference is left alone rather than
          stretched: the pile the player digs should be the carrot they see in
          the ground, and squashing it to match a mock's drawing would make it
          a different object. Only the SIZE follows the mock. */}
      {/* Turned 45° clockwise, so the carrot LIES on the pill rather than
          standing to attention in it. The game's sprite is drawn upright (it
          grows out of the ground); the mock's is reclining, and on a wide
          shallow panel a diagonal reads as an object at rest where a vertical
          one reads as a bullet point. */}
      <span style={artBox} aria-hidden>
        <Carrot height={44} />
      </span>

      <span style={stack}>
        <span key={fireKey} className={fireKey ? 'banked' : undefined} style={figure}>
          {groupDigits(stock)}
        </span>
        {/* Only when there is something to chase. A rank with no gap beside it
            is the standing the season drawer already shows, and an empty row
            here would be a permanent blank under the count. */}
        {/* Keyed on the RANK so a change remounts the line and replays its
            pop (`rr-rank-pop`): climbing a place is the one thing this line
            exists to report, and it used to change as quietly as a clock. */}
        {/* THE CLIMB, as a badge and a named target.
            "#2 · 5,560 to pass" ran past the pill's fixed width and was cut to
            "to pa...", and even whole it did not say WHO there was to pass.
            The rank is a gold chip; the line names the place it chases
            ("to #1"), shortened past four digits so it always fits. The unit
            is season points, not carrots — said in the tooltip, and kept off
            the line so it never reads as a carrot count. */}
        {rank !== null && (rank === 1 || toPass !== null) && (
          <span
            key={rank}
            className="rr-rank-pop"
            style={rankRow}
            title={rank === 1
              ? 'Season rank #1: leading the board'
              : `Season rank #${rank}: ${groupDigits(Math.max(1, toPass ?? 1))} season points to pass #${rank - 1}`}
          >
            <span style={rankChip}>#{rank}</span>
            {/* At least 1: a gap of 0 is a TIE, and passing a tied player takes
                one more point. "0 to #91" read as nothing to do. */}
            {rank === 1 ? 'leading' : <>{shortGap(Math.max(1, toPass ?? 1))} to #{rank - 1}</>}
          </span>
        )}
      </span>
      </PxPanel>
    </div>
  );
}

const pill: CSSProperties = {
  /* `fixed`, and placed by globals.css (`.rr-carrot-pill`).
     It was `relative` here, which is an INLINE style and so beat the
     stylesheet's `position: fixed` outright — the pill stayed in the topbar's
     flow and sat at x 1206 of a 1376px screen instead of on its centre. The
     burst inside it positions against the plate. */
  position: 'fixed',
  pointerEvents: 'auto',
};

/**
 * The pill's face. The frame (`PxPanel`) replaced a 2px bone rim, a 14px
 * radius and a soil gradient; the fill is the gradient's top tone, the one
 * the pill read as. The padding gives back the pixel or so the frame is wider
 * than the old rim (two source pixels, 4-6px), so the pill keeps its height.
 */
const plate: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  /* The one gap between an image and the text it belongs to, everywhere on the
     top bar and the floor. */
  gap: 'var(--rr-pad)',
  /* A one-line plate: the tight pad above and below, the full pad each side.
     It was 3/8/3/10 — four different numbers on one small panel. */
  padding: 'var(--rr-pad-tight) var(--rr-pad)',
  boxSizing: 'border-box',
};

const artBox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
  flexShrink: 0,
  transform: 'rotate(45deg)',
  // The rotated sprite's corners reach past its own box; this keeps the pill
  // from growing to contain a diagonal it only needs to show.
  width: 34,
  height: 34,
};

/**
 * The number and the rank line — one left-aligned stack, at a FIXED width.
 *
 * The pill is centred on the screen, so anything that changes its width moves
 * it: banking a harvest (1,940 -> 2,180), climbing a rank, or the rank line
 * appearing at all took the pill from 146px to 220px and slid it sideways
 * under the player's eye. A counter that walks when it counts is the one thing
 * a counter must not do.
 *
 * Wide enough for the longest thing either line holds — a seven-figure total,
 * and "#48 · 12,000 to pass" — so the content changes inside a box that does
 * not. `text-overflow` is the backstop for a season that outgrows even that.
 */
const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 1,
  lineHeight: 1,
  width: 132,
  minWidth: 0,
  overflow: 'hidden',
};

const figure: CSSProperties = {
  position: 'relative',
  // Over the burst: the carrots fly BEHIND the figure, so it stays readable
  // while they pass.
  zIndex: 2,
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 22,
  fontVariantNumeric: 'tabular-nums',
  color: INK,
  lineHeight: 1,
};

/**
 * The climb line. Same size as "carrots" and a shade warmer, so it reads as a
 * second fact about the same pile rather than as a caption on the word above.
 */
const rankText: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 10,
  letterSpacing: '0.02em',
  color: SUB,
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
};

/** The rank line: the chip, then the target, on one row. */
const rankRow: CSSProperties = {
  ...rankText,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 2,
  color: '#d8c3ab',
};

/**
 * The rank itself, as the gold badge the season board gives your own row.
 *
 * FLAT, NOT FRAMED. It is a 10px chip on a 10px line: the codex's frame is two
 * source pixels a side (up to 12px of height), which made the chip 23px tall
 * and the pill 15px taller than its figure needs. Square corners and a
 * one-pixel dark edge keep it pixel art at the size the line has.
 */
const rankChip: CSSProperties = {
  display: 'inline-block',
  /* The game's chip inset: 2px of vertical room — all a 10px line can spare —
     and the tight pad each side, the same as every other badge and tag. */
  padding: '2px var(--rr-pad-tight)',
  background: RANK_GOLD,
  boxShadow: '0 0 0 1px #2a180e',
  color: '#2a180e',
  fontSize: 10,
  lineHeight: 1,
};

/** The haul beside the pill: a small glass plate in the pixel frame. */
const carryPlate: CSSProperties = {
  display: 'block',
  /* A chip, on the game's chip inset. */
  padding: '2px var(--rr-pad-tight)',
  lineHeight: 1,
};
