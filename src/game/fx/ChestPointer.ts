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
 * ## The same arrow the burrow already uses
 *
 * `Keys.ARROW_DOWN` is the shared kit's chevron, which the burrow hangs over
 * the field a raider is crossing towards (`BurrowScene.buildGoalArrow`). This
 * is the same job — "the thing you are going to is HERE" — so it is the same
 * sprite, the same gold, the same bob. A hand-drawn triangle stood here first
 * and read as a debug marker beside the game's own art; more to the point, two
 * arrows that mean one thing should not be two different pictures.
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
import { Assets, Container, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import * as Keys from '@/config/assetKeys';
import { HALF_W, HALF_H, tilePos, tileDepth, toColRow } from '@/config/gridConfig';
import { levelTierAt, tierLift } from '@/lib/game/terrainBoard';

/** Step inside the chest's cell. Above the box and its beam, below the next row. */
const OVER = 12;

/**
 * How high the arrow's TIP floats over the tile's top face.
 *
 * Deliberately CLOSE to the box — this is the slot the chest's tier word used
 * to occupy, and on the tutorial island the word steps aside for it (see
 * `Tile.hideChestTier`). Two earlier passes tried to share the space instead
 * and both failed: sitting under the word, the arrow read as pointing AT the
 * label; lifted clear above it, it ran off the top of the screen, because the
 * tutorial's chest sits high on the board and the camera frames the island,
 * not the arrow. Close to the lid is also simply what reads as pointing at it.
 *
 * In TILE-HALVES rather than raw pixels, the way the burrow's goal arrow does
 * it: the group is a child of the camera-scaled world, so a pixel count here
 * is not a pixel count on screen — a flat 40 put the chevron a third of the
 * way up the canvas, visibly detached from the box it was meant to mark.
 */
const LIFT = 2.4;

/** Width as a share of the tile, so it follows the grid's metrics rather than
 *  pinning itself to the texture's pixel count. The burrow's own 0.7. */
const SCALE = 0.7;

/** The bob: pixels per leg, and seconds for one. The burrow's numbers. */
const BOB = 5;
const BOB_SECONDS = 0.9;

/** The gold the burrow's goal arrow already wears — the prize's colour. */
const TINT = 0xffd45c;

/**
 * An arrow planted over `index`, bobbing until it is taken down.
 *
 * Fire-and-forget like the rest of fx/: nothing outside has to tick it. The
 * caller keeps the handle only to `destroy()` it — which is the moment the
 * chest is dug, or the scene goes away.
 */
export class ChestPointer {
  private readonly group: Container;
  private tween: gsap.core.Tween | null = null;

  constructor(world: Container, seed: string, index: number) {
    const { x, y: flatY } = tilePos(index);
    /** The tile's top FACE, not the grid plane — the terrace the chest sits on. */
    const groundY = flatY - tierLift(seed, index);

    const group = new Container();
    // Transparent to the pointer: the chest's own tile is what gets tapped to
    // dig it, and a marker that swallowed that tap would put the sign for the
    // prize between the player and the prize.
    group.eventMode = 'none';
    // Named so a Playwright probe can find it on the stage — the same trick
    // the fog sprites use (`tile-<index>`). Costs nothing at runtime and it is
    // the only way to assert "the arrow is over the chest" from outside.
    group.label = `chest-arrow-${index}`;
    group.position.set(x, groundY);
    const { col, row } = toColRow(index);
    group.zIndex = tileDepth(index) * 16 + levelTierAt(seed, col, row) + OVER;
    world.addChild(group);
    this.group = group;

    const texture = Assets.get<Texture>(Keys.ARROW_DOWN);
    // A missing texture is a missing atlas, not a reason to break a run: the
    // chest still glows and is still diggable without a sign over it.
    if (!texture) return;

    const arrow = new Sprite(texture);
    // Anchored at its TIP, which is what the arrow actually points with:
    // anchored centrally the bob would swing the tip into the lid, and the
    // sprite's own height would decide which cell it appeared to mean.
    arrow.anchor.set(0.5, 1);
    arrow.scale.set((HALF_W * SCALE) / texture.width);
    arrow.tint = TINT;
    arrow.y = -HALF_H * LIFT;
    group.addChild(arrow);

    // The bob rides the SPRITE, not the group, so the group's origin stays
    // pinned to the chest's cell and only the chevron travels. Eased both ways
    // rather than linear: a constant-speed bob reads as a machine, and this is
    // meant to read as something beckoning.
    this.tween = gsap.to(arrow, {
      y: arrow.y - BOB,
      duration: BOB_SECONDS,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Take it down. Safe to call twice — the scene tears down more than once. */
  destroy(): void {
    this.tween?.kill();
    this.tween = null;
    this.group.destroy({ children: true });
  }
}
