'use client';

/**
 * The burrow went up a level — said over the whole screen, once.
 *
 * An upgrade is the biggest thing a player buys in this game, and it landed
 * as a text toast: "Burrow deepened: 250". The house on the board swapped
 * texture in the same frame. Now a warm flash blooms from the middle, the
 * level stamps down the way the raid's victory does (same keyframe — one
 * grammar for "you did the thing"), and it lifts away a second later. The
 * board underneath plays its own part (`BurrowTerrain.celebrateLevel`).
 *
 * Keyed by the caller so two upgrades in a row are two stamps.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** How long the stamp stays, matched to the CSS (`rr-levelup-out` delay + run). */
const STAMP_MS = 2200;

export function LevelUpStamp({ level, onDone }: { level: number; onDone(): void }) {
  useEffect(() => {
    const t = setTimeout(onDone, STAMP_MS);
    return () => clearTimeout(t);
    // The caller keys this component on the upgrade, so a changing callback
    // identity must not restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="rr-levelup" role="status" aria-live="polite">
      <div className="rr-levelup-flash" />
      <div className="rr-levelup-stamp">
        BURROW LEVEL {level}
        <small>THE GARDEN GROWS FASTER</small>
      </div>
    </div>,
    document.body,
  );
}
