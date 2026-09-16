'use client';

/**
 * A plain sheet in the page colour, shown while the game loads.
 *
 * Pixi has to fetch and parse a lot before the first frame — sprite sheets,
 * atlases, the burrow painting — and this holds the frame meanwhile.
 *
 * NO PICTURE. It used to show a painting of the island, and that painting
 * flashed on every reload and every sign-in between two screens that were not
 * the island — a stop the player never asked for. The sheet is the same dark
 * the canvas and the curtain use, so it reads as part of the cut, not a place.
 *
 * It covers rather than replaces: the screen underneath mounts and loads behind
 * it, and the overlay fades out once it is ready. Unmounting a loader to reveal
 * an empty page and THEN starting the load is the flicker this avoids.
 */
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/provider';

export interface LoadingScreenProps {
  /** Lift the veil. The screen underneath is already mounted. */
  ready: boolean;
  /** Shown centred on the sheet. Keep it short. */
  label?: string;
  /**
   * Cover without the label.
   *
   * For waits the player did not start — the page's session check, and the
   * boot of a session it restored. A "Waking…" line flashed for a fraction of
   * a second on a reload is noise. If `bare` drops while still not ready the
   * label fades in; if the sheet lifts straight from bare, it never shows.
   */
  bare?: boolean;
}

export function LoadingScreen({ ready, label, bare = false }: LoadingScreenProps) {
  const t = useT();
  // Defaulted here, not in the parameter list: a default cannot call a hook.
  const said = label ?? t.chrome.loading;
  // Kept mounted through the fade so the transition is visible; only then
  // removed, so it costs nothing while nothing is loading. It comes back if
  // `ready` drops again: the page lifts it off the session check and then needs
  // it once more over the game's boot, and a veil that could only lift once
  // left that boot on a bare black canvas.
  const [gone, setGone] = useState(false);
  // Whether the label has been let in during this showing. Sticky until the
  // veil is gone, so the label fading out WITH the sheet (a real load ending)
  // is told apart from a bare sheet lifting, where it must not appear mid-fade.
  const [labelled, setLabelled] = useState(false);

  useEffect(() => {
    if (!bare && !ready) setLabelled(true);
  }, [bare, ready]);
  useEffect(() => {
    if (gone) setLabelled(false);
  }, [gone]);

  useEffect(() => {
    if (!ready) {
      setGone(false);
      return;
    }
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [ready]);

  if (gone) return null;

  return (
    <div className={`rr-loading${ready ? ' done' : ''}${labelled ? '' : ' bare'}`} aria-hidden={ready}>
      <p>
        {said}
        {/* Three dots that fill in, rather than a spinner: a spinner promises a
            duration this cannot know, and the pixel font has no spinner glyph. */}
        <span className="rr-loading-dots" />
      </p>
    </div>
  );
}

/** Must match the CSS transition, or the overlay is pulled mid-fade. */
const FADE_MS = 420;
