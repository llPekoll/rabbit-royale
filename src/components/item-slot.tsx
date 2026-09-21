'use client';

/**
 * ONE INVENTORY SLOT: a square, the thing's picture, and a count in the corner.
 *
 * The shape an item has everywhere in this game that is not the shop's stall —
 * a bordered square rather than the hub cards' rounded slab, because that is
 * what a slot looks like, and because the border is what can carry a LIVE state
 * without needing a second element for it.
 *
 * Written once here and used twice: the garden card's two bottles, and the kit
 * row's seven. They were the same forty lines with different constants, which
 * is the shape that drifts the first time one of them is retuned.
 *
 * THREE STATES, and the middle one is the reason this is not a plain button:
 *
 *  - EMPTY: nothing held, nothing running. Dimmed, NOT hidden. An item you
 *    cannot see is an item you do not know exists, and several of these only
 *    ever arrive from a chest — a player who has never opened the right one has
 *    no idea what the drop was for. Same argument the shop's shelf makes for
 *    listing what you cannot afford.
 *  - RUNNING: a window is open (a shield holding, a smoke screen up). Ringed in
 *    lamplight, and the corner says how long is left — for most of these that
 *    is the only place in the game the fact appears.
 *  - HELD: the corner carries the count.
 *
 * THE HIT AREA IS BIGGER THAN THE SQUARE. The visible slot is sized by the row
 * that holds it — inside a hub card that is ~26px, well under the 44px floor
 * globals.css puts under every button ("anything a thumb hits is at least
 * 44px"). The square cannot simply BE 44px: two of them beside HARVEST burst
 * the garden card on the Seeker, where the whole card is 58px tall. So the
 * picture is the size the card can hold and an invisible span carries the rest
 * of the target, overflowing the square on every side.
 */
import type { CSSProperties, ReactNode } from 'react';
import { PX, PxButton, PxPanel } from './px';

/** A live window's ring — the lamplight the burrow uses for things running. */
export const SLOT_LIVE = '#ffb238';
/** An empty slot's edge: present, legible, plainly not pressable. */
export const SLOT_OFF = '#4a2f1d';
/** A held count's chip — the carrot the rest of the column uses for counts. */
export const SLOT_CHIP = '#e4762b';
/** The square's ground — packed soil. */
const SLOT_FACE = '#2a1810';
/** Its bevel: the soil's underside. */
const SLOT_BEVEL = '#1d100a';

/** A pixel ring in lamplight that follows the button's stepped silhouette. */
const LIVE_RING = [`${PX} 0`, `calc(-1 * ${PX}) 0`, `0 ${PX}`, `0 calc(-1 * ${PX})`]
  .map((o) => `drop-shadow(${o} 0 ${SLOT_LIVE})`)
  .join(' ');

export interface ItemSlotProps {
  /** The sprite, when the game has one for this thing. */
  art?: string;
  /** Its width over its height, so a non-square sprite is never stretched. */
  aspect?: number;
  /** Shown when there is no sprite — see `ITEM_META`'s note on coverage. */
  fallback?: ReactNode;
  /** What the corner says, or null for a slot with nothing to report. */
  chip?: string | null;
  /** Ring it in lamplight and light the chip: something is RUNNING. */
  live?: boolean;
  /** Full opacity even with nothing held — for a slot that is merely idle. */
  lit?: boolean;
  /** What a screen reader is told. The button's content is a picture. */
  label: string;
  /** Omitted, the slot is a read-only indicator rather than a control. */
  onClick?(): void;
  disabled?: boolean;
}

export function ItemSlot({
  art, aspect = 1, fallback, chip, live, lit, label, onClick, disabled,
}: ItemSlotProps) {
  const pressable = !!onClick && !disabled;
  // Nothing held, nothing running, nothing to press: the art fades, the square
  // does not. See the note on `opacity` below.
  const dim = !pressable && !live && !lit;

  return (
    /* THE CODEX'S BUTTON (`PxButton`) in the soil the square always had. Its
       old border is now its gloss — lamplight when a window is running, the
       plank edge otherwise — and a running slot also takes a pixel ring
       (`filter`) following the button's stepped silhouette, because the gloss
       alone is too quiet for the one place the fact appears. A slot with
       nothing to press sits SUNK (`pressed`): a recess, not a key. */
    <PxButton
      type="button"
      className="rr-item-slot rr-ptf-fill"
      onClick={pressable ? onClick : undefined}
      disabled={!pressable}
      pressed={!pressable}
      aria-label={label}
      title={label}
      color={SLOT_FACE}
      shadowColor={SLOT_BEVEL}
      highlightColor={live ? SLOT_LIVE : SLOT_OFF}
      style={{
        ...slotButton,
        /* As a variable, not a `filter`: the sheet composes it with the cast
           shadow every menu element throws, and swaps that cast on the press
           (px-top-floor.css, `.rr-item-slot`). An inline `filter` would have
           replaced both. */
        ['--rr-live-ring' as string]: live ? LIVE_RING : undefined,
        /* DIMMED BY ITS CONTENTS, NOT BY ITS OPACITY.
           `button:disabled { opacity: 0.5 }` in globals.css is right for a
           slab on a panel and wrong here: these squares sit over the island,
           so a faded slot let the WATER through and an empty one came out
           pale blue — lighter than its lit neighbours, which is the exact
           opposite of what "you have none" should look like. (The launcher
           tiles opt out of the same rule, for the same reason, a few lines
           further down that file.) So the square keeps its opaque ground and
           the ART fades instead. The kit's own disabled grey is lifted in
           px-top-floor.css for the same reason. */
        opacity: 1,
        // A read-only slot must not wear the denied cursor: it is not refusing
        // a press, it was never a control.
        cursor: pressable ? 'pointer' : 'default',
      }}
    >
      {/* The thumb's target, which overflows the square. See the header. */}
      <span aria-hidden style={hitArea} />
      {art ? (
        <img
          className="pixelated"
          src={art}
          alt=""
          aria-hidden
          style={{
            ...slotArt,
            width: `calc(var(--rr-slot) * 0.56 * ${aspect})`,
            opacity: dim ? 0.4 : 1,
          }}
        />
      ) : (
        <span aria-hidden style={{ ...slotGlyph, opacity: dim ? 0.4 : 1 }}>
          {fallback}
        </span>
      )}
      {chip && (
        <PxPanel color={live ? SLOT_LIVE : SLOT_CHIP} className="rr-slot-chip" style={slotChip}>
          {chip}
        </PxPanel>
      )}
    </PxButton>
  );
}

const slotButton: CSSProperties = {
  position: 'relative',
  width: 'var(--rr-slot)',
  height: 'var(--rr-slot)',
  /* BOTH floors restated, and this is load-bearing: `button { min-height: 44px;
     min-width: 44px }` in globals.css would otherwise make the square a 44xN
     RECTANGLE — the height is a share of its row, the width would be the global
     floor. Stating both is what keeps the two sides equal; the lost touch area
     comes back as `hitArea`. */
  minWidth: 'var(--rr-slot)',
  minHeight: 'var(--rr-slot)',
  maxWidth: 'var(--rr-slot)',
  /* `flex: none`, not `flexShrink: 0`. Shrink alone leaves `flex-basis` at
     `auto`, and the row's leftover space still went to the item with the larger
     basis — which stretched the squares into rectangles. `none` pins grow AND
     shrink. */
  flex: 'none',
  alignSelf: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  letterSpacing: 'normal',
  /* The slots sit inside a container the HUD lays over the canvas, which turns
     pointer events off wholesale; anything that wants presses turns them on. */
  pointerEvents: 'auto',
};

/** See the header: the thumb's target, not the eye's. */
const hitArea: CSSProperties = {
  position: 'absolute',
  // Half the shortfall on each side, against the 44px floor. Clamped at 0 so a
  // slot already at or above 44px does not grow a NEGATIVE inset and spill.
  inset: 'min(0px, calc((44px - var(--rr-slot)) / -2))',
  pointerEvents: 'auto',
};

const slotArt: CSSProperties = {
  // Height is the constraint (the square is the square); the width follows the
  // art's own aspect so nothing is stretched — the same rule
  // `chest-prize.tsx` applies to the identical files.
  // 0.56, not the old bordered square's 0.66: the pixel frame and the bevel
  // take more of the square than a 2px border did.
  height: 'calc(var(--rr-slot) * 0.56)',
  display: 'block',
};

/** The emoji stand-in, for the kinds the game has no sprite for. */
const slotGlyph: CSSProperties = {
  fontSize: 'calc(var(--rr-slot) * 0.44)',
  lineHeight: 1,
  // Emoji ignore `color`, so nothing here tints it; the square around it is
  // what carries the state.
  display: 'block',
};

/**
 * The corner chip: how many, or how long.
 *
 * Pinned OUTSIDE the square's bottom-right rather than inside it. Inside, on a
 * 26px slot, it covered the very picture that says which item this is.
 */
const slotChip: CSSProperties = {
  position: 'absolute',
  right: -4,
  // The content box stops above the bevel (`.rr-ptf-fill`); this reaches back
  // past it to the square's own bottom edge.
  bottom: 'calc(-4px - var(--u) * 4)',
  minWidth: 11,
  /* The game's chip inset. Vertically 2px is all an 8px glyph can spare; the
     tight pad each side is what every other chip in the game takes. */
  padding: '2px var(--rr-pad-tight)',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 8,
  fontWeight: 400,
  lineHeight: 1,
  color: '#2a1810',
  fontVariantNumeric: 'tabular-nums',
  pointerEvents: 'none',
};
