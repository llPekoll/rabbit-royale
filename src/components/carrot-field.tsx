'use client';

/**
 * The burrow's field, growing.
 *
 * The backdrop ships with a BARE field (`burrow.webp`) and the crop is drawn
 * over it here, because a carrot painted into the art cannot grow — and the
 * field is the one part of that picture that should be alive. Signed out it is
 * scenery on a waiting screen; signed in it is a readout of a garden the player
 * owns, emptying the moment they harvest.
 *
 * Each plot plays its WHOLE sprout-to-ripe animation as a one-shot. What the
 * garden's fullness changes is how often a new plot starts — see
 * `garden-growth.ts` for why frames-by-progress would have been motionless.
 *
 * Drawn on a canvas rather than as 35 DOM nodes: it sits behind the whole UI,
 * animates continuously, and 35 elements each stepping a sprite every frame is
 * layout churn for something nobody clicks.
 */
import { useEffect, useRef } from 'react';
import PLOTS from '@/config/carrotPlots.json';
import {
  GROW_MS, growthFrame, spawnGapMs, idleProgress, STAGES,
  recyclesPlots, standingTarget,
} from '@/lib/game/garden-growth';

const SHEET = '/assets/carottes/carrote.png';

export interface CarrotFieldProps {
  /**
   * How full the garden is, 0..1 — normally `gardenReady / capacity`.
   *
   * `null` means "nobody is signed in": the field runs its slow decorative loop
   * instead, which needs no garden and makes no claim about one.
   */
  progress: number | null;
  /**
   * Bumped by the caller on a harvest. The field clears and regrows from bare
   * soil, so collecting has a visible consequence on the place itself and not
   * only on a counter.
   */
  harvestKey?: number;
  className?: string;
}

interface Plot {
  x: number;
  y: number;
  /** When this plot sprouted, in ms on the animation clock; null = bare. */
  sproutedAt: number | null;
}

export function CarrotField({ progress, harvestKey = 0, className }: CarrotFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Read inside the animation loop, so a prop change does not restart it —
  // restarting would re-sprout the whole field on every re-render.
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const art = PLOTS.art;
    canvas.width = art.w;
    canvas.height = art.h;
    ctx.imageSmoothingEnabled = false;

    const plots: Plot[] = PLOTS.plots.map((p) => ({ x: p.x, y: p.y, sproutedAt: null }));
    const sheet = new Image();
    sheet.src = SHEET;

    let raf = 0;
    let ready = false;
    let start = 0;
    let nextSprout = 0;
    // Frame rectangles come from the atlas (via carrotPlots.json), not from a
    // cols x rows formula — a re-pack would break the formula silently.
    const rects = PLOTS.frames;
    const scale = PLOTS.sprite.scale;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!ready) return;
      if (!start) {
        start = now;
        nextSprout = now;
      }
      const elapsed = now - start;

      // Signed out, the loop supplies its own fullness; signed in, the garden
      // does. Everything downstream is the same either way.
      const p = progressRef.current ?? idleProgress(elapsed);

      // Start plots until as many are growing as the field's fullness calls
      // for. Only one per gap, so they arrive as a trickle rather than all at
      // once — the trickle IS the readout.
      const live = plots.filter((q) => q.sproutedAt !== null).length;
      // What the field is ALLOWED to be standing. On a real garden this never
      // falls — see `standingTarget`; only `harvestKey` empties it.
      const wanted = standingTarget(progressRef.current, live, plots.length);
      if (live < wanted && now >= nextSprout) {
        // Sprout the next BARE plot in draw order, so the field fills from the
        // back forward instead of speckling at random.
        const next = plots.find((q) => q.sproutedAt === null);
        if (next) next.sproutedAt = now;
        nextSprout = now + spawnGapMs(p, plots.length);
      }
      // Fullness fell — only the idle loop wrapping can do this now, since a
      // real garden's target never drops. Clear the surplus from the front, so
      // the field empties the way it filled.
      if (live > wanted) {
        for (let i = plots.length - 1; i >= 0 && plots.filter((q) => q.sproutedAt !== null).length > wanted; i--) {
          if (plots[i].sproutedAt !== null) plots[i].sproutedAt = null;
        }
      }

      // The decorative loop's churn, keeping the floor in `grownCount` MOVING
      // rather than standing inert. Never on a real garden — see
      // `recyclesPlots`: there a grown carrot IS the harvest, and replaying it
      // elsewhere shows carrots vanishing while the panel's number only climbs.
      // The replacement is the next bare plot in draw order, not a random one,
      // so the field still fills back to front.
      if (recyclesPlots(progressRef.current)) {
        for (const plot of plots) {
          if (plot.sproutedAt === null) continue;
          if (now - plot.sproutedAt < GROW_MS + spawnGapMs(p, plots.length)) continue;
          plot.sproutedAt = null;
          const fresh = plots.find((q) => q.sproutedAt === null);
          if (fresh) fresh.sproutedAt = now;
        }
      }

      ctx.clearRect(0, 0, art.w, art.h);
      for (const plot of plots) {
        if (plot.sproutedAt === null) continue;
        const r = rects[Math.min(rects.length - 1, growthFrame(now - plot.sproutedAt))];
        const dw = Math.round(r.w * scale);
        const dh = Math.round(r.h * scale);
        ctx.drawImage(
          sheet, r.x, r.y, r.w, r.h,
          // Anchored at the BOTTOM centre: a plant meets the ground at its
          // root. Anchoring at the middle floats every carrot.
          Math.round(plot.x - dw / 2), Math.round(plot.y - dh), dw, dh,
        );
      }
    };

    sheet.onload = () => { ready = true; };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // `harvestKey` in the deps is the point: a harvest tears the field down and
    // rebuilds it from bare soil.
  }, [harvestKey]);

  return <canvas ref={ref} className={className} aria-hidden />;
}

/** Frames in the sheet, re-exported so a story can label its controls. */
export const CARROT_STAGES = STAGES;
export const CARROT_GROW_MS = GROW_MS;
