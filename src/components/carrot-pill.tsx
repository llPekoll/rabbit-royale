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
import {
  Plank, PLANK_ENERGY_CAP_L, PLANK_ENERGY_CAP_R, PLANK_ENERGY_HEIGHT,
  PLANK_ENERGY_LOW_L, PLANK_ENERGY_LOW_R, plankEnergyLow, plankEnergyTop,
} from './plank';
import { EnergyRing, RING_SIZE } from './energy-dial';
import { CarrotMark } from './carrot-mark';
import { EnergyBar } from './energy-bar';
import { ChestCount } from './chest-count';

export interface CarrotPillProps {
  /** Carrots banked, as the server has them. */
  stock: number;
  /** Bumped once per harvest — drives the burst and the number's pop. */
  fireKey: number;
  /** How many carrots just landed. */
  gain: number;
  /**
   * THE BANK'S ENERGY, as the medallion hanging off the plank's left end —
   * null off the burrow. It is the tank every loop draws on (a crossing, a
   * raid's first step), so it stands beside the stock, the other thing the
   * player owns, rather than on the DIG slab where it read as DIG's alone
   * (Paul, 2026-09-21). The island's run gauge is the bar on the lower
   * plank (`energy` below) for now; the two are still separate pools.
   */
  bank?: { energy: number; max: number } | null;
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
  /**
   * The run's energy, or null off-run — which is most of the time: the burrow,
   * the shop and the season board all wear this pill and none of them has a
   * rabbit to spend energy.
   *
   * WHY IT IS ON THE PILL AT ALL (Paul, 2026-09-20: "je veux que tu laisse la
   * barre comme avant mais dans la planche de bois avec les carottes car ya de
   * la place"). The gauge used to stand on its own over the board, in the HUD
   * strip under this pill — two panels in the same top band, one of them a
   * plank and one of them not. The board HAS the room: the wood between the
   * leaves stretches, and the figure's stack is a fixed 132px that a two-digit
   * total leaves mostly empty.
   *
   * IT IS THE SAME BAR, unchanged — the kit's pixel track, the bolt, the
   * outlined figure, the notch at one bomb's worth, the blink on a real loss.
   * Only where it hangs has moved.
   */
  energy?: number | null;
  /**
   * The island's chests — taken, and how many it holds — or null off-run.
   *
   * ON THE BOARD, UNDER THE CARROT COUNT (Paul, 2026-09-20: "met une icone de
   * chest juste en dessous du nombre de carrote avec le 0/12 chest"). It used
   * to sit in the HUD strip below, on its own glass plate, which put the
   * run's two goals on two different grounds: the pile you are building and
   * the chests that end the island.
   *
   * TWO NUMBERS, ONE COLUMN. The carrots say how the run is going; the chests
   * say how long it has left. They belong to the same glance, which is what
   * the board is for.
   */
  chests?: { taken: number; total: number; warnStage: number } | null;
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
  stock, fireKey, gain, rank, toPass, onAdd, denyKey = 0, carrying = null, bank = null,
  energy = null, chests = null,
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
      {/* THE MEDALLION: the bank's energy, a ring drawn like a fuel gauge
          (energy-dial.tsx) — full at 12 o'clock, draining anticlockwise. It
          hangs half off the plank's left end, the way the dial hung off the
          DIG board, so the pill still reads as one object. Its middle is the
          bare wooden hub: the carrot that used to lie across it said "this
          is about carrots", and it is not (Paul, 2026-09-21). Drawn at the
          art's own pixel size, so the ring's rim stays crisp; the phone's
          pill scale takes it down with the plank. */}
      {bank && (
        <span
          className="rr-pill-ring"
          style={ringSeat}
          title={t.loop.energyOf(bank.energy, bank.max)}
          aria-label={t.loop.energyOf(bank.energy, bank.max)}
          role="img"
        >
          <EnergyRing value={bank.energy} max={bank.max} size={RING_SIZE.height} bolt />
        </span>
      )}
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
      <Plank
        tall={energy !== null}
        className={`rr-pill-plate${energy !== null ? ' has-energy' : ''}`}
        style={plate}
      >
      {denyKey > 0 && <span key={`deny-${denyKey}`} className="rr-pill-deny" aria-hidden />}
      {carrying ? (
        <span
          key={`carry-${carrying}`}
          className="rr-pill-carrying"
          title={t.pill.carryNote}
          aria-label={t.pill.carrying(carrying)}
        >
          {/* THE CARROT IS ON THE CHIP, not just in the tooltip.

              It read as a bare "+18" in orange (Paul, 2026-09-20: "c'est quoi
              le plus 18 je comprends pas"), which names no unit and no event
              — and on this board it sits a few pixels from the chest count's
              own figure, so the one thing it could be mistaken for is the
              other number beside it. The mark says WHAT was carried; the
              tooltip still says the rest ("banked when you walk home"). */}
          <PxPanel color={CARRY_GLASS} className="rr-carry-chip" style={carryPlate}>
            +{groupDigits(carrying)}
            <CarrotMark size={10} />
          </PxPanel>
        </span>
      ) : null}
      {/* Carrots fly up behind the figure as it climbs — the loot arriving,
          with the number as its result. */}
      <CarrotBurst fireKey={fireKey} amount={gain} />

      {/* THE COUNT'S ROW. On the plain board it is simply the plate's own
          flex row; on the energy board it is PINNED to the upper plank, since
          the two boards are separate surfaces and centring on the whole box
          would drop the figure onto the seam between them. */}
      <span style={energy !== null ? countRow : contents}>

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
      {/* BEFORE the figure on the plain board, AFTER it on the run's — see
          the twin below. The sprite names the unit either way; which side it
          names it from is the board's business. */}
      {energy === null && (
        <span style={artBox} aria-hidden>
          <Carrot height={44} />
        </span>
      )}

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
          {/* THE CARROT AFTER THE FIGURE on the run's board (Paul's Aseprite,
              2026-09-20). It reads "0 carrots" — a figure and its unit, the
              way the haul chip beside it reads "+6 carrot" — where the sprite
              in front read as a bullet marking a row. The plain board keeps
              the sprite in front, which is the mock's own arrangement and
              where the burrow's eye already goes. */}
          {energy !== null && (
            <span style={artBoxInline} aria-hidden>
              <Carrot height={40} />
            </span>
          )}
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
        {/* THE ISLAND'S CHESTS, under the pile. The sprite names the unit, as
            the carrot does for the figure above it — see chest-count.tsx for
            why the word went. Run only: off the island there is no island to
            count, and the line simply is not there. */}
        {chests && (
          <span style={chestLine}>
            <ChestCount
              taken={chests.taken}
              total={chests.total}
              warnStage={chests.warnStage}
            />
          </span>
        )}
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

      </span>

      {/* THE RUN'S ENERGY, ON THE SAME BOARD, UNDER THE COUNT.

          ONE PLANK, NOT TWO. Stacking a second board under the first read as
          two objects with two pairs of leaves colliding in the middle (Paul,
          2026-09-20: "c'est ca mais tu merge"), so Paul drew the board with
          its lower plank attached — `plank+enegie.png`, "ya de la place pour
          l'energie". The gauge sits on that lower plank.

          PINNED TO IT, not laid out in a column: the two boards are painted
          surfaces at fixed rows of the art (`plankEnergyLow`), and flex would
          share the box's height between them instead of putting each row on
          its own wood. */}
      {energy !== null && (
        <span style={energyRow}>
          <EnergyBar energy={energy} />
        </span>
      )}
      </Plank>
    </div>
  );
}

/** How much of the ring hangs past the plank's edge. */
const RING_OVERHANG = 0.5;
/**
 * Where the medallion sits: centred on the plank's height, half of it past
 * the plank's left edge. Absolute against the pill's fixed box, so the plate
 * can still drop in on arrival without moving it.
 */
const ringSeat: CSSProperties = {
  position: 'absolute',
  left: `calc(-1 * ${RING_SIZE.width}px * ${RING_OVERHANG})`,
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 1,
  pointerEvents: 'none',
};

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
  /* THE WIDTH IS NOT STATED HERE. It belongs to `.rr-pill-plate` in
     globals.css, because it has two values — the plain board, and the wider
     one the island's energy bar needs — and an INLINE width beats any
     stylesheet rule outright. Stated here, the run's board stayed 176px wide
     and squeezed the gauge's track down to 8px: the bolt and the figure kept
     their size, so what vanished was the bar itself (measured 2026-09-20). */
};

/**
 * The gauge's row on the tall board — the lower of the two.
 *
 * It takes the row's full width so the track runs the length of the board,
 * which is what a gauge wants and what the count above it does not: the
 * figure is centred in a fixed stack so it cannot walk as it counts (see
 * `stack`), while the bar has nothing to walk and every pixel of length is
 * another pixel of resolution.
 */
/**
 * The count's row, pinned to the UPPER plank of the energy board.
 *
 * `contents` on the plain board, so the figure and the carrot stay direct
 * children of the plate's flex row and nothing about the pill's usual layout
 * changes when there is no run.
 */
const contents: CSSProperties = { display: 'contents' };

const countRow: CSSProperties = {
  position: 'absolute',
  /* The upper plank runs the board's FULL width, so this reaches back out
     over both caps — same padding-box arithmetic as `energyRow`. */
  left: -PLANK_ENERGY_CAP_L,
  right: -PLANK_ENERGY_CAP_R,
  ...plankEnergyTop(PLANK_ENERGY_HEIGHT),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--rr-pad)',
};

/**
 * The gauge's row, on the LOWER plank.
 *
 * Inset from the board's ends by more than the count's: the lower plank is
 * narrower than the one above it (x=28..138 of 167 in the art), so a bar run
 * to the full width would hang off both its ends into the leaves.
 */
/**
 * The gauge's row, on the LOWER plank.
 *
 * THE OFFSETS ARE MEASURED FROM THE BOARD'S PAINTED EDGE, and an absolutely
 * positioned child resolves against its parent's PADDING box — which on this
 * plate is the 180px row alone, because the caps are `border-width` and a
 * border is outside the padding box. Stated as plain `left`/`right` the row
 * came out 22px wide inside a 438px board (measured 2026-09-20).
 *
 * So each side subtracts the cap it sits behind: the lower plank starts 84
 * CSS px from the board's left edge, and the left cap is 118 of them, so the
 * row starts 34px to the LEFT of the padding box. Same on the right.
 */
const energyRow: CSSProperties = {
  position: 'absolute',
  left: PLANK_ENERGY_LOW_L - PLANK_ENERGY_CAP_L,
  right: PLANK_ENERGY_LOW_R - PLANK_ENERGY_CAP_R,
  ...plankEnergyLow(PLANK_ENERGY_HEIGHT),
  display: 'flex',
  alignItems: 'center',
};

/**
 * The carrot when it rides INSIDE the figure's row, on the run's board.
 *
 * IT KEEPS THE 45° LIE. Standing it upright was tried and rejected on sight
 * (Paul, 2026-09-20: "ya plus l'angle") — the tilt is how this carrot is
 * drawn everywhere in the chrome, and squaring it beside the figure made it a
 * different object from the one on the burrow's board and in the haul chip.
 * It moved along the row; it did not become a new sprite.
 *
 * The box is square and a little wider than the art, because a rotated sprite
 * throws its corners past its own bounds and the row must not grow to contain
 * a diagonal it only needs to show.
 */
const artBoxInline: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
  flexShrink: 0,
  /* LIFTED OFF THE ROW'S CENTRE, but only just (Paul, 2026-09-20). The
     sprite's drawn pixels sit low in its box — the leaves are slimmer than
     the root, so its visual mass is below its geometric middle — and centred
     against a 28px figure it read as sitting a step lower than the number it
     belongs to.

     2px, not the 4 first tried: the upper plank's bark is close above this
     row, and at 4 the leaves clipped against it. The lift is there to settle
     the sprite against the figure, not to push it into the board's edge. The
     tilt goes with it, so the two stay one transform. */
  transform: 'translateY(-2px) rotate(45deg)',
  width: 32,
  height: 32,
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
  fontSize: 28,
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
  /* 28 IS THE BOARD'S STEP. The pile is the pill's subject and the upper
     plank gives it a row of its own now — Paul sized it up in Aseprite
     (2026-09-20) and 22 read small against the wood, where it had read fine
     against the old dark slab. The advance scales with the face: 16.2 at 22
     is 0.736 per point, so 28 takes 20.6. */
  [28, 20.6], [22, 16.2], [16, 12.1], [12, 9.1], [10, 7.7],
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

/**
 * THE CHEST LINE, under the pile with air between them.
 *
 * A row of its own rather than the stack's 1px gap: at 28 the figure has
 * presence, and a count tucked right under it read as a subscript on the
 * carrots rather than as the run's other goal. Paul set the distance in
 * Aseprite (2026-09-20) — it clears the figure's descender and still belongs
 * to the same column.
 */
const chestLine: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: 6,
};

/** The haul beside the pill: a small glass plate in the pixel frame. */
const carryPlate: CSSProperties = {
  /* A row, so the figure and the carrot it counts sit on one line. */
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  /* A chip, on the game's chip inset. */
  padding: '2px var(--rr-pad-tight)',
  lineHeight: 1,
};
