'use client';

/**
 * The wordmark at the top of the sign-in screen.
 *
 * ── Why the square emblem and not the banner ────────────────────────────────
 * The banner art (rr-logo-banner.webp) carries an EMPTY ribbon: a slot for a
 * phrase, which this component used to fill with a scrolling ticker. The
 * emblem used here instead already has its ribbon LETTERED — it reads "ROYALE"
 * in the artwork — so there is no slot to scroll through and a ticker drawn
 * over it would be a second wordmark on top of the first.
 *
 * The phrases did not die with the ribbon: they read under the logo now, one
 * at a time, swapped on a timer. Same list (config/taglines), same job — say
 * what the island is — in the one place left that is actually empty.
 *
 * ── Integer scale, always ────────────────────────────────────────────────────
 * This is pixel art. At a fractional scale some source pixels land on two
 * device pixels and their neighbours land on one, so the emblem's strokes go
 * visibly uneven — the bevel thickens on one letter and not the next, and no
 * amount of `image-rendering: pixelated` fixes it, because the ugliness is in
 * the geometry rather than the filtering. So it is never sized by percentage:
 * it is `96px * an integer`, chosen from the space available.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TAGLINES, nextTagline } from '@/config/taglines';

const LOGO_SRC = '/assets/ui/rr-logo-1x.webp';

/** The artwork's own pixels. */
const LOGO_W = 96;
const LOGO_H = 106;

/**
 * The ribbon's writable interior, MEASURED off the file (the largest run of
 * unbroken cream, per column and per row) rather than guessed:
 *
 *   x 17..79  — inside both scalloped end folds
 *   y 93..97  — the band that is clear across the full width, under "ROYALE"
 */
const RIBBON = {
  left: 17 / LOGO_W,
  width: (79 - 17) / LOGO_W,
  top: 93 / LOGO_H,
  height: (98 - 93) / LOGO_H,
};

/**
 * The type size in the ribbon, in source pixels, scaled by the same integer as
 * the artwork so it stays glued to the scroll at every step.
 *
 * 4, not 5: at 5px "The Cursed Crown" measured 66px against the ribbon's 62px
 * interior and the first and last letters were cut off by the scalloped end
 * folds. The letter-spacing is dropped to 0 for the same reason -- every
 * hundredth of an em is a pixel the phrase does not have.
 */
const RIBBON_CELL = 4;

/**
 * How long a phrase holds before the next one fades in. Long enough to read a
 * fifty-character line twice over without it feeling like a slideshow.
 */
const TAGLINE_MS = 6000;

/**
 * Three, not "as many as fit". At 4x the emblem is 384px tall and eats the
 * crawl's title card, which is the thing this screen exists to show; at 3x it
 * is 288px of crown and skull, which reads as the title of the screen.
 */
const MAX_SCALE = 3;

/**
 * The height the emblem is allowed to claim. It sits at the TOP of the screen
 * with the crawl rising underneath it, so its size is bounded by the viewport
 * rather than by the column's width alone — on a short landscape phone a 3x
 * emblem would be most of the frame.
 */
const MAX_VH = 0.28;

export function LogoBanner() {
  const hostRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  /** False through the server pass and the client's first paint; see the img. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  /**
   * EMPTY until mounted, not `TAGLINES[0]`.
   *
   * A random pick during render differs between the server pass and the client
   * one and blows up hydration — but so does seeding with a fixed phrase and
   * rolling in an effect: the server ships TAGLINES[0], the client's first
   * paint rolls something else, and React compares the two TEXTS and fails the
   * same way. The only markup both passes agree on is no phrase at all, so the
   * line starts empty and fills a frame later.
   */
  const [phrase, setPhrase] = useState<string | null>(null);

  useEffect(() => {
    setPhrase(nextTagline());
    const id = setInterval(() => setPhrase((p) => nextTagline(p ?? undefined)), TAGLINE_MS);
    return () => clearInterval(id);
  }, []);

  /** Largest whole multiple of the artwork that fits the space we are given. */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      // The host is width:100% and its width does not depend on the emblem's,
      // so observing it cannot feed back into the size we set from it.
      const byWidth = Math.floor(host.clientWidth / LOGO_W);
      const byHeight = Math.floor((window.innerHeight * MAX_VH) / LOGO_H);
      setScale(Math.max(1, Math.min(MAX_SCALE, byWidth, byHeight)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  /**
   * Publish the masthead's real height as `--rr-mast`.
   *
   * The crawl fades out over exactly this band (.rr-crawl-mast) so the chapter
   * never climbs through the wordmark, and the band therefore has to be the
   * masthead's ACTUAL height rather than a constant guessed against one
   * viewport: the emblem is 1x, 2x or 3x depending on the screen, and a fixed
   * 400px band would either clip the logo on a desktop or black out a third of
   * a phone. Measured after paint, on the same triggers as the scale.
   */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        '--rr-mast',
        `${Math.round(host.getBoundingClientRect().bottom)}px`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(host);
    // The tagline too, not just the host. Phrases differ in length, so one
    // wraps to two lines where the last took one -- and on a phone that is the
    // difference between the band covering the phrase and leaving it sitting
    // in the fade, reading grey. Observing only the parent missed it: the
    // child's reflow does not always resize the box on the same frame.
    const line = host.querySelector('.rr-tagline');
    if (line) ro.observe(line);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--rr-mast');
    };
  }, [scale, phrase]);

  return (
    <div className="rr-logo-banner" ref={hostRef}>
      {/* The emblem and the words written INTO it, in one positioned box. */}
      <div
        className="rr-logo-stack"
        style={mounted ? { width: LOGO_W * scale, height: LOGO_H * scale } : undefined}
      >
      <img
        className="rr-logo"
        src={LOGO_SRC}
        alt="Rabbit Royale"
        // The file's OWN pixels in the attributes, and the scaled size in the
        // style. The attributes are what the server renders, and the server
        // cannot know the viewport -- it always says scale 1, while the client
        // measures 2x or 3x before hydrating and React reports the difference
        // as an attribute mismatch. Keeping the attributes at the artwork's
        // intrinsic size makes both passes agree; the style, applied after
        // mount, is what actually sizes the emblem, and the two together still
        // reserve the right aspect ratio while the image loads.
        width={LOGO_W}
        height={LOGO_H}
        draggable={false}
      />
      {/* The subtitle, written INTO the emblem's own empty ribbon rather than
          set as a line underneath it.

          The artwork carries a blank scroll under "ROYALE" -- a slot, not a
          decoration -- and the phrase belongs in it: it buys back the line the
          subtitle used to occupy below the logo, which is what lets the crawl
          start higher.

          The box is MEASURED off the file, not eyeballed (the run of unbroken
          cream, per row and column): x 17..79 and y 93..97 of the 96x106
          artwork. Positioned in percentages of the stack so it stays glued to
          the ribbon at 1x, 2x and 3x alike.

          KEYED, even though it never changes: its sibling carries
          `key={phrase}`, and a keyed node among unkeyed ones makes React match
          the list by POSITION across the hydration boundary. */}
      <span className="rr-logo-ribbon" key="sub" style={{ fontSize: RIBBON_CELL * scale }}>
        The Cursed Crown
      </span>
      </div>
      {/* The phrase, keyed so React remounts the node on every swap and the
          fade-in plays again instead of only once. The node is rendered even
          while the phrase is null so its line is already reserved — appearing
          from nothing would shove the masthead down a line on first paint. */}
      <p className="rr-tagline" key={phrase ?? 'pending'}>
        {phrase ?? ' '}
      </p>
    </div>
  );
}
