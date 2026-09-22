'use client';

/**
 * THE ENERGY PANEL: a tap on the ring, and the situation as a LEDGER.
 *
 * The one tank pays three things — an island, a raid, and the wait — and
 * the ring only says how full it is. This says what that buys right now.
 *
 * WHY A LEDGER AND NOT PROSE (22 September 2026). The first cut said all of
 * it in four sentences ("An island: yes. The crossing takes 5, then every
 * dig takes 1. A raid: yes. 45 to climb in, at most 75 in all; reach the
 * field and your steps come back.") — true, complete, and read like a
 * rulebook: the player had to parse each sentence to find the one word that
 * mattered, "yes". Now every door is a ROW with the same three cells — what
 * it is, what it costs, whether the tank covers it — so the answer is the
 * right-hand column, in one colour per verdict, and the costs are there for
 * whoever wants them. A row's verdict, when short, carries the wait: the
 * free route, stated beside the paid one below it.
 *
 * THE TRACK above the rows is the ring laid flat: the fill, and the two
 * floors as ticks — the crossing's and the raid's — so "needs 40" has a
 * place on the picture as well as a number in the row.
 *
 * Same panel as the kit's tool explanation in DEFEND (`.rr-toolkit-detail`):
 * the player already knows that shape as "what is this and what can I do
 * with it".
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ENERGY, FLAG, ISLAND_TIERS, RAID_RUN } from '@config/tuning';
import { useT } from '@/i18n/provider';
import { formatWait } from '@/i18n/format';
import { PxButton, PxPanel } from './px';
import './kit-row.css';

export const RAID_FLOOR = RAID_RUN.TOLL + RAID_RUN.WALK_FLOOR * RAID_RUN.STEP_COST;

/** What a right X pays across the ladder: the client is not told its tier. */
const X_GAIN_LO = Math.min(...ISLAND_TIERS.map((t) => t.xGain));
const X_GAIN_HI = Math.max(...ISLAND_TIERS.map((t) => t.xGain));

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

/** A row's verdict: the tank covers it, it is short (with the wait), or it is a plain reading. */
type Verdict =
  | { kind: 'ready'; text: string }
  | { kind: 'short'; text: string; wait: string | null }
  | { kind: 'muted'; text: string }
  | null;

interface Row {
  label: string;
  detail: string;
  verdict: Verdict;
}

export function EnergyPanel(p: EnergyPanelProps) {
  const t = useT();
  const c = t.energyPanel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  // The wait to a given floor, by regen alone — null when there already is.
  const waitTo = (floor: number): string | null =>
    p.energy >= floor || p.regenPerHour <= 0 ? null : formatWait(((floor - p.energy) / p.regenPerHour) * 3_600_000, t.units);
  const msToFull = p.regenPerHour > 0 ? Math.max(0, (p.max - p.energy) / p.regenPerHour) * 3_600_000 : 0;
  const canIsland = p.energy >= p.runCost;
  const canRaid = p.energy >= RAID_FLOOR;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / p.max) * 100))}%`;

  const ready: Verdict = { kind: 'ready', text: c.ready };
  const short = (floor: number): Verdict => ({ kind: 'short', text: c.needs(floor), wait: waitTo(floor) });

  const rows: Row[] = p.onIsland
    ? [
        { label: c.dig, detail: c.digCost(ENERGY.DIG_COST, ENERGY.BOMB_LOSS), verdict: null },
        { label: c.x, detail: c.xCost(X_GAIN_LO, X_GAIN_HI, FLAG.LOSS), verdict: null },
        {
          label: c.home,
          detail: c.homeCost(RAID_FLOOR),
          verdict: canRaid ? { kind: 'ready', text: c.raidReady } : { kind: 'muted', text: c.under(RAID_FLOOR) },
        },
      ]
    : [
        { label: c.island, detail: c.islandCost(p.crossingCost), verdict: canIsland ? ready : short(p.runCost) },
        { label: c.raid, detail: c.raidCost(RAID_RUN.TOLL, RAID_RUN.STAKE), verdict: canRaid ? ready : short(RAID_FLOOR) },
      ];
  // The burrow's level is a reason to upgrade, and the upgrade is at home:
  // on the island the row is a fact nobody can act on, and it is the row that
  // pushed the refill button off a 400px screen.
  if (!p.onIsland) rows.push({ label: c.levelLabel(p.level), detail: c.levelRate(p.regenPerHour, p.nextRegenPerHour), verdict: null });

  // A fixed ANCHOR around the panel: `PxPanel` positions itself inline, so
  // the placing has to sit on a box of its own (globals.css `.rr-energy-panel`).
  return createPortal(
    <div className="rr-energy-panel" role="dialog" aria-label={c.title}>
    <PxPanel color="#48301f" className="rr-toolkit-detail rr-energy-panel-body">
      <div className="rr-toolkit-summary">
        <div>
          <strong>{c.title}</strong>
          {/* The reading, the rate, and the time to full — one line, three
              facts, the ring's own numbers. */}
          <span className="rr-toolkit-stock">
            {c.reading(p.energy, p.max)}
            {p.regenPerHour > 0 && <> &middot; {c.rate(p.regenPerHour)}</>}
            {' '}&middot; {p.energy >= p.max ? c.full : c.fullIn(formatWait(msToFull, t.units))}
          </span>
        </div>
        <button type="button" className="rr-toolkit-disclosure" aria-label={t.chrome.close} onClick={p.onClose}>&times;</button>
      </div>

      {/* THE RING, LAID FLAT: the fill, and the two floors as ticks. The
          crossing's floor is the near one, the raid's the far one; both are
          named by the rows beneath, so the ticks carry no label of their own. */}
      <div className="rr-tank-track" aria-hidden>
        <i className="rr-tank-fill" style={{ width: pct(p.energy) }} />
        <b className="rr-tank-tick island" style={{ left: pct(p.runCost) }} />
        <b className="rr-tank-tick raid" style={{ left: pct(RAID_FLOOR) }} />
      </div>

      <dl className="rr-tank-ledger">
        {rows.map((r) => (
          <div className="rr-tank-row" key={r.label}>
            <dt className="rr-tank-label">{r.label}</dt>
            <dd className="rr-tank-detail">{r.detail}</dd>
            {r.verdict && (
              <dd className={`rr-tank-verdict ${r.verdict.kind}`}>
                <span>{r.verdict.text}</span>
                {r.verdict.kind === 'short' && r.verdict.wait && <small>{c.inWait(r.verdict.wait)}</small>}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {/* The one rule under the rows: reading the burrow pays back, like
          reading the island does — or, on the island, that the tank keeps
          what the rabbit brings home. A clause each row would have repeated. */}
      <p className="rr-tank-hint">{p.onIsland ? c.homeHint : c.raidRefund}</p>

      {p.energy < p.max && (
        <PxButton className="rr-toolkit-action" color="#6b8035" onClick={p.onRefill}>{t.recap.getEnergy}</PxButton>
      )}
    </PxPanel>
    </div>,
    document.body,
  );
}
