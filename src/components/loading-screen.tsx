'use client';

/**
 * The island, shown while the game loads.
 *
 * Pixi has to fetch and parse a lot before the first frame — sprite sheets,
 * atlases, the burrow painting — and the alternative is a black rectangle that
 * looks like a broken page. This is a picture of where the player is going.
 *
 * It covers rather than replaces: the screen underneath mounts and loads behind
 * it, and the overlay fades out once it is ready. Unmounting a loader to reveal
 * an empty page and THEN starting the load is the flicker this avoids.
 */
import { useEffect, useState } from 'react';

const ART = '/assets/island/loading_screen.png';

export interface LoadingScreenProps {
  /** Lift the veil. The screen underneath is already mounted. */
  ready: boolean;
  /** Shown under the art. Keep it short. */
  label?: string;
}

export function LoadingScreen({ ready, label = 'Loading' }: LoadingScreenProps) {
  // Kept mounted through the fade so the transition is visible; only then
  // removed, so it costs nothing for the rest of the session.
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [ready]);

  if (gone) return null;

  return (
    <div className={`rr-loading${ready ? ' done' : ''}`} aria-hidden={ready}>
      <img src={ART} alt="" draggable={false} />
      <p>
        {label}
        {/* Three dots that fill in, rather than a spinner: a spinner promises a
            duration this cannot know, and the pixel font has no spinner glyph. */}
        <span className="rr-loading-dots" />
      </p>
    </div>
  );
}

/** Must match the CSS transition, or the overlay is pulled mid-fade. */
const FADE_MS = 420;
