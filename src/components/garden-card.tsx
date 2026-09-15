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
import {
  HubCard, HubRow, headingText, valueText, subText, SUB_CLASS,
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
const BTN = '#e4762b';
/** Its lit bottom edge, where the light catches. */
const BTN_LIP = '#ffd6ae';
/** The shadow it casts, which is what gives it thickness. */
const BTN_SHADOW = '#9a4810';
/** Spent: the same slab with the light off. */
const BTN_OFF = '#5a3320';
const BTN_OFF_SHADOW = '#2f1a10';
const BTN_OFF_INK = '#9a8270';
/** The carrot mark beside the count — the game's own silhouette. */
const CARROT_MARK = '/assets/misc/carrote_silouhette.png';
const GARDEN_ART = '/assets/ui/icons/garden.webp';

export function GardenCard({
  ready, yieldPerHour, capacity, capHours, onHarvest, pending,
}: GardenCardProps) {
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
        <button
            type="button"
            className="rr-hub-btn rr-slab-btn"
            onClick={onHarvest}
            disabled={!canHarvest}
            style={{
              ...harvestButton,
              background: canHarvest ? BTN_LIP : BTN_OFF_SHADOW,
            }}
          >
            <span
              className="rr-slab-face"
              style={{
                ...harvestFace,
                background: canHarvest ? BTN : BTN_OFF,
                color: canHarvest ? '#ffffff' : BTN_OFF_INK,
                boxShadow: `inset 0 -3px 0 ${canHarvest ? BTN_SHADOW : BTN_OFF_SHADOW}`,
              }}
            >
              HARVEST
          </span>
        </button>
      }
    >
      <HubRow>
        <span style={headingText}>GARDEN</span>
        <span style={valueText}>
          +{ready}
          <img className="pixelated" src={CARROT_MARK} alt="" aria-hidden style={carrotMark} />
        </span>
      </HubRow>

      {/* The RATE, not just the pile: "+0" alone reads as a broken garden. */}
      <p className={SUB_CLASS} style={subText}>
        {yieldPerHour}/hour &middot; holds {capacity} ({capHours}h)
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
  fontSize: 'clamp(9px, 15cqh, 15px)',
  letterSpacing: '0.08em',
  transition: 'transform 90ms ease-out',
};

const carrotMark: CSSProperties = {
  // Tied to the card like the type beside it, so a 49px card does not carry a
  // mark drawn for a 95px one.
  width: 'clamp(7px, 12cqh, 12px)',
  height: 'auto',
  display: 'block',
};

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
  height: '50cqh',
  minHeight: 32,
  // The button must not be what shrinks when the band above it is tight —
  // flex compressed it back to 33% of the card and undid the measurement.
  flexShrink: 0,
  width: '100%',
  position: 'relative',
  border: 'none',
  borderRadius: 8,
  lineHeight: 1,
  padding: 0,
  overflow: 'hidden',
  /* NO bottom margin — the shadow is drawn INSIDE the box (see the `inset`
     box-shadow above). A margin here is the one length in the card that does
     not scale with it, a constant among `cqh` shares, and it was the last few
     pixels of overflow at every viewport. */
};
