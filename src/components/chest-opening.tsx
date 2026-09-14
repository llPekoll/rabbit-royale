'use client';

/**
 * The chest POPPING ITS LID — the half of the loot-box atlas nobody plays yet.
 *
 * `LootChest` draws the closed box and its shine (tag `higblight`, frames 0-5).
 * The same sheet also carries the opening, split across two tags whose names
 * are misleading: `jump front` (6-10) is the BACK half of the box as the lid
 * flies, and `jumpback` (17-21) is the front lip it flies over. Played in
 * order they are one animation, and this is the component that plays it.
 *
 * Built for the kit's `ChestReveal` ceremony, whose `chest` prop is called with
 * the current phase: this pops on "blow" and rests closed before it. It is a
 * plain canvas, so it works anywhere the reveal does.
 *
 * ## Why its own crop
 *
 * `LootChest` crops to the shine frames' shared 23x14 trim box, which is what
 * makes its canvas BE the chest. The opening frames are bigger and move — up to
 * 30x15, and one sits 3px higher than the closed box — so that crop would clip
 * the lid off mid-flight. The window here is the UNION of every frame this
 * component draws, computed from the atlas rather than guessed: 31x17 at
 * (20, 47). Wider than the chest on purpose, so the lid has somewhere to go.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { LOOT_BOX_ATLAS } from '@domin8/arcade-kit/game';

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  duration: number;
}

/**
 * The opening, in play order: the box's back half, then the front lip.
 *
 * Frame 8 and 19 are the same drawing from the two tags; keeping both is what
 * the sheet intends — the animation reads as one pop, not two halves.
 */
const OPEN_FRAMES = [6, 7, 8, 9, 10, 17, 18, 19, 20, 21];

/** The closed box, resting on the first shine frame. */
const CLOSED_FRAME = 0;

/**
 * The window every frame above is drawn into — the union of their trim boxes.
 *
 * Taken from the atlas (min x/y, max right/bottom over all frames drawn here),
 * not chosen by eye: a window sized to the closed box clips the lid, and one
 * sized by trial and error drifts the moment the sheet is re-exported.
 */
const CROP_X = 20;
const CROP_Y = 47;
const W = 31;
const H = 17;

/** Native aspect, so a caller sizes by width and the height follows. */
export const OPENING_ASPECT = H / W;

let atlasPromise: Promise<{ img: HTMLImageElement; frames: AtlasFrame[] }> | null = null;
function loadAtlas() {
  if (!atlasPromise) {
    const j = LOOT_BOX_ATLAS.atlas as { frames: AtlasFrame[] | Record<string, AtlasFrame> };
    // Aseprite writes `frames` as an ARRAY; older exports use an object. Both
    // shapes appear in the wild, so normalise rather than assume.
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

export interface ChestOpeningProps {
  /**
   * Play the opening. While false the chest rests closed.
   *
   * A prop rather than a `play()` handle because the ceremony drives this from
   * its own phase: the consumer passes `open={phase === 'blow'}` and never has
   * to hold a ref or worry about when to fire it.
   */
  open: boolean;
  /** Rendered width in CSS px. Height follows the sprite's own aspect. */
  size?: number;
  /** Fired once the last frame has been shown. */
  onOpened?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function ChestOpening({ open, size = 96, onOpened, className, style }: ChestOpeningProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Held in a ref so restarting the animation never re-runs the effect: the
  // callback identity is the consumer's business, not a reason to reload.
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  useEffect(() => {
    let alive = true;
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
        // Each frame carries its own offset inside the source cell, so the
        // lid lands where it was drawn rather than snapping to the corner.
        f.spriteSourceSize.x - CROP_X, f.spriteSourceSize.y - CROP_Y, f.frame.w, f.frame.h,
      );
    };

    const step = (n: number) => {
      if (!alive) return;
      if (n >= OPEN_FRAMES.length) {
        onOpenedRef.current?.();
        return;
      }
      const idx = OPEN_FRAMES[n];
      paint(idx);
      // The sheet times itself — each frame carries the hold the artist drew
      // it with, so re-timing the pop happens in Aseprite, not here.
      timer = setTimeout(() => step(n + 1), frames[idx]?.duration ?? 100);
    };

    loadAtlas().then(({ img: i, frames: f }) => {
      if (!alive) return;
      img = i;
      frames = f;
      if (open) step(0);
      else paint(CLOSED_FRAME);
    });

    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [open]);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className={className}
      style={{
        width: size,
        height: size * OPENING_ASPECT,
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
}
