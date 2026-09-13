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
import type { CSSProperties } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { CarrotBurst } from '@/components/carrot-burst';
import { groupDigits } from './hub-card';

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
}

/* ── Sampled from the reference ────────────────────────────────────────── */
const FACE_TOP = '#3a2415';
const FACE_BOTTOM = '#2a180e';
const RIM = '#ddccbc';
/** The figure — cream, the same ink the cards give a live value. */
const INK = '#fde7bd';
/** "carrots", and the rank line: a step quieter than the number. */
const SUB = '#a28b7b';
/** The [+] — the one saturated thing in the pill, because it is the action. */
const PLUS = '#e47422';
const PLUS_LIP = '#ffd6ae';
const PLUS_SHADOW = '#9a4810';

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
  stock, fireKey, gain, rank, toPass, onAdd,
}: CarrotPillProps) {
  return (
    <div className="rr-carrot-pill" style={pill} title={`${stock} carrots banked`}>
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
        {rank !== null && toPass !== null && (
          <span style={rankText}>#{rank} &middot; {groupDigits(toPass)} to pass</span>
        )}
        {/* Top of the board: there is no gap, and saying so is worth a row. */}
        {rank === 1 && <span style={rankText}>#1 &middot; leading</span>}
      </span>

    </div>
  );
}

const pill: CSSProperties = {
  /* `fixed`, and placed by globals.css (`.rr-carrot-pill`).
     It was `relative` here, which is an INLINE style and so beat the
     stylesheet's `position: fixed` outright — the pill stayed in the topbar's
     flow and sat at x 1206 of a 1376px screen instead of on its centre. The
     burst inside it still positions against this box either way. */
  position: 'fixed',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 8px 6px 12px',
  boxSizing: 'border-box',
  border: `2px solid ${RIM}`,
  borderRadius: 14,
  background: `linear-gradient(180deg, ${FACE_TOP} 0%, ${FACE_BOTTOM} 100%)`,
  boxShadow: '0 3px 0 rgba(0, 0, 0, 0.35)',
  pointerEvents: 'auto',
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
