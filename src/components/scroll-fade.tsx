'use client';

/**
 * "There is more below" — for a scroll box whose overflow nothing announces.
 *
 * The burrow's column scrolls, but on a landscape phone its last card stops
 * flush against the loop bar, and a card cut by the floor reads as the end of
 * the column rather than the middle of it. This marks the box `data-more="1"`
 * while it can still scroll down, and `.rr-burrow[data-more]` (globals.css)
 * fades its foot out — the sign every scrollable list makes.
 *
 * It WAS a button: the kit's down arrow on a chip, stuck to the foot, and a
 * tap scrolled. On a phone the chip sat over the burrow card's figures, and
 * a control was more than the job needed (Paul, 2026-09-21). The measuring
 * is the same; only what it drives changed.
 *
 * It measures its own PARENT, so the caller only drops it in as the scroll
 * box's last child — no ref to thread through the page. A data attribute
 * rather than a class: React owns the box's `className` and rewrites it on
 * every render, and would drop a class set from outside.
 */
import { useEffect, useRef } from 'react';

/** Slack for sub-pixel scroll positions: a box 1px short of its end is at it. */
const END_SLACK = 4;

export function ScrollFade() {
  const probe = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = probe.current?.parentElement;
    if (!box) return;
    const check = () => {
      const more = box.scrollTop + box.clientHeight < box.scrollHeight - END_SLACK;
      if (more) box.dataset.more = '1';
      else delete box.dataset.more;
    };
    // The box's own size changes with the viewport; its content changes when a
    // card grows (a quest completes, a note appears) or mounts. Both move the
    // answer without a scroll event.
    const sizes = new ResizeObserver(check);
    const observeChildren = () => {
      for (const child of Array.from(box.children)) sizes.observe(child);
    };
    sizes.observe(box);
    observeChildren();
    const mounts = new MutationObserver(() => {
      observeChildren();
      check();
    });
    mounts.observe(box, { childList: true });
    box.addEventListener('scroll', check, { passive: true });
    check();
    return () => {
      sizes.disconnect();
      mounts.disconnect();
      box.removeEventListener('scroll', check);
      delete box.dataset.more;
    };
  }, []);

  /* Zero-size and out of the pointer's way: it is a probe, not a thing. */
  return <span ref={probe} aria-hidden style={{ display: 'block', height: 0, pointerEvents: 'none' }} />;
}
