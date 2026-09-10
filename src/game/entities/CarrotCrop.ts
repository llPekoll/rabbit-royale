/**
 * The crop growing in the burrow's field, on the Pixi canvas.
 *
 * The Pixi twin of `components/carrot-field.tsx`: same plots, same sprite
 * sheet, same rules from `garden-growth.ts`. Two renderers because the burrow
 * is drawn two different ways — signed out it is a CSS backdrop behind the
 * sign-in panel, signed in it is this scene — but only ONE set of rules, so the
 * field cannot mean one thing on one screen and something else on the other.
 *
 * Every plot plays its whole sprout-to-ripe animation as a one-shot; how full
 * the garden is decides how OFTEN a plot starts. See garden-growth.ts for why
 * driving the frame from garden fullness would have left 35 frozen sprites.
 */
import { Container, Sprite, Texture, Rectangle } from 'pixi.js';
import PLOTS from '@/config/carrotPlots.json';
import {
  GROW_MS, MIN_LIVE_PLOTS, growthFrame, spawnGapMs, grownCount, idleProgress,
} from '@/lib/game/garden-growth';
import { GAME_W, GAME_H } from '../Application';
import { BURROW_ZOOM } from '@/config/burrowConfig';

interface Plot {
  x: number;
  y: number;
  sproutedAt: number | null;
  sprite: Sprite;
}

export class CarrotCrop {
  private plots: Plot[] = [];
  private frames: Texture[] = [];
  private elapsed = 0;
  private nextSprout = 0;
  private progress: number | null = null;

  /**
   * `base` is the backdrop's texture — the crop is cut from the SAME sheet the
   * carrots are drawn in, but positioned in the backdrop's coordinate space, so
   * both scale together and the plants stay in their furrows at any canvas size.
   */
  constructor(private container: Container, sheet: Texture) {
    // One sub-texture per growth frame, from the atlas rectangles rather than a
    // cols x rows formula — a re-pack would break a formula silently.
    this.frames = PLOTS.frames.map((r) => new Texture({
      source: sheet.source,
      frame: new Rectangle(r.x, r.y, r.w, r.h),
    }));

    // The backdrop is drawn `cover`-then-zoom about the canvas centre, so a
    // point in the ART maps into the scene by exactly this transform. Derived
    // rather than hardcoded, so moving BURROW_ZOOM moves the crop with it.
    const cover = Math.max(GAME_W / PLOTS.art.w, GAME_H / PLOTS.art.h);
    const scale = cover * BURROW_ZOOM;
    const left = GAME_W / 2 - (PLOTS.art.w * scale) / 2;
    const top = GAME_H / 2 - (PLOTS.art.h * scale) / 2;

    for (const p of PLOTS.plots) {
      const sprite = new Sprite(this.frames[0]);
      // Bottom-centre: a plant meets the ground at its root, and anchoring at
      // the middle floats every carrot above the soil.
      sprite.anchor.set(0.5, 1);
      sprite.position.set(left + p.x * scale, top + p.y * scale);
      sprite.scale.set(PLOTS.sprite.scale * scale);
      sprite.visible = false;
      // Above the backdrop (-10) but below the board's tiles and traps, so a
      // trap dropped on the field still reads as being ON it.
      sprite.zIndex = -5;
      this.container.addChild(sprite);
      this.plots.push({ x: p.x, y: p.y, sproutedAt: null, sprite });
    }
  }

  /** How full the garden is, 0..1; null runs the decorative loop. */
  setProgress(progress: number | null): void {
    this.progress = progress;
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
