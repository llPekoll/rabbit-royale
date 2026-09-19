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
 *
 * THE CODEX'S BUTTON (`PxButton`), in that same cool grey: the rim is its
 * gloss, the cast shadow its bevel. It squashes on a press but does not
 * wiggle — a toolbar that shakes on every tap is noise. It drops in from above
 * when it mounts (`.rr-ptf-drop`, px-top-floor.css).
 */
import type { CSSProperties, ReactNode } from 'react';
import { PxButton, PxPanel } from './px';
import { LeafBadge } from './leaf-badge';

/* ── Sampled from the reference ────────────────────────────────────────── */
const FACE_TOP = '#3a3936';
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
    <PxButton
      type="button"
      className="rr-hub-icon rr-ptf-fill rr-ptf-drop"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      // Open reads as pressed: the cap sinks and the face takes the rim's
      // lighter grey, so the button does not appear to resize.
      pressed={pressed}
      color={pressed ? RIM : FACE_TOP}
      shadowColor={SHADOW}
      highlightColor={RIM}
      style={button}
    >
      <span style={glyph} aria-hidden>{children}</span>
      {/* THE NEWS BADGE IS THE PAINTED RED PILL (leaf-badge.tsx); the COUNT
          badge stays on the kit.

          Not a hedge: the sheet draws one badge and it is red, which is the
          "something new" tone. A standing count — traps in the shed, your rank
          — is deliberately quieter than that (see `tone` above), and painting
          it red would undo the distinction the two tones exist to make. */}
      {corner && tone === 'news' && (
        <LeafBadge height={18} style={badgeSeat}>
          {corner}
        </LeafBadge>
      )}
      {corner && tone !== 'news' && (
        <PxPanel color="#2a1810" style={{ ...badge, color: '#fde7bd' }}>
          {corner}
        </PxPanel>
      )}
    </PxButton>
  );
}

/**
 * 92x92 in the mock's 1376-wide window — stated as a share of the viewport for
 * the same reason everything else here is: on the Seeker (890x400) a 92px
 * square would be a quarter of the screen's height.
 */
const button: CSSProperties = {
  width: 'clamp(34px, 11svh, 68px)',
  height: 'clamp(34px, 11svh, 68px)',
  minWidth: 'clamp(34px, 11svh, 68px)',
  flexShrink: 0,
  padding: 0,
  pointerEvents: 'auto',
  letterSpacing: 'normal',
};

/**
 * A sprite in place of the emoji: the glyph's box, drawn pixelated. The shop
 * stall (33px) and the gold cup (16px) are both scaled to one height so the
 * row reads as a set; `width: auto` keeps each at its own aspect.
 */
export const hubIconArt: CSSProperties = {
  height: 'clamp(22px, 7.5svh, 46px)',
  width: 'auto',
  display: 'block',
  imageRendering: 'pixelated',
};

const glyph: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'clamp(16px, 5.5svh, 32px)',
  lineHeight: 1,
};

/**
 * Hangs off the top-right corner, like the launcher tiles' own badge — a
 * small pixel panel in the red (news) or in the chrome's dark and cream
 * (a standing number). Transparent to the pointer: the corner is still the
 * button's.
 */
/**
 * WHERE THE BADGE SITS, and nothing about how it looks.
 *
 * `LeafBadge` owns its own padding, minimum width and figure size — the pill's
 * geometry is what keeps its painted ends the right shape. Handing it the full
 * `badge` object below would override all three (a spread style wins) and
 * squash the art, so the painted badge gets only the corner placement.
 */
const badgeSeat: CSSProperties = {
  position: 'absolute',
  top: 'calc(-7px - var(--u))',
  right: -7,
  pointerEvents: 'none',
};

const badge: CSSProperties = {
  position: 'absolute',
  /* The content box starts one button-pixel down (`.rr-ptf-fill`); this puts
     the badge back on the button's own corner. */
  top: 'calc(-7px - var(--u))',
  right: -7,
  minWidth: 18,
  /* The game's chip inset — the same one the pill's rank badge and the loop
     bar's corner badges take. */
  padding: '2px var(--rr-pad-tight)',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 9,
  fontWeight: 400,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
  letterSpacing: 'normal',
  pointerEvents: 'none',
};
