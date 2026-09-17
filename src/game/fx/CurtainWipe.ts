/**
 * The curtain — a soft-edged boundary that travels across, one scene on each
 * side of it.
 *
 * Both scenes are drawn at once, stacked. The outgoing one is MASKED by a
 * gradient that sweeps across the screen, so where the mask has faded out the
 * scene below shows through. The boundary between them is a wide, soft ramp
 * rather than a line, so what the eye follows is a blurred seam sliding over
 * the picture — not an object passing in front of it.
 *
 * NO BLACK, ANYWHERE. Every pixel at every instant belongs to one scene or the
 * other: the outgoing one where its mask is still opaque, the incoming one
 * where the mask has gone. This is the distinguishing property, exactly as it
 * is for `SandWipe`; the two differ only in the SHAPE of the boundary — a
 * travelling ramp here, a dither threshold there.
 *
 * ## What this replaced, and why
 *
 * This used to be a black band that swept over the screen: solid in the middle,
 * feathered at both edges, with the scene swap hidden in the frame where the
 * band covered everything. It worked, and it was the wrong effect — the band is
 * a THING, and a thing passing in front of the game is a third object in a
 * transition that should only ever have two. The black was the tell: a wipe
 * that goes through black is telling you the game took the screen away, which
 * is a shutter's statement and this variant is not a shutter.
 *
 * A gradient mask says the other thing. The new scene is not arriving, it was
 * there; the old one is being drawn aside. Same travel, same beat, no third
 * object and no darkness.
 *
 * ## A LINE with a gradient hugging it
 *
 * The boundary reads as an edge — something with a definite place, that you can
 * point at as it crosses the screen — and the gradient is a narrow falloff on
 * either side of it rather than a wide blend between two pictures.
 *
 * The width is the whole of the design here, and it was got wrong in both
 * directions before it was got right. Too wide (a fifth of the screen, then a
 * eighth) and there is no line at all: both scenes are present across a broad
 * band, the eye stops following an edge and starts watching a lopsided
 * cross-fade. Too narrow — a pure hard cut, no gradient — and the softness that
 * makes the seam glide is gone; it reads as a tear, and on scaled pixel art it
 * stair-steps.
 *
 * `EDGE` is the width of that falloff, and it is deliberately small enough that
 * at any instant the vast majority of the screen is unambiguously one scene or
 * the other. The gradient's job is to keep the line from being a hard tear, not
 * to mix the pictures.
 *
 * The mask is a one-dimensional GRADIENT TEXTURE on a sprite, stretched across
 * the screen and slid along — not a `Graphics` sheet, and that is the one
 * mechanical thing worth knowing here.
 *
 * It stays a Sprite rather than reverting to a `Graphics` rectangle, even
 * though a hard edge is exactly what a Graphics mask gives for free. Pixi
 * resolves a Graphics mask as COVERAGE — a pixel is inside the shape or outside
 * it — and that coverage is computed against the raw geometry, so the cut lands
 * on a whole device pixel and the edge crawls as the sheet moves: the seam
 * jitters by a pixel between frames instead of sliding. The sprite's single
 * interpolated sample is what keeps the line smooth in motion.
 *
 * It is built once at construction and only ever moved, so it costs one sprite
 * transform per frame.
 *
 * Direction is chosen per crossing, left or right: see `RandomWipe`. Vertical
 * boundaries only — a rabbit board is wider than it is tall, so a horizontal
 * sweep has the longer distance to cover and therefore the better sense of
 * travel.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { WIPE_CLOSE_MS, WIPE_OPEN_MS } from '@/config/wipe';
import type { SandStack } from './SandWipe';

/**
 * How long the sweep takes.
 *
 * The two halves of the shared beat added together: this effect has no midpoint
 * to divide them at, but it is one of a set and the set is held to one rhythm
 * (see `config/wipe`). A sweep that ran to its own duration would read as an
 * unrelated thing happening to the game rather than as one of several ways of
 * saying the same sentence.
 */
const SWEEP_MS = WIPE_CLOSE_MS + WIPE_OPEN_MS;

/**
 * How wide the soft falloff around the line is, as a share of the screen.
 *
 * Small: a band hugging the edge, not a region where the two scenes trade
 * places. At 0.08 it is around 58px on the 720-wide design space — enough that
 * the boundary is visibly soft rather than cut with a knife, and still narrow
 * enough that at any instant the overwhelming majority of the screen is
 * unambiguously one scene or the other.
 *
 * The history is worth keeping, because the failure modes look reasonable in
 * the code and are not subtle on screen. 0.22 and then 0.12 were far too wide —
 * the blend swallowed the line, and the effect became a cross-fade with a
 * direction. Zero is the opposite error: with no falloff at all the seam is a
 * tear, and on scaled pixel art it stair-steps and crawls by a pixel between
 * frames rather than sliding.
 *
 * Note that for a long stretch this number appeared to do NOTHING, and the
 * reason was not in this constant at all: the mask was a single sprite sized to
 * the viewport, which stretched the ramp across the whole screen no matter what
 * value was set here. See `draw`. A width knob that does not visibly change the
 * width is a sign the geometry is wrong, not that the value needs to be bigger.
 */
const EDGE = 0.08;

/**
 * How many texels the mask texture carries in total, ramp AND solid body.
 *
 * The ramp gets `EDGE / (1 + EDGE)` of them — about 150 at 0.08 — stretched
 * over a few dozen screen pixels and sampled linearly, which is finer than the
 * destination. 2048 rather than something larger because a 1-pixel-tall
 * texture still has to fit the GPU's maximum width, and 4096 is the floor on
 * older mobile parts.
 */
const MASK_TEXELS = 2048;

export type CurtainDirection = 'left' | 'right';

export interface CurtainWipeOptions {
  /** Viewport size in screen pixels — NOT design space: the mask must cover the
   *  letterbox too, which lives outside the scaled game root. */
  width: number;
  height: number;
  /**
   * Which way the boundary travels. `right` means the reveal starts at the left
   * edge and sweeps rightwards — named for the direction of travel, not the
   * side it starts on, because that is how the motion is described out loud.
   */
  direction?: CurtainDirection;
}

export class CurtainWipe {
  /**
   * The mask lives here: its soft edge, and the solid body behind it.
   *
   * It is a child of this container rather than of a scene so that the sheet's
   * own position is never entangled with whatever transform a scene carries;
   * Pixi masks read global coordinates, so the mask can be parented anywhere as
   * long as it is on the stage.
   *
   * Never `eventMode: 'static'`, unlike the shutter this replaced. A shutter
   * must swallow taps meant for the board it is hiding — this hides nothing,
   * and both scenes underneath are real. Blocking input would invent a wait
   * that the effect exists to avoid.
   */
  readonly view = new Container();

  /**
   * The mask: a gradient sprite, clear at one end and solid at the other.
   *
   * Built once and only ever moved — see the note at the top on why this is a
   * Sprite and not a Graphics.
   */
  /**
   * ONE plain Sprite, and it must stay exactly that.
   *
   * Pixi picks the mask implementation by type: `AlphaMask.test` is
   * `mask instanceof Sprite`, and everything else — a Graphics, or a Container
   * holding sprites — goes to `StencilMask`, which is pure coverage. A stencil
   * mask does not read alpha at all: every texel of a gradient counts as
   * "inside", and the seam comes out as a hard line with the whole ramp on the
   * kept side. The gradient is in the texture and never reaches the screen.
   *
   * That was the second time this file lost its softness to the mask type. The
   * first was a Graphics sheet (same reason); the second was splitting the mask
   * into a Container of two sprites — a ramp and a solid body — which fixed the
   * geometry and silently swapped the alpha path for the stencil one. So the
   * ramp and the solid body are baked into ONE texture instead; see
   * `rampTexture` for how the split is made constant.
   */
  private readonly sheet: Sprite;
  private w: number;
  private h: number;
  private direction: CurtainDirection;
  private stacked: SandStack | null = null;
  /**
   * How far the boundary has travelled: 0 = the outgoing scene whole,
   * 1 = entirely replaced by the incoming one.
   *
   * A FULL PASS, one direction, no reversal — the boundary leaves by the far
   * side rather than retreating the way it came.
   */
  private progress = 0;
  private tween: gsap.core.Tween | null = null;
  private settle: (() => void) | null = null;
  private runId = 0;

  constructor(options: CurtainWipeOptions) {
    this.w = options.width;
    this.h = options.height;
    this.direction = options.direction ?? "right";

    this.sheet = new Sprite(rampTexture());
    // Anchored at its LEFT edge so `x` is the position of the clear end, which
    // is what `draw` computes. Anchoring centrally would make every placement a
    // half-width correction away from the number that means something.
    this.sheet.anchor.set(0, 0);
    this.view.addChild(this.sheet);
    this.view.visible = false;
    this.draw();
  }

  /** Follow a viewport change. Cheap — the sheet is a strip of rects. */
  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.draw();
  }

  /** Point the next sweep. Takes effect on the next `play`. */
  setDirection(direction: CurtainDirection): void {
    this.direction = direction;
    this.draw();
  }

  /**
   * Name the two scenes for the next crossing, and stack them.
   *
   * The same contract as `SandWipe.stack`, and deliberately the same type: both
   * variants work by revealing a scene that is already underneath, and the only
   * thing that differs is how the outgoing one is taken away. `RandomWipe`
   * hands both the identical pair.
   *
   * Any previous stack is put back FIRST. Without it the mask leaks from one
   * pass to the next, and in the worst direction: this crossing's `to` is
   * usually the last one's `from`, so it would arrive still masked by a sheet
   * that is no longer being animated — a scene permanently half-hidden. Same
   * failure, same reasoning, as the filter leak documented in `SandWipe.stack`.
   */
  stack(stack: SandStack): void {
    this.clear();
    this.stacked = stack;
    stack.to.visible = true;
    stack.from.visible = true;
    // Two adjacent indices well above whatever the scenes carry by default, so
    // the pair sorts against each other rather than against the sea and the
    // backdrop that share their parent.
    stack.to.zIndex = 10;
    stack.from.zIndex = 11;
    stack.from.mask = this.sheet;
    this.view.visible = true;
  }

  /**
   * Run the swap, then sweep the boundary across to reveal it.
   *
   * `midpoint` is the scene swap and it runs FIRST, not at a midpoint — there
   * is no covered moment here to hide it in, so the scene being revealed must
   * be on screen, underneath, before the boundary starts to move. It is still
   * awaited, so a swap that needs real frames gets them with the outgoing scene
   * still whole over the top of the work.
   *
   * `power1.inOut` across the whole pass. There is ONE movement to ease, and
   * easing its halves separately would put a deceleration into the middle of a
   * travel that is supposed to be continuous.
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

    // Nothing to sweep between — cross bare rather than not at all, the same
    // rule as a missing silhouette. The change always happens; the flourish is
    // what is optional.
    if (!stack) {
      await midpoint();
      return;
    }

    this.set(0);

    try {
      await midpoint();
      // Both re-asserted AFTER the swap, because the swap is the thing that
      // hides scenes: the manager's `show` reveals the destination and hides
      // everything else. With `from` hidden the screen cuts instantly instead
      // of sweeping; with `to` hidden the sweep uncovers nothing and the screen
      // goes black — the one thing this variant exists to avoid.
      stack.to.visible = true;
      stack.from.visible = true;
      await this.to(1, SWEEP_MS, "power1.inOut");
    } finally {
      // Put the scenes back WHATEVER happened in between. A `midpoint` that
      // throws would otherwise leave the outgoing scene parked over the new one
      // wearing a mask that has stopped moving — the game replaced by a frozen
      // half-and-half.
      //
      // Unless a newer crossing has taken over: it has stacked its own pair,
      // and tearing this one down would strip the mask off the scene that
      // crossing is in the middle of sweeping.
      if (run === this.runId) this.clear();
    }
  }

  /** Park the sweep at a given travel without animating — for stories and
   *  resets. 0 = the outgoing scene whole, 1 = entirely swept away. */
  set(progress: number): void {
    this.settle?.();
    this.tween?.kill();
    this.tween = null;
    this.progress = progress;
    this.draw();
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
   * The mask comes OFF rather than being left fully open. A mask costs a stencil
   * pass for as long as it is attached, and this one would otherwise stay on
   * whichever scene was last departed for the rest of the session.
   *
   * The outgoing scene is hidden HERE, at the end, not during the pass: it has
   * to stay visible right to the last frame, because at progress 1 it is still
   * a scene whose mask happens to be empty. Hiding it earlier would put a hard
   * cut back into the end of the sweep.
   *
   * The revealed scene is left VISIBLE — it is the current scene now, and this
   * effect's only remaining job is to stop being in front of it.
   */
  private clear(): void {
    const stack = this.stacked;
    this.view.visible = false;
    if (!stack) return;
    stack.from.mask = null;
    stack.from.visible = false;
    stack.to.visible = true;
    stack.from.zIndex = 0;
    stack.to.zIndex = 0;
    this.stacked = null;
  }

  private to(progress: number, ms: number, ease: string): Promise<void> {
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
        progress,
        duration: ms / 1000,
        ease,
        onUpdate: () => this.draw(),
        onComplete: finish,
      });
    });
  }

  /**
   * Place the mask: the ramp at the boundary, solid behind it, nothing beyond.
   *
   * Three things have to be true at once and the sprite gives two of them for
   * free. The ramp itself is the texture. Everything BEHIND the boundary (the
   * part of the outgoing scene not yet reached) must be solid mask — which is
   * why the sprite is made much wider than its gradient and the texture's
   * address mode clamps: past the last texel the solid end simply repeats, so
   * one sprite covers both the ramp and the untouched remainder.
   *
   * Everything beyond the boundary must be NO mask, and that is the default —
   * a Pixi mask keeps only what it covers, so unpainted screen is hidden and
   * the scene underneath shows.
   *
   * Geometry is written in "distance from the entry side", which for `right`
   * (the reveal starting at the left) is plain screen x. `left` is the mirror,
   * applied as a horizontal flip of the sprite rather than threaded through the
   * arithmetic.
   */
  private draw(): void {
    const edge = this.w * EDGE;
    const p = Math.min(1, Math.max(0, this.progress));

    // How far the boundary has advanced. It starts one full falloff BEFORE the
    // entry side, so at progress 0 the mask is solid across the whole viewport
    // (the outgoing scene whole, nothing yet fading), and finishes one full
    // falloff past the far side, so at progress 1 none of it is left.
    const swept = -edge + p * (this.w + 2 * edge);

    // Tall enough to cover the letterbox as well as the board.
    this.sheet.height = this.h;
    this.sheet.y = 0;

    // The sprite is `edge + w` wide, and the texture is baked so that the ramp
    // occupies exactly the first `edge` of that and the rest is solid — see
    // `rampTexture`. So the boundary is `edge` wide on screen, and everything
    // behind it back to the entry side is genuinely opaque.
    //
    // This is the third shape this arithmetic has taken. A single sprite with a
    // ramp-only texture stretched the gradient across the whole screen (a
    // full-screen cross-fade); two sprites in a Container fixed the geometry
    // but turned the mask into a stencil and lost the gradient entirely (a hard
    // line). One sprite, one texture with the split baked in, is the version
    // that does both.
    this.sheet.width = edge + this.w;

    if (this.direction === 'right') {
      // Clear end leading at the boundary; the solid part follows it back
      // towards the entry side.
      this.sheet.scale.x = Math.abs(this.sheet.scale.x);
      this.sheet.x = swept;
    } else {
      // Mirrored: a negative x-scale flips the sprite about its anchor so its
      // clear end still leads, and the placement is measured from the far side.
      this.sheet.scale.x = -Math.abs(this.sheet.scale.x);
      this.sheet.x = this.w - swept;
    }
  }
}

/**
 * The mask, as a 1-pixel-tall texture: a short alpha ramp, then solid.
 *
 * Clear at index 0, rising to solid over the first `EDGE / (1 + EDGE)` of the
 * width, and solid from there to the end. The sprite is drawn `edge + w` wide
 * (`draw`), so that share of it is exactly `edge` on screen: the boundary is
 * as wide as `EDGE` says and the rest of the outgoing scene is untouched. The
 * split is a constant because `edge` is itself a constant share of `w`, which
 * is what lets the texture be baked once rather than rebuilt on resize.
 *
 * WHITE throughout, varying only in ALPHA. A mask is read for its alpha alone
 * — Pixi uses the sprite's opacity, not its colour — so any other colour here
 * would be a claim about the file that is not true.
 *
 * `clamp-to-edge` so the sampler never wraps at either end; the texture has
 * its own solid run and does not rely on the clamp to extend it, but a wrapped
 * sample at the boundary would put a sliver of solid ahead of the clear end.
 */
function rampTexture(): Texture {
  const px = new Uint8Array(MASK_TEXELS * 4);
  const rampTexels = Math.max(2, Math.round(MASK_TEXELS * (EDGE / (1 + EDGE))));
  for (let i = 0; i < MASK_TEXELS; i++) {
    px[i * 4] = 255;
    px[i * 4 + 1] = 255;
    px[i * 4 + 2] = 255;
    // `smoothstep` across the ramp rather than a straight line: a linear ramp
    // has a visible kink where it starts and stops — the eye picks out the
    // sudden onset of a change more readily than the change itself — and
    // eased at both ends the falloff meets the untouched picture without a
    // detectable seam of its own. Past the ramp, solid.
    const t = Math.min(1, i / (rampTexels - 1));
    px[i * 4 + 3] = Math.round(255 * t * t * (3 - 2 * t));
  }
  const tex = Texture.from({
    resource: px,
    width: MASK_TEXELS,
    height: 1,
    alphaMode: 'no-premultiply-alpha',
  });
  tex.source.addressMode = 'clamp-to-edge';
  tex.source.scaleMode = 'linear';
  return tex;
}
