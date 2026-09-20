'use client';

/**
 * THE SHIELD SCROLL — the board DEFEND wears.
 *
 * WHERE IT COMES FROM. Paul's second reference (2026-09-19): a parchment
 * panel in a mossy wood frame, leaves at both ends, with a red shield sunk
 * into the left end. He first pointed it at RAID and then corrected it to
 * DEFEND, which is the reading the art itself argues for — the shield is
 * literally what that slab is about.
 *
 * IT IS A 3-SLICE, like the plank (plank.tsx), and for the same reason: the
 * frame is an OBJECT lit from above, not a border that repeats. Its height is
 * drawn art and never stretches; only the parchment between the two caps
 * grows. See plank.tsx's header for what a 9-slice did to that kind of art.
 *
 * THE LEFT CAP CARRIES THE SHIELD, which makes the two caps different widths:
 * 107px of shield-and-leaves on the left, 47px of leaves on the right. A
 * symmetric slice would have cut the shield in half and stretched it.
 *
 * THE ART IS DRAWN AT 1x, not the chrome's usual 2x. The source is 354x104,
 * and the slab it dresses is 80px tall on desktop and 48 on the Seeker — at
 * 2x the frame alone would be 208px, nearly three times the slab. This is the
 * one piece of chrome whose art is finer than the grid it lands on, so it is
 * SCALED DOWN rather than up, and `image-rendering` is left at the browser's
 * default: `pixelated` on a downscale drops every other source pixel and eats
 * the shield's highlights, where a smooth resample keeps them.
 */
import type { CSSProperties, ReactNode } from 'react';

/** The baked art. */
export const SCROLL_URL = '/assets/ui/scroll-plank.webp';
/** The art's own size. */
export const SCROLL_SIZE = { width: 354, height: 104 } as const;

/**
 * The caps, measured off the alpha: the shield and its leaves run to x=107,
 * and the right leaves start again at x=307.
 */
const CAP_LEFT = 107;
const CAP_RIGHT = 47;
/** The frame's own top and bottom edge — drawn, so never stretched. */
const EDGE = 14;

export interface ScrollPlankProps {
  /** How tall to draw it. The caps scale with it, so the art keeps its shape. */
  height: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * A box on the parchment. The caller owns what goes inside; this supplies the
 * frame, and reports through `contentInset` how much of each end the art
 * takes so the caller can keep its text off the shield.
 */
export function ScrollPlank({ height, children, className, style }: ScrollPlankProps) {
  /* Everything scales off the height the slab asks for, so the shield stays
     the same shape at 80px and at 48. */
  const k = height / SCROLL_SIZE.height;
  const left = Math.round(CAP_LEFT * k);
  const right = Math.round(CAP_RIGHT * k);
  const edge = Math.round(EDGE * k);
  return (
    <div
      className={`rr-scroll-plank${className ? ` ${className}` : ''}`}
      style={{
        borderImageSource: `url(${SCROLL_URL})`,
        /* The slice is in SOURCE pixels; the width is what it is drawn at. */
        borderImageSlice: `${EDGE} ${CAP_RIGHT} ${EDGE} ${CAP_LEFT} fill`,
        borderImageWidth: `${edge}px ${right}px ${edge}px ${left}px`,
        borderImageRepeat: 'stretch',
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderWidth: `${edge}px ${right}px ${edge}px ${left}px`,
        height,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * What each end of the art costs at a given height — the caller's text has to
 * clear the shield, and guessing that number in two places is how they drift.
 */
export function scrollInset(height: number) {
  const k = height / SCROLL_SIZE.height;
  return { left: Math.round(CAP_LEFT * k), right: Math.round(CAP_RIGHT * k) };
}
