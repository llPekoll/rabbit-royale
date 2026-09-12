/**
 * The carrot iris — the cartoon wipe between the burrow and the island.
 *
 * A black sheet over the whole screen with a CARROT-SHAPED HOLE in it. The hole
 * shrinks to nothing (iris out), the screen is briefly all black, then it opens
 * again on the other place (iris in). It is the "That's all folks!" circle from
 * a Looney Tunes short, except the aperture is the thing this game is about.
 *
 * Why a hole and not a carrot: the shape has to be what you SEE THROUGH.
 * Drawing a carrot over the screen would be a sticker; cutting one out of the
 * dark makes the dark the object and the game the light behind it. The whole
 * trick is the negative.
 *
 * The scene swap happens at the pitch-black midpoint, so the player never sees
 * it. That is the other half of what an iris is for in animation — it is a
 * shutter as much as a flourish, and it buys the cut for free.
 *
 * Cut with an INVERSE MASK. The obvious alternative — a sprite blended with
 * `erase` over the sheet — does not work here: erase subtracts alpha within a
 * render target, so without its own render group it eats the game as well, and
 * with one the group still composites its opaque black over everything. Both
 * were tried against the pixels; both came out solid black. An inverse mask
 * keeps the carrot's edges hard, which was the only reason to avoid it.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import {
  WIPE_CLOSE_MS, WIPE_OPEN_MS, WIPE_HOLD_MS, WIPE_OPEN_SCALE,
} from '@/config/wipe';

// The timings live in config/wipe so the DOM iris over the sign-in screen can
// share them without importing Pixi. The first cut of these was faster and the
// carrot went by before the eye could name it — which wastes the one flourish
// the transition has.
const CLOSE_MS = WIPE_CLOSE_MS;
const OPEN_MS = WIPE_OPEN_MS;
const HOLD_MS = WIPE_HOLD_MS;
const OPEN_SCALE = WIPE_OPEN_SCALE;

export interface CarrotWipeOptions {
  /** Viewport size in screen pixels — NOT design space: the sheet must cover
   *  the letterbox too, which lives outside the scaled game root. */
  width: number;
  height: number;
  /**
   * The aperture mask (`/assets/fx/carrot-mask.webp`, from
   * tools/gen_carrot_mask.py), already loaded. Its ALPHA is the shape; the
   * white it is drawn in is never seen.
   *
   * NOT the kit's carrot sprite. That one is drawn to be looked at — it carries
   * its shape in shading as much as in its outline — and an alpha channel keeps
   * only the outline, so as a mask it came out a soft blob with its leaves
   * shattering into specks the moment the iris got small.
   */
  texture: Texture;
}

export class CarrotWipe {
  /** Add this to the stage, above every scene. */
  readonly view = new Container();

  private readonly sheet = new Graphics();
  private readonly hole: Sprite;
  private w: number;
  private h: number;
  /** 0 = hole closed (all black), 1 = hole wide open (screen clear). */
  private aperture = 1;
  private tween: gsap.core.Tween | null = null;

  constructor(options: CarrotWipeOptions) {
    this.w = options.width;
    this.h = options.height;

    // A missing texture is the one failure this effect cannot survive quietly:
    // the mask would have no area, the sheet would stay opaque, and crossing to
    // the island would look like the game had frozen on a black screen. Say so
    // rather than shipping a shutter that never opens.
    if (!options.texture) {
      throw new Error('CarrotWipe: no carrot texture — was the boot loader run?');
    }

    this.hole = new Sprite(options.texture);
    this.hole.anchor.set(0.5);
    // A ~40px mask blown up past the screen's diagonal — the largest upscale in
    // the game by far. Linear filtering turns its edge into a soft grey fringe
    // at exactly the size where the shape has to read, so the scale mode is
    // pinned HERE rather than trusted from the loader: this sprite is a
    // silhouette, and a soft silhouette is not one.
    options.texture.source.scaleMode = 'nearest';

    // The mask sprite is a shape, not a picture: it is never added to the
    // display list itself, only handed to the sheet as its inverse mask.
    this.sheet.setMask({ mask: this.hole, inverse: true });
    this.view.addChild(this.sheet, this.hole);

    // The sheet is a shutter: while it is up it must swallow every tap meant
    // for the board behind it, or a player can move a rabbit they cannot see.
    this.view.eventMode = 'static';
    this.view.visible = false;
    this.draw();
  }

  /** Follow a viewport change. Cheap — the sheet is one rect. */
  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.draw();
  }

  /**
   * Close the iris, run `midpoint` under full black, then open it again.
   *
   * `midpoint` is where the scene swap goes. It is awaited, so a caller that
   * needs a frame or two to settle gets them while nothing is visible — which
   * is the whole reason to hide a cut behind a shutter.
   */
  async play(midpoint: () => void | Promise<void>): Promise<void> {
    this.view.visible = true;
    this.set(1);

    try {
      await this.to(0, CLOSE_MS, 'power2.in');
      await midpoint();
      await wait(HOLD_MS);
      // `power2.out` on the way back: the aperture leaves fast and returns
      // slow, so the new screen is uncovered generously rather than snatched
      // open.
      await this.to(1, OPEN_MS, 'power2.out');
    } finally {
      // The shutter comes down WHATEVER happened in between.
      //
      // It is `eventMode: 'static'` on purpose — while it is up it swallows
      // every tap meant for the board behind it. So a `midpoint` that throws
      // does not merely skip an animation: it leaves a full-screen,
      // interactive black sheet parked over the game forever, and every tap
      // from then on dies in it. The board looks fine (the sheet is drawn at
      // aperture 0, i.e. fully open and invisible) while nothing can be
      // clicked — a failure with no symptom but silence.
      //
      // `midpoint` is where the scene swap goes, so it is exactly the callback
      // most likely to throw: it rebuilds terrain, and it runs next to fetches
      // that can time out.
      this.view.visible = false;
    }
  }

  /** Park the iris open or shut without animating — for stories and resets. */
  set(aperture: number): void {
    this.tween?.kill();
    this.tween = null;
    this.aperture = aperture;
    this.draw();
  }

  destroy(): void {
    this.tween?.kill();
    this.tween = null;
    this.view.destroy({ children: true });
  }

  private to(aperture: number, ms: number, ease: string): Promise<void> {
    return new Promise((resolve) => {
      this.tween?.kill();
      this.tween = gsap.to(this, {
        aperture,
        duration: ms / 1000,
        ease,
        onUpdate: () => this.draw(),
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * Repaint: fill the screen black, and size the carrot that is cut out of it.
   *
   * Sized by HEIGHT with the width derived from the mask's own aspect, so
   * retuning the shape in the generator needs no matching edit here — and so
   * the silhouette can never be squashed into a lozenge by a square box.
   */
  private draw(): void {
    this.sheet.clear();
    this.sheet.rect(0, 0, this.w, this.h);
    this.sheet.fill(0x000000);

    const open = Math.max(0, this.aperture);
    const height = Math.hypot(this.w, this.h) * OPEN_SCALE * open;

    // At zero the mask has no area, and a zero-sized mask is a degenerate
    // transform rather than a closed shutter: drop the mask and let the sheet
    // cover everything, which is what "closed" means.
    this.sheet.mask = open > 0 ? this.hole : null;
    this.hole.visible = open > 0;
    this.hole.height = height;
    const tex = this.hole.texture;
    this.hole.width = height * (tex.width / tex.height);
    this.hole.position.set(this.w / 2, this.h / 2);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
