/**
 * Pixel sparks out of the skull's eye sockets on the RABBIT ROYALE banner —
 * the same flame the hub's cabinet spits from its RR thumbnail
 * (hub `attract-screen.tsx` → stepEmbers/paintEmbers), ported to Pixi so the
 * game's own logo carries the identity the arcade already gave it.
 *
 * Three things are load-bearing and were learned on the hub side:
 *  - the emitters are FRACTIONS of the drawn logo rect, not fixed pixels, so
 *    they track the sprite through every scale and relayout;
 *  - sparks fan OUTWARD from the midline — one that climbs straight up spends
 *    its whole life against the bone-white skull it came from and is never
 *    seen (same reason the ramp starts amber, not white-hot);
 *  - they step at a deliberate 30fps: at 1-2px a spark, display-rate stepping
 *    buys sub-pixel motion nobody can see.
 *
 * `prefers-reduced-motion` turns them OFF rather than slowing them down.
 */
import { Container, Graphics, type Sprite } from 'pixi.js';

/** Eye sockets, as fractions of the banner's drawn rect. MEASURED on
 *  `RR-Logo_Banner.png` (365x106) rather than eyeballed: a dark pixel counts as
 *  socket only when bone surrounds it on all four sides, which is what
 *  separates the holes from the skull's own outline (the outline's centroid
 *  sits well above the eyes — aiming at it puts the flame over the crown).
 *
 *  RE-MEASURED for the redrawn banner (365x106, the wide wordmark stacked over
 *  a compact one). These are FRACTIONS of the rect they are applied to, so the
 *  taller sheet moved the eyes UP the frame: y fell from 0.542 to ~0.397 while
 *  x barely moved, which is exactly what a sheet growing from 78 to 106 rows
 *  does to a fixed pixel row. Taken from the two socket blobs themselves
 *  (106 and 107 px, symmetric about the skull) rather than from a
 *  flood-fill heuristic — that one locked onto the side banners' shadow and
 *  put the flames outside the skull entirely. */
export const SKULL_EMBERS: readonly { x: number; y: number }[] = [
  { x: 0.467, y: 0.397 },
  { x: 0.531, y: 0.396 },
];

const RAMP = [0xffe27a, 0xffab2e, 0xf4571b, 0xb52a10];
const STEP_MS = 1000 / 30;

/** Every knob of the flame. Exposed as one object so the Storybook story can
 *  drive it live (`FX/Logo embers` → Controls) and the numbers that ship are
 *  the ones you tuned there. */
export interface EmberTuning {
  /** Sparks per second, PER socket. */
  rate: number;
  /** Ceiling on live sparks — the sockets share the budget. */
  cap: number;
  /** Upward speed, in fractions of the banner's HEIGHT per second. */
  climb: number;
  /** Random extra climb on top of `climb`. */
  climbVar: number;
  /** Sideways fan, in height-fractions/s (converted to width on spawn). */
  spread: number;
  /** Wobble amplitude, same units as `spread`. */
  drift: number;
  /** Lifetime in seconds, plus a random extra. */
  ttl: number;
  ttlVar: number;
  /** Sparks are killed above this height (0 = the banner's top edge), so the
   *  plume stays on the skull instead of drifting over the crown. */
  ceiling: number;
  /** Share of sparks drawn 2 art-pixels wide instead of 1. */
  fatChance: number;
  /**
   * How fast a spark COOLS along the amber→red ramp, as an exponent on its
   * age: 1 walks the ramp evenly, >1 holds the bright end (slower), and <1
   * dives to the reds early. Cooling is deliberately separate from `ttl` —
   * lifetime decides how far a spark travels, this decides what colour it is
   * while it does, and the two want opposite values here (long-lived sparks
   * that stay yellow read as sparkle, not fire).
   */
  cooling: number;
}

/**
 * The shipping look. The hub's thumbnail is ~90 stage px wide and the banner
 * is drawn ~4x that, so a rate that reads as flame there is a thin trickle
 * here — hence the higher rate and the short climb: the sparks must live ON
 * the skull, and a reach sized against the whole banner puts them above the
 * crown where they read as specks in the sky.
 */
export const EMBER_TUNING: EmberTuning = {
  rate: 48,
  cap: 270,
  // Peko tuned the density and the fan at 0.23/0.29 climb, which reads as a
  // furnace — but at that speed the base of the jet is already clear of the
  // bone, so the sockets themselves look empty. Halved: same shape, same
  // reach over the round trip, and the flame now STARTS in the eyes.
  climb: 0.11,
  climbVar: 0.14,
  spread: 0.16,
  drift: 0.05,
  ttl: 2.5,
  ttlVar: 1.0,
  ceiling: 0.16,
  fatChance: 1.0,
  // Under 1: the ramp is walked early, so a spark is red for most of its
  // (long) life instead of hanging on to the yellows.
  cooling: 0.55,
};

/**
 * THE FLAME IS THE RUN'S DEPTH.
 *
 * On the setup screen the skull burns at `EMBER_TUNING` — a full flame, which
 * is the game's resting identity. The moment a round starts it is cut back to
 * a couple of sparks and then climbs GEOMETRICALLY with every safe step, so
 * the sign catches fire as the player walks: by around the tenth step it is
 * back to the attract flame, and a deep run leaves it well past anything the
 * idle screen ever shows.
 *
 * Why steps and not the multiplier: they are the same information (the ladder
 * is a function of steps) but steps tick EVERY move, so the flame answers each
 * tap instead of jumping only at a palier. And why geometric: a linear ramp
 * over a 27-step ladder is invisible move to move — the point is that the
 * eighteenth step has to feel like a different fire from the third.
 *
 * COSMETIC ONLY. Like every other drama constant in this game, none of this
 * touches an outcome; the flame reports the depth, it never predicts a mine.
 */
export function runEmberTuning(steps: number): Partial<EmberTuning> {
  const rate = Math.min(RUN_RATE_MAX, RUN_RATE_START * Math.pow(RUN_RATE_GROWTH, Math.max(0, steps - 1)));
  return {
    rate,
    // The cap is what actually limits a dense plume (rate x sockets x life is
    // the steady-state population), so it has to climb with the rate or the
    // flame stops growing the moment it fills.
    cap: Math.min(RUN_CAP_MAX, Math.ceil(rate * SOCKET_COUNT * EMBER_TUNING.ttl)),
  };
}

/** Sparks per second, PER socket, on the first step of a run — a trickle. */
const RUN_RATE_START = 5;
/** What a very deep run reaches. Past the idle flame's 48 on purpose. */
const RUN_RATE_MAX = 110;
/** Per step. 1.28 passes the idle rate around step 10 and tops out near 14. */
const RUN_RATE_GROWTH = 1.28;
/** Hard ceiling on live sparks in a run. Every one is a `rect` per frame, so
 *  this is the number that decides what the deepest runs cost to draw. */
const RUN_CAP_MAX = 420;
/** `SKULL_EMBERS.length`, but the spawn budget is shared per socket. */
const SOCKET_COUNT = 2;

interface Ember {
  x: number; // fraction of the logo rect
  y: number;
  vx: number;
  vy: number;
  drift: number;
  phase: number;
  life: number;
  ttl: number;
  fat: boolean;
}

export class LogoEmbers {
  private gfx = new Graphics();
  private list: Ember[] = [];
  private spawnAcc = 0;
  private acc = 0;
  private x0 = 0;
  private y0 = 0;
  private w = 0;
  private h = 0;
  private enabled: boolean;
  private t: EmberTuning;
  private sockets: readonly { x: number; y: number }[];

  /**
   * @param parent  container to paint into (the logo's own swing group, so
   *                the sparks hang and sway with the sign).
   * @param zIndex  above the logo sprite.
   */
  constructor(
    parent: Container,
    zIndex = 11,
    tuning: Partial<EmberTuning> = {},
    sockets: readonly { x: number; y: number }[] = SKULL_EMBERS,
  ) {
    this.t = { ...EMBER_TUNING, ...tuning };
    this.sockets = sockets;
    this.gfx.zIndex = zIndex;
    parent.addChild(this.gfx);
    this.enabled =
      typeof window === 'undefined' ||
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!this.enabled) this.gfx.visible = false;
  }

  /**
   * Park the field on the logo's DRAWN rect. Takes the SPRITE, not four
   * numbers, and reads its bounds — the caller must not have to know whether
   * the anchor is 0 or 0.5 (the game centres the banner, a story may not), and
   * that ambiguity is exactly what once put the flame above the crown instead
   * of in the sockets.
   */
  setRect(logo: Sprite): void {
    // Read the rect from the sprite's OWN transform, never from getBounds():
    // bounds are global, so they fold in every ancestor's position — and the
    // game parks the title group AFTER building it, so a rect captured at
    // construction time is stale by the time the sign is on screen (the flame
    // ended up over the wordmark instead of the sockets). Local geometry is
    // true the moment the sprite exists and stays true through relayouts.
    //
    // The Graphics itself never moves; the paint owns the offset. Doing both
    // would compose and push the flame off the skull by the rect's origin.
    const w = logo.width;
    const h = logo.height;
    this.gfx.position.set(0, 0);
    this.x0 = logo.position.x - w * logo.anchor.x;
    this.y0 = logo.position.y - h * logo.anchor.y;
    this.w = w;
    this.h = h;
  }

  /**
   * Retune a LIVE field — the knobs the game drives while a run is on.
   *
   * Merged, not replaced, so a caller can move `rate`/`cap` without having to
   * restate the twelve numbers that decide what the flame LOOKS like. Sparks
   * already in the air keep the shape they were born with and simply burn out;
   * that is what makes a change of intensity read as the fire catching or
   * dying down rather than as a cut.
   */
  setTuning(tuning: Partial<EmberTuning>): void {
    this.t = { ...this.t, ...tuning };
    // A cap that just came DOWN must not leave a crowd hanging in the air —
    // drop the oldest sparks (the front of the list) so the plume thins from
    // the top, where they are already cooling out.
    if (this.list.length > this.t.cap) this.list.splice(0, this.list.length - this.t.cap);
  }

  /** Advance + repaint. `deltaMs` from the Pixi ticker. */
  update(deltaMs: number): void {
    if (!this.enabled || this.w <= 0) return;
    this.acc += deltaMs;
    if (this.acc < STEP_MS) return;
    const dt = this.acc / 1000;
    this.acc = 0;
    this.step(dt);
    this.paint();
  }

  private step(dt: number): void {
    for (const e of this.list) {
      e.life += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy *= Math.pow(0.72, dt); // eases off as it climbs, without stalling
    }
    // Splice-free compaction — this runs every frame the logo is on screen.
    let n = 0;
    // Sparks climb a little way ABOVE the banner (y < 0) — that plume is the
    // point; drop them only once they are well clear of the sign.
    for (const e of this.list) if (e.life < e.ttl && e.y > this.t.ceiling) this.list[n++] = e;
    this.list.length = n;

    this.spawnAcc += dt * this.t.rate * this.sockets.length;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.list.length >= this.t.cap) break;
      const src = this.sockets[Math.floor(Math.random() * this.sockets.length)];
      const out = src.x < 0.5 ? -1 : 1;
      // Positions stay in the rect's OWN fractions (x of width, y of height):
      // the sockets are measured that way and paint reads them back the same,
      // so there is nowhere for a unit mix-up to hide.
      //
      // vy is picked from the REACH, not by eye. With the 0.72^dt damping the
      // travel over a life t is v0 × (1 − 0.72^t)/(−ln 0.72) ≈ 1.36 × v0.
      // The plume must be READ INSIDE THE SOCKET, so it is sized against the
      // skull (~0.55 of the banner's height), not against the banner: at
      // ~0.16 height-fractions/s a spark spends most of its life over the
      // bone, which is where the flame is supposed to live. Twice that and
      // the sockets look empty while sparks hover above the crown.
      // vx and drift are in WIDTH fractions and scaled by aspect so a spark
      // travels as far sideways as upward IN PIXELS — without that factor the
      // plume fans ~4.7x wider than it climbs and leaves the skull sideways
      // while sitting at the right height (which reads as "aimed wrong" but
      // is really "spread too wide").
      const aspect = this.h / this.w;
      this.list.push({
        x: src.x + (Math.random() - 0.5) * 0.008,
        y: src.y + (Math.random() - 0.5) * 0.02,
        vx: out * (this.t.spread * (0.4 + Math.random() * 0.6)) * aspect,
        vy: -(this.t.climb + Math.random() * this.t.climbVar),
        drift: this.t.drift * (0.4 + Math.random() * 0.6) * aspect,
        phase: Math.random() * Math.PI * 2,
        life: 0,
        // The reach is roughly vy × ttl, and the reach is what makes the
        // stream read as flame rather than as specks on the art.
        ttl: this.t.ttl + Math.random() * this.t.ttlVar,
        fat: Math.random() < this.t.fatChance,
      });
    }
  }

  private paint(): void {
    const g = this.gfx;
    g.clear();
    for (const e of this.list) {
      const t = e.life / e.ttl;
      // A spark about to die BLINKS out rather than fading — there is no alpha
      // to spend at this size.
      if (t > 0.82 && Math.floor(e.life * 16) % 2 === 0) continue;
      const cooled = Math.pow(t, this.t.cooling);
      const step = Math.min(RAMP.length - 1, Math.floor(cooled * RAMP.length));
      const wob = Math.sin(e.phase + e.life * 4) * e.drift;
      // Sparks are sized against the BANNER, not in device pixels: the sign is
      // drawn anywhere from ~250 to ~900 px wide, and a fixed 1-2 px spark is
      // a lone speck at the top of that range. One "spark pixel" is the
      // banner's own art pixel (365 native px across), so the flame keeps the
      // chunky look of the sprite it comes out of at every size.
      const unit = Math.max(1, Math.round(this.w / 365));
      const size = (e.fat && t < 0.6 ? 2 : 1) * unit;
      g.rect(
        Math.round(this.x0 + (e.x + wob) * this.w),
        Math.round(this.y0 + e.y * this.h),
        size,
        size,
      ).fill(RAMP[step]);
    }
  }

  destroy(): void {
    this.list.length = 0;
    this.gfx.destroy();
  }
}
