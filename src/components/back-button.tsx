'use client';

/**
 * THE WAY BACK — one button, in one place, on every screen that needs one.
 *
 * Three screens had three different exits. Placement had the soil-coloured
 * GO FARM slab in the middle of the floor ("BACK"); a raid had a small grey
 * "Retreat" text button tucked inside its HUD; watching somebody else's run
 * had the island's big animated HOME arrow relabelled "Stop watching". Three
 * shapes for one idea meant finding the exit again on every screen. Now it is
 * always this: bottom-CENTRE, the soil slab, the kit's pixel arrow pointing
 * left, and a verb.
 *
 * Bottom-centre (Paul, 2026-09-16). It used to take the bottom-left corner so
 * the middle of the floor could stay with the screen's own controls — but that
 * put the one control every screen shares in the one place nothing else lives,
 * and it read as an afterthought. The kit row now stacks ABOVE it instead of
 * beside it (`--rr-back-h`), and the mute keeps its own corner.
 *
 * NOT the island's HOME. Leaving a run is the run's main action — it banks
 * the haul — so it keeps its big arrow in the middle of the floor.
 *
 * THE CODEX'S BUTTON (`PxButton`) in the burrow's soil: the lit lip it used to
 * stand on is its gloss, the shadow its bevel, and a press squashes it. No
 * wiggle — a way out is not a loud action.
 */
import type { CSSProperties } from 'react';
import { ARROW_URLS, ARROW_SIZE } from '@domin8/arcade-kit';
import { PxButton, pxLabel } from './px';

export interface BackButtonProps {
  /** The verb: "Back", "Retreat", "Stop watching". */
  label: string;
  onClick(): void;
  disabled?: boolean;
}

/* The burrow's own soil — the palette BACK already wore as a FarmButton tone. */
const FACE = '#5a3a24';
const LIP = '#8a5f3d';
const SHADOW = '#2a1810';
const OFF = '#4a3526';
const OFF_INK = '#a99483';

/** The arrow at a whole multiple of its sprite, about 24px tall: square pixels. */
const ARROW = ARROW_SIZE.left;
const ARROW_SCALE = Math.max(1, Math.floor(24 / ARROW.h));

export function BackButton({ label, onClick, disabled }: BackButtonProps) {
  return (
    <PxButton
      type="button"
      className="rr-back-btn"
      onClick={onClick}
      disabled={disabled}
      color={disabled ? OFF : FACE}
      shadowColor={SHADOW}
      highlightColor={disabled ? undefined : LIP}
      textColor={disabled ? OFF_INK : '#ffffff'}
      style={button}
    >
      <span style={row}>
        <img
          src={ARROW_URLS.left}
          alt=""
          aria-hidden
          draggable={false}
          width={ARROW.w * ARROW_SCALE}
          height={ARROW.h * ARROW_SCALE}
          style={arrow}
        />
        <span style={labelText}>{label}</span>
      </span>
    </PxButton>
  );
}

const button: CSSProperties = {
  /* Placed by `.rr-back-btn` (globals.css). The kit writes `position:
     relative` inline, which would drop the button into the flow. */
  position: 'fixed',
  /* A MINIMUM, not a height. The arrow is 25px of sprite and the uniform label
     pad is 24px of it, which is one pixel more than the 48px floor of the old
     fixed clamp could hold on the Seeker — the arrow was cropped. Sized by its
     contents against the same floor, the button keeps its touch target and can
     never crop what it holds. */
  height: 'auto',
  /* `--rr-back-h` (globals.css), because the placement kit row stacks on top
     of this button and has to know how tall it is. Stated in one place so the
     two can never disagree. */
  minHeight: 'var(--rr-back-h)',
  /* The same label air as every other button; it was 0/12/12/10 — no top air
     at all, and two different side insets. */
  padding: 'var(--rr-btn-pad)',
  pointerEvents: 'auto',
};

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  /* The one image-to-label gap. */
  gap: 'var(--rr-pad)',
};

const arrow: CSSProperties = {
  display: 'block',
  flexShrink: 0,
  imageRendering: 'pixelated',
};

const labelText: CSSProperties = {
  ...pxLabel,
  fontSize: 'clamp(13px, 2.8svh, 18px)',
  fontWeight: 400,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};
