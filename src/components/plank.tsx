'use client';

/**
 * THE WOOD PLANK — the chrome's new ground.
 *
 * WHERE IT COMES FROM. Paul's reference (2026-09-19): a bark-edged board with
 * leaf clusters sprouting at both ends, on transparent ground. It replaces the
 * flat dark slab the pill wears today — the one he called "tout moche" — and
 * it is the first of a set: the UI moves onto painted wood one panel at a
 * time, so this is written to be worn by more than the pill.
 *
 * IT IS A 3-SLICE, NOT A 9-SLICE — the board's HEIGHT is fixed art.
 *
 * The first cut here was a nine-slice with a 4px top and bottom edge, and it
 * was wrong in a way the story caught immediately: the plank is not a frame
 * around a hole, it is an OBJECT lit from above. Its 45 rows are a bright
 * highlight along the top lip, flat grain, then the shadowed underside — a
 * gradient down the whole board, not a repeating edge. Stretching a 4px slice
 * of that produced a thick putty band top and bottom, and squashed the leaf
 * clusters (which are as tall as the board) into it.
 *
 * So the vertical slice is ZERO and the board keeps its painted height. Only
 * the wood between the caps stretches, sideways. What grows is the plank's
 * length, which is the only thing a longer plank should be.
 *
 * `fill` IS ON, and it must be: it paints the middle slice — the flat grain
 * the content sits on. Without it the centre is a hole and the box's own
 * background shows through as a pale band (the first cut's other bug).
 *
 * NO REPEAT — `stretch`. The middle is flat grain, and `repeat` would tile a
 * seam into the one part of the board the eye rests on.
 */
import type { CSSProperties, ReactNode } from 'react';

/** The baked art, on the native pixel grid. */
export const PLANK_URL = '/assets/ui/plank.webp';
/** The art's own size, in source pixels. */
export const PLANK_SIZE = { width: 167, height: 45 } as const;

/**
 * ONE SOURCE PIXEL IS 2 CSS PIXELS, as everywhere else in the chrome (`PX` in
 * px.tsx). Drawn at 2x so the grain lands on whole device pixels and never
 * resamples: a board at 1.37x would shimmer against the pixel face on it.
 */
export const PLANK_SCALE = 2;

/**
 * The leafy caps, measured off the alpha: leaves run to x=28 on the left and
 * start again at x=144 on the right, so 30 puts the cut in clean wood just
 * past the last leaf on both sides.
 */
const CAP = 30;

/** The board's drawn height, in CSS px — fixed, never stretched. */
export const PLANK_HEIGHT = PLANK_SIZE.height * PLANK_SCALE;
/** What each cap costs in width; content narrower than two caps has no wood. */
export const PLANK_CAP = CAP * PLANK_SCALE;

export interface PlankProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * A box on the wood board. The caller owns what goes inside; this supplies the
 * ground, its fixed height, and the side room the leaves need.
 */
export function Plank({ children, className, style }: PlankProps) {
  return (
    <div className={`rr-plank${className ? ` ${className}` : ''}`} style={{ ...plank, ...style }}>
      {children}
    </div>
  );
}

const plank: CSSProperties = {
  /* THE 3-SLICE. Zero top and bottom: the board keeps its painted height and
     only the wood between the caps stretches. `fill` paints the middle. */
  borderImageSource: `url(${PLANK_URL})`,
  borderImageSlice: `0 ${CAP} 0 ${CAP} fill`,
  borderImageWidth: `0 ${PLANK_CAP}px`,
  borderImageRepeat: 'stretch',
  borderStyle: 'solid',
  borderColor: 'transparent',
  borderWidth: `0 ${PLANK_CAP}px`,
  /* The art's own height. The board is an object, not a frame: it does not
     grow taller to fit its contents, the contents sit within it. */
  height: PLANK_HEIGHT,
  /* Pixel art: never smoothed, at any scale. */
  imageRendering: 'pixelated',
  boxSizing: 'border-box',
};
