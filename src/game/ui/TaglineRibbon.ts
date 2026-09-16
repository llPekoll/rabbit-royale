import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import * as Keys from '@/config/assetKeys';
import { GAME_W } from '../Application';
import { nextTagline } from '@/config/taglines';
import { makeLabel, type Label } from './textFace';

/**
 * Scrolling tagline rendered inside the logo banner ribbon. Picks a random
 * phrase, centers it when it fits, or scrolls it right-to-left when it
 * overflows. Size follows the logo scale so the text always sits in the
 * ribbon artwork.
 *
 * THE PHRASES ARE PASSED IN, one language's worth (`t.taglines`): this file
 * draws on a canvas and has no React context to read them from. It also draws
 * through `makeLabel`, so a language the kit's atlas cannot render falls back
 * to a real font rather than to a row of blanks. See ui/textFace.ts.
 */
export class TaglineRibbon {
  private text: Label;
  private wrap: Container;
  private mask: Graphics;
  private scrollTween: gsap.core.Tween | null = null;

  constructor(
    parent: Container,
    private logoSprite: Sprite,
    private taglines: readonly string[],
  ) {
    const initial = taglines[Math.floor(Math.random() * taglines.length)] ?? '';
    this.text = makeLabel(initial, Keys.FONT_BASIC, 8);
    this.text.anchor.set(0.5);
    this.text.tint = 0x4a3a2a;

    this.wrap = new Container();
    this.wrap.zIndex = 11;
    this.mask = new Graphics();
    this.wrap.addChild(this.mask);
    this.wrap.addChild(this.text);
    this.text.mask = this.mask;
    parent.addChild(this.wrap);
  }

  /** Reparent the ribbon into a shared container (e.g. the title swing group)
   *  so it hangs and swings together with the logo during the intro. Layout
   *  math stays in container coords — the swing group is a transparent
   *  passthrough at rest, so relayout() needs no awareness of it. */
  attachTo(group: Container): void {
    group.addChild(this.wrap);
  }

  /** Swap to a fresh random phrase (not the current one) and relayout. */
  reroll(logoScale: number): void {
    this.text.text = nextTagline(this.taglines, this.text.text);
    this.relayout(logoScale);
  }

  /**
   * Size the mask to the banner ribbon, place the wrap under the logo, and
   * either center static text or start a right-to-left scroll for overflow.
   */
  relayout(logoScale: number): void {
    const logoNativeW = this.logoSprite.texture.width;
    const logoNativeH = this.logoSprite.texture.height;

    const ribbonW = Math.max(60, logoNativeW * logoScale * 0.82);
    const ribbonH = 40;

    this.mask.clear();
    this.mask.rect(-ribbonW / 2, -ribbonH / 2, ribbonW, ribbonH);
    this.mask.fill(0xffffff);

    const ribbonOffsetY = logoNativeH * logoScale * 0.40;
    // Follow the logo's ACTUAL centre (GameScene top-anchors it), so the ribbon
    // stays glued to the banner across portrait/landscape with no jump.
    const logoCenterY = this.logoSprite.position.y;
    this.wrap.position.set(GAME_W / 2, logoCenterY + ribbonOffsetY);
    this.text.scale.set(logoScale);

    this.scrollTween?.kill();
    this.scrollTween = null;

    // ALWAYS scroll — news-ticker mode, not scroll-only-on-overflow.
    //
    // This used to centre any phrase that fitted the ribbon, which made the
    // banner's behaviour depend on which of the five taglines got rolled: the
    // long ones swept, the short ones sat dead still. It reads as broken rather
    // than as a deliberate fit, and it drifted further as the logo (and with it
    // `ribbonW`) grew, since more phrases started fitting. The ribbon is a
    // ticker; it should move whatever it is showing.
    const textW = this.text.width;
    this.text.anchor.set(0, 0.5);
    this.text.position.set(ribbonW / 2, 0);
    const speed = 45; // design px/sec
    this.scrollTween = gsap.to(this.text, {
      x: -textW - ribbonW / 2,
      duration: (textW + ribbonW) / speed,
      ease: 'linear',
      repeat: -1,
    });
  }

}
