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
 * THE RAIL: the wood along the top and bottom, as a share of the height.
 *
 * The banner is a 3-slice with no vertical inset, so its middle slice is the
 * whole 139px of art stretched to the card — the rails scale with the height
 * exactly as the caps do. Measured down the art's middle columns: the
 * parchment's light begins at row 13 and ends at row 127, so each rail is
 * ~13 source rows. A card that pads a FIXED 10px inside this frame puts its
 * first line on the wood once it is taller than ~110px — on a desktop the
 * burrow card's heading sat with its top rows in the rail, dark on dark, and
 * read as cut off (Paul, 2026-09-21). hub-card.tsx pads by this instead.
 */
export const BANNER_RAIL = 13;
export const BANNER_RAIL_RATIO = BANNER_RAIL / BANNER_SIZE.height;

/**
 * THE CAP THE BURROW'S CARDS USE — a share of the height, held under a hard
 * pixel ceiling. This is the one number on this component worth arguing about.
 *
 * WHY NOT THE ART'S OWN 0.46. At that proportion a 308px card spends 142px of
 * its width on the two ends, leaving 146px of usable width against contents
 * that need 234-248 (measured): every heading wrapped and the burrow card's
 * "20 carrots/hour" was clipped mid-word.
 *
 * WHY NOT A SMALLER RATIO EITHER. 0.22 bought the room but drew a MEAGRE
 * frame — thin rails, sparse vines, and a long stretched middle whose grain
 * smeared while the ends stayed sharp (Paul, 2026-09-19: "le cadre est
 * vachement strecher c'est pas tres joli").
 *
 * SO IT IS A RATIO WITH A CEILING. The ratio gives short cards a frame in
 * proportion to them; the 34px ceiling is what the TALLEST card can afford —
 * measured by squeezing the cards' border until text broke, which it does at
 * 39px and badly at 49. Every card gets the thickest frame it can carry, and
 * none of them clips.
 *
 * `repeat` IS NOT THE ANSWER to the stretch, though it looks like it should
 * be: see the note on `borderImageRepeat` below.
 */
export const BANNER_CARD_CAP_RATIO = 0.32;
/** The most any card can spend on one end before its contents clip. */
export const BANNER_CARD_CAP_MAX = 34;

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
           and only the wood between the ends grows. `fill` paints the
           parchment in the middle. */
        borderImageSource: `url(${BANNER_URL})`,
        borderImageSlice: `0 ${BANNER_CAP} 0 ${BANNER_CAP} fill`,
        borderImageWidth: `0 ${ends}`,
        /* `stretch`, and `repeat` IS NOT AN OPTION HERE — tried, 2026-09-19.

           Repeating looked right in an offline render, which tiled the middle
           band horizontally only. `border-image-repeat` does not work that way:
           it tiles the middle slice in BOTH directions, so the top and bottom
           rails repeated down the card's face and drew wooden bars straight
           across the text. The board is a 3-slice with a zero vertical inset,
           so its middle slice is the full height of the art — there is nothing
           to tile vertically against.

           The stretch is therefore the price of a 3-slice on a box wider than
           the art, and `BANNER_CARD_CAP_RATIO` is where it is managed. */
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
