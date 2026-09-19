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
 * IT IS A STONE RING NOW, not a cool grey slab (Paul, 2026-09-19). The face
 * was the codex's `PxButton` in `#2f2e2c`, chosen to say "chrome" rather than
 * "burrow furniture"; the mossy stone frames say the same thing better, by
 * being made of the island instead of being a darker shade of the app.
 *
 * Each button draws one of THREE rings, picked by hashing its label so the row
 * looks hand-laid without ever changing under the player — see `ringFor`. The
 * art carries its own rim, lit edge and cast shadow, which is why the kit's
 * button underneath it had to go rather than be tinted: two faces, one square
 * and one round, showed the square's corners on every side.
 *
 * It still drops in from above when it mounts (`.rr-ptf-drop`,
 * px-top-floor.css).
 */
import type { CSSProperties, ReactNode } from 'react';
import { PxPanel } from './px';
import { LeafBadge } from './leaf-badge';


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

/**
 * THE THREE STONE RINGS, from Paul's sheet of six (2026-09-19).
 *
 * Three rather than six because the corner only ever holds five buttons: with
 * six frames most would be unique anyway, and the point of the set is that the
 * row looks hand-laid rather than stamped. These three are the most DIFFERENT
 * of the six — measured by where the leaves sit, in quadrants: 1 is heavy
 * bottom-left (0.42), 2 is bottom-right (0.48), 3 is the balanced one with the
 * most foliage top-right (0.14). Picking three that happened to be adjacent on
 * the sheet would have given three near-identical rings.
 */
export const RING_URLS = [
  '/assets/ui/ring-1.webp',
  '/assets/ui/ring-2.webp',
  '/assets/ui/ring-3.webp',
] as const;

/**
 * WHICH RING A BUTTON WEARS — random-looking, but STABLE.
 *
 * Hashed from the button's own label, not `Math.random()`. A random draw would
 * be re-rolled on every render, so a ring would change while you looked at it:
 * the shop's frame would jump the moment its trap count ticked, and the story's
 * the moment a chapter opened. Hashing the label means each button keeps its
 * ring for good, the assignment still looks unplanned across the row, and the
 * server and the client agree on it — a `Math.random()` here would render one
 * ring in the HTML and a different one on hydration.
 */
function ringFor(label: string): string {
  /* FNV-1a, not the usual `h * 31 + c`. Four of the five labels in the corner
     start with "S" ("Shop", "Story", "Show the season board", "Sound
     settings"), and a `*31` hash weights the leading characters heavily enough
     that it handed Shop and Story — which sit side by side — the same ring, and
     never used ring 1 at all. FNV mixes each character into the whole word, and
     spreads these five labels across all three. */
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i += 1) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return RING_URLS[h % RING_URLS.length];
}

export function HubIconButton({
  children, label, count, badge: badgeText, tone = 'count', pressed, onClick,
}: HubIconButtonProps) {
  const corner = badgeText ?? (count && count > 0 ? (count > 99 ? '99+' : String(count)) : null);
  const ring = ringFor(label);
  return (
    <button
      type="button"
      className={`rr-hub-icon rr-ring-btn rr-ptf-drop${pressed ? ' is-pressed' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      /* THE STONE RING IS THE BUTTON'S FACE, so this is a plain <button> and
         no longer the kit's `PxButton`. Wearing both would stack two faces:
         the kit paints a bevelled square through a canvas nine-slice, and the
         ring would sit on top of it as a second, round object — the corners of
         the square would show past the circle on every side. The ring's art
         already carries its own rim, lit top edge and cast shadow, which is
         exactly what the kit's face was providing. */
      style={{ ...button, backgroundImage: `url(${ring})` }}
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
    </button>
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
  /* The ring is the face. `contain` because the art is square and must stay
     round: `cover` would crop the stones off at the narrow side. */
  backgroundSize: 'contain',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
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
