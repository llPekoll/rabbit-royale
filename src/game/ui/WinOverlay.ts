import { Container, Graphics, BitmapText } from 'pixi.js';
import gsap from 'gsap';
import { pixelText, titleText, formatMult, TINT_AMOUNT, TINT_MULT } from './PixelText';

/**
 * Cash-out celebration overlay: dark rect, big "xN" palier text scaling in,
 * and a "+$N" amount popping in beneath. All three are added to the
 * gridContainer so they inherit its scale/offset. Teardown kills the scale
 * tweens so no straggling animations keep running after the next game.
 */
export class WinOverlay {
  private overlay: Graphics | null = null;
  private bigText: BitmapText | null = null;
  private amountText: BitmapText | null = null;

  constructor(private parent: Container) {}

  /**
   * Reveal the overlay stack centered at (cx, cy). The big text scale depends
   * on palier tier so x50+ wins read as bigger events; amount stays at 3x.
   */
  show(cx: number, cy: number, multiplier: number, amountLabel: string, fullW: number, fullH: number): void {
    this.clear();

    this.overlay = new Graphics();
    this.overlay.rect(-fullW, -fullH, fullW * 3, fullH * 3);
    this.overlay.fill({ color: 0x000000 });
    this.overlay.alpha = 0;
    this.overlay.zIndex = 58;
    this.parent.addChild(this.overlay);
    gsap.to(this.overlay, { alpha: 0.6, duration: 0.4 });

    const bigScale = multiplier >= 50 ? 8 : multiplier >= 10 ? 7 : 5;
    // Big win multiplier — bevel TITLE face (hero moment).
    this.bigText = titleText(cx, cy - 20, `x${formatMult(multiplier)}`);
    this.bigText.anchor.set(0.5);
    this.bigText.zIndex = 60;
    this.bigText.scale.set(0);
    this.bigText.tint = TINT_MULT;
    this.parent.addChild(this.bigText);
    gsap.to(this.bigText.scale, {
      x: bigScale,
      y: bigScale,
      duration: 0.5,
      ease: 'back.out(1.7)',
    });

    this.amountText = pixelText(cx, cy + 50, amountLabel);
    this.amountText.anchor.set(0.5);
    this.amountText.zIndex = 60;
    this.amountText.scale.set(0);
    this.amountText.tint = TINT_AMOUNT;
    this.parent.addChild(this.amountText);
    gsap.to(this.amountText.scale, {
      x: 3,
      y: 3,
      duration: 0.4,
      delay: 0.3,
      ease: 'back.out(1.7)',
    });
  }

  /** Destroy all three overlay elements with their tweens. Safe to call
   *  even when nothing is currently showing. */
  clear(): void {
    if (this.overlay) {
      gsap.killTweensOf(this.overlay);
      this.parent.removeChild(this.overlay);
      this.overlay.destroy();
      this.overlay = null;
    }
    if (this.bigText) {
      gsap.killTweensOf(this.bigText);
      gsap.killTweensOf(this.bigText.scale);
      this.parent.removeChild(this.bigText);
      this.bigText.destroy();
      this.bigText = null;
    }
    if (this.amountText) {
      gsap.killTweensOf(this.amountText);
      gsap.killTweensOf(this.amountText.scale);
      this.parent.removeChild(this.amountText);
      this.amountText.destroy();
      this.amountText = null;
    }
  }
}
