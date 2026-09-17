'use client';

/**
 * What to do about a bar that is running out — said once, when it matters.
 *
 * Two moments, both pointing at the same exit, the red X:
 *
 *   LOW   the bar has just dropped to one bomb's worth or less. A line for a
 *         few seconds. A player who never places an X (a third of a Meadow
 *         island is their whole run) used to meet the end of it as a surprise;
 *         this is the warning, and it names the pump.
 *   DRY   the bar is at zero and the rabbit is still alive — digging emptied
 *         it, no bomb did (see `resolveMove`). The line stays for as long as
 *         that is true, because the board has changed rules: no more digging,
 *         a right X revives, a wrong one ends the run, home banks the haul.
 *
 * Nothing on the first island: its own captions own that strip.
 */
import { useEffect, useRef, useState } from 'react';
import { ENERGY } from '@config/tuning';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';

const LOW_MS = 5000;

export function EnergyCoach({ energy, alive }: { energy: number; alive: boolean }) {
  const t = useT();
  const prev = useRef(energy);
  const [low, setLow] = useState(false);
  useEffect(() => {
    const crossed = prev.current > ENERGY.BOMB_LOSS && energy <= ENERGY.BOMB_LOSS && energy > 0;
    prev.current = energy;
    if (!crossed) return;
    setLow(true);
    const timer = setTimeout(() => setLow(false), LOW_MS);
    return () => clearTimeout(timer);
  }, [energy]);

  const dry = alive && energy <= 0;
  const text = dry ? t.run.energyDry : low ? t.run.energyLow : null;
  if (!text) return null;
  return (
    <PxPanel
      color={dry ? 'rgba(74, 21, 18, 0.92)' : 'rgba(13, 17, 23, 0.86)'}
      className="rr-caption"
      style={{ background: 'none', borderRadius: 0 }}
    >
      <span role="status" aria-live="polite">{text}</span>
    </PxPanel>
  );
}
