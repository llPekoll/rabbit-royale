'use client';

/**
 * THE WAY BACK — one button, in one place, on every screen that needs one.
 *
 * Three screens had three different exits. Placement had the soil-coloured
 * GO FARM slab in the middle of the floor ("BACK"); a raid had a small grey
 * "Retreat" text button tucked inside its HUD; watching somebody else's run
 * had the island's big animated HOME arrow relabelled "Stop watching". Three
 * shapes for one idea meant finding the exit again on every screen. Now it is
 * always this: bottom-LEFT, the soil slab, the kit's pixel arrow pointing
 * left, and a verb.
 *
 * Bottom-left because the middle of the floor belongs to the screen's own
 * controls (the kit, while placing) and the bottom-right corner to the mute.
 *
 * NOT the island's HOME. Leaving a run is the run's main action — it banks
 * the haul — so it keeps its big arrow in the middle of the floor.
 *
 * The same plinth trick as the loop bar's slabs: the button's background is
 * the lit lip, the face covers all but its bottom 4px, and a press sinks the
 * face into it (`.rr-back-btn:active .rr-back-face` in globals.css).
 */
import type { CSSProperties } from 'react';
import { ARROW_URLS, ARROW_SIZE } from '@domin8/arcade-kit';

export interface BackButtonProps {
  /** The verb: "Back", "Retreat", "Stop watching". */
  label: string;
  onClick(): void;
  disabled?: boolean;
}

/* The burrow's own soil — the palette BACK already wore as a FarmButton tone. */
const FACE = '#5a3a24';
const FACE_LIT = '#6d4830';
const LIP = '#8a5f3d';
const SHADOW = '#2a1810';
const OFF = '#4a3526';
const OFF_INK = '#a99483';

/** The arrow at a whole multiple of its sprite, about 24px tall: square pixels. */
const ARROW = ARROW_SIZE.left;
const ARROW_SCALE = Math.max(1, Math.floor(24 / ARROW.h));

export function BackButton({ label, onClick, disabled }: BackButtonProps) {
  return (
    <button
      type="button"
      className="rr-back-btn"
      onClick={onClick}
      disabled={disabled}
      style={{ ...button, background: disabled ? SHADOW : LIP }}
    >
      <span
        className="rr-back-face"
        style={{
          ...face,
          background: disabled ? OFF : `linear-gradient(180deg, ${FACE_LIT} 0%, ${FACE} 100%)`,
          color: disabled ? OFF_INK : '#ffffff',
          boxShadow: `inset 0 -3px 0 ${SHADOW}`,
        }}
      >
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
    </button>
  );
}

const button: CSSProperties = {
  display: 'block',
  // The lip shows only along the bottom: the face covers the rest of it.
  padding: '0 0 4px',
  height: 'clamp(48px, 9svh, 64px)',
  boxSizing: 'border-box',
  border: 'none',
  borderRadius: 12,
  overflow: 'hidden',
  pointerEvents: 'auto',
};

const face: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  height: '100%',
  padding: '0 18px 0 14px',
  boxSizing: 'border-box',
  borderRadius: 12,
  transition: 'transform 90ms ease-out',
};

const arrow: CSSProperties = {
  display: 'block',
  flexShrink: 0,
  imageRendering: 'pixelated',
};

const labelText: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(13px, 2.8svh, 18px)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};
