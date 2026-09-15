'use client';

/**
 * A SQUARE CHROME BUTTON for the top-right corner — settings, the season board.
 *
 * WHAT IT REPLACES. The season board opened from `.rr-lb-tab`: a half-pill
 * welded to the right edge at 42% height, which slid sideways with the panel.
 * That works, but it is a control with no siblings — nothing else on the screen
 * looks like it — and it sits in the middle of the right edge where nothing
 * else lives. The mock puts the board's door in the TOP-RIGHT corner beside a
 * settings button, as a pair of square slabs. Two controls of one shape in one
 * corner read as a toolbar; one lozenge halfway down an edge reads as a tab
 * somebody forgot to style.
 *
 * DARKER AND COOLER THAN THE BURROW'S PANELS. Sampled off the mock: `#2f2e2c`
 * against the cards' warm `#2a180e`. That is deliberate in the reference and
 * worth keeping — these are the CHROME (settings, standings), not the burrow's
 * own furniture, and the colour is what says so before the icon does.
 */
import type { CSSProperties, ReactNode } from 'react';

/* ── Sampled from the reference ────────────────────────────────────────── */
const FACE_TOP = '#3a3936';
const FACE_BOTTOM = '#24231f';
/** The lit top edge — these slabs catch light the way the cards' rims do. */
const RIM = '#4e5158';
const SHADOW = '#121210';
/** The badge: the same saturated red the launcher tiles use, for one reason. */
const BADGE = '#e62132';

export interface HubIconButtonProps {
  /** The glyph. An emoji or a sprite — whatever the caller has. */
  children: ReactNode;
  label: string;
  /** Optional count. Absent or 0 draws nothing: a "0" badge notifies of nothing. */
  count?: number;
  /** What the corner says instead of a bare count ("#59", "NEW"). Wins over `count`. */
  badge?: string | null;
  /**
   * RED MEANS NEWS. `news` is something that happened, which opening the
   * button will show you (a chapter just opened) — the saturated red dot.
   * `count` (the default) is a standing number (traps in the shed, your rank):
   * a quiet chip. Every corner used to be red, so the trophy's rank, the
   * shed's trap count and a real new chapter all read as "something new in
   * here" — and opening them found nothing marked new, which read as broken.
   */
  tone?: 'news' | 'count';
  /** Pressed state, for a button that toggles something open. */
  pressed?: boolean;
  onClick?(): void;
}

export function HubIconButton({
  children, label, count, badge: badgeText, tone = 'count', pressed, onClick,
}: HubIconButtonProps) {
  const corner = badgeText ?? (count && count > 0 ? (count > 99 ? '99+' : String(count)) : null);
  return (
    <button
      type="button"
      className="rr-hub-icon"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      style={{
        ...button,
        // Open reads as pressed: the face lifts rather than the border
        // changing, so the button does not appear to resize.
        background: pressed
          ? `linear-gradient(180deg, ${RIM} 0%, ${FACE_TOP} 100%)`
          : `linear-gradient(180deg, ${FACE_TOP} 0%, ${FACE_BOTTOM} 100%)`,
      }}
    >
      <span style={glyph} aria-hidden>{children}</span>
      {corner && (
        <span style={tone === 'news' ? badge : countChip} aria-hidden>{corner}</span>
      )}
    </button>
  );
}

/**
 * 92x92 in the mock's 1376-wide window — stated as a share of the viewport for
 * the same reason everything else here is: on the Seeker (890x400) a 92px
 * square would be a quarter of the screen's height.
 */
const button: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'clamp(34px, 11svh, 68px)',
  height: 'clamp(34px, 11svh, 68px)',
  flexShrink: 0,
  padding: 0,
  border: `2px solid ${RIM}`,
  borderRadius: 12,
  boxShadow: `0 3px 0 ${SHADOW}`,
  pointerEvents: 'auto',
};

const glyph: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'clamp(16px, 5.5svh, 32px)',
  lineHeight: 1,
};

/** Hangs off the top-right corner, like the launcher tiles' own badge. */
const badge: CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  minWidth: 18,
  height: 18,
  paddingInline: 4,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 9,
  background: BADGE,
  color: '#ffffff',
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 9,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
  border: '2px solid #ddccbc',
};

/** A standing number, not news: the same corner, in the chrome's own dark and cream. */
const countChip: CSSProperties = {
  ...badge,
  background: '#2a1810',
  color: '#fde7bd',
  border: '2px solid #6b4526',
};
