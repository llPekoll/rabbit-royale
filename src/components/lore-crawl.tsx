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
 *
 * 253vh in 64s is ~3.95vh/s. The crawl ran at ~5.97vh/s and the words went past
 * faster than they could be read -- which for a screen whose entire job is to
 * be read is the only failure that matters. A third slower is the fix; the
 * earlier note that 58s left sixteen seconds of empty sky was measured against
 * the SHORTER 215vh runway and no longer applies to this one.
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

  return (
    <div className={`rr-crawl${className ? ` ${className}` : ''}`}>
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
      {/* The fade into the horizon. A gradient element rather than a mask on
          the text: masking the animated layer forces it off the compositor on
          every browser that still paints masks on the CPU, and this runs on a
          phone. */}
      <div className="rr-crawl-horizon" aria-hidden />
    </div>
  );
}
