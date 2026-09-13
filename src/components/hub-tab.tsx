'use client';

/**
 * THE LAUNCHER TILE — one of the four doors along the bottom of the burrow.
 *
 * WHAT IT REPLACES. `LauncherTab` (burrow-chrome.tsx) is a WIDE row: a sprite
 * overhanging a nine-slice bar, a label, a second dim line of state, and a
 * count chip at the far right. Four of them stacked ate most of the left
 * column — the column that also has to hold energy, the garden and the burrow.
 * The mock puts the same four doors in a ROW of square tiles at the bottom
 * corner, which costs one row instead of four and leaves the board visible.
 *
 * WHAT IS LOST, AND WHY THAT IS THE POINT. A tile has no room for the `sub`
 * line ("0 IN THE SHED", "2/8 IN THE GROUND"). That line is not free: it is
 * four sentences of state permanently on screen, and the mock's answer — a
 * count badge when there is something to report, nothing when there is not —
 * says the same thing in a glyph. The tile keeps the badge and drops the
 * prose. Where the state was genuinely load-bearing it moved INTO the badge
 * (see each caller); where it was only reassurance it is gone on purpose.
 *
 * COLOURS ARE MEASURED. Sampled off the reference: the tiles are a warmer,
 * lighter brown than the cards above them (#3c3226 against the card's
 * #2d1610), which is what makes the row read as a different KIND of thing —
 * doors, not readouts.
 */
import type { CSSProperties, ReactNode } from 'react';

/* ── Sampled from the reference ────────────────────────────────────────── */
/** The tile's face — warmer and lighter than a card's. */
const FACE_TOP = '#4a3d2e';
const FACE_BOTTOM = '#332619';
/** Its cast shadow: what makes the tile an object lying on the water. */
const SHADOW = '#1b1009';
/** The label under the art. Cream, the same ink the cards use for a value. */
const INK = '#e9dabd';
/** Spent/unavailable: the tile is still there, its light is not. Lifted from
 *  #8a7a68, which was 4.1:1 at 7px — dim should still be readable. */
const INK_OFF = '#a8977f';
/** ...and its face goes flatter and darker, never more transparent. */
const FACE_OFF_TOP = '#2f2820';
const FACE_OFF_BOTTOM = '#221b14';
/** The badge — the one saturated red in the UI, so it can only mean "look". */
const BADGE = '#e62132';
const BADGE_INK = '#ffffff';

export interface HubTabProps {
  /** The tile's art: a sprite URL, or a node for art that animates itself. */
  sprite?: string;
  art?: ReactNode;
  label: string;
  /**
   * The badge's number. Absent or 0 draws nothing — a badge reading "0" is a
   * notification that there is nothing to notify.
   */
  count?: number;
  /**
   * Dims the tile without removing it. A door that cannot be opened right now
   * is still a door, and hiding it would make the row's shape change under
   * the player.
   */
  disabled?: boolean;
  /**
   * Looks like `disabled` but still answers a tap — for a door whose own job
   * is not available yet but which can send the player to what unlocks it.
   */
  muted?: boolean;
  onClick?(): void;
  ariaLabel?: string;
}

export function HubTab({
  sprite, art, label, count, disabled, muted, onClick, ariaLabel,
}: HubTabProps) {
  const showBadge = !!count && count > 0;
  const off = disabled || muted;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      /* A disabled tile keeps its FACE and loses its light.
         `opacity` was the first cut and it was wrong here: these tiles sit on
         bright water, so fading the whole button let the sea through and the
         dimmed tile came out blue — lighter than its neighbours instead of
         darker. Dimming the face and the ink separately keeps the row's four
         squares the same object in two states. */
      className="rr-hub-tab"
      style={{
        ...tile,
        background: off
          ? `linear-gradient(180deg, ${FACE_OFF_TOP} 0%, ${FACE_OFF_BOTTOM} 100%)`
          : `linear-gradient(180deg, ${FACE_TOP} 0%, ${FACE_BOTTOM} 100%)`,
      }}
    >
      <span style={{ ...artBox, opacity: off ? 0.45 : 1 }}>
        {art ?? <img className="pixelated" src={sprite} alt="" aria-hidden style={spriteStyle} />}
      </span>
      <span style={{ ...labelText, color: off ? INK_OFF : INK }}>{label}</span>

      {showBadge && (
        <span style={badge}>
          {/* Over 99 the digits stop being readable at this size and the badge
              stops being a glyph, so it says "lots" instead of a number. */}
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

/**
 * A square tile — 95x95 in the mock, at a 4-across row.
 *
 * `position: relative` so the badge can hang off its corner; `overflow` stays
 * VISIBLE for the same reason, which is why the badge is drawn last.
 */
const tile: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  /* Square, sharing the row's width with three others — but capped by the
     VIEWPORT's height, which is what keeps the row on screen.
     The mock's tiles are 95px of a 768-tall window (12.4%). Left as a pure
     `aspect-ratio: 1` against a ~400px-wide column, each tile came out ~95px
     tall whatever the window was, and on the Seeker (400px tall) the four of
     them plus three cards ran 137px past the bottom of the screen. */
  /* Square, and sized from the VIEWPORT's height so four of them always fit
     the floor: the mock's tiles are 95px of a 768-tall window (12.4%). The row
     is `fit-content`, so the tiles state their own size rather than dividing a
     width — which is what lets the row's box stop where the tiles do. */
  // `--rr-tile` is set only on an upright phone, where the height-based size
  // runs the row off the screen — see globals.css.
  width: 'var(--rr-tile, 12.4svh)',
  height: 'var(--rr-tile, 12.4svh)',
  minWidth: 44,
  minHeight: 44,
  flexShrink: 0,
  padding: 4,
  boxSizing: 'border-box',
  border: 'none',
  borderRadius: 12,
  background: `linear-gradient(180deg, ${FACE_TOP} 0%, ${FACE_BOTTOM} 100%)`,
  boxShadow: `0 3px 0 ${SHADOW}`,
  pointerEvents: 'auto',
  /* NO `cursor` here, deliberately.
     The game ships pixel-art cursors as CSS variables (`--cur-hand`, and
     `--cur-denied` for a dead control), applied to `button` and
     `button:disabled` in globals.css. An inline `cursor: 'pointer'` is a style
     attribute and beats those rules outright — every button written that way
     dropped back to the OS arrow the moment the pointer left the Pixi canvas,
     which is exactly how it was spotted. Let the stylesheet do it. */
};

/**
 * The art's box, sized as a SHARE of the tile.
 *
 * Fixed pixels would break the row: the four tiles divide whatever width the
 * column has, so on a narrow phone they are much smaller than on desktop and a
 * 44px sprite would overflow a 60px tile.
 */
const artBox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // 58% of the tile, measured off the mock (the shield's art is 55px in a 95px
  // tile). The first cut used 52% and, with the tile's padding and the gap
  // under it, left the art visibly adrift in the square — the mock's marks
  // nearly fill their tiles, which is what makes them read as objects.
  height: '58%',
  width: '100%',
  lineHeight: 0,
};

/**
 * The sprite FILLS the art box rather than merely fitting inside it.
 *
 * `max-height: 100%` with `height: auto` — the first cut — only ever shrinks:
 * a 32px source in a 55px box stayed 32px, so every mark rendered at a third
 * of the tile instead of the mock's 58% and the row read as icons floating in
 * empty squares. `height: 100%` with `width: auto` scales UP as well, and
 * `object-fit: contain` keeps a non-square source (the 30x31 scroll, the
 * chest) from stretching.
 */
const spriteStyle: CSSProperties = {
  height: '100%',
  width: 'auto',
  maxWidth: '100%',
  objectFit: 'contain',
  display: 'block',
};

const labelText: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  /* 11px of cap height in a 95px tile in the mock ≈ 12%. Expressed against
     the ROW's width (`cqw`) so it shrinks with the tiles on a phone rather
     than overflowing the square, but with a floor that keeps it legible and a
     ceiling that stops it crowding the art on a wide column. */
  /* Against the ROW's width (`cqw`) so it tracks the tiles, with a floor low
     enough that the longest label ("RAIDING") still fits a Seeker-sized tile.
     At 2.9cqw it was 12px there and "RAIDING"/"STORY" both ellipsised. */
  // Upright phones get a larger floor (`--rr-tile-label`): their tiles are
  // 80-90px, and 7px there was the smallest text on the screen.
  fontSize: 'var(--rr-tile-label, clamp(7px, 2.2cqw, 12px))',
  letterSpacing: '0.02em',
  lineHeight: 1,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};

/**
 * The count badge, hanging off the top-right corner.
 *
 * A fixed-size circle rather than one that hugs its digits: a badge that
 * changes width as the count ticks 9 -> 10 makes the whole row appear to
 * shift, which is the same reasoning `LauncherTab`'s chip already carried.
 */
const badge: CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  minWidth: 20,
  height: 20,
  paddingInline: 4,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  background: BADGE,
  color: BADGE_INK,
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 10,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
  // The same bone rim the cards carry, so the badge reads as part of this UI
  // rather than as a web notification dot.
  border: '2px solid #ddccbc',
};

/**
 * The row the four tiles sit in.
 *
 * A container query context, so a tile's label can size itself against the
 * ROW's width (`cqw`) — which is what makes the text shrink on a phone instead
 * of overflowing its square.
 */
export function HubTabRow({ children }: { children: ReactNode }) {
  return <div className="rr-hub-row" style={row}>{children}</div>;
}

/**
 * PINNED TO THE FLOOR, not stacked under the cards.
 *
 * In the mock the four tiles sit in the bottom-left corner with 218px of open
 * water between them and the last card — they are the screen's furniture, not
 * the column's last row. Leaving them inside the scrolling column looked right
 * on a desktop window and broke on the Seeker: the column's content ran 467px
 * into 228 of visible height, so the row fell below the fold where
 * `elementFromPoint` returned the game's canvas — the four doors were not just
 * out of sight but DEAD.
 *
 * `fixed`, so it is anchored to the viewport rather than to a scroll box, and
 * placed by globals.css alongside the mute it shares the corner with.
 */
const row: CSSProperties = {
  display: 'flex',
  gap: 8,
  containerType: 'inline-size',
  // The badges hang above the tiles; without room the row clips them against
  // whatever sits over it.
  paddingTop: 8,
  pointerEvents: 'auto',
};
