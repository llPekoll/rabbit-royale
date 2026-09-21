'use client';

/**
 * WHO JUST PUSHED YOU, said while they are still standing there.
 *
 * Rule 7 of `docs/bumping.md` — the victim always knows who did it — was true
 * of the wire and of nothing else: the server has always sent `pushedBy`, and
 * the client dropped it on the floor. So being shoved read as the board
 * glitching, and the one reply the rule exists to enable (turn round and shove
 * them back) needed a name the player was never given.
 *
 * ONLY A SURVIVED SHOVE. A fatal one is the recap's business — it names the
 * culprit in a card that also holds the way out (`run-recap`), and a toast
 * fading over the top of it would be the same sentence twice, the second time
 * in the corner.
 *
 * It fades on a clock rather than waiting to be dismissed: a shove is over by
 * the time it is read, and a notice that needs a tap is a notice standing
 * between the player and the tile they want.
 */
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';
import type { ShoveNote } from './use-game-socket';

/** How long the blame stays up. Long enough to read, short enough to shove back. */
const TOAST_MS = 2600;

export function ShoveToast({ shove }: { shove: ShoveNote | null }) {
  const t = useT();
  /**
   * The note's OWN timestamp is held, not a boolean.
   *
   * Two shoves by the same rabbit are two notices, and a flag would have made
   * the second one a no-op while the first was still fading — the player would
   * have been pushed twice and told once. `at` is bumped per shove, so a
   * re-shove restarts the clock on a fresh line.
   */
  const [at, setAt] = useState<number | null>(null);

  const key = shove && !shove.fatal ? shove.at : null;
  useEffect(() => {
    if (key === null) { setAt(null); return; }
    setAt(key);
    const timer = setTimeout(() => setAt((cur) => (cur === key ? null : cur)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [key]);

  if (at === null || !shove) return null;
  return (
    <PxPanel color="rgba(13, 17, 23, 0.86)" className="rr-caption rr-shove-toast">
      {/* The name can be missing when the shover left before the roster caught
          up. "Somebody pushed you" is still the truth, and still better than
          a board that appears to have moved the rabbit by itself. */}
      <span role="status" aria-live="polite">
        {shove.byName ? t.shove.by(shove.byName) : t.shove.anon}
      </span>
    </PxPanel>
  );
}
