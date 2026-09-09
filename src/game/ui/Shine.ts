import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';

export interface ShineGeometry {
  cx: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Diagonal white shine that periodically sweeps across a button — subtle
 * "I can be clicked" cue. Geometry is resolved lazily at each `start()`
 * call via the supplied callback, so size/position changes between games
 * (e.g. portrait vs. landscape) pick up automatically.
 */
export class Shine {
  private shine: Graphics | null = null;
  private mask: Graphics | null = null;
  private tween: gsap.core.Tween | null = null;

  constructor(
    private parent: Container,
    private getGeometry: () => ShineGeometry
  ) {}

  start(): void {
    this.stop();
    const { cx, y, w, h } = this.getGeometry();

    const shineW = 14;
    const skew = h * 0.6;
    const shine = new Graphics();
    shine.poly([skew, 0, skew + shineW, 0, shineW, h, 0, h]);
    shine.fill({ color: 0xffffff, alpha: 0.35 });
    shine.position.set(cx - w / 2 - 30, y - h / 2);
    shine.zIndex = 71;
    this.parent.addChild(shine);

    const mask = new Graphics();
    mask.rect(cx - w / 2, y - h / 2, w, h);
    mask.fill(0xffffff);
    this.parent.addChild(mask);
    shine.mask = mask;

    this.shine = shine;
    this.mask = mask;
    this.tween = gsap.fromTo(
      shine,
      { x: cx - w / 2 - 30 },
      { x: cx + w / 2 + 30, duration: 0.4, ease: 'sine.inOut', delay: 0.8, repeat: -1, repeatDelay: 3 }
    );
  }

  stop(): void {
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
    if (this.shine) {
      this.shine.mask = null;
      this.shine.parent?.removeChild(this.shine);
      this.shine.destroy();
      this.shine = null;
    }
    if (this.mask) {
      this.mask.parent?.removeChild(this.mask);
      this.mask.destroy();
      this.mask = null;
    }
  }

  /** True while the sweep is currently running. */
  get isActive(): boolean {
    return this.tween !== null;
  }
}
