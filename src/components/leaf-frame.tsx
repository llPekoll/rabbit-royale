'use client';

/**
 * THE LEAF FRAME — a real 9-slice, and the first panel that is NOT the kit.
 *
 * WHERE IT COMES FROM. Paul's reference (2026-09-19): a bark frame with leaf
 * clusters at all four corners around a parchment field, handed over as a
 * labelled 9-slice sheet with three worked examples (a horizontal bar, a large
 * panel, a vertical panel). His brief: "je veux aller vers un 9 qui est pas le
 * design system qu'on a actuellement" — this is deliberately a second material,
 * beside the codex chrome in px.tsx, not a replacement for it.
 *
 * IT IS A TRUE 9-SLICE, WHICH THE OTHER BOARDS ARE NOT.
 *
 * plank.tsx and scroll-plank.tsx are 3-slices on purpose: those are boards lit
 * from above, whose height is drawn art, so their vertical slice is zero and
 * only their length grows. This one is the other kind of object — a frame
 * around a hole. Its four corners are fixed, its four edges repeat, and the
 * parchment in the middle grows in BOTH directions. That is why it can be a
 * wide bar, a tall column and a big panel from one asset, which is exactly
 * what the reference's three examples demonstrate.
 *
 * WHERE THE CUTS ARE, AND WHY THERE.
 *
 * The slices were not guessed: the leaf clusters were isolated by hue and the
 * only green-free bands in the art were measured — columns 82..416 and rows
 * 103..335. Every leaf lives outside that window, so cutting inside it keeps
 * all four clusters whole. The insets below sit a margin inside those bands.
 *
 * The four clusters are DIFFERENT SIZES (the bottom pair hang lower and wider
 * than the top pair, as hand-painted art does), so the slice is ASYMMETRIC:
 * the bottom inset is not the top inset. Forcing it square would have clipped
 * the bottom leaves.
 *
 * THE EDGES ARE UNIFORM, so they stretch rather than tile: measured
 * column-to-column drift along each edge band is under 0.4/255, i.e. flat
 * bark. `repeat` would buy nothing and risk a seam mid-edge.
 *
 * `fill` IS ON: the middle slice is the parchment the content sits on. Without
 * it the centre is a hole and the box's own background shows through.
 *
 * NOT `pixelated`. This art is painted, not pixel art — it has soft brush
 * edges and a 504x417 source that is nearly always drawn SMALLER than native.
 * `image-rendering: pixelated` on a downscale drops every other source pixel
 * and shreds the leaf highlights; the browser's default resample keeps them.
 * (scroll-plank.tsx reached the same conclusion for the same reason.)
 */
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

/** The baked art. */
export const LEAF_FRAME_URL = '/assets/ui/leaf-frame.webp';
/** The art's own size, in source pixels. */
export const LEAF_FRAME_SIZE = { width: 504, height: 417 } as const;

/**
 * The slice insets, in source pixels — asymmetric because the painted corners
 * are. See the header: these sit inside the measured green-free bands, so no
 * cut ever crosses a leaf.
 */
export const LEAF_FRAME_SLICE = { top: 110, right: 90, bottom: 85, left: 90 } as const;

/**
 * THE SMALLEST BOX A GIVEN CORNER FITS IN. Opposite corners must not meet:
 * below this the leaves collide and the frame collapses into a knot. The fix
 * for a box that must be smaller is always a smaller `corner`, never a
 * squeezed box.
 */
/**
 * THE SMALLEST CORNER WHOSE LEAVES STILL READ AS LEAVES.
 *
 * MEASURED, NOT CHOSEN. Rendering the frame at a range of corner sizes and
 * counting green pixels in the corners: 90 -> 6547, 62 -> 3204, 47 -> 1830,
 * 38 -> 1210, 30 -> 766, then it falls off a cliff — 18 -> 387, 12 -> 131. At
 * 12 the cluster is three specks that read as dirt on the bark, and at a real
 * 24x23 badge (which forces a 9px corner) the frame is a cream blob with no
 * leaves and no bark at all.
 *
 * So this is the floor for wearing the frame AT ALL. A surface that cannot
 * give a 30px corner — i.e. anything under roughly 60x65 — should keep the
 * kit's crisp pixel border instead, which is legible at any size precisely
 * because it is a 2px line and not an illustration. The two materials split
 * by SIZE, and this constant is where.
 */
export const LEAF_FRAME_MIN_CORNER = 30;

/**
 * The biggest corner a box of this size can wear, or `null` if it cannot wear
 * the frame at all. Callers use this to size themselves honestly rather than
 * passing a corner that silently collapses.
 *
 * The cap at `LEAF_FRAME_CORNER` is deliberate: past the art's own 90px the
 * leaves are being blown up, which softens them.
 */
export function leafFrameCornerFor(width: number, height: number): number | null {
  const { top, right, bottom, left } = LEAF_FRAME_SLICE;
  /* The corner is measured on the LEFT inset, so convert the box's limits into
     that same unit before taking the tightest one. */
  const byWidth = (width / (left + right)) * left;
  const byHeight = (height / (top + bottom)) * left;
  const fit = Math.floor(Math.min(byWidth, byHeight, LEAF_FRAME_CORNER));
  return fit >= LEAF_FRAME_MIN_CORNER ? fit : null;
}

export function leafFrameMin(corner = LEAF_FRAME_CORNER) {
  const scale = corner / LEAF_FRAME_SLICE.left;
  return {
    width: Math.ceil((LEAF_FRAME_SLICE.left + LEAF_FRAME_SLICE.right) * scale),
    height: Math.ceil((LEAF_FRAME_SLICE.top + LEAF_FRAME_SLICE.bottom) * scale),
  };
}

/**
 * THE DEFAULT CORNER SIZE, in CSS pixels — how wide the leaf cluster is drawn.
 *
 * THIS IS THE KNOB, AND IT IS NOT A FRACTION OF THE BOX. The first cut of this
 * component took a `scale` against the source art, and it was wrong in a way
 * the story caught at once: the leaves are a FIXED-SIZE OBJECT, like a rivet,
 * not a proportion of whatever panel they sit on. The reference draws its
 * corner at ~90 of 504 source pixels, i.e. 18% of a smallish panel — at
 * `scale: 0.5` that same corner is 45px, which on a 720px bar is 6% and reads
 * as a thin sprig rather than a leaf cluster. Measured against the reference,
 * a 90px corner is what the art was drawn to look like.
 *
 * A caller that wants daintier leaves passes a smaller `corner`; the frame's
 * thickness then follows it, because bark and leaves are one painted object.
 */
export const LEAF_FRAME_CORNER = 90;

/**
 * It takes a plain div's props, because the surfaces that wear it are dialogs
 * and buttons: they need `role`, `aria-*` and their own click handlers, and a
 * frame that swallowed those would force every caller to add a wrapper element
 * (which would then be the thing the layout sees, not the frame).
 */
export interface LeafFrameProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /**
   * How wide to draw the leaf corner, in CSS pixels. The rest of the frame's
   * thickness scales off it, so the art keeps its shape. This is an absolute
   * size, NOT a fraction of the box: a corner is the same object on a wide bar
   * and on a tall column, which is what keeps a set of panels looking related.
   *
   * `leafFrameCornerFor` picks the biggest one a given box can carry.
   */
  corner?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * A box inside the leaf frame. The caller owns what goes inside and sizes the
 * box; this supplies the frame and reserves the border room the art needs.
 */
export function LeafFrame({
  corner = LEAF_FRAME_CORNER,
  children,
  className,
  style,
  ...rest
}: LeafFrameProps) {
  const { top, right, bottom, left } = LEAF_FRAME_SLICE;
  /* The asked-for corner width, back into the art's own scale. Every other
     edge derives from it, so the asymmetric slice stays in proportion and the
     leaves never squash. */
  const scale = corner / left;
  /* The drawn thickness of each edge. The slice is in SOURCE pixels and the
     width is in CSS pixels; scaling the second is what resizes the art. */
  const width = `${top * scale}px ${right * scale}px ${bottom * scale}px ${left * scale}px`;

  return (
    <div
      {...rest}
      className={`rr-leaf-frame${className ? ` ${className}` : ''}`}
      style={{ ...frame, borderImageWidth: width, borderWidth: width, ...style }}
    >
      {children}
    </div>
  );
}

const frame: CSSProperties = {
  borderImageSource: `url(${LEAF_FRAME_URL})`,
  /* Unitless: border-image-slice is always source pixels. `fill` paints the
     parchment centre. */
  borderImageSlice: `${LEAF_FRAME_SLICE.top} ${LEAF_FRAME_SLICE.right} ${LEAF_FRAME_SLICE.bottom} ${LEAF_FRAME_SLICE.left} fill`,
  /* Flat bark: stretch, never tile. See the header. */
  borderImageRepeat: 'stretch',
  borderStyle: 'solid',
  borderColor: 'transparent',
  boxSizing: 'border-box',
};

/**
 * The padding that keeps content off the bark, for a given scale. The border
 * box already reserves the frame's thickness, so this is the BREATHING ROOM
 * inside the parchment — without it text sits flush against the wood.
 */
export function leafFramePadding(corner = LEAF_FRAME_CORNER): number {
  return Math.round((corner / LEAF_FRAME_SLICE.left) * 14 + 6);
}
