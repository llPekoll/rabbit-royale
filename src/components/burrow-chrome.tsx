'use client';

/**
 * The burrow's chrome: one palette, one pixel, and the parts every panel builds
 * from.
 *
 * WHY THIS EXISTS. The burrow column was web UI wearing a pixel game's art —
 * 12px rounded cards, 8px rounded buttons, a CSS gradient meter — sitting on
 * top of a hand-drawn island. The hub solved the same problem with
 * `@domin8/arcade-kit`: nine-slice panels and buttons cut from real sprites, at
 * ONE pixel scale, so every control on screen belongs to the same machine.
 * This file is that decision applied to Rabbit Royale.
 *
 * THE PIXEL. `UI_PIXEL = 2` — two CSS px per source pixel, for every panel and
 * button the burrow draws. This is the hub's standard, and it is deliberately
 * not a per-component choice: the hub's own notes record what happened when it
 * was (a 10px bevel beside a 4px one read as two different products). A control
 * may be any size; its pixel does not scale with it.
 *
 * THE GROUND. Warm soil, not the hub's navy. The hub's palette file allows this
 * explicitly — a panel keeps its own colour when that colour does a job the
 * navy cannot — and the burrow is a PLACE (earth, lamplight), not a cabinet
 * screen. The shop already took this position and it reads correctly; this
 * makes it the rule for the whole column rather than one dialog's exception.
 * The lore codex keeps its parchment for the same reason: it is a scroll.
 */
import type { CSSProperties, ReactNode } from 'react';
import { NineSlicePanel, NineSliceButton, BitmapText } from '@domin8/arcade-kit';

/** Two CSS px per source pixel, everywhere in the burrow. See the header. */
export const UI_PIXEL = 2;

/* ── The soil palette ──────────────────────────────────────────────────────
   Sampled from the burrow art itself rather than invented beside it, which is
   the same rule the lore panel follows against `scroll.png`. */
export const SOIL = '#2a1810';        // the panel face — packed earth
export const SOIL_DEEP = '#1d100a';   // its underside / bevel
export const PLANK = '#4a2f1d';       // a raised block on the soil
export const CHALK = '#f5e6d3';       // body text — chalk on earth
export const CHALK_DIM = '#b39877';   // secondary text
export const CARROT = '#e07a2f';      // THE accent: the one thing worth having
export const CARROT_DEEP = '#a8521a';
export const DANGER = '#c1442e';      // only for real danger, never for chrome
export const LAMP = '#ffb238';        // lamplight — headings, live numbers

/**
 * A burrow card: the nine-slice panel plus the padding its contents need.
 *
 * Replaces `.rr-card`, whose 12px border-radius is the single most out-of-place
 * thing in a game drawn entirely in square pixels.
 */
export function BurrowCard({
  children, style,
}: { children: ReactNode; style?: CSSProperties }) {
  return (
    <NineSlicePanel color={SOIL} scale={UI_PIXEL} style={{ ...cardStyle, ...style }}>
      <div style={cardInner}>{children}</div>
    </NineSlicePanel>
  );
}

const cardStyle: CSSProperties = { width: '100%', marginBottom: 10 };
const cardInner: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '8px 10px',
  boxSizing: 'border-box',
  width: '100%',
};

/** A card's label/value line: name on the left, the number on the right. */
export function CardRow({
  label, value, tone = CHALK,
}: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div style={rowStyle}>
      <BitmapText scale={1.25} style={{ color: CHALK }}>{label}</BitmapText>
      <span style={{ color: tone, display: 'inline-flex', alignItems: 'center' }}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <BitmapText scale={1.25} style={{ color: tone }}>{String(value)}</BitmapText>
        ) : value}
      </span>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
};

/**
 * The card's fine print — the line that says what a number MEANS.
 *
 * Set in the pixel WEB font rather than `BitmapText`: these are sentences that
 * wrap ("Out of energy. Next in 4m."), and the fixed-cell atlas is built for
 * short labels. Same split the lore codex makes, for the same reason.
 */
export function CardNote({ children, tone = CHALK_DIM }: { children: ReactNode; tone?: string }) {
  return <p className="rr-pix-note" style={{ color: tone }}>{children}</p>;
}

/**
 * A burrow meter, drawn in the GAUGE SPRITES the energy bar already uses.
 *
 * The old `.rr-meter` was a CSS gradient in a rounded track — the one element
 * on screen with no pixels in it at all. These are the same nine-slice bar
 * sprites (`tools/gen_energy_bar.py`), so colour is a sprite SET, never a hex:
 * the palette lives in the art, which is the rule energy-bar.tsx established.
 */
export function BurrowMeter({
  value, max, tone = 'carrot', label,
}: { value: number; max: number; tone?: 'carrot' | 'warn' | 'danger'; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const FILL = '/assets/gauge/bar-fill';
  return (
    <div
      className="rr-pix-meter"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <i
        className="rr-pix-meter-fill"
        hidden={pct === 0}
        style={{
          // Snapped to whole source pixels — a fill ending mid-pixel renders
          // the crest as two half-lit columns, which pixel art never does.
          width: `round(down, (100% - 2 * var(--rr-gauge-wall)) * ${pct}, calc(1px * var(--rr-gauge-px)))`,
          background: `
            url('${FILL}-${tone}-cap.webp') right center / auto 100% no-repeat,
            url('${FILL}-${tone}-mid.webp') left center / auto 100% repeat-x`,
        }}
      />
    </div>
  );
}

/**
 * The burrow's action button — carrot-faced, the kit's nine-slice.
 *
 * `full` stretches it across the card, which is what Harvest and Upgrade want.
 */
export function BurrowButton({
  children, onClick, disabled, full = true, tone = CARROT, toneDeep = CARROT_DEEP,
}: {
  children: string;
  onClick?(): void;
  disabled?: boolean;
  full?: boolean;
  tone?: string;
  toneDeep?: string;
}) {
  return (
    <NineSliceButton
      color={disabled ? PLANK : tone}
      shadowColor={disabled ? SOIL_DEEP : toneDeep}
      scale={UI_PIXEL}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? '100%' : undefined,
        height: 34,
        opacity: disabled ? 0.55 : 1,
        pointerEvents: 'auto',
      }}
    >
      <BitmapText scale={1.25} style={{ color: disabled ? CHALK_DIM : SOIL_DEEP }}>
        {children}
      </BitmapText>
    </NineSliceButton>
  );
}

/**
 * A LAUNCHER TAB — the rail control the hub uses for SHOP and QUESTS.
 *
 * The defining move is the sprite: it is drawn LARGER than the tab and pulled
 * back with negative margins, so it overhangs the frame instead of sitting
 * inside it. The hub's note on this is the whole design rationale — "a sprite
 * that ends at the frame reads as a pictogram in a box, one that overhangs it
 * reads as an object lying ON the tab" — and the negative margins are what keep
 * the button at its shared height while the art is bigger than its content box.
 *
 * `count` is the optional chip on the right (unopened chests, chapters to read).
 * It is a FIXED square with the digit centred, not a box that hugs its content:
 * `BitmapText` trims each glyph to its ink, so "1" is 3 source px and "2" is 6 —
 * a hugging chip changes size and shifts as the count ticks up.
 */
export const TAB_HEIGHT = 38;

export function LauncherTab({
  sprite, art, spriteSize = 52, spriteHeight, label, sub, count, countTone = CARROT,
  onClick, ariaLabel, face = SOIL, faceDeep = SOIL_DEEP, ink = CARROT,
}: {
  /** A sprite URL, for art that is a still image. */
  sprite?: string;
  /**
   * ...or a rendered node, for art that animates itself (the loot chest is a
   * canvas playing its own shine). Takes precedence over `sprite`; the bleed
   * geometry below applies to either, so an animated mark overhangs the tab
   * exactly the way a still one does.
   */
  art?: ReactNode;
  /** Rendered WIDTH of the sprite. Larger than TAB_HEIGHT — that is the point. */
  spriteSize?: number;
  /**
   * The art's rendered HEIGHT, when it is not square.
   *
   * The bleed below centres the art on the tab, and it needs the height to do
   * that. A square sprite (the scroll) can infer it from the width; the loot
   * chest cannot — it is 23x14, so a 52px-wide chest is 32px tall, and using
   * the width made the maths pull it far below the tab's middle.
   */
  spriteHeight?: number;
  label: string;
  /** A second, dimmer line under the label (state, not decoration). */
  sub?: string;
  count?: number;
  countTone?: string;
  onClick?(): void;
  ariaLabel?: string;
  face?: string;
  faceDeep?: string;
  ink?: string;
}) {
  // How far the art hangs past the tab, top and bottom. Negative margins of
  // exactly this much keep the BUTTON at TAB_HEIGHT while the sprite is taller.
  // Measured off the art's real HEIGHT: a non-square mark (the 23x14 chest) is
  // much shorter than it is wide, and bleeding by its width shoved it below
  // the tab instead of centring it on the row.
  const artH = spriteHeight ?? spriteSize;
  const bleed = Math.max(0, Math.round((artH - TAB_HEIGHT) / 2));
  return (
    <NineSliceButton
      color={face}
      shadowColor={faceDeep}
      scale={UI_PIXEL}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      style={{
        width: '100%',
        height: TAB_HEIGHT,
        marginBottom: 10,
        justifyContent: 'flex-start',
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={tabInner}>
        <span
          style={{
            display: 'block',
            // Vertical bleed is generous, horizontal is not: the tab sits in a
            // column and art reaching left crowds the frame it lies on.
            margin: `-${bleed}px 4px -${bleed}px -6px`,
            flexShrink: 0,
            pointerEvents: 'none',
            lineHeight: 0,
          }}
        >
          {art ?? (
            <img
              className="pixelated"
              src={sprite}
              alt=""
              aria-hidden
              style={{ width: spriteSize, height: 'auto', display: 'block' }}
            />
          )}
        </span>
        <span style={tabText}>
          <BitmapText scale={1.25} style={{ color: ink }}>{label}</BitmapText>
          {sub && (
            <BitmapText scale={1} style={{ color: CHALK_DIM }}>{sub}</BitmapText>
          )}
        </span>
        <span style={tabSpacer} />
        {count !== undefined && count > 0 && (
          <span style={{ ...countChip, background: countTone }}>
            <BitmapText scale={1} style={{ color: SOIL_DEEP }}>{String(count)}</BitmapText>
          </span>
        )}
      </span>
    </NineSliceButton>
  );
}

const tabInner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  paddingInline: '0.4rem',
  width: '100%',
  boxSizing: 'border-box',
};

/**
 * The label block hugs the sprite instead of taking the row's slack.
 *
 * The hub gives its tabs a fixed shared width because they stack in a narrow
 * rail where two different widths read as a mistake. The burrow's column is
 * wider than these tabs need, so inheriting that rule stranded the label
 * halfway across an empty tab with the sprite marooned at the far left. The
 * slack belongs AFTER the text, not between the art and its own label.
 */
const tabText: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 1,
  minWidth: 0,
  lineHeight: 0,
};

/** Eats the leftover width, so the count chip stays pinned to the right. */
const tabSpacer: CSSProperties = { flex: 1, minWidth: 8 };

const countChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 16,
  height: 14,
  boxSizing: 'border-box',
  paddingInline: 2,
  lineHeight: 0,
  border: `1px solid ${CARROT_DEEP}`,
  flexShrink: 0,
};
