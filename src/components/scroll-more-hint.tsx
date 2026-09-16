'use client';

/**
 * "There is more below" — for a scroll box whose overflow nothing announces.
 *
 * The burrow's column scrolls, but on a landscape phone its last card stops
 * flush against the loop bar, and a card cut by the floor reads as the end of
 * the column rather than the middle of it. This is the kit's down arrow on a
 * small chip at the box's visible foot, there only while the box can still
 * scroll down, and a tap scrolls it.
 *
 * It measures its own PARENT, so the caller only drops it in as the scroll
 * box's last child — no ref to thread through the page. Positioned by
 * `.rr-col-more` (globals.css): sticky, zero-height, so it adds nothing to the
 * height it is measuring.
 */
import { useEffect, useRef, useState } from 'react';
import { ARROW_URLS } from '@domin8/arcade-kit';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';
import { FACE_TOP } from './hub-card';

/** Slack for sub-pixel scroll positions: a box 1px short of its end is at it. */
const END_SLACK = 4;

export function ScrollMoreHint() {
  const t = useT();
  const shelf = useRef<HTMLSpanElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const box = shelf.current?.parentElement;
    if (!box) return;
    const check = () =>
      setMore(box.scrollTop + box.clientHeight < box.scrollHeight - END_SLACK);
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
    };
  }, []);

  return (
    <span ref={shelf} className="rr-col-more">
      {more && (
        <button
          type="button"
          className="rr-col-more-btn"
          aria-label={t.chrome.moreBelow}
          title={t.chrome.moreBelow}
          onClick={() => {
            const box = shelf.current?.parentElement;
            box?.scrollBy({ top: box.clientHeight * 0.6, behavior: 'smooth' });
          }}
        >
          <PxPanel color={FACE_TOP} className="rr-col-more-chip">
            <img src={ARROW_URLS.down} alt="" draggable={false} />
          </PxPanel>
        </button>
      )}
    </span>
  );
}
