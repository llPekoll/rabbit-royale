import { Container } from 'pixi.js';
import * as Keys from '@/config/assetKeys';
import { arcadeCase, makeLabel, usingBitmapFace, type Label } from './textFace';

// Two faces, per the shared @domin8/arcade-kit typography convention:
//   • BODY (flat basic font) — the DEFAULT for all normal HUD/game text.
//   • TITLE (bevel outline font) — reserved for big hero moments (see titleText).
// Body cell is 8px (uniform 8 advance); title cell is 8×12 (variable advance).
const BODY_CELL = 8;
const TITLE_CELL = 12;

/**
 * THE FACE IS A LANGUAGE CHOICE, and it is made in ui/textFace.ts.
 *
 * Both atlases here are printable ASCII, so they cannot draw a sinogram or an
 * accent: outside English every label built through this file is a rasterised
 * `Text` instead of a `BitmapText`. Everything below returns `Label`, the
 * union of the two — the callers only ever touch `.text`, `.tint`, `.anchor`
 * and the transform, which both classes have.
 */

/**
 * Create a pixel-perfect BODY label (the flat font) — normal text.
 * Upper-cases where the atlas requires it (see `arcadeCase`).
 */
export function pixelText(
  x: number,
  y: number,
  text: string,
): Label {
  const t = makeLabel(arcadeCase(text), Keys.FONT_BASIC, BODY_CELL);
  t.position.set(x, y);
  return t;
}

/**
 * Create a TITLE label (the bevelled outline font) — for big hero text
 * only (GAME OVER, the big win multiplier).
 */
export function titleText(
  x: number,
  y: number,
  text: string,
): Label {
  const t = makeLabel(arcadeCase(text), Keys.FONT_PIXEL_S, TITLE_CELL);
  t.position.set(x, y);
  return t;
}

/** Update text. */
export function setPixelText(t: Label, text: string): void {
  t.text = arcadeCase(text);
}

/** xAdvance for a character at scale 1. Body font is a uniform 8-px cell; the
 *  title (outline) font has variable advance — pass `title` to measure it. */
export function charAdvance(ch: string, title = false): number {
  if (!title) return BODY_CELL; // basic font: uniform 8
  if (ch === ' ') return 4;
  if (ch === '.' || ch === ',') return 5;
  return 8;
}

/**
 * Total rendered width of `text` at the given scale (body font by default).
 *
 * AN ESTIMATE OUTSIDE ENGLISH, and knowingly so. The atlases are fixed-cell,
 * so summing advances is exact for them; a rasterised fallback face is
 * proportional, and a sinogram is about twice as wide as a Latin letter. The
 * callers use this to CENTRE and to SPACE, never to clip, so a few pixels of
 * drift moves a label slightly off-centre rather than cutting it — and a
 * layout measured per-glyph on the CPU every frame is not worth that. Wide
 * scripts are counted double, which is the one correction that matters.
 */
export function measureText(text: string, scale: number, title = false): number {
  let w = 0;
  const bitmap = usingBitmapFace();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // CJK, Hangul and the full-width forms occupy two cells in every face that
    // draws them. Everything else is close enough to the Latin cell.
    const wide = !bitmap && /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch);
    w += charAdvance(ch, title) * (wide ? 2 : 1);
  }
  return w * scale;
}

/** Format a money amount, trimming trailing zeros; returns '0' for <=0. */
export function formatAmount(val: number): string {
  if (val <= 0) return '0';
  return val.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Format a payout multiplier for display (continuous Stake-style ladder):
 *  2 decimals with trailing zeros trimmed under 100 (1.26, 2.5, 12.6),
 *  whole numbers above (127, 1000). */
export function formatMult(mult: number): string {
  if (mult >= 100) return Math.round(mult).toString();
  return mult.toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Shared tint for money amounts rendered anywhere in the HUD — $ values
 *  in the balance, bet / play-again / cash-out buttons, reward-ladder
 *  payouts, and the win overlay. Non-money UI text (button action words,
 *  palier multipliers, labels) keeps its own tint. */
export const TINT_AMOUNT = 0xaaffcc;

/** Gold accent used for palier multipliers in the reward ladder, the
 *  bet-row action label, and the +/- bet selectors. Matches the cabinet
 *  palette (warm white / gold accents) described in CLAUDE.md. */
export const TINT_MULT = 0xffd700;

/** Danger red shared by the GAME OVER banner and the "xN was k steps
 *  away" death-reveal wave, so the two reads as a single color language. */
export const TINT_DANGER = 0xff4444;

/** The arcade drop shadow: black at 30%, one SOURCE pixel down and right. */
const SHADOW_TINT = 0x000000;
const SHADOW_ALPHA = 0.3;
const SHADOW_OFFSET = 1;

/**
 * A body label wearing the arcade's drop shadow — the same glyphs again in
 * black behind the face, offset by one source pixel.
 *
 * This is how 80s cabinets kept bright text legible over busy art, and the
 * gold multipliers need it for exactly that reason: they land on grass, dirt,
 * stone and water, and gold-on-sand had almost no edge.
 *
 * Returns the GROUP to transform. Scale, position and tweens go on the group
 * so the shadow inherits them for free — animate the face alone and the shadow
 * detaches from it. Re-tint and re-text via `face`; the shadow stays black.
 */
export function shadowedPixelText(
  x: number,
  y: number,
  text: string,
): { group: Container; face: Label; shadow: Label } {
  const group = new Container();
  group.position.set(x, y);

  const shadow = pixelText(SHADOW_OFFSET, SHADOW_OFFSET, text);
  shadow.anchor.set(0.5);
  shadow.tint = SHADOW_TINT;
  shadow.alpha = SHADOW_ALPHA;
  group.addChild(shadow); // first = behind

  const face = pixelText(0, 0, text);
  face.anchor.set(0.5);
  group.addChild(face);

  return { group, face, shadow };
}

/** The outline's eight neighbours, one source pixel out. */
const OUTLINE_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;
/** Near-black, the kit's ink rather than pure #000, so it sits with the art. */
const OUTLINE_TINT = 0x0c0a12;

/**
 * A body label with a solid one-pixel OUTLINE: eight opaque copies around the
 * face, then the face.
 *
 * The drop shadow above is 30% black on one side, which gives a glyph no edge
 * at all where the face and the ground are close in brightness — measured on
 * the island, the blue "1" hint came to 1.2–1.6:1 on grass and a chest's GOLD
 * label to 1.8:1. A closed dark ring gives every glyph an edge on every ground
 * the island has, whatever the tint.
 *
 * Same contract as `shadowedPixelText`: transform the GROUP, tint the `face`.
 */
export function outlinedPixelText(
  x: number,
  y: number,
  text: string,
): { group: Container; face: Label; outline: Label[] } {
  const group = new Container();
  group.position.set(x, y);

  const outline = OUTLINE_OFFSETS.map(([dx, dy]) => {
    const copy = pixelText(dx, dy, text);
    copy.anchor.set(0.5);
    copy.tint = OUTLINE_TINT;
    group.addChild(copy); // all behind the face
    return copy;
  });

  const face = pixelText(0, 0, text);
  face.anchor.set(0.5);
  group.addChild(face);

  return { group, face, outline };
}

/** Retext an `outlinedPixelText` — every copy, or the ring shows the old glyphs. */
export function setOutlinedText(
  t: { face: Label; outline: Label[] },
  text: string,
): void {
  setPixelText(t.face, text);
  for (const copy of t.outline) setPixelText(copy, text);
}

/** Retext a `shadowedPixelText` — both copies, or the shadow goes stale. */
export function setShadowedText(
  t: { face: Label; shadow: Label },
  text: string,
): void {
  setPixelText(t.face, text);
  setPixelText(t.shadow, text);
}
