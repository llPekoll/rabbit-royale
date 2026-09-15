/**
 * The two hints that teach trap placement without a word of text.
 *
 * Placement is the burrow's only defence and it is taught by a DOM toast
 * ("Tap a tile to mine it..."), which is a sentence the player has to read,
 * remember, and map onto a board they have never seen. Both of these show the
 * same thing ON the board instead:
 *
 *  - `GhostBomb`, for a mouse: the bomb a click would bury, drawn faint on the
 *    cell under the pointer. A preview is the most direct answer there is to
 *    "what happens if I click here?" — the answer is already on screen.
 *  - `GloveHint`, for a finger: a finger has no hover, so there is nothing to
 *    preview. The game's own pixel hand walks onto a free cell and presses it,
 *    which is the gesture itself rather than a description of it.
 *
 * Neither knows anything about the burrow: which cell, where it is and what a
 * press looks like on it are all the scene's to answer, through callbacks.
 * That keeps the board's one projection (`mountVeil`) the only one — see the
 * note on trap markers in `BurrowScene.addTrap` for what a second projection
 * cost last time.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import gsap from 'gsap';

/**
 * The OS asks for no motion.
 *
 * Checked per hint rather than once at import: the setting can change while
 * the tab is open, and a hint started after the change should honour it.
 * Loops are what it rules out; a still hand on a cell teaches just as well.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A device whose PRIMARY pointer is a finger.
 *
 * Both halves, because either alone lies: a touch laptop reports
 * `pointer: coarse` for its screen and still has a trackpad that hovers, and
 * that player gets the ghost bomb instead. Only a device that cannot hover at
 * all needs to be shown the press.
 */
export function isTouchPrimary(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
}

/**
 * The candidate closest to `at`, or null when there are none.
 *
 * Pure so it can be tested without a stage. The glove uses it to pick the free
 * cell nearest the middle of the view: a hint pressed off in a corner, or under
 * the toast at the top of the screen, is a hint the player does not see.
 */
export function nearestTo<T extends { x: number; y: number }>(
  candidates: Iterable<T>,
  at: { x: number; y: number },
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = (c.x - at.x) ** 2 + (c.y - at.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** How faint the ghost is: clearly the bomb, clearly not buried yet. */
export const GHOST_ALPHA = 0.55;
/** How far the ghost bobs, in the cell's own px — a breath, not a bounce. */
const GHOST_BOB_PX = 2;

/**
 * A faint bomb that follows the pointer from cell to cell.
 *
 * Built from the SAME texture, anchor and scale as a placed trap's bomb (the
 * scene hands them in), so the preview is pixel for pixel the thing a click
 * buries — a ghost that was a different size would promise a different result.
 *
 * Two display objects on purpose. The HOLDER is what the scene mounts into a
 * cell, and mounting sets its position; the SPRITE inside it is what bobs. Had
 * the bob run on the mounted object, every move to a new cell would snap the
 * position back and fight the tween.
 */
export class GhostBomb {
  readonly holder = new Container();
  private readonly sprite: Sprite;
  private bob: gsap.core.Tween | null = null;
  private cell = -1;

  constructor(texture: Texture, scale: number, anchorY: number) {
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, anchorY);
    this.sprite.scale.set(scale);
    this.sprite.alpha = GHOST_ALPHA;
    this.holder.addChild(this.sprite);
    // A preview must never take the click it is previewing: the cell's own
    // diamond, underneath, is what answers.
    this.holder.eventMode = 'none';
    this.holder.label = 'burrow-ghost-bomb';
    this.holder.visible = false;
  }

  /** The cell it is on, or -1 while hidden. */
  get tile(): number { return this.cell; }

  /**
   * Show it on `tile`. `mount` puts the holder into that cell (the scene's
   * `mountVeil`). A no-op on the cell it is already on, so a handler that runs
   * on every pointermove costs nothing.
   */
  showOn(tile: number, mount: (holder: Container) => void): void {
    if (this.cell === tile && this.holder.visible) return;
    this.cell = tile;
    mount(this.holder);
    this.holder.visible = true;
    // A quick fade per cell rather than a pop: the pointer crosses cells
    // faster than a pop could finish, and a trail of half-scaled bombs reads
    // as lag.
    gsap.killTweensOf(this.holder);
    this.holder.alpha = 0;
    gsap.to(this.holder, { alpha: 1, duration: 0.08 });
    if (!this.bob && !prefersReducedMotion()) {
      this.sprite.y = 0;
      this.bob = gsap.to(this.sprite, {
        y: -GHOST_BOB_PX, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1,
      });
    }
  }

  hide(): void {
    this.cell = -1;
    this.holder.visible = false;
    gsap.killTweensOf(this.holder);
    this.bob?.kill();
    this.bob = null;
    this.sprite.y = 0;
  }

  destroy(): void {
    this.hide();
    this.holder.destroy({ children: true });
  }
}

/** Where the glove should press next, as the scene sees it. */
export interface GloveTarget {
  tile: number;
  /** The cell's centre in the glove's PARENT space. */
  x: number;
  y: number;
}

export interface GloveHintOptions {
  /** The free cell to press on this cycle, or null if there is none in view. */
  pickTarget(): GloveTarget | null;
  /** The fingertip just landed on `tile` — draw the press on the cell. */
  onPress(tile: number): void;
  /**
   * The glove's scale in its parent's space. The scene answers it from the
   * camera so the hand is the same size on screen at any zoom.
   */
  scale(): number;
  /** Presses before the glove gives up on its own. */
  maxCycles?: number;
  /** It stopped by itself (ran out of cycles). */
  onDone?(): void;
}

/**
 * The fingertip in the art: the hand points up and to the left, and its tip is
 * this far into the 27x32 sprite — the same point the CSS cursor hotspot uses
 * (`--cur-hand` in globals.css), plus the one row of outline above the nail.
 */
const TIP_X = 5 / 27;
const TIP_Y = 1 / 32;
/** The hand approaches from below-right, the side it points away from, so it
 *  never covers the cell it is about to press. In art px. */
const APPROACH_X = 16;
const APPROACH_Y = 20;
/** Seconds between the end of one press and the start of the next. */
const GLOVE_GAP = 0.4;
/** Long enough for the camera's pull-back (0.55s) to land first. */
const GLOVE_START_DELAY = 0.7;
const DEFAULT_CYCLES = 5;

/**
 * The pixel hand pressing a free cell, over and over, until the player does it.
 *
 * One cycle is ~1.8s: glide in, press (a squash about the fingertip, which is
 * where the anchor sits, so the tip stays planted and the hand compresses onto
 * it), release, drift off. Each cycle re-picks its cell, so a player who pans
 * the board still sees the hand in the middle of what they are looking at.
 *
 * With reduced motion the hand is simply placed on a cell and left there: the
 * picture of a finger on a tile carries the lesson without anything looping.
 */
export class GloveHint {
  readonly hand: Sprite;
  private timeline: gsap.core.Timeline | null = null;
  private timer: gsap.core.Tween | null = null;
  private cycles = 0;
  private readonly maxCycles: number;
  private stopped = false;

  constructor(
    parent: Container,
    texture: Texture,
    private readonly opts: GloveHintOptions,
    zIndex = 1e6,
  ) {
    this.maxCycles = opts.maxCycles ?? DEFAULT_CYCLES;
    this.hand = new Sprite(texture);
    this.hand.anchor.set(TIP_X, TIP_Y);
    this.hand.label = 'burrow-glove-hint';
    // It sits over the very cells it points at, and a hint that swallowed the
    // tap it is asking for would be worse than no hint.
    this.hand.eventMode = 'none';
    this.hand.alpha = 0;
    // Above the clouds (`CloudField` sorts at 10 000): it is interface, not
    // scenery, and a cloud drifting over the hand would hide the lesson.
    this.hand.zIndex = zIndex;
    parent.addChild(this.hand);
    this.timer = gsap.delayedCall(GLOVE_START_DELAY, () => this.begin());
  }

  private begin(): void {
    this.timer = null;
    if (this.stopped) return;
    if (prefersReducedMotion()) {
      const target = this.opts.pickTarget();
      if (!target) return;
      this.hand.scale.set(this.opts.scale());
      this.hand.position.set(target.x, target.y);
      this.hand.alpha = 1;
      return;
    }
    this.cycle();
  }

  private cycle(): void {
    this.timer = null;
    if (this.stopped) return;
    if (this.cycles >= this.maxCycles) {
      this.stop();
      this.opts.onDone?.();
      return;
    }
    const target = this.opts.pickTarget();
    if (!target) {
      // Nothing free in view (the board is full, or panned off) — look again
      // shortly rather than giving up: a lifted bomb frees a cell.
      this.timer = gsap.delayedCall(GLOVE_GAP, () => this.cycle());
      return;
    }
    this.cycles++;

    const s = this.opts.scale();
    const { x, y } = target;
    const fromX = x + APPROACH_X * s;
    const fromY = y + APPROACH_Y * s;
    const hand = this.hand;
    hand.scale.set(s);
    hand.position.set(fromX, fromY);
    hand.alpha = 0;

    const tl = gsap.timeline({
      onComplete: () => {
        this.timeline = null;
        this.timer = gsap.delayedCall(GLOVE_GAP, () => this.cycle());
      },
    });
    tl.to(hand, { alpha: 1, duration: 0.2 }, 0);
    tl.to(hand.position, { x, y, duration: 0.45, ease: 'power2.out' }, 0);
    // The press: wider and shorter about the fingertip.
    tl.to(hand.scale, { x: s * 1.08, y: s * 0.84, duration: 0.09, ease: 'power1.in' });
    tl.call(() => this.opts.onPress(target.tile));
    tl.to(hand.scale, { x: s, y: s, duration: 0.18, ease: 'back.out(3)' });
    // Hold a beat on the cell so the ripple is read against the finger.
    tl.to(hand.position, {
      x: x + APPROACH_X * s * 0.5, y: y + APPROACH_Y * s * 0.5, duration: 0.32, ease: 'power1.in',
    }, '+=0.3');
    tl.to(hand, { alpha: 0, duration: 0.3 }, '<');
    this.timeline = tl;
  }

  /** Stop and hide. Safe to call more than once. */
  stop(): void {
    this.stopped = true;
    this.timer?.kill();
    this.timer = null;
    this.timeline?.kill();
    this.timeline = null;
    gsap.killTweensOf(this.hand);
    gsap.killTweensOf(this.hand.position);
    gsap.killTweensOf(this.hand.scale);
    this.hand.alpha = 0;
    this.hand.visible = false;
  }

  destroy(): void {
    this.stop();
    this.hand.destroy();
  }
}
