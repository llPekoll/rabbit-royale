'use client';

/**
 * "Low energy" — said once, when there is still time to do something about it.
 *
 * Zero ends the run (`resolveMove`), and the only thing that pushes zero away
 * is a right red X. So the moment worth marking is not the end but the
 * approach: when the bar drops to one bomb's worth or less, a line names the
 * pump for a few seconds, and the X button starts to beat (`urge`, see
 * mark-bomb-button.tsx). A player who never places an X used to meet the end
 * of their run as a surprise; this makes it a countdown they can answer —
 * "twenty left: find a bomb I can prove, or lose the run".
 *
 * Nothing on the first island: its own captions own that strip.
 */
import { useEffect, useRef, useState } from 'react';
import { ENERGY } from '@config/tuning';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';

const LOW_MS = 5000;

export function EnergyCoach({ energy }: { energy: number }) {
  const t = useT();
  const prev = useRef(energy);
  const [low, setLow] = useState(false);
  // The clock lives in a ref, not in the effect's cleanup: energy changes on
  // the very next dig, and a cleanup would cancel the timer with nothing left
  // to start it again — the line would never leave.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const crossed = prev.current > ENERGY.BOMB_LOSS && energy <= ENERGY.BOMB_LOSS && energy > 0;
    prev.current = energy;
    if (!crossed) return;
    setLow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLow(false), LOW_MS);
  }, [energy]);

  if (!low) return null;
  return (
    <PxPanel color="rgba(13, 17, 23, 0.86)" className="rr-caption" style={{ background: 'none', borderRadius: 0 }}>
      <span role="status" aria-live="polite">{t.run.energyLow}</span>
    </PxPanel>
  );
}
