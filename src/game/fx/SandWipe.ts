/**
 * The sand — the outgoing scene crumbles away and the new one is simply THERE,
 * underneath, the whole time.
 *
 * The odd one out of the set, and deliberately so. The iris and the curtain are
 * both SHUTTERS: they put something opaque over the screen, swap the world
 * behind it, and take it away again. This one covers nothing. Both scenes are
 * drawn at once, stacked, and the top one loses its pixels a few at a time
 * until there is none of it left — the reveal is not something arriving, it is
 * something being uncovered.
 *
 * WHY IT IS WORTH HAVING a third kind. A shutter always says the same thing,
 * however it is shaped: the game took the screen away and gave you another one.
 * That is right for a raid, where the two places genuinely are elsewhere from
 * each other. It is heavy-handed for the small crossings, and no amount of
 * restyling the shutter fixes it, because the black IS the statement. Dissolving
 * says something else — that the new screen was always there and the old one
 * was merely in front of it — and that is nearer the truth of a game whose
 * burrow and island are two views of one world.
 *
 * THROUGH BLACK, in two movements: the outgoing scene crumbles away to nothing,
 * and then the incoming one is built back up out of the same grain. Black is
 * not something that passes in FRONT here — it is simply what is left when one
 * picture has gone and the next has not yet arrived, which is a different idea
 * from a shutter and looks like one.
 *
 * That makes it the one variant in the set that does use darkness, and it earns
 * it by never covering anything: the black is the floor of the stack showing
 * through, not a sheet laid over the game. The `curtain`, which reveals one
 * scene from under another with no black at all, is the counterpart — between
 * them the rotation says both things.
 *
 * The turn is where the two halves meet, and it is the moment worth getting
 * right: the first half runs to fully-gone and the second starts from
 * fully-gone, so there is exactly one instant of clean black and no plateau.
 * See `play`.
 *
 * ## Sand, not a fade
 *
 * The obvious way to take a picture to black is to ramp its alpha, and it is
 * wrong here for the reason `DissolveFilter` was written in the first place: a
 * pixel has no half. A fade makes the whole scene uniformly murky and every
 * intermediate frame is a picture nobody drew — it looks like a lighting
 * change, which is a photographic idea, not a pixel-art one.
 *
 * So the top scene is dissolved by REMOVING PIXELS, in the fixed order of an
 * ordered dither. Each pixel is fully present or fully gone; what changes is
 * how many. The grain that gives it its name comes from the Bayer matrix being
 * sampled in SCREEN space — the dots are the screen's own grid, square and one
 * art-pixel wide, so it reads as the picture being made of grains rather than
 * as a texture laid over it. `DissolveFilter` carries the argument in full.
 *
 * ## Where the swap happens
 *
 * At the turn, under the black — which is the ordinary shutter contract after
 * all, and the reason this variant can keep it where the `curtain` cannot. The
 * instant of full dissolve is a genuine covered moment: nothing of either scene
 * is on screen, so the swap is as unseen there as it is behind an iris.
 *
 * The callback is awaited, and that matters: the swap rebuilds terrain and can
 * take real frames (see `BurrowScene.showGround`). Those frames pass on black
 * with nothing half-built showing, and the second half does not begin until the
 * work is done — so a slow swap lengthens the black rather than tearing the
 * rebuild into view.
 *
 * ## What it needs from the caller that a shutter does not
 *
 * Both scenes visible at once, and the outgoing one on top. A shutter is a
 * sibling that covers everything and needs to know nothing about the scenes; a
 * dissolve IS the scenes, so it has to be handed them. `stack` is that hand-off
 * and `RandomWipe` does it — see the note there on why this variant is
 * constructed differently from its siblings.
 */
import { Container } from 'pixi.js';
import gsap from 'gsap';
import { WIPE_CLOSE_MS, WIPE_OPEN_MS } from '@/config/wipe';
import { DissolveFilter } from './DissolveFilter';

/**
 * The two halves of the pass, straight from the shared beat.
 *
 * This variant has a genuine turn in the middle, so it maps onto the pair
 * exactly as the iris does — crumbling away is the close, building back up is
 * the open — and reads as one of a set rather than as an unrelated thing
 * happening to the game (see `config/wipe`).
 *
 * The opening is the slower of the two for the reason given there: going away
 * should feel decisive, arriving can afford to be generous. It matters a little
 * more here than it does behind an iris, because the grain is the thing being
 * looked at and a build-up that is rushed reads as a flicker rather than as a
 * picture assembling.
 */
const CRUMBLE_MS = WIPE_CLOSE_MS;
const BUILD_MS = WIPE_OPEN_MS;

/**
 * How many device pixels one grain spans.
 *
 * Matched to the on-screen size of an art pixel, which is what makes the holes
 * look punched out of the scene rather than laid over it. The canvas renders at
 * up to 2x and is then blown up again by `image-rendering: pixelated`, so a
 * grain of 1 comes out finer than anything actually drawn and shimmers.
 *
 * 3 rather than the filter's default 2 because this dissolves a WHOLE SCREEN
 * rather than a tree: the larger the area, the coarser the grain has to be to
 * still read as grain instead of as a uniform haze at arm's length.
 */
const GRAIN = 3;

export interface SandWipeOptions {
  /** Viewport size in screen pixels. Kept only to size the filter's grain
   *  against the device pixel ratio; this effect draws nothing of its own. */
  width: number;
  height: number;
}

/**
 * The scenes this crossing is between, as the caller sees them.
 *
 * Containers rather than scene objects: all this needs is something to put a
 * filter on and something to sort above its sibling, and taking the narrower
 * type keeps the effect out of the business of what a scene IS.
 */
export interface SandStack {
  /** The scene being left — the one that crumbles. */
  from: Container;
  /** The scene being arrived at — the one revealed underneath. */
  to: Container;
}

export class SandWipe {
  /**
   * Nothing is ever drawn here.
   *
   * The other two variants are sheets on the stage and this is the empty
   * container that stands in their place, so `RandomWipe` can add every variant
   * to the stage the same way rather than special-casing which of them have a
   * view. It is deliberately left `visible = false` and given no children: a
   * dissolve happens entirely inside the scenes' own filters.
   *
   * It also, pointedly, never becomes `eventMode: 'static'`. The other two do,
   * because a shutter must swallow taps meant for the board it is hiding — this
   * one hides nothing, and the board underneath is a real screen the player can
   * perfectly well see. Blocking input would be inventing a wait that the whole
   * point of the effect is to avoid.
   */
  readonly view = new Container();

  private readonly filter: DissolveFilter;
  private stacked: SandStack | null = null;
  private tween: gsap.core.Tween | null = null;
  /** Resolves the in-flight tween — see the note on `settle`. */
  private settle: (() => void) | null = null;
  /** Bumped by each `play`, so an older one can tell it has been superseded. */
  private runId = 0;
  /** 0 = the outgoing scene whole, 1 = every one of its pixels gone. */
  private amount = 0;

  constructor(options: SandWipeOptions) {
    this.view.visible = false;
    this.filter = new DissolveFilter({
      amount: 0,
      pixelSize: GRAIN,
      // The whole scene, evenly. A hole is for showing the player through a
      // tree; here the entire picture is going.
      holeRadius: 0,
      // No rim tint. That lit edge is what sells a hole being burned through a
      // wall — it wants a boundary to sit on, and a dissolve with no hole has
      // none, so it would just wash the surviving grains with colour the scene
      // never had.
      edgeStrength: 0,
    });
    this.resize(options.width, options.height);
  }

  /** Follow a viewport change. Only the grain scale depends on it. */
  resize(_width: number, _height: number): void {
    // The filter reads the device pixel ratio itself to keep a grain the size
    // of an art pixel; there is no geometry here to lay out.
  }

  /**
   * Name the two scenes for the next crossing, and stack them.
   *
   * Called by `RandomWipe` immediately before `play`, because which scene is
   * being left is not known until the crossing happens. Sorting is by zIndex on
   * the shared parent (`gameRoot.sortableChildren` is on): the outgoing scene
   * is lifted above the incoming one so that it is the one doing the hiding.
   *
   * Both are kept explicitly VISIBLE. The scene manager's `show` hides every
   * scene but the current one, and it is called as part of the swap — so
   * without this the outgoing scene would blink out of existence at the exact
   * moment it is supposed to start crumbling, and the effect would be a hard
   * cut with a dissolve playing over nothing.
   */
  stack(stack: SandStack): void {
    // Put back whatever the LAST crossing left stacked, before touching
    // anything new.
    //
    // Without this the filter leaks from one pass to the next, and it does so
    // in the worst possible direction: this crossing's `to` is usually the
    // previous crossing's `from`, so it arrives still carrying the filter it
    // was dissolved with. Both scenes then hold the same filter instance and
    // dissolve TOGETHER — and since the shared `amount` drives both, the
    // screen goes to black at the end of every pass. Exactly the failure this
    // variant exists to avoid, and invisible on a single crossing: it needs
    // two in a row to show up, which is why the looping story is the one that
    // caught it.
    //
    // `clear` is a no-op when nothing is stacked, so the first crossing pays
    // nothing for this.
    this.clear();
    this.stacked = stack;
    stack.to.visible = true;
    stack.from.visible = true;
    // Two adjacent indices well above whatever the scenes carry by default, so
    // the pair sorts against each other rather than against the sea and the
    // backdrop that share their parent.
    stack.to.zIndex = 10;
    stack.from.zIndex = 11;
    stack.from.filters = [this.filter];
  }

  /**
   * Crumble the outgoing scene away to black, swap, then build the new one back
   * out of the same grain.
   *
   * Two movements with the swap between them, which is the plain shutter
   * contract — see the note at the top of the file for why this variant can
   * keep it where the `curtain` cannot.
   *
   * ONLY ONE SCENE IS EVER ON SCREEN. That is what separates this from the
   * curtain, and it is why the incoming scene is kept hidden through the whole
   * first half: if both were visible, dissolving the top one would reveal the
   * bottom one and there would be no black at all. So `from` dissolves out over
   * nothing, and only once it is gone does `to` take its place and dissolve in.
   *
   * `power2.in` out, `power2.out` back — the same in-then-out pair the iris
   * uses, and for the same reason. Going away should feel decisive; arriving
   * can afford to be generous. Easing the two halves separately is right HERE,
   * unlike in the curtain, precisely because there genuinely are two movements
   * with a turn between them rather than one continuous travel.
   */
  /**
   * Re-aim the crossing in flight at another scene — from inside `midpoint`.
   *
   * The second half reads `stacked.to` AFTER the swap, so replacing it here
   * is enough: the scene revealed is the one named, and `clear` leaves that
   * one visible. `to` may equal `from` (a crossing that turned round) — the
   * pass then rebuilds the scene it dissolved, which is exactly the picture
   * of a trip that went nowhere.
   */
  retarget(to: Container): void {
    if (this.stacked) this.stacked.to = to;
  }

  async play(midpoint: () => void | Promise<void>): Promise<void> {
    const run = ++this.runId;
    const stack = this.stacked;

    // No stack means nobody told this crossing what it is between — cross bare
    // rather than not at all, exactly as `RandomWipe` does for a missing
    // silhouette. The change always happens; the flourish is what is optional.
    if (!stack) {
      await midpoint();
      return;
    }

    this.set(0);

    try {
      // First movement: the outgoing scene alone, crumbling to nothing. The
      // incoming one is explicitly HIDDEN — see above; showing it here is what
      // would eat the black.
      stack.from.visible = true;
      stack.to.visible = false;
      await this.to(1, CRUMBLE_MS, 'power2.in');

      // The turn, on black. Nothing of either scene is drawn at this point, so
      // the swap is as unseen here as it is behind an iris.
      await midpoint();

      // Second movement: the incoming scene, built back up out of the grain.
      // Both visibilities are re-asserted AFTER the swap, because the swap is
      // precisely the thing that changes them — the manager's `show` reveals
      // the destination and hides everything else, and a caller may hide the
      // pair by hand as well. This is the first moment the state can be set and
      // have it stick.
      //
      // The filter moves to `to` here. It is one instance shared by both
      // halves, so it has to come off the scene that has finished with it:
      // left on `from` as well, the two would dissolve together off a single
      // `amount`, which is the leak `stack` documents at length.
      stack.from.filters = [];
      stack.from.visible = false;
      stack.to.visible = true;
      stack.to.filters = [this.filter];
      // Start fully dissolved and come back: `set` rather than a tween start,
      // so there is no frame of the new scene at full strength before the
      // build-up begins.
      this.set(1);
      await this.to(0, BUILD_MS, 'power2.out');
    } finally {
      // Clean up WHATEVER happened in between. A `midpoint` that throws would
      // otherwise leave a scene parked half-dissolved and never finishing —
      // the game replaced by a permanent stipple, or by black if it threw
      // during the first movement.
      //
      // Unless a newer crossing has taken over: it has stacked its own pair,
      // and tearing this one down would strip the filter off the scene that
      // crossing is in the middle of dissolving.
      if (run === this.runId) this.clear();
    }
  }

  /**
   * Park the dissolve at a given amount without animating — for stories and
   * resets. 0 = the outgoing scene whole, 1 = entirely gone.
   */
  set(amount: number): void {
    this.settle?.();
    this.tween?.kill();
    this.tween = null;
    this.amount = amount;
    this.filter.amount = amount;
  }

  /** What the dissolve is currently at. For the stories' readout. */
  get progress(): number {
    return this.amount;
  }

  destroy(): void {
    // A crossing in flight when the app tears down: settle it, or the `play()`
    // awaiting it never reaches its own cleanup.
    this.settle?.();
    this.tween?.kill();
    this.tween = null;
    this.clear();
    this.view.destroy({ children: true });
  }

  /**
   * Put the scenes back the way they were found.
   *
   * The filter comes OFF rather than being left at amount 0. A filter costs a
   * render target and a full-screen pass every frame for as long as it is
   * attached, and this one would otherwise stay on whichever scene was last
   * departed for the rest of the session, doing nothing but that.
   *
   * And the outgoing scene is hidden here, not during the pass: it has to stay
   * visible right to the end, because at amount 1 it is still a scene with a
   * filter that happens to be discarding every pixel. Hiding it earlier is what
   * would put a hard cut back into the last frame.
   */
  private clear(): void {
    const stack = this.stacked;
    if (!stack) return;
    // BOTH scenes are stripped, because the filter moves between them halfway
    // through a pass and a crossing can be abandoned at either side of that
    // turn. Clearing only the one this started on would leave the filter parked
    // on the other for the rest of the session — and worse, waiting there to be
    // the second filter when that scene is next stacked.
    stack.from.filters = [];
    stack.to.filters = [];
    stack.from.visible = false;
    // The revealed scene is left VISIBLE. It is the current scene now — the
    // swap made it so — and this effect's only remaining job is to stop being
    // in front of it. Hiding it here because `stack` was the thing that showed
    // it would black the screen out at the end of every crossing.
    stack.to.visible = true;
    stack.from.zIndex = 0;
    stack.to.zIndex = 0;
    this.stacked = null;
    this.set(0);
  }

  private to(amount: number, ms: number, ease: string): Promise<void> {
    return new Promise((resolve) => {
      // Settle the tween this one replaces rather than just killing it —
      // `kill()` skips `onComplete`, so the promise the REPLACED animation
      // handed out would never resolve and the `play()` awaiting it would hang
      // inside its `try` forever, never reaching the `finally` that cleans up.
      // See the long note in `ShapeWipe.to`; the failure is the same one, and a
      // second crossing started mid-animation is enough to cause it.
      this.settle?.();
      this.tween?.kill();

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.settle = null;
        resolve();
      };
      this.settle = finish;

      this.tween = gsap.to(this, {
        amount,
        duration: ms / 1000,
        ease,
        onUpdate: () => { this.filter.amount = this.amount; },
        onComplete: finish,
      });
    });
  }
}
