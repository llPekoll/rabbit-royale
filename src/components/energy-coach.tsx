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
import { ENERGY, RAID_RUN } from '@config/tuning';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';

const LOW_MS = 5000;

/**
 * THE RAID LINE. What a raid needs in the tank to be let in (the toll plus
 * the longest crossing): the one tank brings home what a run leaves, so
 * crossing this line on the way down is the moment "dig on or go raid" is a
 * real choice — said once, like the one-bomb line below it.
 */
const RAID_FLOOR = RAID_RUN.TOLL + RAID_RUN.WALK_FLOOR * RAID_RUN.STEP_COST;

export function EnergyCoach({ energy }: { energy: number }) {
  const t = useT();
  const prev = useRef(energy);
  const [low, setLow] = useState<'bomb' | 'raid' | null>(null);
  // The clock lives in a ref, not in the effect's cleanup: energy changes on
  // the very next dig, and a cleanup would cancel the timer with nothing left
  // to start it again — the line would never leave.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const was = prev.current;
    prev.current = energy;
    const crossed = was > ENERGY.BOMB_LOSS && energy <= ENERGY.BOMB_LOSS && energy > 0 ? 'bomb'
      : was > RAID_FLOOR && energy <= RAID_FLOOR && energy > ENERGY.BOMB_LOSS ? 'raid'
      : null;
    if (!crossed) return;
    setLow(crossed);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLow(null), LOW_MS);
  }, [energy]);

  if (!low) return null;
  return (
    <PxPanel color="rgba(13, 17, 23, 0.86)" className="rr-caption">
      <span role="status" aria-live="polite">{low === 'raid' ? t.run.energyRaidLeft : t.run.energyLow}</span>
    </PxPanel>
  );
}
