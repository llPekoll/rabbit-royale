import { Container, Graphics, BitmapText } from 'pixi.js';
import gsap from 'gsap';
import { pixelText } from './PixelText';

export interface CharTintRange {
  start: number;
  end: number;
  tint: number;
}

/**
 * Owns the death-reveal overlay stack: a zIndex-sorted Container for GAME OVER
 * text + animated per-char "X WAS N STEPS AWAY" wave, and a separate darkening
 * graphic that fades in under it. The scene calls these in sequence during the
 * death cascade and tears them down when re-entering setup.
 */
export class DeathReveal {
  private revealGroup: Container | null = null;
  private darkenOverlay: Graphics | null = null;
  private waveChars: BitmapText[] = [];
  private waveTweens: gsap.core.Tween[] = [];

  constructor(private parent: Container) {}

  /** The reveal container, or null if not currently open. */
  get group(): Container | null {
    return this.revealGroup;
  }

  get darken(): Graphics | null {
    return this.darkenOverlay;
  }

  /** Create a fresh reveal group and return it. Tears down any prior wave
   *  text + reveal group so repeated deaths don't stack. */
  createGroup(): Container {
    this.clearWaveText();
    if (this.revealGroup) {
      this.parent.removeChild(this.revealGroup);
      this.revealGroup.destroy({ children: true });
    }
    this.revealGroup = new Container();
    this.revealGroup.zIndex = 70;
    this.parent.addChild(this.revealGroup);
    return this.revealGroup;
  }

  /** Create an oversized black rect (to cover translated gridContainer) and
   *  fade it to 60% alpha. Returns the graphic so the caller can tween it. */
  showDarken(w: number, h: number): Graphics {
    const g = new Graphics();
    g.rect(-w, -h, w * 3, h * 3);
    g.fill({ color: 0x000000 });
    g.zIndex = 65;
    g.alpha = 0;
    this.parent.addChild(g);
    gsap.to(g, { alpha: 0.6, duration: 0.6 });
    this.darkenOverlay = g;
    return g;
  }

  /**
   * Render `text` one char at a time across the reveal group, each char
   * yoyo-bouncing vertically with a staggered delay so it reads as a wave.
   * Caller should guard against calling this after the reveal group has been
   * torn down (we early-return, but the wave is only meaningful while dead).
   */
  showWaveText(
    text: string,
    cx: number,
    cy: number,
    tint: number,
    scale = 2,
    charTints?: CharTintRange[]
  ): void {
    this.clearWaveText();
    if (!this.revealGroup) return;

    const charW = 8 * scale;
    const totalW = text.length * charW;
    const startX = cx - totalW / 2 + charW / 2;
    const amplitude = 4;

    for (let i = 0; i < text.length; i++) {
      const ch = pixelText(startX + i * charW, cy, text[i]);
      ch.anchor.set(0.5);
      ch.scale.set(scale);
      let charTint = tint;
      if (charTints) {
        for (const ct of charTints) {
          if (i >= ct.start && i < ct.end) { charTint = ct.tint; break; }
        }
      }
      ch.tint = charTint;
      ch.zIndex = 70;
      this.revealGroup.addChild(ch);
      this.waveChars.push(ch);

      const tw = gsap.to(ch, {
        y: cy - amplitude,
        duration: 0.3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: i * 0.05,
      });
      this.waveTweens.push(tw);
    }
  }

  clearWaveText(): void {
    for (const tw of this.waveTweens) tw.kill();
    this.waveTweens = [];
    for (const ch of this.waveChars) {
      gsap.killTweensOf(ch);
      ch.parent?.removeChild(ch);
      ch.destroy();
    }
    this.waveChars = [];
  }

  /** Destroy reveal group + darken overlay (and any wave chars inside). */
  clearAll(): void {
    this.clearWaveText();
    if (this.revealGroup) {
      this.parent.removeChild(this.revealGroup);
      this.revealGroup.destroy({ children: true });
      this.revealGroup = null;
    }
    if (this.darkenOverlay) {
      this.parent.removeChild(this.darkenOverlay);
      this.darkenOverlay.destroy();
      this.darkenOverlay = null;
    }
  }
}
