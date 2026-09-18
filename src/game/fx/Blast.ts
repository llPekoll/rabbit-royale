/**
 * The bomb going off.
 *
 * What shipped before this module was ONE thing: the 14-frame 48px sheet at
 * 1.6x over the tile, plus an 8-beat shake. It read as weak while farming, and
 * for two separate reasons.
 *
 * ## It was drawn under the island
 *
 * The scene adds the explosion to the SAME sorted container the terrain lives
 * in, at a literal `zIndex = 55`. The terrain sorts its blocks by
 * `isoDepth = (col + row) * 16 + tier` — hundreds by mid-island — and `Tile`
 * matches that ruler (`tileDepth * 16 + tier`). So 55 is the depth of a cell
 * three steps from the island's back corner: EVERYWHERE else on the board, the
 * ground, the trees and the cliff faces were drawn over the fire. That was most
 * of the problem, and it cost nothing to fix — see `blastDepth`.
 *
 * ## A blast is a sequence, not a picture of fire
 *
 * The eye reads an explosion in an order, and four of the five beats were
 * missing:
 *
 *   1. a FLASH, before anything else is legible. The sheet's own first frames
 *      fade up over three frames, which reads as something IGNITING; the flash
 *      is what makes it read as detonating.
 *   2. a SHOCKWAVE leaving the centre, flat on the ground and on the isometric
 *      ellipse the tiles are drawn on. This is what gives the blast a SIZE:
 *      without it there is 77px of fire on a 44px tile and nothing saying how
 *      far the damage went.
 *   3. DEBRIS thrown out and falling back — motion that outlives the fire, so
 *      the effect does not end on a hard cut when the sheet runs out.
 *   4. SMOKE that lingers a beat after the fire is gone. Without it the tile
 *      snapped from full brightness to bare grass: by 120ms it was already
 *      perfectly clean, and the skull does not fade in until 250ms.
 *   5. the SHAKE. The old one was a symmetric yoyo, the same amplitude eight
 *      times, which reads as the screen wobbling rather than as something
 *      hitting the ground — an impact has a loudest moment and then decays.
 *
 * Every number here was set in `FX/Explosion` (src/stories/Explosion.stories.tsx),
 * which drives THIS module: the story is the tuning surface, one control per
 * layer, and it can turn each of them off to show what the game looked like
 * without it.
 */
import {
  AnimatedSprite, ColorMatrixFilter, Container, Graphics, Sprite, Texture,
  type Renderer,
} from 'pixi.js';
import gsap from 'gsap';
import { getExplosionTextures } from '../services/AssetLoader';
import { HALF_W, HALF_H, tilePos, tileDepth, toColRow } from '@/config/gridConfig';
import { levelTierAt, tierLift } from '@/lib/game/terrainBoard';

/* ── the numbers, as tuned in FX/Explosion ──────────────────────────────── */

/** Scale on the 48px sheet. Was 1.6 — i.e. 77px of fire on a 44px tile. */
export const FIRE_SCALE = 2.2;
/** Frames per second the 14-frame sheet plays at. */
export const FIRE_FPS = 20;
/**
 * Pixels the fire is lifted off the tile's top face. An explosion whose middle
 * sits ON the ground reads as a puddle rather than as something going off.
 */
export const FIRE_LIFT = 20;
/** Scale of the white blow-out, as a multiple of the 64px disc. */
const FLASH_SCALE = 1.4;
/** How far the ground ring travels, in tiles of radius. */
const SHOCKWAVE_TILES = 2.5;
/** Chunks thrown out per blast. */
const DEBRIS_COUNT = 18;
/** Smoke puffs per blast. */
const SMOKE_COUNT = 8;
/** Alpha of the scorch burnt into the tile face, at its darkest. */
const SCORCH_ALPHA = 0.55;
/**
 * Seconds the scorch holds before it fades off the grass.
 *
 * It is a SCAR, not a monument: the island's permanent "someone died here" is
 * `Tile.markBombSite`'s skull, which is drawn on the tile itself and cleaned up
 * with it. Left forever, the scorch was an orphan ellipse on a container
 * nothing owns — it accumulated one per blast for the life of the scene, and on
 * a tile the rabbit had walked off it read as a shadow with nothing casting it.
 */
const SCORCH_HOLD = 2.4;
const SCORCH_FADE = 1.6;
/** Peak board kick, in design px. Was 4 — which nobody felt. */
export const SHAKE_PX = 9;

/**
 * Where each beat starts, in ms after the bomb goes off.
 *
 * Debris and smoke start a frame or two IN, once the flash has cleared:
 * thrown on frame 0 they are lost inside the white and the effect spends its
 * loudest moment showing nothing.
 */
const AT_DEBRIS = 60;
const AT_KNOCKBACK = 80;
const AT_SMOKE = 120;
const AT_SCORCH = 150;

/* ── the soft discs ─────────────────────────────────────────────────────── */

/**
 * The smoke and flash discs, generated once per renderer.
 *
 * Drawn with `Graphics` per particle they would be a fresh geometry each — a
 * blast spawns dozens, and at that point the effect pays for its own frame
 * drop on exactly the frame it needs to be smooth.
 */
let discs: { smoke: Texture; flash: Texture } | null = null;

function softDisc(renderer: Renderer, color: number): Texture {
  const g = new Graphics();
  const R = 32;
  // Concentric rings rather than a shader: cheap, and this is a pixel-art
  // game, so a crunchy falloff is not a defect here.
  for (let i = 8; i >= 1; i--) {
    g.circle(R, R, (R * i) / 8).fill({ color, alpha: 0.12 });
  }
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** Build the particle discs. Idempotent; call once the renderer exists. */
export function initBlastTextures(renderer: Renderer): void {
  if (discs) return;
  discs = {
    smoke: softDisc(renderer, 0x2b2b33),
    flash: softDisc(renderer, 0xffffff),
  };
}

/* ── depth ──────────────────────────────────────────────────────────────── */

/**
 * The depth a blast on `index` sorts at, on the TERRAIN's ruler.
 *
 * `over` is the step INSIDE that cell — the same thing `Tile` does with its own
 * children (its fog is 0, a hint 40, a skull 39). Adding it to the tile's own
 * depth is what keeps the fire in front of the ground it is standing on and
 * behind the hill in front of it, instead of behind both.
 */
export function blastDepth(seed: string, index: number, over: number): number {
  const { col, row } = toColRow(index);
  return tileDepth(index) * 16 + levelTierAt(seed, col, row) + over;
}

/* ── the blast ──────────────────────────────────────────────────────────── */

export interface BlastOptions {
  /**
   * Knock a neighbour back — the rabbit standing next to the tile. Given the
   * blast's origin so it can be shoved AWAY from it: the rabbit is the only
   * thing on screen that can say the blast had a direction.
   */
  onShockwave?: (origin: { x: number; y: number }) => void;
  /**
   * Skip the scorch — the dark ellipse burnt onto the tile face.
   *
   * It exists to say "the ground here is charred" on a cell that otherwise
   * goes back to being plain grass. Where the terrain swaps in the painted
   * pit (`IsoIslandView.digCell`) the ground already says it, permanently and
   * in the island's own palette, and the scorch becomes a dark blob fading in
   * and out over a hole that is staying — two marks for one event, the
   * temporary one on top.
   */
  noScorch?: boolean;
}

/**
 * Play the whole blast on `index`, into `world`.
 *
 * `world` is the scene's sorted container — the one holding the terrain, the
 * tiles and the rabbits — because every layer here has to sort against them.
 *
 * Fire-and-forget: each piece removes and destroys itself, so nothing has to
 * be tracked. The returned function cancels the pending beats, for a scene
 * torn down mid-blast.
 */
export function playBlast(
  world: Container,
  seed: string,
  index: number,
  opts: BlastOptions = {},
): () => void {
  const { x: bx, y: flatY } = tilePos(index);
  /** The tile's top FACE, not the grid plane — the terrace it sits on. */
  const groundY = flatY - tierLift(seed, index);
  const z = (over: number) => blastDepth(seed, index, over);

  const timers = new Set<number>();
  const after = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };

  // ---- 1. the flash ------------------------------------------------------
  if (discs) {
    const f = new Sprite(discs.flash);
    f.anchor.set(0.5);
    f.position.set(bx, groundY - FIRE_LIFT);
    f.zIndex = z(7);
    f.blendMode = 'add';
    f.scale.set(FLASH_SCALE);
    f.alpha = 0.9;
    world.addChild(f);
    gsap.to(f, {
      alpha: 0, duration: 0.14, ease: 'power2.in',
      onComplete: () => { world.removeChild(f); f.destroy(); },
    });
    gsap.to(f.scale, { x: FLASH_SCALE * 1.6, y: FLASH_SCALE * 1.6, duration: 0.14 });
  }

  // ---- the fire ----------------------------------------------------------
  const textures = getExplosionTextures();
  if (textures.length > 0) {
    const boom = new AnimatedSprite(textures);
    boom.anchor.set(0.5);
    boom.position.set(bx, groundY - FIRE_LIFT);
    boom.scale.set(FIRE_SCALE);
    boom.zIndex = z(6);
    boom.animationSpeed = FIRE_FPS / 60;
    boom.loop = false;
    boom.onComplete = () => { world.removeChild(boom); boom.destroy(); };
    world.addChild(boom);
    boom.play();
  }

  // ---- 2. the shockwave --------------------------------------------------
  // Flat on the ground, on the ISOMETRIC ellipse — a circle here would read as
  // a ring standing up in the air rather than as the ground answering.
  {
    const ring = new Graphics();
    ring.zIndex = z(1); // over the tile face, under anything standing on it
    ring.position.set(bx, groundY);
    world.addChild(ring);
    const max = SHOCKWAVE_TILES * HALF_W * 2;
    const state = { r: 6, a: 0.85 };
    gsap.to(state, {
      r: max, a: 0, duration: 0.45, ease: 'power2.out',
      onUpdate: () => {
        ring.clear();
        ring.ellipse(0, 0, state.r, state.r * (HALF_H / HALF_W));
        ring.stroke({ color: 0xfff1c4, alpha: state.a, width: 3 });
      },
      onComplete: () => { world.removeChild(ring); ring.destroy(); },
    });
  }

  // ---- 3. the debris -----------------------------------------------------
  after(AT_DEBRIS, () => {
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const chunk = new Graphics();
      const size = 2 + Math.random() * 3;
      chunk.rect(-size / 2, -size / 2, size, size)
        .fill({ color: Math.random() < 0.4 ? 0x8a5a2b : 0x4b3a22 });
      chunk.position.set(bx, groundY - 6);
      chunk.zIndex = z(6);
      world.addChild(chunk);

      const dir = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 46;
      // Iso-squashed travel: the ground is drawn at 2:1, so a chunk thrown
      // "north" must cover half the pixels of one thrown "east", or it reads as
      // skidding across the SCREEN rather than across the field.
      const dx = Math.cos(dir) * dist;
      const dy = Math.sin(dir) * dist * (HALF_H / HALF_W);
      const rise = 22 + Math.random() * 26;
      const t = 0.45 + Math.random() * 0.35;
      gsap.to(chunk, { x: bx + dx, duration: t, ease: 'none' });
      // Up then down on separate tweens — one tween straight to the landing
      // point draws a straight line, which is the one shape a thrown thing
      // never travels in.
      gsap.timeline()
        .to(chunk, { y: groundY - 6 - rise, duration: t * 0.4, ease: 'power2.out' })
        .to(chunk, { y: groundY + dy, duration: t * 0.6, ease: 'power2.in' });
      gsap.to(chunk, {
        alpha: 0, duration: 0.25, delay: t,
        onComplete: () => { world.removeChild(chunk); chunk.destroy(); },
      });
    }
  });

  // ---- 4. the smoke ------------------------------------------------------
  // Lingers AFTER the fire, so the tile does not snap from full brightness to
  // bare grass. This is also what covers the gap the skull's 0.25s delay left.
  after(AT_SMOKE, () => {
    if (!discs) return;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const puff = new Sprite(discs.smoke);
      puff.anchor.set(0.5);
      puff.position.set(bx + (Math.random() - 0.5) * 22, groundY - 4);
      puff.zIndex = z(5);
      puff.alpha = 0.55;
      const s = 0.4 + Math.random() * 0.4;
      puff.scale.set(s);
      world.addChild(puff);
      gsap.to(puff, {
        y: puff.y - (26 + Math.random() * 26),
        x: puff.x + (Math.random() - 0.5) * 24,
        alpha: 0,
        duration: 0.9 + Math.random() * 0.6,
        delay: i * 0.05,
        ease: 'power1.out',
        onComplete: () => { world.removeChild(puff); puff.destroy(); },
      });
      gsap.to(puff.scale, { x: s * 2.2, y: s * 2.2, duration: 1.2, delay: i * 0.05 });
    }
  });

  // ---- 5. the scorch -----------------------------------------------------
  // What is LEFT. Burnt into the tile face on the iso diamond, under the skull
  // that fades in over it.
  //
  // Parented to `world` rather than to the Tile because it outlives nothing in
  // particular and has to sort against the terrain, same as every layer above.
  if (!opts.noScorch) after(AT_SCORCH, () => {
    const g = new Graphics();
    g.ellipse(0, 0, HALF_W * 0.8, HALF_H * 0.8).fill({ color: 0x1a1209, alpha: SCORCH_ALPHA });
    g.position.set(bx, groundY);
    g.zIndex = z(0);
    g.alpha = 0;
    world.addChild(g);
    gsap.timeline()
      .to(g, { alpha: 1, duration: 0.3, delay: 0.1 })
      // ...and then off the grass again. Removed rather than left at alpha 0,
      // so a long session does not stack an invisible Graphics per bomb.
      .to(g, {
        alpha: 0,
        duration: SCORCH_FADE,
        delay: SCORCH_HOLD,
        onComplete: () => { world.removeChild(g); g.destroy(); },
      });
  });

  // ---- the neighbour taking it -------------------------------------------
  if (opts.onShockwave) {
    after(AT_KNOCKBACK, () => opts.onShockwave?.({ x: bx, y: groundY }));
  }

  return () => { for (const t of timers) window.clearTimeout(t); timers.clear(); };
}

/**
 * Shove a container away from a blast, then let it settle back.
 *
 * Used on the rabbit standing next to the tile. Separate from `playBlast`
 * because the scene owns the rabbits and knows which one is where; this is
 * just the motion.
 */
export function knockBack(c: Container, origin: { x: number; y: number }): void {
  const home = { x: c.x, y: c.y };
  gsap.killTweensOf(c);
  const ang = Math.atan2(c.y - origin.y, c.x - origin.x);
  gsap.timeline()
    .to(c, {
      x: home.x + Math.cos(ang) * 14,
      y: home.y + Math.sin(ang) * 8 - 10,
      duration: 0.12, ease: 'power2.out',
    })
    .to(c, { x: home.x, y: home.y, duration: 0.3, ease: 'bounce.out' });
}

/**
 * Is a blinking-out sprite visible at `t` (0..1) through its exit?
 *
 * The count of blinks grows with the SQUARE of progress, so the gaps tighten
 * as it goes: a constant flicker reads as a fault, one that accelerates reads
 * as something losing its grip. Pure like `flashOnAt`, and split out for the
 * same reason — the toggling is too fast to judge from a screenshot.
 */
const BLINK_OUT_BEATS = 15;

export function blinkOutVisibleAt(t: number): boolean {
  // Two parities are load-bearing here and both were wrong once:
  //   - counted from an offset of 3, the sprite STARTED hidden, opening the
  //     exit on a frame of nothing — which reads as the instant vanish this
  //     replaces;
  //   - ending on an even count leaves it VISIBLE on the last frame, so the
  //     tween's own `visible = false` is a hard cut rather than the arrival of
  //     the flicker.
  // From zero, over an ODD number of blinks, it opens visible and lands hidden.
  return Math.floor(t * t * BLINK_OUT_BEATS) % 2 === 0;
}

/**
 * Blink a sprite to a flat WHITE silhouette and back — the hit flash.
 *
 * A colour MATRIX rather than `tint`, for the reason `IslandShadow` hit first:
 * `tint` multiplies, so tinting a brown rabbit white leaves a brown rabbit.
 * Sending every channel to 1 while keeping alpha gives a real stencil, which
 * is what reads as "this thing was just struck" at two frames long.
 *
 * `times` blinks rather than one long flash: a single 300ms white rabbit reads
 * as a rendering fault, three short ones read as damage.
 */
/**
 * Is the flash showing white at `t` blinks in?
 *
 * Split out of `hitFlash` so the schedule can be pinned by a test. Two earlier
 * shapes of this both failed SILENTLY on screen — every blink collapsing onto
 * one frame, then the filter latching on and never clearing — and neither was
 * catchable by screenshot, because a blink is shorter than a capture is
 * reliable. A pure function of the clock is testable, and having the rendered
 * state be a pure function of the clock is also what stops the two failures:
 * there is no ordering left to get wrong.
 */
export function flashOnAt(t: number, on: number, off: number): boolean {
  // `t` counts blinks, so its fractional part is the position within one.
  return (t % 1) < on / (on + off);
}

export function hitFlash(c: Container, times = 3, on = 0.05, off = 0.06): void {
  const white = new ColorMatrixFilter();
  white.matrix = [
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 1, 0,
  ];
  // Kept off the sprite until it is wanted: a filter left attached costs a
  // render pass on every frame of a run for two frames of use.
  const had = (c.filters ?? []) as never;

  // ONE tween carrying a clock, read every frame — not a chain of scheduled
  // callbacks. Two earlier shapes both failed silently:
  //   - `tl.to({}, { duration })` as a spacer tweens no property, so GSAP folds
  //     it to zero and all the blinks fire on the same frame;
  //   - `.call()`s placed by position around a parallel spacer tween fired, but
  //     ordered so the filter was set and never cleared between them.
  // A number driven from 0 to `times` and floored is immune to both: the state
  // is a pure function of the clock, so there is no ordering to get wrong.
  const clock = { t: 0 };
  /** What is currently on the sprite — see the note in `onUpdate`. */
  let shown = false;
  gsap.to(clock, {
    t: times,
    duration: times * (on + off),
    ease: 'none',
    onUpdate: () => {
      const want = flashOnAt(clock.t, on, off);
      // The wanted state is tracked HERE rather than read back off `filters`:
      // Pixi normalises what it is given, so the getter does not hand back the
      // array that was set and an `isOn` derived from it never changed — which
      // left the filter latched on for the whole tween however many blinks were
      // asked for.
      if (want !== shown) {
        shown = want;
        c.filters = (want ? [white] : []) as never;
      }
    },
    onComplete: () => { c.filters = had; },
  });
}

/**
 * One hard hit that decays, around the point `home`.
 *
 * The old shake was `repeat: 7, yoyo: true` at a constant amplitude: the same
 * jolt eight times, which the eye reads as a wobble. An impact has a loudest
 * moment and then gets out of the way, which is what the ramp does.
 *
 * `home` is the CAMERA's framing rather than a position captured when the
 * shake began — a pan mid-blast moves the camera, and returning to the old spot
 * would undo it.
 */
export function impactShake(
  c: Container,
  home: { x: number; y: number },
  peak = SHAKE_PX,
): void {
  gsap.killTweensOf(c.position);
  // Kick by a constant on SCREEN, not in board space: the container is scaled
  // by the camera, so a fixed offset in its own coordinates would be a harder
  // jolt the further the camera is zoomed in.
  const kick = peak / c.scale.x;
  const beats = 8;
  const tl = gsap.timeline({ onComplete: () => c.position.set(home.x, home.y) });
  for (let i = 0; i < beats; i++) {
    const a = kick * (1 - i / beats);
    const s = i % 2 === 0 ? 1 : -1;
    tl.to(c.position, {
      x: home.x + a * s, y: home.y + a * 0.6 * s, duration: 0.045, ease: 'none',
    });
  }
  tl.to(c.position, { x: home.x, y: home.y, duration: 0.05 });
}
