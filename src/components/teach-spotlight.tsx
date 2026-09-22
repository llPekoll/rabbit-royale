'use client';

/**
 * THE SPOTLIGHT — while the tutorial asks for the red X, everything on the
 * screen goes dark except MARK A BOMB (Paul, 22 September 2026: "darkening
 * the whole screen except the MARK A BOMB button").
 *
 * WHY. The board holds until the taught bomb wears its X (`teachingHold`):
 * every other step is refused. A refused step is a buzz and a red tile, and a
 * player who has not yet noticed the button in the corner reads the buzz as
 * the game being broken — that is the report this answers. An arrow over the
 * button and a caption saying to press it were both there, and both were one
 * thing among twenty on a lit board. With the board dark, they are the only
 * things left.
 *
 * WHAT STAYS LIT. The button, the arrow bobbing over it, and the caption line
 * that says what to press — the instruction and the control it names, nothing
 * else. The caption is lit too because a hint that hides its own sentence is
 * a worse hint.
 *
 * HOW. One SVG over the whole screen, painted through a mask with the lit
 * boxes cut out. A mask rather than a box-shadow spread because there are
 * three holes, not one; an SVG rather than `clip-path` because the holes want
 * rounded corners and a mask draws them as rects with `rx`. It sits ABOVE the
 * carrot pill (z 20) and below the hit flash and the eruption (25, 30), and
 * takes no pointer events, so a tap on the lit button reaches it as before.
 *
 * The boxes are MEASURED each frame while the spotlight is up: the caption
 * changes text and re-lays itself, the button's width follows its label, and
 * three `getBoundingClientRect` calls a frame cost nothing. It only re-renders
 * when a box actually moved.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Air around each lit thing, so the plank's leafy caps are not clipped. */
const PAD = 8;
const RADIUS = 10;

interface Box { x: number; y: number; w: number; h: number }

const LIT = ['.rr-mark-btn', '.rr-mark-arrow', '.rr-overlay > .rr-caption'] as const;

function measure(): Box[] {
  const out: Box[] = [];
  for (const sel of LIT) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    out.push({ x: Math.round(r.left - PAD), y: Math.round(r.top - PAD), w: Math.round(r.width + 2 * PAD), h: Math.round(r.height + 2 * PAD) });
  }
  return out;
}

function same(a: Box[], b: Box[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y && p.w === b[i].w && p.h === b[i].h);
}

export function TeachSpotlight() {
  const [holes, setHoles] = useState<Box[]>([]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = measure();
      setHoles((was) => (same(was, next) ? was : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return createPortal(
    <svg className="rr-teach-spotlight" aria-hidden width="100%" height="100%">
      <defs>
        <mask id="rr-teach-spotlight-mask">
          <rect width="100%" height="100%" fill="#fff" />
          {holes.map((h, i) => (
            <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={RADIUS} fill="#000" />
          ))}
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.66)" mask="url(#rr-teach-spotlight-mask)" />
    </svg>,
    document.body,
  );
}
