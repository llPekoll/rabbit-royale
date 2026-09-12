/**
 * The crop growing in the burrow's field, on the Pixi canvas.
 *
 * The Pixi twin of `components/carrot-field.tsx`: same sprite sheet, same
 * rules from `garden-growth.ts`. Two renderers because the burrow is drawn two
 * different ways — signed out it is a CSS backdrop behind the sign-in panel,
 * signed in it is this scene — but only ONE set of rules, so the field cannot
 * mean one thing on one screen and something else on the other.
 *
 * Every plot plays its whole sprout-to-ripe animation as a one-shot; how full
 * the garden is decides how OFTEN a plot starts. See garden-growth.ts for why
 * driving the frame from garden fullness would have left 35 frozen sprites.
 *
 * ## Where the plants stand
 *
 * On the FIELD TILES, now. They used to come from `carrotPlots.json` — 35
 * points flood-filled out of the painted soil in `burrow.webp` — because the
 * field was a picture of a field. On generated ground the garden is a set of
 * cells the owner's seed chose, so the plots are sown on those cells instead
 * and there is nothing left to keep aligned with a painting.
 *
 * Several plants per cell, jittered inside the diamond, so a field reads as a
 * crop rather than as one carrot per square.
 */
import { Container, Sprite, Texture, Rectangle } from 'pixi.js';
import PLOTS from '@/config/carrotPlots.json';
import {
  GROW_MS, MIN_LIVE_PLOTS, growthFrame, spawnGapMs, grownCount, idleProgress,
} from '@/lib/game/garden-growth';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { BURROW_HALF_W, BURROW_HALF_H } from '@/config/burrowConfig';
import { fieldTiles } from '@/game/burrow/board';
import { burrowTileScreen, burrowDepth } from '@/game/burrow/screen';

interface Plot {
  x: number;
  y: number;
  /** The field tile this plant grows on, so a raid can hide it. */
  tile: number;
  sproutedAt: number | null;
  sprite: Sprite;
}

/**
 * Plants per field cell.
 *
 * Three keeps a 12-cell garden at ~36 plants, which is about what the painted
 * field carried (35) — so `garden-growth`'s pacing, tuned against that count,
 * still reads the same.
 */
const PER_CELL = 3;

/** How large a carrot is drawn against the burrow's diamond. */
const PLANT_SCALE = 0.42;

export class CarrotCrop {
  private plots: Plot[] = [];
  private frames: Texture[] = [];
  private elapsed = 0;
  private nextSprout = 0;
  private progress: number | null = null;
  /** Tiles currently uncovered, or null when the whole field is in view. */
  private shown: Set<number> | null = null;

  /**
   * `sheet` is the carrot growth atlas; `seed` is the burrow's owner, which is
   * what decides where the field is.
   *
   * The jitter is seeded from the same id, so a player's garden is sown the
   * same way every time they open it — a field that reshuffled on each visit
   * would read as the plants having moved overnight.
   */
  constructor(private container: Container, sheet: Texture, seed: string) {
    // One sub-texture per growth frame, from the atlas rectangles rather than a
    // cols x rows formula — a re-pack would break a formula silently.
    this.frames = PLOTS.frames.map((r) => new Texture({
      source: sheet.source,
      frame: new Rectangle(r.x, r.y, r.w, r.h),
    }));

    const rng = mulberry32(seedFrom(`${seed}:crop`));

    for (const tile of fieldTiles(seed)) {
      const centre = burrowTileScreen(seed, tile);
      for (let n = 0; n < PER_CELL; n++) {
        // Scattered inside the cell's DIAMOND, not its bounding box: a point
        // picked in the box lands outside the tile at the corners, and a
        // carrot there grows out of the neighbouring cell. |u| + |v| <= 1 in
        // diamond coordinates is exactly the tile.
        const u = rng() * 2 - 1;
        const v = (rng() * 2 - 1) * (1 - Math.abs(u));
        const x = centre.x + (u + v) * BURROW_HALF_W * 0.6;
        const y = centre.y + (v - u) * BURROW_HALF_H * 0.6;

        const sprite = new Sprite(this.frames[0]);
        // Bottom-centre: a plant meets the ground at its root, and anchoring
        // at the middle floats every carrot above the soil.
        sprite.anchor.set(0.5, 1);
        sprite.position.set(x, y);
        sprite.scale.set(PLANT_SCALE);
        sprite.visible = false;
        // Sorted against the tile it grows on, a hair in front of it, so a
        // trap dropped on the field still reads as being ON the ground and a
        // plant on a nearer cell draws over one behind it.
        sprite.zIndex = burrowDepth(seed, tile) + 0.2;
        this.container.addChild(sprite);
        this.plots.push({ x, y, tile, sproutedAt: null, sprite });
      }
    }
  }

  /** How full the garden is, 0..1; null runs the decorative loop. */
  setProgress(progress: number | null): void {
    this.progress = progress;
  }

  /**
   * Show only the plants growing on these tiles; null shows the whole field.
   *
   * The garden is the OBJECTIVE of a raid, and a carrot is the most legible
   * thing on the board — so a crop drawn over hidden ground is an arrow
   * pointing at the win condition, visible from the doorway. During a raid the
   * plants are therefore uncovered with the tiles they grow on, and a raider
   * sees the garden at the moment they reach it rather than from the start.
   *
   * Held as a set rather than applied once, because `update` turns sprites
   * visible as they sprout and would otherwise undo this on the next frame.
   */
  revealOnly(tiles: Iterable<number> | null): void {
    this.shown = tiles === null ? null : new Set(tiles);
    for (const plot of this.plots) {
      if (!this.canShow(plot)) plot.sprite.visible = false;
    }
  }

  /** True when this plot's tile is uncovered — always, outside a raid. */
  private canShow(plot: Plot): boolean {
    return this.shown === null || this.shown.has(plot.tile);
  }

  /** Clear the field — the harvest has been collected. */
  reset(): void {
    for (const plot of this.plots) {
      plot.sproutedAt = null;
      plot.sprite.visible = false;
    }
  }

  /** Driven by the scene's ticker, in real milliseconds. */
  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    const now = this.elapsed;
    const p = this.progress ?? idleProgress(now);

    const wanted = grownCount(p, this.plots.length);
    const live = this.plots.filter((q) => q.sproutedAt !== null).length;

    if (live < wanted && now >= this.nextSprout) {
      // Fill from the back forward, so the field grows in rather than
      // speckling at random.
      const next = this.plots.find((q) => q.sproutedAt === null);
      if (next) next.sproutedAt = now;
      this.nextSprout = now + spawnGapMs(p);
    }
    if (live > wanted) {
      for (let i = this.plots.length - 1; i >= 0; i--) {
        if (this.plots.filter((q) => q.sproutedAt !== null).length <= wanted) break;
        if (this.plots[i].sproutedAt !== null) {
          this.plots[i].sproutedAt = null;
          this.plots[i].sprite.visible = false;
        }
      }
    }

    // On a nearly bare field the few living plots would sprout once and then
    // stand there forever, which is the inert picture `MIN_LIVE_PLOTS` exists
    // to avoid — a floor only helps if those plots keep MOVING. So a finished
    // one is recycled. Only while nearly bare: on a real crop a grown carrot
    // must stay put, because it IS the harvest.
    if (wanted <= MIN_LIVE_PLOTS) {
      for (const plot of this.plots) {
        if (plot.sproutedAt === null) continue;
        if (now - plot.sproutedAt < GROW_MS + spawnGapMs(p)) continue;
        plot.sproutedAt = null;
        plot.sprite.visible = false;
        const fresh = this.plots[Math.floor(Math.random() * this.plots.length)];
        if (fresh.sproutedAt === null) fresh.sproutedAt = now;
      }
    }

    for (const plot of this.plots) {
      if (plot.sproutedAt === null) continue;
      // A sprouted plant on ground the viewer has not uncovered stays hidden:
      // it keeps growing, it is simply not drawn. See `revealOnly`.
      if (!this.canShow(plot)) { plot.sprite.visible = false; continue; }
      plot.sprite.visible = true;
      plot.sprite.texture = this.frames[
        Math.min(this.frames.length - 1, growthFrame(now - plot.sproutedAt))
      ];
    }
  }

  destroy(): void {
    for (const plot of this.plots) plot.sprite.destroy();
    this.plots = [];
    for (const f of this.frames) f.destroy();
    this.frames = [];
  }
}
