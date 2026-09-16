'use client';

/**
 * THE ENERGY CARD, built to the mock rather than to the column it replaces.
 *
 * WHAT CHANGED AND WHY. The burrow's cards were one shape: a nine-slice wooden
 * frame, a label row, and something full-width under it. Energy wore that shape
 * like everything else, so the screen's most-read number looked exactly like
 * the upgrade price. The reference puts energy in its own object — a bolt
 * standing at the left, the label and the count on one line beside it, and the
 * bar tucked under that line in the RIGHT-HAND COLUMN only.
 *
 * SO THIS IS NOT `BurrowCard`. Reusing that would have meant a full-width bar
 * under a full-width label — the layout the mock is explicitly not. The frame
 * comes from `hub-card.tsx`, which is the mock's rounded slab; the game's own
 * nine-slice is square and stays on the panels that still wear it. A deliberate
 * departure from `burrow-chrome`'s "every panel is a nine-slice" rule, for the
 * one reason that rule allows: the art direction asked for a different object.
 *
 * COLOURS ARE MEASURED, NOT CHOSEN — sampled off the reference image.
 */
import type { CSSProperties } from 'react';
import { useT } from '@/i18n/provider';
import {
  HubCard, HubRow, RIM, headingText, valueText, subText, SUB_CLASS,
} from './hub-card';

export interface EnergyCardProps {
  energy: number;
  maxEnergy: number;
  /**
   * The refill line ("+1 in 5m."), when there is one to give.
   *
   * The mock's card has no such line — but the mock is a still image of a full
   * bar, and a full bar is the one state that needs no caption. Empty is the
   * state this card exists for, and an empty gauge with no return time is
   * indistinguishable from a broken game. So the line renders only when it
   * says something, inside the card rather than in a wooden frame of its own.
   */
  note?: string;
}

/* ── Sampled from the reference ────────────────────────────────────────── */
/** The bar's channel: the hole the fill sits in. */
const TROUGH = '#43261a';
/** The fill's vertical banding — bright crown, deep belly. */
const FILL_TOP = '#ffd138';
const FILL_MID = '#ffae13';
const FILL_BOTTOM = '#ea8918';
/** Out of energy: the fill's ladder, re-struck in the burrow's DANGER red. */
const DANGER_TOP = '#e8654a';
const DANGER_MID = '#c1442e';
const DANGER_BOTTOM = '#8f2f1f';

const BOLT = '/assets/ui/icons/bolt.webp';

export function EnergyCard({ energy, maxEnergy, note }: EnergyCardProps) {
  const t = useT();
  const pct = maxEnergy > 0 ? Math.max(0, Math.min(1, energy / maxEnergy)) : 0;
  const empty = energy <= 0;

  return (
    /* 12.4 = the card's height as a share of the VIEWPORT (95px of the mock's
       768), not an aspect ratio — see `HubCard`'s `ratio`. The bolt is 44% OF
       THE CARD in the mock, asked for as 59cqh because `cqh` measures the
       card's padded content box rather than the card itself. (The garden card
       carries the same offset for the same reason.)
       Two earlier cuts got the bolt wrong in the same direction: a flat 38px
       was too small, and a correction to "70%" was measured with a detector
       that also caught the BAR — which is the same yellow — and produced a
       bolt that ate the card's left third. In the mock it is a slim mark
       standing in its own margin, not a half of the card. */
    <HubCard ratio={12.4} art={BOLT} artHeight="59cqh">
      <HubRow>
        <span style={headingText}>{t.burrow.energy}</span>
        <span style={{ ...valueText, color: empty ? DANGER_TOP : undefined }}>
          {energy}/{maxEnergy}
        </span>
      </HubRow>

      <div
        style={trough}
        role="meter"
        aria-valuenow={energy}
        aria-valuemin={0}
        aria-valuemax={maxEnergy}
        aria-label={t.burrow.energy}
      >
        {/* Hidden rather than zero-width: a 0% fill still paints its rounded
            cap, which reads as a sliver of charge in an empty tube. */}
        {pct > 0 && (
          <i
            style={{
              ...fill,
              width: `${pct * 100}%`,
              background: empty
                ? `linear-gradient(180deg, ${DANGER_TOP} 0%, ${DANGER_MID} 45%, ${DANGER_BOTTOM} 100%)`
                : `linear-gradient(180deg, ${FILL_TOP} 0%, ${FILL_MID} 45%, ${FILL_BOTTOM} 100%)`,
            }}
          />
        )}
      </div>

      {/* Hides on a short card like every other sub-line — but this one is
          the refill countdown, so losing it costs more than losing a rate. It
          is recoverable: the gauge still shows empty, and the energy popup
          (which a tap on an empty bar opens) states the wait in full. */}
      {note && (
        <p className={SUB_CLASS} style={{ ...subText, color: empty ? DANGER_TOP : undefined }}>
          {note}
        </p>
      )}
    </HubCard>
  );
}

/** The channel the fill sits in — inset, with its own rim, like the mock's. */
const trough: CSSProperties = {
  position: 'relative',
  /* 32% of the CARD's height in the mock (30px of 95); 42cqh is what lands on
     that, since `cqh` measures the padded content box. `cqh` and not `%`: a
     percentage resolves against the flex column, which is sized by its own
     contents, and that collapsed the trough to 4px. */
  height: '42cqh',
  borderRadius: 7,
  border: `2px solid ${RIM}`,
  background: TROUGH,
  overflow: 'hidden',
};

const fill: CSSProperties = {
  display: 'block',
  height: '100%',
  borderRadius: 3,
  // Stepped, not smooth: energy moves in whole points (a dig, a carrot), and
  // easing between them hides what a single dig cost.
  transition: 'width 120ms linear',
};
