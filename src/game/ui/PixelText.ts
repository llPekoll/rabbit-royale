import { BitmapText, Container } from 'pixi.js';
import * as Keys from '@/config/assetKeys';

// Two faces, per the shared @domin8/arcade-kit typography convention:
//   • BODY (flat basic font) — the DEFAULT for all normal HUD/game text.
//   • TITLE (bevel outline font) — reserved for big hero moments (see titleText).
// Body cell is 8px (uniform 8 advance); title cell is 8×12 (variable advance).
const BODY_CELL = 8;
const TITLE_CELL = 12;

/**
 * Create a pixel-perfect BODY BitmapText (the flat font) — normal text.
 * Auto-uppercases. Returns a PIXI.BitmapText.
 */
export function pixelText(
  x: number,
  y: number,
  text: string,
): BitmapText {
  const t = new BitmapText({
    text: text.toUpperCase(),
    style: {
      fontFamily: Keys.FONT_BASIC,
      fontSize: BODY_CELL, // native cell height
      fill: 0xffffff,
    },
  });
  t.position.set(x, y);
  return t;
}

/**
 * Create a TITLE BitmapText (the bevelled outline font) — for big hero text
 * only (GAME OVER, the big win multiplier). Auto-uppercases.
 */
export function titleText(
  x: number,
  y: number,
  text: string,
): BitmapText {
  const t = new BitmapText({
    text: text.toUpperCase(),
    style: {
      fontFamily: Keys.FONT_PIXEL_S,
      fontSize: TITLE_CELL, // native cell height
      fill: 0xffffff,
    },
  });
  t.position.set(x, y);
  return t;
}

/** Update text (auto-uppercase). */
export function setPixelText(t: BitmapText, text: string): void {
  t.text = text.toUpperCase();
}

/** xAdvance for a character at scale 1. Body font is a uniform 8-px cell; the
 *  title (outline) font has variable advance — pass `title` to measure it. */
export function charAdvance(ch: string, title = false): number {
  if (!title) return BODY_CELL; // basic font: uniform 8
  if (ch === ' ') return 4;
  if (ch === '.' || ch === ',') return 5;
  return 8;
}

/** Total rendered width of `text` at the given scale (body font by default). */
export function measureText(text: string, scale: number, title = false): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) w += charAdvance(text[i], title);
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
): { group: Container; face: BitmapText; shadow: BitmapText } {
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

/** Retext a `shadowedPixelText` — both copies, or the shadow goes stale. */
export function setShadowedText(
  t: { face: BitmapText; shadow: BitmapText },
  text: string,
): void {
  setPixelText(t.face, text);
  setPixelText(t.shadow, text);
}
