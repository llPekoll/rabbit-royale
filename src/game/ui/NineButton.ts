import { BitmapText } from 'pixi.js';
import gsap from 'gsap';
import { pixelText, setPixelText } from './PixelText';
import { NineButton as KitNineButton, measureButtonLabel } from '@domin8/arcade-kit/pixi';
import * as Keys from '@/config/assetKeys';

/**
 * Rabbit Royale's in-game (canvas) button. The 9-slice rendering, baking, and
 * the cap-sink press now live in the shared kit (`@domin8/arcade-kit/pixi`); this
 * is a thin tone-palette shim so call sites keep their RR-flavoured `tone` API
 * while the look stays in lockstep with the DOM kit and the hub cabinet.
 *
 * Sprites are loaded once via the kit's `loadButtonAssets()` (see AssetLoader);
 * the label rides RR's basicpixel BitmapFont (`Keys.FONT_BASIC`).
 */

export type ButtonTone = 'gold' | 'green' | 'slate' | 'carrot' | 'amber';

// face = bright saturated top; bevel = darker bottom lip (kit darkens face ~32%).
const TONE: Record<ButtonTone, { face: string; bevel: string }> = {
  gold:  { face: '#fbbf24', bevel: '#a06a10' }, // RR accent gold (bet / steppers)
  green: { face: '#5cd994', bevel: '#2f7d52' }, // cash-out / "in profit" green
  slate: { face: '#8b9298', bevel: '#474d51' }, // quiet steel (disabled / neutral)
  // The season pass' carrot orange — reserved for HOUSE-STAKED rounds. A free
  // round used to wear plain `gold`, i.e. the exact look of the BET button, so
  // "FREE ROUND $5" and "PLAY AGAIN $5" were the same object with different
  // words on it. Orange is the pass' own colour wherever it appears (the tab's
  // carrots, the rail's free-round rungs), so the button now says whose money
  // is on the line before the label is read.
  carrot: { face: '#f0842b', bevel: '#9c4a0c' },
  // The FREE chip WAITING to be picked. It used to sit on `slate`, and steel
  // is the disabled colour everywhere else in this row — so the one control
  // offering the player a free round read as the one control they could not
  // press. Amber keeps it in the carrot family (same warmth, a step back) so
  // picking it deepens to orange rather than changing subject, and it stays
  // clear of the `gold` the bet PRESETS wear, which would have made a free
  // round look like a fifth bet size.
  amber: { face: '#f7b23c', bevel: '#a8601a' },
};

export { measureButtonLabel };

/** How far toward white a blink's lit half travels. Enough to read across a
 *  busy board, short of washing the tone out into a different colour. */
const BLINK_LIFT = 0.38;
/** Half a cycle: on for this long, off for this long. */
const BLINK_HALF_S = 0.45;

/** Mix a hex colour toward white by `amount` (0..1). */
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

export interface NineButtonOptions {
  tone: ButtonTone;
  onTap?: () => void;
  /** Opt into the arcade-kit cap-sink on press (used by the betting buttons). */
  sink?: boolean;
  /** Rendered size of one source pixel (design units). Smaller = thinner
   *  bevel / outline / corners. Defaults to the kit's 3. */
  pixelSize?: number;
}

/** The ghost key badge: how far its right edge sits from the button's, and
 *  how present it is. Faint enough to read as an annotation ON the button
 *  rather than a second label competing with the first. */
const BADGE_INSET = 8;
const BADGE_ALPHA = 0.42;
const BADGE_SCALE = 0.75;

export class NineButton extends KitNineButton {
  private tone: ButtonTone;
  private labelNudgeY = 0;
  private keyBadge: BitmapText | null = null;
  private enabled = true;
  private blink: gsap.core.Timeline | null = null;

  constructor(opts: NineButtonOptions) {
    super({
      faceColor:  TONE[opts.tone].face,
      bevelColor: TONE[opts.tone].bevel,
      fontFamily: Keys.FONT_BASIC,
      sink:       opts.sink,
      pixelSize:  opts.pixelSize,
      onTap:      opts.onTap,
    });
    this.tone = opts.tone;
  }

  /** The kit sets the enabled flag but never exposes it; call sites that need
   *  to reason about it (the ENTER badge) would otherwise track it themselves
   *  and drift. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  override setEnabled(enabled: boolean): void {
    super.setEnabled(enabled);
    this.enabled = enabled;
  }

  setTone(tone: ButtonTone): void {
    if (tone === this.tone) return;
    this.tone = tone;
    this.setColors(TONE[tone].face, TONE[tone].bevel);
    // A blink in flight is painting the OLD tone's two cuts — restart it on the
    // new one rather than leaving it to flash a colour the button no longer is.
    if (this.blink) this.setBlinking(true);
  }

  /**
   * Pulse the face between this button's own tone and a lighter cut of it.
   *
   * TWO baked states, alternating — not a continuous lerp. The kit bakes one
   * texture per `face|bevel|pressed` triple and CACHES it, so a smooth ramp
   * would mint (and keep) a texture every frame; two colours cost two entries
   * and the swap is free. It also suits the job: this is a call-to-action
   * saying "there is something free here", and a hard blink reads as a light
   * turning on, where a slow fade reads as a bug in the renderer.
   *
   * Works off whatever tone is current, so the button keeps saying whose money
   * is on the line (slate when the free round is not picked, carrot when it is)
   * while still asking to be looked at.
   */
  setBlinking(on: boolean): void {
    this.blink?.kill();
    this.blink = null;
    if (!on) {
      this.setColors(TONE[this.tone].face, TONE[this.tone].bevel);
      return;
    }
    let lit = false;
    this.blink = gsap.timeline({ repeat: -1 })
      .call(() => {
        lit = !lit;
        const t = TONE[this.tone];
        this.setColors(
          lit ? lighten(t.face, BLINK_LIFT) : t.face,
          lit ? lighten(t.bevel, BLINK_LIFT) : t.bevel,
        );
      })
      .to({}, { duration: BLINK_HALF_S });
  }

  /** Stop the pulse and drop its timeline — call before losing the button. */
  destroyBlink(): void {
    this.blink?.kill();
    this.blink = null;
  }

  /** Drop the label `px` below the kit's face-centred baseline. basicpixel
   *  glyphs sit high in their 8-px cell, so a large label on a tight face
   *  visually kisses the button's top outline — a one-source-pixel nudge
   *  (3px) re-centres it optically. Re-applied after every kit relayout. */
  setLabelNudgeY(px: number): void {
    this.labelNudgeY = px;
    this.applyLabelNudge();
  }

  private applyLabelNudge(): void {
    // `!== this.keyBadge`: the badge is a BitmapText too, and nudging IT here
    // would drag it off the baseline `placeKeyBadge` just put it on.
    const label = this.container.children.find(
      (c) => c instanceof BitmapText && c !== this.keyBadge,
    );
    if (label) label.position.y = -this.bevelPx / 2 + this.labelNudgeY;
  }

  /**
   * A ghostly key name pinned inside the button's RIGHT edge — "ENTER" on
   * whichever button that key currently fires.
   *
   * The keyboard hint used to be a floating row beside the board ("ENTER  BET"),
   * which asked the player to hold a mapping in their head: read the legend
   * over there, apply it to the control over here. Printed on the control it
   * needs no mapping at all — the button says what fires it. It is deliberately
   * faint and small: an annotation, not a second label, and the button reads
   * exactly the same if you never look at it.
   *
   * `null` removes it (touch layouts, or a button Enter does not fire).
   */
  setKeyBadge(text: string | null): void {
    if (text === null) {
      if (this.keyBadge) {
        this.keyBadge.destroy();
        this.keyBadge = null;
      }
      return;
    }
    if (!this.keyBadge) {
      this.keyBadge = pixelText(0, 0, text);
      this.keyBadge.anchor.set(1, 0.5);
      this.keyBadge.alpha = BADGE_ALPHA;
      this.keyBadge.scale.set(BADGE_SCALE);
      this.container.addChild(this.keyBadge);
    } else {
      setPixelText(this.keyBadge, text);
    }
    this.placeKeyBadge();
  }

  /** Right edge of the FACE, not of the box: the kit reserves the bottom
   *  `bevelPx` for the lip, so the badge rides the same optical centre the
   *  label does or it sits low against the bevel. */
  private placeKeyBadge(): void {
    if (!this.keyBadge) return;
    this.keyBadge.position.set(this.width / 2 - BADGE_INSET, -this.bevelPx / 2);
  }

  override setSize(w: number, h: number): void {
    super.setSize(w, h);
    this.applyLabelNudge();
    this.placeKeyBadge();
  }

  override setLabel(text: string): void {
    super.setLabel(text);
    this.applyLabelNudge();
  }

  override setLabelScale(scale: number): void {
    super.setLabelScale(scale);
    this.applyLabelNudge();
  }
}
