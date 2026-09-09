import { Container } from 'pixi.js';
import gsap from 'gsap';
import { pixelText } from './PixelText';

export const PROGRESS_WAVE_SCALE = 2.5;
const SCALE = PROGRESS_WAVE_SCALE;
const CHAR_W = 8 * 2.5;
const AMPLITUDE = 4;
const DROP = 40;
const STAGGER = 0.015;
const SPEED = 0.35;      // duration of one bounce cycle (seconds)
const FREQUENCY = 0.06;  // stagger delay between chars (seconds)
const SHADOW_PX = SCALE; // drop shadow: a black copy shifted 1×1 source pixel
const SHINE_STAGGER = 0.045; // per-char delay of the light sweep (left → right)
const SHINE_PERIOD = 3;      // seconds between sweeps (matches the button Shine cadence)

/**
 * Animated "xN IS k STEP(S) AWAY!" banner shown during active play.
 * Owns its own character sprites, tweens, and a small queue of gsap.delayedCall
 * handles used during the fall/rise transition between paliers.
 *
 * Vertical center (`cy`) is set externally per layout (portrait vs landscape).
 * Horizontal center is provided via `getCx()` so the banner re-centers when
 * the canvas is resized.
 */
export class ProgressWaveText {
  cy = 445;

  private chars: Container[] = [];
  private transitionChars: Container[] = [];
  private tweens: gsap.core.Tween[] = [];
  private delayedCalls: gsap.core.Tween[] = [];
  private shineTls: gsap.core.Timeline[] = [];
  private transitioning = false;
  // Last-rendered state so relayout() can respawn chars at a new cx/cy
  // without waiting for the next update() from the game HUD.
  private lastMsg: string | null = null;
  private lastStepStart = 0;
  private lastStepEnd = 0;
  private lastMultEnd = 0;
  private lastTint = 0xffffff;
  private lastT = 0;

  constructor(
    private parent: Container,
    private getCx: () => number
  ) {}

  /** Show (or update) the banner for the current step/palier. Rebuilds the
   *  text unless it's already identical to what's displayed. */
  update(stepsRemaining: number, nextPalierLabel: string): void {
    if (this.transitioning) {
      this.clear();
    }

    const { msg, stepStart, stepEnd, multEnd } = this.buildMsg(stepsRemaining, nextPalierLabel);

    // Chars are containers (shadow + glyph + shine), so identity is tracked
    // via the last-spawned message rather than per-char text.
    if (this.chars.length > 0 && this.lastMsg === msg) {
      return;
    }

    this.clear();
    const { tint, t } = this.tintFor(stepsRemaining);
    this.spawnChars(msg, stepStart, stepEnd, multEnd, tint, t);
  }

  /** Re-spawn the current banner at the latest cx/cy. Chars' tween y-targets
   *  are captured at spawn time, so on viewport resize we need to rebuild
   *  them in place — otherwise the banner keeps bouncing around its old
   *  anchor and drifts away from the cash-out button. Called from GameScene
   *  relayout(). No-op if nothing is currently displayed or if a palier
   *  transition is mid-flight. */
  relayout(): void {
    if (this.transitioning || !this.lastMsg || this.chars.length === 0) return;
    const msg = this.lastMsg;
    const stepStart = this.lastStepStart;
    const stepEnd = this.lastStepEnd;
    const multEnd = this.lastMultEnd;
    const tint = this.lastTint;
    const t = this.lastT;
    this.clear();
    this.spawnChars(msg, stepStart, stepEnd, multEnd, tint, t);
  }

  /** Palier transition: old chars fall down staggered, then new chars rise up. */
  transition(stepsRemaining: number, nextPalierLabel: string): void {
    this.clear();

    this.transitioning = true;
    const { msg: newMsg, stepStart, stepEnd, multEnd } = this.buildMsg(stepsRemaining, nextPalierLabel);
    const { tint, t } = this.tintFor(stepsRemaining);
    const cy = this.cy;

    const oldChars = [...this.chars];
    this.chars = [];

    for (const tw of this.tweens) tw.kill();
    this.tweens = [];

    const fallDuration = 0.15;
    const totalFallTime = fallDuration + oldChars.length * STAGGER;

    this.transitionChars = [...oldChars];

    oldChars.forEach((ch, i) => {
      gsap.to(ch, {
        y: cy + DROP,
        alpha: 0,
        duration: fallDuration,
        delay: i * STAGGER,
        ease: 'power2.in',
        onComplete: () => {
          const idx = this.transitionChars.indexOf(ch);
          if (idx !== -1) this.transitionChars.splice(idx, 1);
          ch.parent?.removeChild(ch);
          ch.destroy();
        },
      });
    });

    const riseDelay = totalFallTime + 0.05;
    const riseDuration = 0.15;

    this.delayedCalls.push(gsap.delayedCall(riseDelay, () => {
      if (!this.transitioning) return;

      const cx = this.getCx();
      const totalW = newMsg.length * CHAR_W;
      const startX = cx - totalW / 2 + CHAR_W / 2;

      const newChars: Container[] = [];
      for (let i = 0; i < newMsg.length; i++) {
        const isGold = i < multEnd || (i >= stepStart && i < stepEnd);
        const ch = this.makeChar(startX + i * CHAR_W, cy + DROP, newMsg[i], isGold ? tint : 0xffffff);
        ch.alpha = 0;
        this.parent.addChild(ch);
        newChars.push(ch);
      }

      this.transitionChars = newChars;

      newChars.forEach((ch, i) => {
        gsap.to(ch, {
          y: cy,
          alpha: 1,
          duration: riseDuration,
          delay: i * STAGGER,
          ease: 'power2.out',
        });
      });

      const totalRiseTime = riseDuration + newChars.length * STAGGER;
      this.delayedCalls.push(gsap.delayedCall(totalRiseTime, () => {
        if (!this.transitioning) return;
        for (const ch of newChars) {
          gsap.killTweensOf(ch);
          ch.parent?.removeChild(ch);
          ch.destroy();
        }
        this.transitionChars = [];
        this.spawnChars(newMsg, stepStart, stepEnd, multEnd, tint, t);
        this.transitioning = false;
      }));
    }));
  }

  /** Remove all chars and kill all tweens/delayed calls. */
  clear(): void {
    this.transitioning = false;
    for (const tw of this.tweens) tw.kill();
    this.tweens = [];
    for (const dc of this.delayedCalls) dc.kill();
    this.delayedCalls = [];
    for (const tl of this.shineTls) tl.kill();
    this.shineTls = [];
    for (const ch of this.chars) {
      gsap.killTweensOf(ch);
      ch.parent?.removeChild(ch);
      ch.destroy();
    }
    this.chars = [];
    for (const ch of this.transitionChars) {
      gsap.killTweensOf(ch);
      ch.parent?.removeChild(ch);
      ch.destroy();
    }
    this.transitionChars = [];
  }

  /** Build the banner text plus its gold highlight spans: [0, multEnd) for a
   *  leading multiplier and [stepStart, stepEnd) for the payout/step value —
   *  everything else renders white. multEnd is 0 for the "NEXT STEP PAYS"
   *  shape (its words lead, not the multiplier); deriving it from stepStart
   *  here is what used to tint "NEXT STEP P" gold. */
  private buildMsg(stepsRemaining: number, nextPalierLabel: string) {
    // Continuous ladder: the next reward is always exactly one step away, so
    // the banner sells the payout, not the distance. The highlight span
    // covers the multiplier itself.
    if (stepsRemaining === 1) {
      const prefix = 'NEXT STEP PAYS ';
      const msg = `${prefix}${nextPalierLabel}!`;
      return {
        msg,
        stepStart: prefix.length,
        stepEnd: prefix.length + nextPalierLabel.length,
        multEnd: 0,
      };
    }
    const stepStr = `${stepsRemaining}`;
    const msg = `${nextPalierLabel} IS ${stepStr} STEP${stepsRemaining > 1 ? 'S' : ''} AWAY!`;
    const stepStart = nextPalierLabel.length + 4;
    const stepEnd = stepStart + stepStr.length;
    // "<xN> IS <k> …": the leading multiplier ends 4 chars (" IS ") before
    // the step number's span.
    return { msg, stepStart, stepEnd, multEnd: stepStart - 4 };
  }

  private tintFor(stepsRemaining: number): { tint: number; t: number } {
    const t = Math.max(0, Math.min(1, 1 - (stepsRemaining - 1) / 6));
    const colors = [0xffffcc, 0xffee88, 0xffdd44, 0xffd700, 0xffcc00, 0xffbb00, 0xffaa00];
    const colorIdx = Math.min(Math.floor(t * (colors.length - 1)), colors.length - 1);
    return { tint: colors[colorIdx], t };
  }

  /** One banner character: a solid black drop shadow (a copy of the glyph
   *  shifted 1×1 source pixel), the tinted glyph, and a white overlay copy
   *  the shine sweep flashes. Grouped in a Container so the wave/fall/rise
   *  tweens move all three as one. */
  private makeChar(x: number, y: number, c: string, tint: number): Container {
    const wrap = new Container();
    wrap.position.set(x, y);
    wrap.zIndex = 70;
    const shadow = pixelText(SHADOW_PX, SHADOW_PX, c);
    shadow.anchor.set(0.5);
    shadow.scale.set(SCALE);
    shadow.tint = 0x000000;
    const glyph = pixelText(0, 0, c);
    glyph.anchor.set(0.5);
    glyph.scale.set(SCALE);
    glyph.tint = tint;
    const shine = pixelText(0, 0, c);
    shine.anchor.set(0.5);
    shine.scale.set(SCALE);
    shine.alpha = 0; // driven by the sweep timelines in spawnChars()
    wrap.addChild(shadow, glyph, shine);
    return wrap;
  }

  private spawnChars(
    msg: string,
    stepStart: number,
    stepEnd: number,
    multEnd: number,
    tint: number,
    t: number
  ): void {
    this.lastMsg = msg;
    this.lastStepStart = stepStart;
    this.lastStepEnd = stepEnd;
    this.lastMultEnd = multEnd;
    this.lastTint = tint;
    this.lastT = t;
    const cx = this.getCx();
    const cy = this.cy;
    const totalW = msg.length * CHAR_W;
    const startX = cx - totalW / 2 + CHAR_W / 2;
    const speed = SPEED * (1 - t * 0.55);
    const freq = FREQUENCY * (1 - t * 0.5);

    // Gold spans (leading multiplier + payout/step value) come from
    // buildMsg(); the connecting words read in white for contrast.
    for (let i = 0; i < msg.length; i++) {
      const isGold = i < multEnd || (i >= stepStart && i < stepEnd);
      const ch = this.makeChar(startX + i * CHAR_W, cy, msg[i], isGold ? tint : 0xffffff);
      this.parent.addChild(ch);
      this.chars.push(ch);

      const tw = gsap.to(ch, {
        y: cy - AMPLITUDE,
        duration: speed,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: i * freq,
      });
      this.tweens.push(tw);

      // Shine: a light reflection sweeps the banner left → right every few
      // seconds — each glyph's white overlay flashes in a staggered wave.
      const overlay = ch.children[2];
      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: SHINE_PERIOD,
        delay: 0.8 + i * SHINE_STAGGER,
      });
      tl.to(overlay, { alpha: 0.9, duration: 0.09, ease: 'sine.in' })
        .to(overlay, { alpha: 0, duration: 0.18, ease: 'sine.out' });
      this.shineTls.push(tl);
    }
  }
}
