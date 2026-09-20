'use client';

/**
 * THE NOTIFICATION BADGE AND THE CLOSE BUTTON — the leaf frame's two small
 * companions, from Paul's second sheet (2026-09-19).
 *
 * They come from the same reference and they are NOT built the same way, and
 * the difference is the whole content of this file.
 *
 * THE BADGE IS A 9-SLICE. It has to hold "1", "12" and "99+"
 * (hub-icon-button.tsx caps it there), so it must widen from a circle to a
 * capsule while its rounded ends keep their shape. That is exactly what a
 * 9-slice is for.
 *
 * THE CLOSE BUTTON IS NOT. Its X is painted into the art and spans almost the
 * whole sprite, so there is no band to stretch that does not cut through the
 * glyph. A close button is always the same size anyway, so it is a FIXED
 * SPRITE: one image, three states, no stretching.
 *
 * The knob was REDRAWN (2026-09-20, "change de croix celle la est bugger"):
 * the sheet's version was a dark rounded square at 82x76, and that odd ratio
 * letterboxed inside the 44px hit box — a resampled rim, which is the "bug"
 * you could see. It is now a round wooden knob drawn square on the pixel
 * grid, in the kit's own palette (tools/draw-close.py).
 *
 * WHAT THE ART NEEDED BEFORE IT COULD BE SLICED.
 *
 * The sheet draws its slice guides ON the sprites as dashed white lines, so
 * they are part of the JPEG. They were rebuilt out of the badge by
 * interpolating each guide band from the clean columns and rows on either side
 * (residual deviation: 1.2-2.5 of 255, under 1%). The same pass on the close
 * button ATE THE X — the glyph is the same brightness as the guides — which is
 * the other reason that one is taken from the clean "Default" state chip at the
 * bottom of the sheet instead.
 *
 * Then the badge's middle band was flattened to its own median column and the
 * corners were ramped into it. Without that the art has a specular highlight
 * that ends abruptly at x=115, and stretching across it printed a visible notch
 * at the top of every wide badge (measured seam jumps of 19-25/255; they are
 * 0 now).
 */
import type { CSSProperties, ReactNode } from 'react';

/* ── The notification badge ─────────────────────────────────────────────── */

export const BADGE_URL = '/assets/ui/badge.webp';
/** The art's own size, after the guides were rebuilt out of it. */
export const BADGE_SIZE = { width: 157, height: 151 } as const;

/**
 * The slice, in source pixels. The sides are FATTER than the corner radius
 * (which measures ~16-22px): the cut has to clear the glossy highlight, which
 * runs to x=115, or the stretch smears it. 44 puts it past the end.
 */
export const BADGE_SLICE = { x: 44, y: 38 } as const;

export interface LeafBadgeProps {
  /** What the badge says: a count, "99+", "NEW", "!". */
  children?: ReactNode;
  /**
   * How tall to draw it, in CSS px. Everything scales off this, so the pill
   * keeps its shape; the width follows the content.
   */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The red pill. It sizes itself to its content: one digit draws a circle, three
 * draw a capsule, and the ends are the same art either way.
 */
export function LeafBadge({ children, height = 22, className, style }: LeafBadgeProps) {
  /* The art is 151 tall and the badge is drawn at `height`, so everything is
     in that ratio — including the slice, which is in source pixels. */
  const scale = height / BADGE_SIZE.height;
  const padX = Math.max(6, Math.round(BADGE_SLICE.x * scale * 0.62));

  return (
    <span
      className={`rr-leaf-badge${className ? ` ${className}` : ''}`}
      style={{
        borderImageSource: `url(${BADGE_URL})`,
        borderImageSlice: `${BADGE_SLICE.y} ${BADGE_SLICE.x} fill`,
        borderImageWidth: `${BADGE_SLICE.y * scale}px ${BADGE_SLICE.x * scale}px`,
        borderImageRepeat: 'stretch',
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderWidth: `${BADGE_SLICE.y * scale}px ${BADGE_SLICE.x * scale}px`,
        boxSizing: 'border-box',
        height,
        /* A circle when there is one character, a capsule when there are more:
           the minimum is the height, and the content pushes it wider. */
        minWidth: height,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        /* The border box already reserves the ends; this is the room the
           figure needs so a "99+" does not touch the rounded caps. */
        padding: `0 ${padX}px`,
        /* The figure. White on red, seated on a dark shadow so it holds at
           11px against the pill's own gloss. */
        color: '#ffffff',
        fontFamily: 'var(--font-pixel), ui-monospace, monospace',
        fontSize: Math.max(9, Math.round(height * 0.5)),
        lineHeight: 1,
        textShadow: '0 1px 0 rgba(120, 16, 16, 0.9)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ── The close button ───────────────────────────────────────────────────── */

/**
 * The three states from the sheet. They are separate files rather than one
 * strip because they are swapped by CSS state, not by a sprite offset — and a
 * strip would have to be positioned, which is one more thing to get wrong.
 */
export const CLOSE_URL = {
  default: '/assets/ui/close-default.webp',
  hover: '/assets/ui/close-hover.webp',
  pressed: '/assets/ui/close-pressed.webp',
} as const;

/* The knob is SQUARE (close-default.webp, 90x90). It was 82x76, and that odd
   ratio is why the old sprite looked chewed: a 44px box letterboxed it and
   resampled the rim. Square means the art lands on the pixel grid at any
   size, so the height maths below is now a no-op that still reads correctly
   if the art ever changes shape again. */
export const CLOSE_SIZE = { width: 90, height: 90 } as const;

export interface LeafCloseProps {
  onClick?: () => void;
  /** How wide to draw it. It is art, so it scales whole rather than stretching. */
  size?: number;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The [x]. A FIXED SPRITE, not a 9-slice — see this file's header. It is a
 * background image rather than a border-image for exactly that reason: there
 * is nothing here to slice.
 */
export function LeafClose({
  onClick,
  size = 44,
  'aria-label': ariaLabel = 'Close',
  className,
  style,
}: LeafCloseProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rr-leaf-close${className ? ` ${className}` : ''}`}
      style={{
        /* THE TARGET IS AT LEAST 44px, THE ART IS `size` — and they are two
           different boxes on purpose.

           Sizing the BACKGROUND rather than the box, and letting the extra hit
           area be padding around it, keeps the art at its own aspect and still
           hands a phone the 44px it needs. It mattered more when the art was
           82x76 and `contain` fitted it to the shorter side; the knob is square
           now, but a 40px sprite in a 44px target still wants this. */
        minWidth: 44,
        minHeight: 44,
        width: Math.max(44, size),
        height: Math.max(44, Math.round((size * CLOSE_SIZE.height) / CLOSE_SIZE.width)),
        border: 'none',
        /* The global `button` rule paints a dark face with an 8px radius. The
           old sprite was an opaque rounded square that covered it; this knob is
           a ROUND cutout, so that plate showed around it as a dark box. The
           sprite is the whole button — nothing behind it. */
        backgroundColor: 'transparent',
        borderRadius: 0,
        boxShadow: 'none',
        backgroundImage: `url(${CLOSE_URL.default})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        /* Explicit, in the art's own ratio: `contain` against a box that the
           44px minimum may have made squarer than the sprite would letterbox
           it. */
        backgroundSize: `${size}px ${Math.round((size * CLOSE_SIZE.height) / CLOSE_SIZE.width)}px`,
        cursor: 'pointer',
        padding: 0,
        ...style,
      }}
    />
  );
}
