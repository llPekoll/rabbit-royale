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
 * FOLDED, IT IS A COUNT AND A PLACE. The figure and the gold rank chip share
 * one row; a tap (or Enter) unfolds the climb under them, "17 [carrot] to #11",
 * and a second tap folds it away. Paul's call, 2026-09-16.
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
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useT } from '@/i18n/provider';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { CarrotBurst } from '@/components/carrot-burst';
import { groupDigits, shortGap } from '@/i18n/format';
import { PxPanel } from './px';
import { Plank } from './plank';
import { CarrotMark } from './carrot-mark';

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

/**
 * The climb line with the carrot right after the gap, in any language: the
 * sentence comes whole from the dictionary ("17 to #11", "差 17 到第 11"), and
 * the mark is slotted in after the figure wherever that language put it.
 */
function ClimbLine({ gap, line }: { gap: string; line: string }) {
  const at = line.indexOf(gap);
  if (at < 0) return <>{line}</>;
  return (
    <>
      {line.slice(0, at + gap.length)}
      <CarrotMark size={10} />
      {line.slice(at + gap.length)}
    </>
  );
}

export function CarrotPill({
  stock, fireKey, gain, rank, toPass, onAdd, denyKey = 0, carrying = null,
}: CarrotPillProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  /* FOLDED BY DEFAULT (Paul, 2026-09-16). The pill says the two things a
     glance needs — how many carrots, what place — and the climb ("17 to #11")
     waits behind a tap. A second row that is always there is a second row the
     top of a 400px-tall phone pays for on every screen. */
  const [open, setOpen] = useState(false);
  const hasRank = rank !== null && (rank === 1 || toPass !== null);
  const toggle = () => setOpen((o) => !o);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  };
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
    <div
      ref={ref}
      className="rr-carrot-pill"
      style={pill}
      title={t.pill.banked(stock)}
      /* A BUTTON only when there is a climb to show. Unranked, the pill has
         nothing behind the tap, and a control that does nothing is worse than
         a readout. A div with the role rather than a <button>: the plate is a
         block (the kit's panel), which a button may not hold. */
      {...(hasRank ? {
        role: 'button',
        tabIndex: 0,
        'aria-expanded': open,
        'aria-label': open ? t.pill.hideClimb(stock, rank!) : t.pill.showClimb(stock, rank!),
        onClick: toggle,
        onKeyDown: onKey,
      } : {})}
    >
      {/* THE PLATE: the wood board (plank.tsx). It replaced the codex's pixel
          frame in soil — Paul, 2026-09-19: the slab was "tout moche", and the
          chrome moves onto painted wood one panel at a time, starting here.

          It keeps the CLASS the frame had. Every rule the pill's plate already
          owns — the arrival drop, the hover brighten, the press sinking it a
          pixel (px-top-floor.css) — binds to `.rr-pill-plate` and is about
          the plate's BEHAVIOUR, not its material, so all of it still applies
          to the board without being restated.

          Inside the fixed box rather than being it, so the plate can drop in
          on arrival without touching the transform that centres the pill. */}
      <Plank className="rr-pill-plate" style={plate}>
      {denyKey > 0 && <span key={`deny-${denyKey}`} className="rr-pill-deny" aria-hidden />}
      {carrying ? (
        <span
          key={`carry-${carrying}`}
          className="rr-pill-carrying"
          title={t.pill.carryNote}
          aria-label={t.pill.carrying(carrying)}
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
        {/* THE FOLDED PILL: the figure, the rank beside it. */}
        <span style={topRow}>
          <span
            key={`fig-${fireKey}`}
            className={fireKey ? 'banked' : undefined}
            style={{ ...figure, fontSize: figureSize(groupDigits(stock), hasRank ? String(rank) : null) }}
          >
            {groupDigits(stock)}
          </span>
          {/* Keyed on the RANK so a change remounts the chip and replays its
              pop (`rr-rank-pop`): climbing a place is the one thing it exists
              to report, and it used to change as quietly as a clock.
              PREFIXED, like every key in this plate: the figure beside it is
              keyed on `fireKey`, and the two are siblings — when the second
              bank landed for a player ranked #2, both children were key `2`
              and React kept the OLD figure next to the new one. Paul saw
              "265 1263" for a stock of 1263 (2026-09-16). */}
          {hasRank && (
            <span key={`rank-${rank}`} className="rr-rank-pop" style={rankChip}>#{rank}</span>
          )}
          {hasRank && <span className={`rr-pill-caret${open ? ' open' : ''}`} aria-hidden />}
        </span>
        {/* THE CLIMB, unfolded: what it takes to pass the place ahead. The
            gap is in SEASON SCORE, which a harvest and a raid move with the
            carrots — so it wears the carrot mark, as Paul asked, and the
            tooltip keeps the exact unit. Shortened past four digits so it
            always fits the fixed width. */}
        {hasRank && open && (
          <span
            className="rr-pill-climb"
            style={rankRow}
            title={rank === 1
              ? t.pill.rankFirst
              : t.pill.rank(rank!, groupDigits(Math.max(1, toPass ?? 1)))}
          >
            {/* At least 1: a gap of 0 is a TIE, and passing a tied player
                takes one more point. "0 to #91" read as nothing to do. */}
            {rank === 1 ? t.pill.leading : (
              <ClimbLine gap={shortGap(Math.max(1, toPass ?? 1))} line={t.pill.toPass(shortGap(Math.max(1, toPass ?? 1)), rank!)} />
            )}
          </span>
        )}
      </span>
      </Plank>
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
 * The pill's face — the wood board.
 *
 * NO PADDING, AND NO HEIGHT. Both belong to the board now: it is drawn art,
 * not a box with a rim, so its height is the height it was painted and the
 * bark along the top and bottom is the only inset the content needs. The
 * tight pad the pixel frame wanted would only push the row off the wood's
 * centre.
 *
 * THE WIDTH IS THE BOARD'S, AND THE CAPS ARE PAID FOR ON TOP.
 *
 * A 3-slice reserves each cap as a BORDER, so `box-sizing: border-box` with a
 * 200px width gave a 200px board whose caps ate 120 of it and left the row
 * 80px to sit in — centred, correctly, on a content box two thirds of the way
 * to the left of the board it is painted on. In the game the carrot and the
 * figure sat in the board's left half with an empty plank beside them.
 *
 * `content-box` is the honest description: the number's row gets the pill's
 * full token width, and the caps are the leaves' own room outside it. The
 * board comes out `--rr-pill-w` plus two caps, which is why the token below
 * shrank by exactly that much — the board on screen is the size the pill has
 * always been.
 */
const plate: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  /* The one gap between an image and the text it belongs to, everywhere on the
     top bar and the floor. */
  gap: 'var(--rr-pad)',
  /* The caps sit OUTSIDE this width, not inside it. */
  boxSizing: 'content-box',
  /* The ROW's width. `--rr-pill-w` is this plus the two caps — the board's
     whole width, which is what the chrome beside the pill reserves. */
  width: 'var(--rr-pill-row)',
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
 * The number and the rank line — one CENTRED stack, at a FIXED width.
 *
 * THE WIDTH IS FIXED, AND THAT PART IS NOT NEGOTIABLE. The pill is centred on
 * the screen, so anything that changes its width moves it: banking a harvest
 * (1,940 -> 2,180), climbing a rank, or the rank line appearing at all took
 * the pill from 146px to 220px and slid it sideways under the player's eye. A
 * counter that walks when it counts is the one thing a counter must not do.
 *
 * Wide enough for the longest thing either line holds — a seven-figure total,
 * and "#48 · 12,000 to pass" — so the content changes inside a box that does
 * not. `text-overflow` is the backstop for a season that outgrows even that.
 *
 * WHAT CHANGED IS THE ALIGNMENT INSIDE IT. The stack used to be left-aligned,
 * which is invisible at four figures and glaring at two: "49" took 30px of a
 * 132px box and left 100px of empty plank to its right, so the whole readout
 * sat in the board's left half (Paul, 2026-09-19). Centred, a short total
 * sits on the board's middle and a long one still grows into the same box —
 * the counter holds its place either way, which was the point of fixing the
 * width in the first place.
 */
const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  /* Centred, so a two-figure total is not marooned at the left. */
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  lineHeight: 1,
  width: 132,
  minWidth: 0,
  overflow: 'hidden',
};

/** The folded pill's one row: the figure, the rank chip, the caret. */
const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--rr-pad-tight)',
  maxWidth: '100%',
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
  /* ONE LINE. The digits are grouped with a space ("1 683"), and a flex row
     short of room broke the figure AT THAT SPACE — "1" over "683", the rank
     chip pushed out of the plate (Paul, 2026-09-16). The size steps down
     instead; see `figureSize`. */
  whiteSpace: 'nowrap',
};

/**
 * The pixel face's advance per character at each size the interface uses,
 * measured in the game (the font is monospace, so a space is a digit's width).
 * Sizes are the kit's own steps — whole multiples of its 8px cell read
 * crispest — so the figure moves between them rather than shrinking freely.
 */
const FIGURE_STEPS: ReadonlyArray<readonly [size: number, perChar: number]> = [
  [22, 16.2], [16, 12.1], [12, 9.1], [10, 7.7],
];

/** The chip: its inset, the "#" (a wide glyph), then the rank's digits at the
 *  10px face — measured as 31 / 42 / 56px for "#5" / "#211" / "#1234". */
const CHIP_PER_DIGIT = 8;
const CHIP_INSET = 12 + 9;
/** Caret and the two gaps around the chip, in the folded row. */
const ROW_FURNITURE = 8 + 12;
const STACK_W = 132;

/**
 * The largest step at which the grouped figure still fits its row beside the
 * rank chip, inside the pill's fixed stack. The pill's width is FIXED so the
 * counter never walks (see `stack`); when the pile outgrows the face, it is
 * the face that gives, one step at a time, never the line. A total past even
 * the smallest step (nine figures beside a four-figure rank) is clipped by the
 * stack rather than wrapped.
 */
export function figureSize(grouped: string, rank: string | null): number {
  const chip = rank === null ? 0 : CHIP_INSET + rank.length * CHIP_PER_DIGIT + ROW_FURNITURE;
  const room = STACK_W - chip;
  for (const [size, perChar] of FIGURE_STEPS) {
    if (grouped.length * perChar <= room) return size;
  }
  return FIGURE_STEPS[FIGURE_STEPS.length - 1][0];
}

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
  /* The row's own air under the figure, so unfolding reads as a line joining
     the pill rather than a second panel. */
  marginTop: 'var(--rr-pad-tight)',
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
  /* The chip never gives: it is the figure's face that steps down. */
  flexShrink: 0,
  whiteSpace: 'nowrap',
  /* The game's chip inset: 2px of vertical room — all a 10px line can spare —
     and the tight pad each side, the same as every other badge and tag. */
  padding: '2px var(--rr-pad-tight)',
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
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
