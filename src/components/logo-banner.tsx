'use client';

/**
 * The wordmark, with the ribbon actually saying something.
 *
 * The banner art carries an EMPTY ribbon on purpose — it is a slot, not a
 * decoration, and the phrase that runs through it is drawn over the artwork
 * here. (An earlier cut of the file had a second, smaller logo baked into that
 * ribbon, which read as the wordmark drawn twice.)
 *
 * ── Integer scale, always ────────────────────────────────────────────────────
 * This is pixel art. At a fractional scale some source pixels land on two
 * device pixels and their neighbours land on one, so the wordmark's strokes go
 * visibly uneven — the bevel thickens on one letter and not the next, and no
 * amount of `image-rendering: pixelated` fixes it, because the ugliness is in
 * the geometry rather than the filtering. So the banner is never sized by
 * percentage: it is `365px * an integer`, chosen from the space available.
 *
 * The ribbon text is scaled by that SAME integer, off the arcade-kit's 8px body
 * cell, which is why it stays glued to the artwork at every step instead of
 * drifting out of the ribbon as the logo grows.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TAGLINES, nextTagline } from '@/config/taglines';

const BANNER_SRC = '/assets/ui/rr-logo-banner.webp';

/** The artwork's own pixels. Every box below is a fraction of these. */
const BANNER_W = 365;
const BANNER_H = 78;

/**
 * The ribbon's writable interior, MEASURED off the file rather than eyeballed
 * (the largest run of unbroken cream, per column and per row):
 *
 *   x 17..347  — inside both scalloped end folds
 *   y 67..76   — the band that is clear across the FULL width. The ribbon is
 *                taller than this at its ends, but the skull's jaw hangs into
 *                its top at the centre, and text has to clear the jaw.
 */
const RIBBON = {
  left: 17 / BANNER_W,
  width: 331 / BANNER_W,
  top: 67 / BANNER_H,
  height: 10 / BANNER_H,
};

/** The arcade-kit body face is an 8px cell — one ribbon line, exactly. */
const FONT_CELL = 8;

/** Source pixels per second. Matches the Pixi ticker so both read the same. */
const SPEED = 45;

/**
 * Two, not "as many as fit". Three would be 1095px of wordmark on a desktop —
 * the logo would stop being the title of the screen and start being the screen.
 */
const MAX_SCALE = 2;

export function LogoBanner() {
  const hostRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const [scale, setScale] = useState(1);
  // Deterministic first render: a random pick here would differ between the
  // server pass and the client one and blow up hydration. The roll happens in
  // an effect, after mount.
  const [phrase, setPhrase] = useState<string>(TAGLINES[0]);
  const [travel, setTravel] = useState<{ from: number; to: number; secs: number } | null>(null);

  useEffect(() => setPhrase(nextTagline()), []);

  /** Largest whole multiple of the artwork that fits the space we are given. */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      // The host is width:100% and its width does not depend on the banner's,
      // so observing it cannot feed back into the size we set from it.
      const avail = host.clientWidth;
      const fit = Math.floor(avail / BANNER_W);
      setScale(Math.max(1, Math.min(MAX_SCALE, fit)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  /**
   * Re-measure the run whenever the phrase or the scale changes.
   *
   * The distance is measured rather than expressed in percentages because the
   * two ends of the run belong to different boxes: the text enters at the
   * mask's right edge and leaves once its OWN width has passed the left one.
   * Driving the duration off that same distance is what keeps the crawl at one
   * speed no matter how long the phrase is.
   */
  const remeasure = useCallback(() => {
    const mask = maskRef.current;
    const text = textRef.current;
    if (!mask || !text) return;
    const maskW = mask.clientWidth;
    const textW = text.scrollWidth;
    if (!maskW || !textW) return;
    setTravel({ from: maskW, to: -textW, secs: (maskW + textW) / (SPEED * scale) });
  }, [scale]);

  useLayoutEffect(() => {
    remeasure();
    // The pixel face arrives asynchronously (see components/pixel-font.tsx) and
    // is far wider than the monospace fallback, so a run measured before it
    // lands would clip the tail off every phrase.
    let alive = true;
    void document.fonts?.ready.then(() => alive && remeasure());
    return () => {
      alive = false;
    };
  }, [phrase, scale, remeasure]);

  const width = BANNER_W * scale;

  return (
    <div className="rr-logo-banner" ref={hostRef}>
      <div className="rr-logo-stack" style={{ width }}>
        <img
          className="rr-logo"
          src={BANNER_SRC}
          alt="Rabbit Royale"
          // The file's own pixels. `width`/`height` here only reserve the box
          // while the image loads — CSS is what sizes it — but a wrong pair
          // shifts the column under the reader's eyes on arrival.
          width={BANNER_W}
          height={BANNER_H}
          draggable={false}
        />
        <div
          className="rr-ribbon"
          ref={maskRef}
          style={{
            left: `${RIBBON.left * 100}%`,
            width: `${RIBBON.width * 100}%`,
            top: `${RIBBON.top * 100}%`,
            height: `${RIBBON.height * 100}%`,
            fontSize: FONT_CELL * scale,
          }}
        >
          <span
            className="rr-ribbon-text"
            ref={textRef}
            // Rolling a fresh phrase on each pass means the ribbon is never
            // caught repeating itself, and the swap happens off-screen.
            onAnimationIteration={() => setPhrase((p) => nextTagline(p))}
            style={
              travel
                ? {
                    ['--rr-ticker-from' as string]: `${travel.from}px`,
                    ['--rr-ticker-to' as string]: `${travel.to}px`,
                    animationDuration: `${travel.secs}s`,
                  }
                : // Parked off the right edge until measured, so the first
                  // frame never flashes the phrase across the ribbon.
                  { transform: 'translateX(100%)', animation: 'none' }
            }
          >
            {phrase}
          </span>
        </div>
      </div>
    </div>
  );
}
