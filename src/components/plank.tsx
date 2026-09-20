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
 * THE ENERGY BOARD — the same plank with a second, smaller one welded under it.
 *
 * PAUL'S ART, not a composition (`plank+enegie.png`, 2026-09-20: "j'ai fait
 * cette planche comme ca ya de la place pour l'energie"). It replaced a
 * generated attempt at the same idea: the short board cannot be stretched
 * vertically by CSS — it is one top-lit gradient with leaf clusters running
 * its full height, so a 9-slice through the grain pulls the leaves into green
 * bars — and cutting it apart in a script produced a seam and a flat flank.
 * Drawn, the lower board is its own shape with its own bark and its own
 * leaves, which is what makes the two read as ONE object.
 *
 * THE TWO BOARDS ARE DIFFERENT WIDTHS, and that decides the slice. The top
 * board runs the full 167 and the lower one only x=28..138, and both have to
 * stretch together from a single 3-slice — so the middle slice must be flat
 * wood in BOTH. The leaves reach x=58 on the left and resume at x=97, so the
 * cut goes just inside that: everything outside is a fixed cap, and the ~38px
 * between them is what grows.
 *
 * That makes the caps much wider than the plain plank's 30 — they carry a
 * leaf cluster AND the lower board's rounded end — which is correct and is
 * why `PLANK_ENERGY_CAP` is its own number rather than a shared one.
 */
export const PLANK_ENERGY_URL = '/assets/ui/plank-energy.webp';
export const PLANK_ENERGY_SIZE = { width: 167, height: 64 } as const;

/**
 * The energy board's caps, measured off the alpha: the left leaves end at
 * x=58 and the right ones begin at x=97, so 59 and 70 (167-97) put both cuts
 * in wood that is flat on the top board and on the lower one at once.
 */
const ENERGY_CAP_L = 59;
const ENERGY_CAP_R = 70;

/**
 * THE TWO BOARDS' OWN ROWS, as fractions of the art's height — because the
 * content does not share one box, it sits on one board or the other.
 *
 * Measured off the alpha: the top board runs rows 1-44 and the lower one
 * 44-61 of 64. A caller centring on the whole box would land its text on the
 * seam between them, which is the same mistake `plankRows` exists to prevent
 * on the energy dial.
 *
 * THE BAND STARTED ONE ROW LOW (Paul, 2026-09-20: "tu peux remonter la jauge
 * d'energie un peu?"). Re-read off the alpha at the stretching column x=83:
 * row 43 is the dark seam under the top board, the lower plank's wood runs
 * 44..60, and row 61 is already transparent — so 61 as the exclusive bottom
 * was right and only `from` was off. At 45 the band skipped the plank's first
 * row while keeping its full bottom, and a gauge centred in that box hung
 * toward the board's bottom edge instead of sitting on the middle of the
 * wood. Photographed 2026-09-20: the bar crowded the lower rim and the figure
 * beside it read as falling off the plank.
 */
const ENERGY_TOP = { from: 1 / 64, to: 44 / 64 } as const;
const ENERGY_LOW = { from: 44 / 64, to: 61 / 64 } as const;

/** The top board's inset from the box, in CSS px at a given drawn height. */
export function plankEnergyTop(height: number) {
  return {
    top: Math.round(ENERGY_TOP.from * height),
    bottom: Math.round((1 - ENERGY_TOP.to) * height),
  };
}

/** The lower board's, the same way — where the gauge goes. */
export function plankEnergyLow(height: number) {
  return {
    top: Math.round(ENERGY_LOW.from * height),
    bottom: Math.round((1 - ENERGY_LOW.to) * height),
  };
}



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
/** The energy board's, the same way — both are painted heights, never stretched. */
export const PLANK_ENERGY_HEIGHT = PLANK_ENERGY_SIZE.height * PLANK_SCALE;
/** What each of ITS caps costs in width. */
export const PLANK_ENERGY_CAP_L = ENERGY_CAP_L * PLANK_SCALE;
export const PLANK_ENERGY_CAP_R = ENERGY_CAP_R * PLANK_SCALE;

/**
 * THE LOWER PLANK'S SIDES, in CSS px from the board's own edges.
 *
 * IN PIXELS, NOT PER CENT, and that is the whole point. The lower plank runs
 * x=42..130 of the 167-wide art, and BOTH of those land inside the fixed caps
 * (which end at 59 and resume at 97). A cap does not stretch, so its geometry
 * is a constant offset from the edge however long the board is drawn — where
 * a percentage would drift the moment the middle slice grows, and slide the
 * gauge off the small plank onto the leaves. Photographed doing exactly that
 * at 4%, 2026-09-20.
 */
/**
 * Plus a margin, because the numbers above are the wood's LAST pixel and a
 * gauge that ends exactly on the bark reads as overflowing it. Six source px
 * — three at the chrome's 2x — is the inset the rest of the board's content
 * sits at, and it is what moves the bolt off the left leaf cluster and the
 * figure off the right edge (photographed 2026-09-20).
 */
const LOW_MARGIN = 6;

export const PLANK_ENERGY_LOW_L = (42 + LOW_MARGIN) * PLANK_SCALE;
export const PLANK_ENERGY_LOW_R = (PLANK_ENERGY_SIZE.width - 130 + LOW_MARGIN) * PLANK_SCALE;
/** What each cap costs in width; content narrower than two caps has no wood. */
export const PLANK_CAP = CAP * PLANK_SCALE;

export interface PlankProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * The ENERGY board — the plank with the smaller one welded under it, for
   * the run's gauge.
   *
   * A flag rather than a second component: everything about wearing this
   * board is identical, and a caller should not have to know which file it is
   * getting.
   */
  tall?: boolean;
}

/**
 * A box on the wood board. The caller owns what goes inside; this supplies the
 * ground, its fixed height, and the side room the leaves need.
 */
export function Plank({ children, className, style, tall = false }: PlankProps) {
  return (
    <div
      className={`rr-plank${tall ? ' tall' : ''}${className ? ` ${className}` : ''}`}
      style={{ ...(tall ? plankEnergy : plank), ...style }}
    >
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

/**
 * The energy board: its own slice, its own painted height.
 *
 * ASYMMETRIC CAPS, because the art is: the left cluster is deeper than the
 * right one, so one number for both would either cut a leaf or waste wood.
 */
const plankEnergy: CSSProperties = {
  ...plank,
  borderImageSource: `url(${PLANK_ENERGY_URL})`,
  borderImageSlice: `0 ${ENERGY_CAP_R} 0 ${ENERGY_CAP_L} fill`,
  borderImageWidth: `0 ${PLANK_ENERGY_CAP_R}px 0 ${PLANK_ENERGY_CAP_L}px`,
  borderWidth: `0 ${PLANK_ENERGY_CAP_R}px 0 ${PLANK_ENERGY_CAP_L}px`,
  height: PLANK_ENERGY_HEIGHT,
};
