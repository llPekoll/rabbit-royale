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
import { ISO_TILE_W } from '@/config/gridConfig';
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
 *
 * This is a FLOOR, not the resting place — see `layout`, which pushes a
 * chevron further out when the chest it points at is close to the frame.
 */
const INSET = 34;

/**
 * How far inside the frame a chest's TILE must come before its chevron goes,
 * as a multiple of the tile width ON SCREEN.
 *
 * A MULTIPLE, not a pixel count, and that is the whole fix. The first cut used
 * a flat 72px, which failed in two ways at once: it was barely twice the
 * chevron's own width, and it did not move with the zoom. Zoomed in, a chest's
 * box and beam cover far more than 72px, so the chevron was still on screen
 * while the chest was fully drawn beneath it — the arrow ended up sitting on
 * top of the very art it was pointing at (reported 2026-09-19, with a capture
 * of a chevron overlapping a bronze box on the south coast).
 *
 * 3.5 tiles is measured from the tile, but it has to cover everything the
 * chest DRAWS: the box overflows its cell, the tier word sits well above it,
 * and the beam runs higher still. Clearing all of that before the marker goes
 * is what makes the hand-off read as one thing becoming another rather than
 * as two markers briefly fighting.
 *
 * The cost of being generous is a chevron that lingers a moment while the
 * chest is already visible, which is the right way to be wrong: the marker
 * points at something the player can now see, instead of covering it.
 */
const IN_VIEW_TILES = 3.5;

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

    // The hand-off distance, in screen pixels at the CURRENT zoom — see
    // `IN_VIEW_TILES`. Read once per layout rather than per chest: every
    // chevron on the board hands off at the same distance.
    const margin = ISO_TILE_W * this.cam.scale * IN_VIEW_TILES;

    let used = 0;
    for (const target of this.targets) {
      const at = toScreen(this.cam, tileScreenPos(this.seed, target.tile));
      const dx = at.x - cx;
      const dy = at.y - cy;
      if (dx === 0 && dy === 0) continue;

      // On screen with room to spare: the chest's own art is doing the job now,
      // so the chevron says nothing rather than covering it.
      //
      // Deliberately NOT a rectangular test against the frame. That was the
      // last bug standing: a box test passes a chest near a CORNER while the
      // radial pull-back below still finds room to stand outside it, so eight
      // chevrons survived on a fully visible island. One geometry for both
      // decisions — distance along the chest's own ray — and the two cannot
      // disagree.
      if (at.x > margin && at.x < this.w - margin
        && at.y > margin && at.y < this.h - margin) continue;

      /**
       * Park the chevron on the frame, then pull it back until it is clear of
       * the chest.
       *
       * Two rules, in the order they matter:
       *
       * FIRST the chevron rides the frame, at `INSET`. That is the whole point
       * of an edge marker — it lives in the periphery, where the player is not
       * looking, and says "over there".
       *
       * THEN, if the chest is itself near that edge, the chevron steps back
       * along its own ray until there is `margin` between them. Without this
       * the marker sat on the box (reported 2026-09-19): a chest 150px inside
       * the frame and a chevron pinned 34px from it are barely a hundred pixels
       * apart. Stepping back is measured from the CHEST, so it is correct at
       * every zoom by construction.
       *
       * And if that pull-back would drag the chevron inside the chest — i.e.
       * the box is so far into the frame that there is no room to stand
       * outside it — the chevron is dropped. That is the zoomed-out case:
       * pulled back to see the whole island, every chest is visible and no
       * arrow should be drawn at all. Earlier attempts tested the scaling
       * factor instead and switched the feature off entirely; comparing
       * DISTANCES FROM THE CENTRE cannot go wrong that way.
       */
      const reach = Math.hypot(dx, dy);
      const ux = dx / reach;
      const uy = dy / reach;
      // How far along the ray the frame is, at INSET.
      const tx = ux === 0 ? Infinity : (this.w / 2 - INSET) / Math.abs(ux);
      const ty = uy === 0 ? Infinity : (this.h / 2 - INSET) / Math.abs(uy);
      // The frame, or a step back from the chest — whichever is nearer the
      // centre. Both are distances along the same ray, so they compare.
      const atFrame = Math.min(tx, ty);
      const dist = Math.min(atFrame, reach - margin);
      // No room to stand outside the box: the chest is in plain sight.
      //
      // `reach - margin` is where the chevron would have to sit to clear the
      // chest. When that is nearer the centre than the frame, the chest is
      // comfortably inside the view and the marker has nothing to add — this
      // is what finally silenced the arrows that hovered over a fully visible
      // island, where a rectangular frame test had let corner chests through.
      if (dist <= 0 || reach - margin < atFrame) continue;

      const sprite = this.take(used++);
      sprite.tint = target.tint;
      sprite.position.set(cx + ux * dist, cy + uy * dist);
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
