/**
 * The transition, as the game actually uses it: a different one each time.
 *
 * Five variants — an iris closing on a carrot, on a skull, on a bomb, a plain
 * curtain sweeping past from one side, and the outgoing scene crumbling away
 * like sand. One is drawn at random for every crossing, uniformly.
 *
 * WHY a rotation. A flourish seen a hundred times is not a flourish, it is a
 * loading screen; the carrot alone was fine for the first few crossings of a
 * session and furniture by the tenth. Four shapes on the same beat keeps the
 * punctuation feeling authored rather than automatic — and the shapes are the
 * three things this game is about, so the variety says something rather than
 * merely being variety.
 *
 * WHY uniform and not weighted towards the carrot. The carrot already has the
 * one place it cannot be replaced: the sign-in cut (`components/carrot-curtain`
 * — see `WIPE_MASK_URL`), which is the first transition any player ever sees
 * and the one that states what the game's shape is. With the introduction
 * spoken for, the repeats can be even.
 *
 * This wraps three implementations rather than extending any, because what
 * varies between them is not a parameter — the iris cuts a hole with a mask,
 * the curtain draws bands with alpha, the sand removes pixels from the scene
 * itself — and the only thing the game needs from them is the shutter
 * contract: `view`, `play`, `resize`, `destroy`.
 *
 * THE SAND IS THE ODD ONE and is constructed differently on purpose. The other
 * two are self-contained sheets: they cover the screen and neither knows nor
 * cares what is under it. A dissolve has nothing to cover with — it works by
 * removing the outgoing scene, so it must be HANDED the two scenes, which is
 * what `scenes` is for. It is asked at the moment of crossing rather than held
 * from boot, because which scene is being left is not a fact that exists until
 * then. Without it the variant is simply not in the draw.
 * Every variant is built ONCE at boot and kept: a crossing is a moment the
 * player is waiting through, and building a Graphics sheet inside it is work
 * done at exactly the wrong time.
 */
import { Container, Texture } from 'pixi.js';
import { WIPE_MASK_URLS, WIPE_OPEN_SCALE, type WipeShape } from '@/config/wipe';
import { ShapeWipe } from './ShapeWipe';
import { CurtainWipe } from './CurtainWipe';
import { SandWipe, type SandStack } from './SandWipe';

/** Which effect a crossing drew. The shapes name their silhouette; `curtain`
 *  is the plain sweep. Exported for the stories, which pin it. */
export type WipeVariant = WipeShape | 'curtain' | 'sand';

export interface RandomWipeOptions {
  /** Viewport size in screen pixels — NOT design space: the shutter must cover
   *  the letterbox too, which lives outside the scaled game root. */
  width: number;
  height: number;
  /**
   * The aperture masks, already loaded, keyed as in `WIPE_MASK_URLS`.
   *
   * A shape whose texture is missing is simply dropped from the rotation: a
   * silhouette that failed to load is a reason to cross with one of the others,
   * never a reason to refuse to cross. If they are ALL missing the curtain is
   * still there, and it needs no texture at all — which is the other reason it
   * belongs in the set.
   */
  textures: Partial<Record<WipeShape, Texture | undefined>>;
  /**
   * The draw. Injected so the stories and tests can pin a variant; the game
   * leaves it alone and gets `Math.random`.
   */
  pick?: (variants: readonly WipeVariant[]) => WipeVariant;
  /**
   * The two scenes a crossing is between, asked for at the moment of crossing.
   *
   * ONLY the sand dissolve needs this, and it is a callback rather than a pair
   * of containers because which scene is being left is not known until `play`
   * is called — the shutters are built once at boot and never learn anything
   * about the world they cover.
   *
   * Absent, or returning null, drops `sand` from the rotation: a dissolve with
   * nothing to dissolve is not a crossing, and the other three need no scenes
   * at all. That is the same rule the silhouettes follow — a variant that
   * cannot be drawn is simply not in the draw.
   */
  scenes?: () => SandStack | null;
}

export class RandomWipe {
  /** Add this to the stage, above every scene. */
  readonly view = new Container();

  private readonly shapes = new Map<WipeShape, ShapeWipe>();
  private readonly curtain: CurtainWipe;
  private readonly sand: SandWipe;
  private readonly scenes: (() => SandStack | null) | null;
  private readonly variants: WipeVariant[] = [];
  private readonly pick: (variants: readonly WipeVariant[]) => WipeVariant;
  /** The variant the last `play` drew — for the stories' readout, and for
   *  anyone debugging a crossing that looked wrong. */
  private lastPlayed: WipeVariant | null = null;

  constructor(options: RandomWipeOptions) {
    this.pick = options.pick ?? uniform;

    for (const shape of Object.keys(WIPE_MASK_URLS) as WipeShape[]) {
      const texture = options.textures[shape];
      if (!texture) {
        console.warn(`[rr] wipe: no ${shape} silhouette — dropping it from the rotation`);
        continue;
      }
      const wipe = new ShapeWipe({
        width: options.width,
        height: options.height,
        texture,
        openScale: WIPE_OPEN_SCALE[shape],
      });
      this.shapes.set(shape, wipe);
      this.variants.push(shape);
      this.view.addChild(wipe.view);
    }

    this.curtain = new CurtainWipe({ width: options.width, height: options.height });
    this.view.addChild(this.curtain.view);

    // The dissolve. Built whether or not it can be used, so `shapeWipe`'s
    // sibling accessor and the stories have something to reach for; it joins
    // the DRAW only if there are scenes for it to work on.
    this.sand = new SandWipe({ width: options.width, height: options.height });
    this.scenes = options.scenes ?? null;
    this.view.addChild(this.sand.view);

    // The two SCENE-BASED variants join the draw only if there are scenes to
    // work on. Both reveal one scene from under another rather than covering
    // the screen, so neither can do anything without the pair — and the three
    // irises need no scenes at all, so there is always something left to cross
    // with. Same rule as a missing silhouette: a variant that cannot be drawn
    // is simply not in the draw.
    if (this.scenes) this.variants.push('curtain', 'sand');
  }

  /** Follow a viewport change. Every variant, not just the next one: a resize
   *  can land between crossings, and a shutter sized for the old viewport
   *  would leave a strip of live game showing down one edge. */
  resize(width: number, height: number): void {
    for (const wipe of this.shapes.values()) wipe.resize(width, height);
    this.curtain.resize(width, height);
    this.sand.resize(width, height);
  }

  /**
   * Draw a variant at random, close it over the screen, run `midpoint` under
   * full black, then open again.
   *
   * `midpoint` is where the scene swap goes. It is awaited, so a caller that
   * needs a frame or two to settle gets them while nothing is visible.
   */
  play(midpoint: () => void | Promise<void>): Promise<void> {
    const variant = this.pick(this.variants);
    this.lastPlayed = variant;

    if (variant === 'sand') {
      // Asked for HERE rather than held from construction: which scene is being
      // left changes with every crossing, and a pair captured at boot would
      // dissolve whatever was on screen when the game started.
      const stack = this.scenes?.() ?? null;
      // Nothing to dissolve — cross bare rather than not at all, same rule as a
      // missing silhouette.
      if (!stack) return Promise.resolve(midpoint()).then(() => {});
      this.sand.stack(stack);
      return this.sand.play(midpoint);
    }

    if (variant === 'curtain') {
      // The curtain now reveals one scene from under another rather than
      // covering the screen with a band, so it needs the same pair the sand
      // does — and drops out of the draw the same way when there is none.
      const stack = this.scenes?.() ?? null;
      if (!stack) return Promise.resolve(midpoint()).then(() => {});
      // The side is part of the draw: a curtain that always swept from the left
      // would be one effect seen twice as often as each iris rather than one
      // share of the rotation.
      this.curtain.setDirection(Math.random() < 0.5 ? 'left' : 'right');
      this.curtain.stack(stack);
      return this.curtain.play(midpoint);
    }

    const wipe = this.shapes.get(variant);
    // Only reachable if `pick` is handed a variant that was dropped for a
    // missing texture. Cross bare rather than not at all — the change always
    // happens, the flourish is what is optional.
    if (!wipe) return Promise.resolve(midpoint()).then(() => {});
    return wipe.play(midpoint);
  }

  /** What the last `play` drew, or null before the first one. */
  get variant(): WipeVariant | null {
    return this.lastPlayed;
  }

  /**
   * One shape wipe, by name — for INSPECTION only (the stories park an
   * aperture half-open to judge whether the silhouette still reads).
   *
   * Deliberately not a `set(aperture)` of its own. A crossing is the only
   * thing the game ever asks of this class, and a shutter parked half-open is
   * not a crossing; giving `RandomWipe` a control the game never calls would
   * put a way to wedge the screen on the shipping class to serve a story.
   * Reaching for the variant and using ITS `set` keeps that where it belongs.
   *
   * Null for a shape whose texture never loaded, same as everywhere else here.
   */
  shapeWipe(shape: WipeShape): ShapeWipe | null {
    return this.shapes.get(shape) ?? null;
  }

  /** The dissolve, for INSPECTION only — the stories park it part-crumbled to
   *  judge the grain. Same reasoning as `shapeWipe`. */
  sandWipe(): SandWipe {
    return this.sand;
  }

  /** The gradient sweep, for INSPECTION only — the stories park it mid-travel
   *  to judge the softness of the seam. Same reasoning as `shapeWipe`. */
  curtainWipe(): CurtainWipe {
    return this.curtain;
  }

  destroy(): void {
    for (const wipe of this.shapes.values()) wipe.destroy();
    this.curtain.destroy();
    this.sand.destroy();
    this.view.destroy({ children: true });
  }
}

/** The game's draw: every variant equally likely, every time. */
const uniform = (variants: readonly WipeVariant[]): WipeVariant =>
  variants[Math.floor(Math.random() * variants.length)];
