'use client';

/**
 * THE VINE BANNER — the board the burrow's cards stand on.
 *
 * WHERE IT COMES FROM. Paul's fourth reference (2026-09-19), for the QUEST,
 * HARVEST and UPGRADE cards: a parchment panel in a bound-wood frame with vines
 * climbing both ends. It is the same family as the leaf frame (leaf-frame.tsx)
 * and the stone rings (hub-icon-button.tsx) — painted wood and foliage, not the
 * kit's pixel bevel.
 *
 * IT IS A 3-SLICE, NOT A 9-SLICE, and that was measured rather than assumed.
 *
 * The vines run from row 12 to row 120 of 139 — nearly the full height — so
 * there is NO horizontal band free of foliage to stretch vertically. A
 * nine-slice would have cut through the leaves on both sides. The columns tell
 * the opposite story: 32..354 is clean, so the art splits cleanly left/right.
 *
 * So the banner keeps its painted HEIGHT and only its width grows, exactly like
 * plank.tsx. What varies between cards is handled by SCALE: the art is drawn at
 * the card's height, and the caps scale with it (53px on a 116-tall card, 66 on
 * a 144). See `bannerCap`.
 *
 * THE CAP IS 64 SOURCE PIXELS because of the ROPE KNOTS. The top and bottom
 * rails carry bindings near each end — measured as features at x 0..57 and
 * 329..386, against a flat median rail everywhere between. A narrower cap would
 * have left a knot inside the stretched middle, where it would smear into a
 * streak; 64 puts every one of them in the fixed ends.
 *
 * `fill` IS ON: the middle slice is the parchment the card's content sits on.
 * Without it the centre is a hole and the card's own background shows through.
 *
 * NOT `pixelated`. The art is painted at 387x139 and is nearly always drawn
 * SMALLER than that on a card, and `image-rendering: pixelated` on a downscale
 * drops every other source pixel and shreds the vines — the same conclusion
 * scroll-plank.tsx reached for the same reason.
 */
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

/** The baked art. */
export const BANNER_URL = '/assets/ui/banner.webp';
/** The art's own size, in source pixels. */
export const BANNER_SIZE = { width: 387, height: 139 } as const;

/**
 * The end caps, in source pixels — wide enough to hold the rope knots. See the
 * header for why this is 64 and not less.
 */
export const BANNER_CAP = 64;

/**
 * What each cap costs, in CSS px, on a banner drawn `height` tall.
 *
 * The caps are ART, so they scale with the height rather than staying a fixed
 * stroke: a 116-tall card gets 53px ends and a 144-tall card 66px, and the
 * knots and vines stay the same shape on both.
 */
export function bannerCap(height: number): number {
  return Math.round((height / BANNER_SIZE.height) * BANNER_CAP);
}

/**
 * The narrowest banner that still has parchment between its ends. Below this
 * the two caps meet and the vines collide.
 */
export function bannerMinWidth(height: number): number {
  return bannerCap(height) * 2;
}

/**
 * The cap as a share of the banner's own height: 64 of 139 source pixels.
 *
 * Exposed because the burrow's cards do NOT know their height as a number —
 * it is `max(calc(Nsvh * var(--rr-card-scale)), Mpx)`, resolved by the browser
 * (hub-card.tsx, `heightBox`). Those callers pass a CSS `calc()` built from
 * this ratio instead of a px value, so the ends still scale with whatever the
 * card turns out to be.
 */
export const BANNER_CAP_RATIO = BANNER_CAP / BANNER_SIZE.height;

/**
 * THE CAP RATIO THE BURROW'S CARDS USE — deliberately slimmer than the art's
 * own 0.46, and this is the one number on this component worth arguing about.
 *
 * At the art's own proportion a 308px card spends 142px of its width on the
 * two ends. With the card's padding that leaves 146px of usable width against
 * contents that measure 214 — the burrow card's "20 carrots/hour" was clipped
 * mid-word, and every heading wrapped.
 *
 * A 3-SLICE CANNOT SOLVE THIS BY ITSELF: the cap and the art scale together,
 * so the only way to buy width is to draw the whole frame slimmer. Rendering
 * the banner down the height range shows the vines survive it — they thin out
 * but stay legible as vines, where the frame at full proportion on a 308px
 * card reads as an ornament that ate its own card.
 *
 * 0.22 leaves 220-233px at both card heights (125 and 155), which clears the
 * 214 the contents need with room to spare.
 */
export const BANNER_CARD_CAP_RATIO = 0.22;

export interface LeafBannerProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /**
   * How tall to draw the board. A number is CSS px; a string is any CSS length
   * — including a `calc()` a card computed for itself, which is the case the
   * burrow needs (see `BANNER_CAP_RATIO`).
   */
  height: number | string;
  /**
   * What each end costs, when `height` is not a plain number and the cap
   * therefore cannot be derived from it. Any CSS length.
   */
  cap?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * A box on the vine banner. The caller owns what goes inside and how wide the
 * box is; this supplies the board and the side room the vines need.
 */
export function LeafBanner({ height, cap, children, className, style, ...rest }: LeafBannerProps) {
  /* A numeric height derives its own caps; a CSS-length height must be told,
     because only the browser knows what it resolves to. */
  const ends = cap ?? `${bannerCap(typeof height === 'number' ? height : 0)}px`;

  return (
    <div
      {...rest}
      className={`rr-leaf-banner${className ? ` ${className}` : ''}`}
      style={{
        /* THE 3-SLICE. Zero top and bottom: the board keeps its painted height
           and only the wood between the ends stretches. `fill` paints the
           parchment in the middle. */
        borderImageSource: `url(${BANNER_URL})`,
        borderImageSlice: `0 ${BANNER_CAP} 0 ${BANNER_CAP} fill`,
        borderImageWidth: `0 ${ends}`,
        borderImageRepeat: 'stretch',
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderWidth: `0 ${ends}`,
        boxSizing: 'border-box',
        height,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The room the content needs inside the board, for a given height.
 *
 * The border box already reserves the two ends; this is the breathing space
 * within the parchment, so text does not sit against the rails. Proportional to
 * the height for the same reason the caps are.
 */
export function bannerPadding(height: number): number {
  return Math.round(height * 0.1) + 4;
}
