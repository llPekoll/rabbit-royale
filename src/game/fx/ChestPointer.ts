/**
 * The arrow that bobs over the tutorial's chest.
 *
 * ONE chest, on ONE island — the first one, dealt by hand so that its chest is
 * a walk away (`firstIslandLayout`, FIRST_RUN.CHEST_MAX_DISTANCE). The chest
 * is already drawn before it is dug, with a glow and a ring, so the player can
 * SEE it from the spawn; what they had no way of knowing is that it is the
 * thing to go and get. The captions cannot say it either — they name what has
 * just happened, and this is about what to do next. So the board points at it,
 * the same way `MoveArrows` answers "where does UP go?" by marking the tile.
 *
 * Deliberately not a tutorial overlay: a card explaining the chest would stop
 * the first thing the player is doing (tapping tiles) to be read. An arrow over
 * the box is read without stopping, and ignored by anyone who has already
 * decided to walk there.
 *
 * ## Why it is in Pixi and not in the DOM
 *
 * It is ANCHORED TO A TILE. The island pans and zooms under the player's
 * finger, and a DOM marker would have to be re-projected every frame to stay
 * on the box — and clipped by hand once the chest goes off-screen. A child of
 * the scene's sorted container gets all of that from the camera for free, and
 * it sorts on the terrain's own ruler, so a hill in front of the chest hides
 * the arrow exactly as it hides the chest.
 *
 * ## The depth
 *
 * `(col + row) * 16 + tier` is the terrain's ruler and `Tile` matches it — see
 * the comment at the top of Blast.ts, which is where a literal `zIndex` last
 * went wrong. The arrow sits at +12 INSIDE the chest's own cell: above the box
 * (which is the tile's own sprite) and above its beam, but still behind
 * anything standing in the row in front.
 */
import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { HALF_W, HALF_H, tilePos, tileDepth, toColRow } from '@/config/gridConfig';
import { levelTierAt, tierLift } from '@/lib/game/terrainBoard';

/** Step inside the chest's cell. Above the box and its beam, below the next row. */
const OVER = 12;

/**
 * How high the arrow's POINT floats over the tile's top face.
 *
 * Deliberately CLOSE to the box — this is the slot the chest's tier word used
 * to occupy, and on the tutorial island the word steps aside for it (see
 * `Tile.hideChestTier`). Two earlier passes tried to share the space instead
 * and both failed: sitting under the word, the arrow read as pointing AT the
 * label; lifted clear above it, it ran off the top of the screen, because the
 * tutorial's chest sits high on the board and the camera frames the island,
 * not the arrow. Close to the lid is also simply what reads as pointing at the
 * lid.
 */
const LIFT = 40;

/** Travel of the bob, in pixels. Enough to be motion, small enough not to drift. */
const BOB = 7;
/** One bob down and back. Slow: this is a beacon, not an alert. */
const BOB_SECONDS = 0.9;

/** Arrow size, off the tile's metrics so it stays proportionate to the grid. */
const W = HALF_W * 0.40;
const H = HALF_H * 1.15;

/** The tutorial's own gold — the colour the first chest's tier already wears. */
const INK = 0xffd76a;

/**
 * An arrow planted over `index`, bobbing until it is taken down.
 *
 * Fire-and-forget like the rest of fx/: nothing outside has to tick it. The
 * caller keeps the handle only to `destroy()` it — which is the moment the
 * chest is dug, or the scene goes away.
 */
export class ChestPointer {
  private readonly g: Graphics;
  private readonly tween: gsap.core.Tween;

  constructor(world: Container, seed: string, index: number) {
    const { x, y: flatY } = tilePos(index);
    /** The tile's top FACE, not the grid plane — the terrace the chest sits on. */
    const groundY = flatY - tierLift(seed, index);

    // Drawn pointing DOWN, with its tip at the origin, so the bob moves the
    // whole shape and the tip stays the thing the eye follows.
    const g = new Graphics()
      // The head.
      .poly([0, 0, -W, -H * 0.45, W, -H * 0.45])
      .fill({ color: INK, alpha: 0.95 })
      // The shaft, which is what makes it read as an arrow and not a triangle.
      .rect(-W * 0.34, -H, W * 0.68, H * 0.58)
      .fill({ color: INK, alpha: 0.95 });

    // Named so a Playwright probe can find it on the stage — the same trick
    // the fog sprites use (`tile-<index>`). Costs nothing at runtime and it is
    // the only way to assert "the arrow is over the chest" from outside.
    g.label = `chest-arrow-${index}`;
    g.position.set(x, groundY - LIFT);
    const { col, row } = toColRow(index);
    g.zIndex = tileDepth(index) * 16 + levelTierAt(seed, col, row) + OVER;
    world.addChild(g);
    this.g = g;

    // Eased both ways rather than linear: a constant-speed bob reads as a
    // machine, and this is supposed to read as something beckoning.
    this.tween = gsap.to(g, {
      y: g.y - BOB,
      duration: BOB_SECONDS,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Take it down. Safe to call twice — the scene tears down more than once. */
  destroy(): void {
    this.tween.kill();
    this.g.destroy();
  }
}
