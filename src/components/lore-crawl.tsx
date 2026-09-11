'use client';

/**
 * The opening crawl — the sign-in screen's reason to exist.
 *
 * Signed out there is nothing to do but connect a wallet, and a screen whose
 * only content is a button asking for one is a toll gate. The island already
 * has a story written for it (config/lore.ts), and the whole of chapter I is
 * readable by a player with zero carrots — it is the chapter deliberately
 * unlocked at 0 so first sight is a promise rather than a grey row. So the
 * doorstep reads it aloud, in the one format everybody on earth recognises as
 * "there is a story here": the receding crawl.
 *
 * WHY A CSS TRANSFORM AND NOT A VIDEO OR A CANVAS. The effect is a single
 * `rotateX` on a `perspective` parent plus a `translateY` keyframe — the GPU
 * composites it and the text stays real text underneath: selectable, readable
 * by a screen reader, and re-flowing on a 360px phone, which is the actual
 * target device here. A pre-rendered crawl would be a video that ships the
 * wrong aspect ratio to every phone but one.
 *
 * WHAT IT SAYS. Not marketing copy about the game — the island's own voice,
 * lifted verbatim from the codex, so the first words a player reads are the
 * same words the game will keep telling them. The crawl ends where chapter I
 * ends and then loops, because there is no "and then the movie starts" here:
 * the player leaves this screen by connecting, whenever they choose to.
 */
import { useEffect, useState } from 'react';
import { LORE } from '@/config/lore';

/**
 * How long one pass takes, in seconds.
 *
 * Slow enough to be read rather than skimmed, and paced off the real text: the
 * chapter is ~150 words, and the crawl is legible at roughly 2.5 words/second
 * before the top of the screen eats it. Deliberately NOT tunable from outside —
 * a crawl whose speed is a prop invites the value that makes it unreadable.
 *
 * PACED WITH THE DISTANCE. This number, `top` and `--crawl-run` (both in
 * globals.css) are ONE setting: the reading speed is the runway divided by the
 * duration, so changing either alone speeds the words up or slows them down.
 * The set that ships is 253vh / 100% / 64s — the harness's `Default` story.
 *
 * 253vh in 64s is ~3.95vh/s. It ran at ~5.97vh/s once and the words went past
 * faster than they could be read -- which for a screen whose entire job is to
 * be read is the only failure that matters.
 */
const CRAWL_SECONDS = 64;

/** The one chapter open to a player with no carrots. See config/lore.ts. */
const OPENING = LORE[0];

export interface LoreCrawlProps {
  /** Extra classes for positioning by the screen that mounts it. */
  className?: string;
}

export function LoreCrawl({ className }: LoreCrawlProps) {
  // Nothing is animated until the component is on screen for a frame, so the
  // crawl always starts from below the fold. Mounted mid-animation (a fast
  // refresh, a re-render on sign-out) it would otherwise pop in at whatever
  // offset the shared animation clock happens to be at.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * Publish the sign-in block's height as `--rr-gate`, which is the distance
   * the near fade has to cover (see .rr-crawl-horizon).
   *
   * It is measured rather than written down as a percentage because the block
   * has no fixed height: signed out it is a PLAY button, two lines of copy and
   * a second button; the copy rewraps at every width; and a failed sign-in
   * adds a warning line under it. Every percentage tried here covered it on
   * one screen and let the crawl through on another.
   *
   * The crawl reads a box it does not own, so it finds it by class rather than
   * by ref — `.rr-empty` is rendered by page.tsx as a sibling, and threading a
   * ref between two fixed layers for one number is worse than this lookup.
   * Absent (any state where there is no gate), the CSS fallback applies.
   */
  useEffect(() => {
    const root = document.documentElement;
    const gate = document.querySelector('.rr-empty');
    if (!gate) return;
    const publish = () => {
      // NOT `gate.height`: .rr-empty is `height: 100%` with its content pushed
      // to the bottom, so its own box is the whole column and measuring it
      // would black out the entire screen. What has to be covered is the
      // content — from the top of the first child down to the bottom edge.
      const first = gate.firstElementChild;
      if (!first) return;
      const top = first.getBoundingClientRect().top;
      root.style.setProperty('--rr-gate', `${Math.max(0, Math.round(window.innerHeight - top))}px`);
    };
    publish();
    // The observer catches the block growing (a warning line, a rewrap); the
    // resize listener catches the viewport changing under it, which moves the
    // block's top without changing its own size.
    const ro = new ResizeObserver(publish);
    ro.observe(gate);
    window.addEventListener('resize', publish);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--rr-gate');
    };
  }, []);

  return (
    <div className={`rr-crawl${className ? ` ${className}` : ''}`}>
      {/* The sky the crawl rises into, BEHIND the words. It darkens the burrow
          painting under the masthead so the wordmark has something to sit on,
          without taking a bite out of the chapter on its way past — which is
          what a single over-the-text gradient did. See .rr-crawl-sky. */}
      <div className="rr-crawl-sky" aria-hidden />
      {/* The receding plane. `aria-hidden` is NOT used: this is the only prose
          on the screen, and hiding the story from a screen reader to keep a
          visual effect tidy would leave a blind player with a bare button. The
          crawl reads in order, so it reads correctly. */}
      <div className="rr-crawl-stage">
        <div
          className="rr-crawl-text"
          style={{
            animationDuration: `${CRAWL_SECONDS}s`,
            animationPlayState: started ? 'running' : 'paused',
          }}
        >
          <p className="rr-crawl-ep">Chapter {OPENING.numeral}</p>
          <h2 className="rr-crawl-title">{OPENING.title}</h2>
          {/* Printed exactly as the codex writes it, `--` and all. The pixel
              face's atlas is ASCII 32-126 and has no em dash — swapping one in
              here draws a blank box, which is the bug test/pixel-font-glyphs
              exists to catch. Two hyphens are the dash in this typeface. */}
          {OPENING.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
      {/* The masthead's band, over the words: the wordmark sits at the top of
          this screen and the crawl climbs into it, so the lines have to have
          dissolved by the time they get there. See .rr-crawl-mast. */}
      <div className="rr-crawl-mast" aria-hidden />
      {/* The fade into the horizon. A gradient element rather than a mask on
          the text: masking the animated layer forces it off the compositor on
          every browser that still paints masks on the CPU, and this runs on a
          phone. */}
      <div className="rr-crawl-horizon" aria-hidden />
    </div>
  );
}
