'use client';

/**
 * THE ENERGY PANEL: a tap on the ring, and the situation as a ledger.
 *
 * The one tank pays three things — an island, a raid, and the wait — and
 * the ring only says how full it is. This says what that buys RIGHT NOW,
 * one row per thing: what it takes, and a chip that says YES or when. A bar
 * on top carries the two lines the ring's tick stands for (the island's
 * floor and the raid's), so the reading "I am past the raid line" is the
 * same picture in both places.
 *
 * It replaced five paragraphs of numbers (2026-09-21): read as a wall on
 * the desktop, and on a 400px phone the button under them was off screen.
 * Same chrome as the kit's tool explanation in DEFEND (`.rr-toolkit-detail`):
 * the player already knows that shape as "what is this and what can I do".
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

/** Green when the tank is a run's worth, the bar's own amber under that,
 *  red when even a raid is out of reach — the dial's three colours. */
function tone(energy: number, max: number): string {
  const f = max > 0 ? energy / max : 0;
  return f > 0.5 ? '#6bbf3a' : f > 1 / 6 ? '#ffb238' : '#ff6a4a';
}

export function EnergyPanel(p: EnergyPanelProps) {
  const t = useT();
  const c = t.energyPanel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);
  const perHour = Math.max(1, p.regenPerHour);
  const msTo = (target: number) => Math.max(0, (target - p.energy) / perHour) * 3_600_000;
  const wait = (target: number) => formatWait(msTo(target), t.units);
  const canIsland = p.energy >= p.runCost;
  const canRaid = p.energy >= RAID_FLOOR;
  const pct = (n: number) => `${(100 * Math.max(0, Math.min(1, n / p.max))).toFixed(1)}%`;

  // The chip: YES in the game's green, or the wait in the panel's ink.
  const chip = (ok: boolean, label: string, when: string) => (
    <span className={`rr-energy-chip ${ok ? 'yes' : 'wait'}`}>{ok ? label : when}</span>
  );

  // A fixed ANCHOR around the panel: `PxPanel` positions itself inline, so
  // the placing has to sit on a box of its own (globals.css `.rr-energy-panel`).
  return createPortal(
    <div className="rr-energy-panel" role="dialog" aria-label={c.title}>
    <PxPanel color="#48301f" className="rr-toolkit-detail rr-energy-panel-body">
      <div className="rr-toolkit-summary">
        <div>
          <strong>{c.title}</strong>
          <span className="rr-toolkit-stock rr-energy-figure">
            <b>{p.energy}</b>/{p.max}
            <span className="rr-energy-rate">{c.perHour(p.regenPerHour)} &middot; {p.energy >= p.max ? c.full : c.fullIn(wait(p.max))}</span>
          </span>
        </div>
        <button type="button" className="rr-toolkit-disclosure" aria-label={t.chrome.close} onClick={p.onClose}>&times;</button>
      </div>

      {/* THE BAR, with the two lines on it. The island's floor is only a
          line at the burrow: on the island the crossing is paid. */}
      <div className="rr-energy-bar" role="img" aria-label={`${p.energy}/${p.max}`}>
        <i className="rr-energy-fill" style={{ width: pct(p.energy), background: tone(p.energy, p.max) }} />
        {!p.onIsland && (
          <b className="rr-energy-tick" style={{ left: pct(p.runCost) }}><span>{c.tickIsland} {p.runCost}</span></b>
        )}
        <b className="rr-energy-tick raid" style={{ left: pct(RAID_FLOOR) }}><span>{c.tickRaid} {RAID_FLOOR}</span></b>
      </div>

      <ul className="rr-energy-rows">
        {p.onIsland ? (
          <>
            <li>
              <div><strong>{c.dig}</strong><span>{c.digCost(ENERGY.BOMB_LOSS)}</span></div>
            </li>
            <li>
              <div><strong>{c.home}</strong><span>{c.homeCost(RAID_FLOOR)}</span></div>
              {chip(canRaid, c.homeYes, c.homeNo)}
            </li>
          </>
        ) : (
          <>
            <li>
              <div><strong>{c.island}</strong><span>{c.islandCost(p.crossingCost)}</span></div>
              {chip(canIsland, c.yes, c.inWait(wait(p.runCost)))}
            </li>
            <li>
              <div><strong>{c.raid}</strong><span>{c.raidCost(RAID_RUN.TOLL, RAID_RUN.STAKE)}</span></div>
              {chip(canRaid, c.yes, c.inWait(wait(RAID_FLOOR)))}
            </li>
          </>
        )}
      </ul>

      <p className="rr-toolkit-hint rr-energy-level">
        {p.nextRegenPerHour === null ? c.levelMax(p.level, p.regenPerHour) : c.level(p.level, p.regenPerHour, p.nextRegenPerHour)}
      </p>
      {/* THE REFILL, only when a door is shut. At 295/300 "get more energy"
          was a shop sign on every open; on the island the run is on. */}
      {!p.onIsland && p.energy < RAID_FLOOR && (
        <PxButton className="rr-toolkit-action" color="#6b8035" onClick={p.onRefill}>{t.recap.getEnergy}</PxButton>
      )}
    </PxPanel>
    </div>,
    document.body,
  );
}
