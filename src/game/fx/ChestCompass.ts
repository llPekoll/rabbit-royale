/**
 * Chevrons pinned to the screen edge, one per chest the camera cannot show.
 *
 * ## Why this exists at all
 *
 * The chests became the island's win condition (`chestProgress`): take them
 * all and it erupts. At the same moment they were moved OUT to the rim
 * (`rimTiles`), so that finishing an island means walking it rather than
 * clearing the middle.
 *
 * Those two changes are right together and broken apart, and this is the
 * seam. The board is 32x32 at 60-80 screen pixels a tile — some two thousand
 * pixels across — and the opening shot frames the rabbit at the spawn, in the
 * centre. So on a fresh island EVERY chest is off-screen by construction: the
 * player is handed a goal ("3/10 chests" in the strip), an empty middle, and
 * no way to know which way to walk. The one thing the new rule needs the board
 * to say, the board could not say.
 *
 * ## Why not an arrow over each chest
 *
 * Because that is a different claim, and `ChestPointer` already refuses it on
 * purpose: outside the tutorial "a chest is a priced decision the player makes
 * for themselves, and an arrow over each one would be the game playing for
 * them." That stands. This does not mark chests you can see — the art already
 * does, with its glow, beam and tier word — it only answers "which way is the
 * one I cannot see", and it stops the moment the chest is in frame and the art
 * takes over. The player still chooses which to walk to, and still cannot tell
 * what the walk costs: a chevron says direction, never distance, and never
 * what lies between.
 *
 * ## Why it is Pixi and inside the camera's container
 *
 * The scene manager mounts exactly one node per scene (`scene.container`) and
 * hides scenes by toggling its `visible`. A layer parked on `app.stage` would
 * outlive that and hang over the burrow. So this lives inside the camera's
 * container like everything else and is COUNTER-TRANSFORMED on every camera
 * change — the same trick `CloudField.counterCamera` uses to park its bands
 * against the frame. Inside a counter-scaled layer, design-space pixels are
 * screen pixels again, which is what pinning to an edge needs.
 */
import { Assets, Container, Sprite, Texture } from 'pixi.js';
import * as Keys from '@/config/assetKeys';
import { toScreen, type IslandCam } from '@/game/scenes/islandCamera';
import { tileScreenPos } from '@/lib/game/terrainBoard';

/** One chest to point at: where it is, and the colour of its tier. */
export interface CompassTarget {
  tile: number;
  tint: number;
}

/**
 * How far in from the frame the chevrons ride, in design pixels.
 *
 * Clear of the HUD strip along the top and of a thumb along the bottom: a
 * marker under the carrot counter is a marker nobody reads, and one in the
 * bottom corner sits where the player's hand already is.
 */
const INSET = 34;

/**
 * A chest this close to the frame's edge, or closer, is treated as ON screen
 * and loses its chevron.
 *
 * Generous on purpose, and measured from the chest's TILE. A chest is drawn
 * with a beam and a word standing well above its cell, so a box whose tile has
 * only just cleared the edge is already legible — and a chevron that survives
 * until the tile is fully inside would sit on top of the very art it is
 * pointing at, which reads as a bug rather than as a hand-off.
 */
const IN_VIEW_MARGIN = 72;

/**
 * Chevron size as a share of its texture.
 *
 * 1.4, not the board arrow's 0.7. `ChestPointer` bobs directly over a box the
 * player is already looking at, and can be small because the thing it marks is
 * right there. These sit in the player's PERIPHERY, against a busy island of
 * pines and sheep, and at the same size they read as more scenery — in the
 * first capture of this feature they were on screen and genuinely hard to
 * find. A marker nobody notices is a marker that does not exist.
 *
 * The layer is counter-scaled, so this is a screen size and stays put as the
 * player zooms — which is the point: the goal must not shrink away when they
 * pull back to look for it.
 */
const SCALE = 1.4;

/**
 * The chevrons for one island.
 *
 * Fire-and-forget: the scene hands it the chest list when it changes and the
 * camera on every move, and never ticks it. Sprites are pooled rather than
 * rebuilt per camera change — this runs on every pan frame, and allocating a
 * sprite per chest per frame is the one way a marker like this turns into jank.
 */
export class ChestCompass {
  private readonly layer: Container;
  private readonly pool: Sprite[] = [];
  private targets: readonly CompassTarget[] = [];
  private seed = '';
  private cam: IslandCam = { scale: 1, x: 0, y: 0 };
  private w = 0;
  private h = 0;

  constructor(parent: Container) {
    this.layer = new Container();
    // Above everything, INCLUDING THE CLOUDS.
    //
    // `CloudField` already sits at 10_000 — chosen to clear the whole board,
    // which climbs past 480 on tile depth alone. A chevron is the one thing
    // that must never be occluded: hidden behind a hill or drifting under a
    // cloud, it has failed the only job it has. So it goes above the highest
    // thing the scene already draws, and the number is deliberately far enough
    // clear of the clouds' to read as "on top of the weather" rather than as a
    // tie nobody meant to make.
    this.layer.zIndex = 20_000;
    this.layer.sortableChildren = false;
    parent.addChild(this.layer);
  }

  /** The chests still worth pointing at. Replaces the previous list. */
  setTargets(seed: string, targets: readonly CompassTarget[]): void {
    this.seed = seed;
    this.targets = targets;
    this.layout();
  }

  /** The camera moved, or the canvas resized. */
  update(cam: IslandCam, width: number, height: number): void {
    this.cam = cam;
    this.w = width;
    this.h = height;
    // Undo the camera, so the children below can be positioned in screen
    // pixels — see the note at the top about why this layer lives in here.
    const inv = 1 / cam.scale;
    this.layer.scale.set(inv);
    this.layer.position.set(-cam.x * inv, -cam.y * inv);
    this.layout();
  }

  /**
   * Place one chevron per OFF-SCREEN chest, against the frame.
   *
   * The arithmetic is deliberately the simplest thing that is correct: take
   * the direction from the screen's centre to the chest, and walk it out to
   * whichever edge it crosses first. A chest beyond the corner therefore lands
   * IN the corner, which is where the player expects to look for it.
   */
  private layout(): void {
    // No canvas yet: park everything rather than returning.
    //
    // An early return here was a real bug. `setTargets` runs from the island
    // snapshot, which can arrive BEFORE the first `update`, so `w`/`h` were
    // still zero — and on the island swap the same path left the previous
    // board's chevrons sitting on screen at their old coordinates, because
    // emptying the target list could not unparent sprites the layout never
    // reached. Parking first makes "nothing to draw" the same code path as
    // "nothing fits", which is the only state this class should ever be in.
    if (!this.w || !this.h) {
      for (const sprite of this.pool) sprite.visible = false;
      return;
    }
    const cx = this.w / 2;
    const cy = this.h / 2;
    const halfW = this.w / 2 - INSET;
    const halfH = this.h / 2 - INSET;

    let used = 0;
    for (const target of this.targets) {
      const at = toScreen(this.cam, tileScreenPos(this.seed, target.tile));
      // On screen: the chest's own art is doing the job, so say nothing.
      if (at.x > IN_VIEW_MARGIN && at.x < this.w - IN_VIEW_MARGIN
        && at.y > IN_VIEW_MARGIN && at.y < this.h - IN_VIEW_MARGIN) continue;

      const dx = at.x - cx;
      const dy = at.y - cy;
      if (dx === 0 && dy === 0) continue;

      // Scale the direction until it touches the nearer edge. Guarding the
      // zero denominators matters: a chest dead level with the rabbit has
      // dy === 0, and an unguarded divide parks its chevron at NaN — which
      // Pixi renders as nothing at all, i.e. a marker that silently vanishes
      // on exactly the alignment a player is most likely to be walking.
      const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
      const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
      const t = Math.min(tx, ty);

      const sprite = this.take(used++);
      sprite.tint = target.tint;
      sprite.position.set(cx + dx * t, cy + dy * t);
      // The kit's chevron points DOWN at rest, so the angle is measured from
      // straight down rather than from the x axis.
      sprite.rotation = Math.atan2(dy, dx) - Math.PI / 2;
      sprite.visible = true;
    }

    // Park the rest rather than destroying them: the list churns as chests are
    // dug and as the camera moves, and a pool that shrinks and regrows is the
    // allocation this class exists to avoid.
    for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  /** The nth chevron, made on first use. */
  private take(i: number): Sprite {
    let sprite = this.pool[i];
    if (!sprite) {
      sprite = new Sprite(Assets.get<Texture>(Keys.ARROW_DOWN) ?? Texture.EMPTY);
      sprite.anchor.set(0.5);
      sprite.scale.set(SCALE);
      this.layer.addChild(sprite);
      this.pool[i] = sprite;
    }
    return sprite;
  }

  destroy(): void {
    this.layer.destroy({ children: true });
  }
}
