'use client';

/**
 * THE ENERGY PANEL: a tap on the ring, and the situation in plain words.
 *
 * The one tank pays three things — an island, a raid, and the wait — and
 * the ring only says how full it is. This says what that buys right now:
 * whether an island or a raid is affordable and what each takes, how long to
 * full, what the burrow's level does to that, and on the island what a dig,
 * a bomb and an X cost and where the raid line is. Same panel as the kit's
 * tool explanation in DEFEND (`.rr-toolkit-detail`): the player already
 * knows that shape as "what is this and what can I do with it".
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ENERGY, RAID_RUN } from '@config/tuning';
import { useT } from '@/i18n/provider';
import { formatWait } from '@/i18n/format';
import { PxButton, PxPanel } from './px';
import './kit-row.css';

export const RAID_FLOOR = RAID_RUN.TOLL + RAID_RUN.WALK_FLOOR * RAID_RUN.STEP_COST;

export interface EnergyPanelProps {
  energy: number;
  max: number;
  regenPerHour: number;
  /** The next burrow level's regen, or null at the top. */
  nextRegenPerHour: number | null;
  level: number;
  onIsland: boolean;
  runCost: number;
  crossingCost: number;
  onRefill: () => void;
  onClose: () => void;
}

export function EnergyPanel(p: EnergyPanelProps) {
  const t = useT();
  const c = t.energyPanel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);
  const msToFull = p.regenPerHour > 0 ? Math.max(0, (p.max - p.energy) / p.regenPerHour) * 3_600_000 : 0;
  const canIsland = p.energy >= p.runCost;
  const canRaid = p.energy >= RAID_FLOOR;

  // A fixed ANCHOR around the panel: `PxPanel` positions itself inline, so
  // the placing has to sit on a box of its own (globals.css `.rr-energy-panel`).
  return createPortal(
    <div className="rr-energy-panel" role="dialog" aria-label={c.title}>
    <PxPanel color="#48301f" className="rr-toolkit-detail rr-energy-panel-body">
      <div className="rr-toolkit-summary">
        <div>
          <strong>{c.title}</strong>
          <span className="rr-toolkit-stock">{c.status(p.energy, p.max, p.regenPerHour)}</span>
        </div>
        <button type="button" className="rr-toolkit-disclosure" aria-label={t.chrome.close} onClick={p.onClose}>&times;</button>
      </div>
      <div className="rr-toolkit-explanation">
        <p>{p.energy >= p.max ? c.full : c.fullIn(formatWait(msToFull, t.units))}</p>
        {p.onIsland ? (
          <>
            <p>{c.dig(ENERGY.DIG_COST, ENERGY.BOMB_LOSS)}</p>
            <p className="rr-toolkit-hint">{canRaid ? c.homeRaid(RAID_FLOOR) : c.homeNoRaid(RAID_FLOOR)}</p>
          </>
        ) : (
          <>
            <p>{canIsland ? c.islandYes(p.crossingCost) : c.islandNo(p.runCost)}</p>
            <p>{canRaid ? c.raidYes(RAID_RUN.TOLL, RAID_RUN.STAKE) : c.raidNo(RAID_FLOOR)}</p>
          </>
        )}
        <p className="rr-toolkit-hint">
          {p.nextRegenPerHour === null ? c.levelMax(p.level, p.regenPerHour) : c.level(p.level, p.regenPerHour, p.nextRegenPerHour)}
        </p>
        {p.energy < p.max && (
          <PxButton className="rr-toolkit-action" color="#6b8035" onClick={p.onRefill}>{t.recap.getEnergy}</PxButton>
        )}
      </div>
    </PxPanel>
    </div>,
    document.body,
  );
}
