'use client';

/**
 * The loot chest — the kit's animated atlas, with its idle shine.
 *
 * This replaces a flat `treasure_chest.webp` that had no light on it at all.
 * The kit ships the real thing on `@domin8/arcade-kit/game`: `LOOT_BOX_ATLAS`,
 * the same Aseprite sheet the hub's SHOP tab and the arena's loot box draw, and
 * its first tag (frames 0-5, named `higblight` in the file) is a highlight that
 * sweeps across the closed lid. That sweep is the whole reason to use it — a
 * chest that caught the light is an object, a chest that does not is a sticker.
 *
 * SCOPE. The hub's `LootChest` also pops the lid and rains coins into it across
 * two stacked canvases. A launcher tab never plays that, so this port carries
 * only the closed chest and its shine: the animation the tab actually shows,
 * without the coin physics it does not.
 *
 * THE INK. Frames are trimmed out of a 64x64 source and the drawn pixels are
 * 23x14, sitting low in the canvas. That empty margin is why a chest sized to
 * "look right" never does — you size the BOX and get a small sprite adrift from
 * whatever is beside it. So this crops to the ink itself: the canvas IS the
 * chest, and ordinary layout (a gap, a height, centring) applies to what you
 * can actually see.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { LOOT_BOX_ATLAS } from '@domin8/arcade-kit/game';

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  duration: number;
}

/** The closed chest's idle shine — atlas tag `higblight`. */
const SHINE = { from: 0, to: 5 } as const;

/**
 * The crop, taken from the shine frames' own trim box (all six share it):
 * source x 21, y 50, and 23x14 of drawn pixels. Cropping to exactly this is
 * what makes the canvas the chest rather than a box the chest sits at the
 * bottom of.
 */
const CROP_X = 21;
const CROP_Y = 50;
const W = 23;
const H = 14;

/** Native aspect, so a caller sizes by width and the height follows. */
export const CHEST_ASPECT = H / W;

// One texture load shared by every chest on the page.
let atlasPromise: Promise<{ img: HTMLImageElement; frames: AtlasFrame[] }> | null = null;
function loadAtlas() {
  if (!atlasPromise) {
    const j = LOOT_BOX_ATLAS.atlas as { frames: AtlasFrame[] | Record<string, AtlasFrame> };
    const frames = Array.isArray(j.frames) ? j.frames : Object.values(j.frames);
    atlasPromise = new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = LOOT_BOX_ATLAS.texture;
    }).then((img) => ({ img, frames }));
  }
  return atlasPromise;
}

export interface LootChestProps {
  /** Rendered width in CSS px. Height follows the sprite's own aspect. */
  size?: number;
  /**
   * Seconds between shines. The sweep is a glance-catcher, so it is rare on
   * purpose: a chest that glints constantly is a blinking icon, which is the
   * thing a player learns to stop seeing.
   */
  everyMs?: number;
  /** Skip the shine entirely (reduced motion is handled on its own below). */
  shine?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function LootChest({
  size = 46, everyMs = 4200, shine = true, className, style,
}: LootChestProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let img: HTMLImageElement | null = null;
    let frames: AtlasFrame[] = [];

    const paint = (i: number) => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !img) return;
      const f = frames[i];
      if (!f) return;
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        f.frame.x, f.frame.y, f.frame.w, f.frame.h,
        f.spriteSourceSize.x - CROP_X, f.spriteSourceSize.y - CROP_Y, f.frame.w, f.frame.h,
      );
    };

    /** Play the shine once, then rest on the closed chest until the next one. */
    const sweep = () => {
      let i = SHINE.from;
      let last = performance.now();
      let acc = 0;
      paint(i);
      const loop = (t: number) => {
        if (!alive) return;
        acc += t - last;
        last = t;
        const dur = frames[i]?.duration || 100;
        if (acc >= dur) {
          acc %= dur;
          i += 1;
          if (i > SHINE.to) {
            paint(SHINE.from); // back to rest
            timer = setTimeout(sweep, everyMs);
            return;
          }
          paint(i);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    loadAtlas().then(({ img: i, frames: f }) => {
      if (!alive) return;
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = W;
      canvas.height = H;
      img = i;
      frames = f;
      paint(SHINE.from);
      // A sweeping highlight is decoration, not information — the chest reads
      // exactly the same at rest, so honour the OS setting and simply hold it.
      const still = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (shine && !still) timer = setTimeout(sweep, everyMs);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [everyMs, shine]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden
      style={{
        width: size,
        height: size * CHEST_ASPECT,
        display: 'block',
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
}
