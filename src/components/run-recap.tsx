'use client';

import type { RunRecap } from './use-game-socket';

/**
 * The end of a run, and the way out of it.
 *
 * A recap whose only button was "Again" was a dead end for the player who most
 * needed a way forward: the runs that end because the tank ran dry are exactly
 * the ones where digging again is not an option, and the screen still offered
 * it as the single thing to do. So the recap asks the burrow what is actually
 * possible and offers THAT.
 *
 * Out of energy the choice is real and it is two-sided — buy a refill and keep
 * digging now, or go home and let the garden fill the bar for free. Both are
 * shown, and going home is the plain one: the shop is never the only door out
 * of an empty tank, or the wait becomes a toll.
 */
export function Recap({
  recap, energy, onAgain, onShop, onHome,
}: {
  recap: RunRecap;
  /** Out-of-run energy left in the burrow. Null while the burrow is loading. */
  energy: number | null;
  onAgain: () => void;
  onShop: () => void;
  onHome: () => void;
}) {
  // Null means "not known yet", not "empty" — offering a refill to a player
  // who has energy would be a shop pitch dressed as help.
  const dry = energy !== null && energy <= 0;

  return (
    <div className="rr-card" style={{ textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 4px' }}>Run over</h2>
      <p style={{ color: 'var(--muted)', margin: '0 0 10px' }}>
        {/* The separator before the duration was missing, so a 3-bomb, 214s
            run printed "💣 3 214s" — which reads as one four-digit number. */}
        🥕 {recap.carrots} &middot; {recap.tilesDug} dug &middot; 💣 {recap.bombsHit}
        {' '}&middot; {formatRunTime(recap.durationMs)}
      </p>

      {dry ? (
        <>
          {/* Why there is no "Again" here, said plainly — a button that
              vanished with no explanation reads as a broken screen. */}
          <p className="rr-note" style={{ margin: '0 0 10px' }}>
            Out of energy.
          </p>
          <button onClick={onShop} style={{ width: '100%', marginBottom: 8 }}>
            Get more energy
          </button>
          <button className="rr-btn ghost" onClick={onHome} style={{ width: '100%' }}>
            Back to the burrow
          </button>
        </>
      ) : (
        <>
          <button onClick={onAgain} style={{ width: '100%', marginBottom: 8 }}>
            Again
          </button>
          {/* Leaving was always possible — the arrow below does it — but a
              player who has just finished is deciding between two things, and
              only one of them was written down. */}
          <button className="rr-btn ghost" onClick={onHome} style={{ width: '100%' }}>
            Back to the burrow
          </button>
        </>
      )}
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
