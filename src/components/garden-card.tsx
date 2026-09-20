'use client';

/**
 * THE GARDEN CARD, built to the mock like the energy card beside it.
 *
 * WHAT THE CARD SAYS, in the order the mock says it: what is standing in the
 * ground right now (+147), how fast it fills and what it holds, and the one
 * action — HARVEST — as a full-width button that is the card's bottom half.
 *
 * THE BUTTON IS THE POINT. In the old wooden card, Harvest was a nine-slice
 * the same colour as the panel it sat on, which made the only actionable thing
 * on the card its least visible element. The mock makes it a solid carrot slab
 * across the full width with a lit bottom edge — the one saturated shape in
 * the column, which is what an action worth taking should be.
 *
 * DISABLED IS NOT GREYED-OUT-AND-STILL-THERE. An empty garden cannot be
 * harvested, and the mock has no state for that, so the choice is this file's:
 * the button keeps its shape and loses its light, which reads as "not yet"
 * rather than as "broken". Colour carries it, as everywhere else here.
 *
 * THE BOTTLES ARE NOT HERE ANY MORE. Water and fertiliser sat on this card's
 * action row for a while, beside HARVEST, on the reasoning that a watering is
 * decided while reading what the garden holds. Then the floor grew a kit row in
 * each corner, and the bottles were in two places at once. The card is the one
 * that gave: a burrow card reports the PLACE — what it makes, what it holds,
 * what a raid cannot take — and a thing in your bag is not a property of the
 * place. They are poured from the bottom-right corner now (`GardenKitRow`),
 * and this card is GARDEN plus HARVEST again.
 */
import type { CSSProperties } from 'react';
import { useT } from '@/i18n/provider';
import { CarrotMark } from './carrot-mark';
import { PxButton, pxLabel } from './px';
import {
  HubCard, HubRow, headingText, valueText, subText, SUB_CLASS, cardSize,
} from './hub-card';

export interface GardenCardProps {
  /** Carrots standing in the ground, ready to take. */
  ready: number;
  /** What the garden makes per hour at this level. */
  yieldPerHour: number;
  /** How much it holds before it stops making more. */
  capacity: number;
  /** How long the capacity is worth, in hours. */
  capHours: number;
  onHarvest?(): void;
  /** A request is in flight; the button must not be pressed twice. */
  pending?: boolean;
}

/* ── Sampled from the reference ────────────────────────────────────────── */
/** The button's face — flat carrot, not a gradient. */
/* HARVEST — the garden's green, sampled off Paul's mock (2026-09-19). It was
   the same orange CLAIM wears; a harvest is not a reward being handed over, it
   is the garden's own crop, and the green is what says so before the label is
   read. See quest-card.tsx for why the three faces split. */
const BTN = '#417f41';
/** Its lit bottom edge, where the light catches. */
const BTN_LIP = '#6ac07a';
/** The shadow it casts, which is what gives it thickness. */
const BTN_SHADOW = '#244220';
/* SPENT, ON PARCHMENT. These were a dark-card palette — a near-black brown
   slab with a grey-brown ink, which read as "off" against the old soil face.
   The vine banner (leaf-banner.tsx) put a cream board behind them, and the
   global `button:disabled { opacity: 0.5 }` then washed that dark slab to a
   pale grey smear with an illegible label.

   Restated as a WARM STONE rather than a dark hole: light enough that the
   50% fade leaves it a solid object on cream, with ink dark enough to survive
   the same fade. */
const BTN_OFF = '#b9a288';
const BTN_OFF_SHADOW = '#8a745c';
const BTN_OFF_INK = '#4a3524';
const GARDEN_ART = '/assets/ui/icons/garden.webp';
/** The risk line: the burrow's danger red, lifted to read on the dark face. */
const RISK_INK = '#ff8a7a';

export function GardenCard({
  ready, yieldPerHour, capacity, capHours, onHarvest, pending,
}: GardenCardProps) {
  const t = useT();
  // Nothing to take: the button has no work to do. `pending` blocks a second
  // press while the first is still in flight.
  const canHarvest = ready > 0 && !pending;

  return (
    // 14.5svh and a top-pinned sprite, both measured off the mock (111px of
    // its 768) — the garden card is taller than energy's 12.4 because the
    // button is half of it, and the plant sits level with the heading rather
    // than floating mid-card.
    <HubCard
      ratio={14.5}
      // Frame and pad twice, heading 9, a gap, the 30px button.
      floor={66}
      art={GARDEN_ART}
      /* The plant is 31% of the card in the mock, and is asked for here as
         39cqh. Not a contradiction: `cqh` measures the card's CONTENT box,
         which the 3%/5% padding has already shrunk, so a share of it is
         smaller than the same share of the card. 39 of the content box lands
         on 31 of the card — verified by measuring the render, not by algebra
         on paper.
         `cqh` rather than `%` because inside a stacked card a percentage
         resolves against the BAND, which is sized by its own contents; that
         shrank the plant to 15px. */
      artHeight="39cqh"
      artAlign="start"
      // HARVEST spans the card, not the text column: in the mock the slab runs
      // under the plant and past the label's left edge. See `HubCard.footer`.
      // Built as a PLINTH plus a FACE, so a press sinks the slab into its own
      // base instead of sliding the whole thing down the screen — see
      // `.rr-slab-btn` in globals.css.
      footer={
        <PxButton
          type="button"
          className="rr-hub-btn rr-harvest-btn"
          onClick={onHarvest}
          disabled={!canHarvest}
          color={canHarvest ? BTN : BTN_OFF}
          shadowColor={canHarvest ? BTN_SHADOW : BTN_OFF_SHADOW}
          textColor={canHarvest ? '#ffffff' : BTN_OFF_INK}
          wiggle
          /* The flat face's colours — see burrow-card-panel.tsx for why these
             are variables and not a stylesheet rule. */
          style={{
            ...harvestButton,
            '--rr-btn-face': canHarvest ? BTN : BTN_OFF,
            '--rr-btn-lip': canHarvest ? BTN_LIP : BTN_OFF_SHADOW,
            '--rr-btn-shadow': canHarvest ? BTN_SHADOW : BTN_OFF_SHADOW,
            '--rr-btn-line': canHarvest ? BTN_SHADOW : BTN_OFF_SHADOW,
            '--rr-btn-ink': canHarvest ? '#ffffff' : BTN_OFF_INK,
          } as CSSProperties}
        >
          <span style={{ ...pxLabel, fontSize: cardSize(15, 9, 15) }}>{t.burrow.harvest}</span>
        </PxButton>
      }
    >
      <HubRow>
        <span style={headingText}>{t.burrow.garden}</span>
        <span style={valueText}>
          +{ready}
          <CarrotMark size={CARROT_MARK_SIZE} />
        </span>
      </HubRow>

      {/* THE RISK, while there is one; the RATE otherwise. What is standing
          outside is what a raid takes first (RAID.GARDEN_LOOT_SHARE), and a
          card that only ever said "72/hour" never gave the player the one
          reason to press HARVEST now rather than later. With nothing to take,
          "+0" alone reads as a broken garden, so the rate line comes back. */}
      {/* Empty, it says what an empty field IS: a promise, not a blank. A
          newcomer's first look at the burrow is "+0", and "20/hour" alone
          left them to guess whether the number would ever move. */}
      {/* `color: undefined` would DELETE the colour rather than fall back to
          `subText`'s: React drops an undefined style property, and the line
          then inherited the app's near-white from the page — invisible on the
          banner's cream board. It read fine only while the card was dark. */}
      <p className={SUB_CLASS} style={{ ...subText, ...(ready > 0 ? { color: RISK_INK } : null) }}>
        {ready > 0
          ? <>stealable until harvested &middot; {yieldPerHour}/hour</>
          : <>grows while you dig &middot; {yieldPerHour}/hour &middot; holds {capacity}</>}
      </p>
    </HubCard>
  );
}

/**
 * The face. 3px shorter than the button and pinned to its top, so the strip
 * left showing at the foot is the lit plinth — and a press drops the face by
 * exactly that much, swallowing it.
 */
const harvestFace: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 'calc(100% - 3px)',
  /* Pinned to the TOP of the plinth — see the note in farm-button.tsx. */
  position: 'absolute',
  top: 0,
  left: 0,
  borderRadius: 8,
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: cardSize(15, 9, 15),
  letterSpacing: '0.08em',
  transition: 'transform 90ms ease-out',
};

/** The carrot beside a figure: the game's own, in colour (`CarrotMark`). */
const CARROT_MARK_SIZE = cardSize(12, 7, 12);

/**
 * The button is 40% of the CARD in the mock (45px of 111); 50cqh is what lands
 * on that, because `cqh` measures the padded content box rather than the card
 * — the same offset the plant's height carries, for the same reason.
 *
 * `cqh` rather than `%` because a percentage resolves against the flex parent,
 * which is sized by its own contents.
 */
const harvestButton: CSSProperties = {
  /* The button is 40% of the CARD in the mock (45px of 111); 50cqh lands on
     that, since `cqh` measures the padded content box rather than the card —
     the same offset the plant's height carries. */
  /* Half the card, with an explicit FLOOR — without one the button settled at
     44px whatever `cqh` asked for (its line box plus the browser's own button
     padding), which on the Seeker's 58px card left nothing for the heading and
     the contents were clipped. 32px is below the 44px touch-target ideal, but
     the whole tile is the target on a card this small and the alternative was
     a button with no card around it. */
  height: '38cqh',
  minHeight: 32,
  // The button must not be what shrinks when the band above it is tight —
  // flex compressed it back to 33% of the card and undid the measurement.
  flexShrink: 0,
  width: '100%',
  /* Size only: the look is `PxButton`'s. No padding, radius or overflow here —
     the kit reserves its bevel with its own padding, and clipping the root
     would cut the pixel corners. */
};
