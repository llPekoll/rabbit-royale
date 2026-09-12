'use client';

import type { RunRecap } from './use-game-socket';

/**
 * The end of a run, and the way out of it.
 *
 * EVERY run ends the same way: `resolveMove` kills the rabbit when, and only
 * when, its energy hits zero (see the `energy <= 0` check in `run.ts`). A bomb
 * does not end a run — it takes 8 energy and can be survived. So "Run over"
 * and "the tank is empty" are THE SAME EVENT, and the refill is always the
 * offer that matches the screen.
 *
 * This used to be decided from the BURROW's energy instead, which is a
 * different resource entirely — a right of entry, regenerating 12/hour to a
 * ceiling of 60, while a run's own bar starts at 30 and is spent digging. The
 * two never agreed, and the burrow's figure is not even debited by a run, so
 * the empty-tank branch this file was written for could not fire: the recap
 * offered "Again" to a player who had just run dry, which is the one thing
 * they cannot do.
 *
 * The choice is real and two-sided — buy a refill and keep digging now, or go
 * home and let the garden fill the bar for free. Both are shown, and going
 * home is the plain one: the shop is never the only door out of an empty tank,
 * or the wait becomes a toll.
 */
export function Recap({
  recap, onShop, onHome,
}: {
  recap: RunRecap;
  onShop: () => void;
  onHome: () => void;
}) {
  return (
    <div className="rr-card" style={{ textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 4px' }}>Run over</h2>
      <p style={{ color: 'var(--muted)', margin: '0 0 10px' }}>
        {/* The separator before the duration was missing, so a 3-bomb, 214s
            run printed "💣 3 214s" — which reads as one four-digit number. */}
        🥕 {recap.carrots} &middot; {recap.tilesDug} dug &middot; 💣 {recap.bombsHit}
        {' '}&middot; {formatRunTime(recap.durationMs)}
      </p>

      {/* Why there is no "Again", said plainly — a button that vanished with
          no explanation reads as a broken screen. */}
      <p className="rr-note" style={{ margin: '0 0 10px' }}>
        Out of energy.
      </p>
      <button onClick={onShop} style={{ width: '100%', marginBottom: 8 }}>
        Get more energy
      </button>
      {/* Leaving was always possible — the arrow below does it — but a player
          who has just finished is deciding between two things, and only one of
          them was written down. */}
      <button className="rr-btn ghost" onClick={onHome} style={{ width: '100%' }}>
        Back to the burrow
      </button>
    </div>
  );
}


/**
 * How long the run lasted, in minutes and seconds.
 *
 * Raw seconds are fine for a stopwatch and wrong for a result: "214s" makes
 * the reader do the division, and session length is the thing this game asks
 * players to get better at — so it is stated in the unit they think in.
 * Under a minute stays in seconds, where "47s" is already the natural form.
 */
function formatRunTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}m ${secs}s`;
}
