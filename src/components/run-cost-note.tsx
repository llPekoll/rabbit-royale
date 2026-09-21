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
 * NOT a gauge on the strip: the dial on the pill is the tank, and it is the
 * same tank the run now drains (one reservoir since 2026-09-21). So this is
 * an EVENT — what the crossing took, what is left ON YOU — and then it gets
 * out of the way. "Left at the burrow" was the three-tank wording and read
 * as a second reserve somewhere else.
 *
 * Driven by the snapshot's `bank`, which the server sends only when a run
 * was paid for: a reconnect is the same run and says nothing.
 */
import { useEffect, useState } from 'react';
import type { RunBank } from './use-game-socket';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';

/** How long the line stays up. Long enough to read twice, short enough to
 *  be gone before the first number is worth reading. */
const NOTE_MS = 6000;

export function RunCostNote({ bank, seed }: { bank: RunBank | null; seed: string | null }) {
  const t = useT();
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
    // Same painted plank as the other island captions — see first-run-caption.
    <PxPanel color="rgba(13, 17, 23, 0.86)" className="rr-caption rr-caption-cost">
      <span role="status" aria-live="polite">
        {t.run.crossed(shown.cost, shown.energy)}
      </span>
    </PxPanel>
  );
}
