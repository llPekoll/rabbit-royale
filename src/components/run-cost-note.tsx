'use client';

/**
 * What the run just cost — said once, on arrival.
 *
 * Crossing to an island takes ENERGY.RUN_COST out of the burrow's bar, and
 * it used to happen in silence: the player pressed GO, the island appeared,
 * and the first they heard of the charge was a bar at 35/60 when they came
 * home. Reported from production as "the energy spent is not clearly shown
 * while exploring". A first-timer never saw the bar before crossing at all.
 *
 * NOT a gauge on the strip. The raid HUD already learned that lesson: two
 * bolt-and-number bars on one screen read as one bar that had been emptied.
 * The island's own life is the hearts; the burrow's bar is a different
 * resource, so it is stated as an EVENT — what was taken, what is left, and
 * where — and then it gets out of the way. It comes back in the recap, where
 * the player is deciding whether to go again.
 *
 * Driven by the snapshot's `bank`, which the server sends only when a run
 * was paid for: a reconnect is the same run and says nothing.
 */
import { useEffect, useState } from 'react';
import type { RunBank } from './use-game-socket';

/** How long the line stays up. Long enough to read twice, short enough to
 *  be gone before the first number is worth reading. */
const NOTE_MS = 6000;

export function RunCostNote({ bank, seed }: { bank: RunBank | null; seed: string | null }) {
  const [shown, setShown] = useState<RunBank | null>(null);

  // Keyed on the SEED as well as the figures: two runs in a row that happen
  // to leave the same bar are still two charges, and each is said.
  useEffect(() => {
    if (!bank || !seed) { setShown(null); return; }
    setShown(bank);
    const t = setTimeout(() => setShown(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [bank, seed]);

  if (!shown) return null;
  return (
    <p className="rr-caption rr-caption-cost" role="status" aria-live="polite">
      ⚡ -{shown.cost} for this run &middot; {shown.energy}/{shown.max} left at the burrow
    </p>
  );
}
