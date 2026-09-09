'use client';

/**
 * The energy bar — the run's life, made visible.
 *
 * Energy was a number in the HUD, which is the one thing it must not be: it is
 * the only resource in the game, it falls with every dig, and a player has to
 * price "is this tile worth it?" at a glance without reading. So it gets a bar,
 * built on the same principles as fuse's gauge — a recessed tube, a fill that
 * GLOWS in proportion to itself, and a marked threshold.
 *
 * The threshold here is the low-energy line: below it a bomb ends the run
 * outright, which is the fact the player needs before they choose a tile, not
 * after.
 */
import { ENERGY } from '@config/tuning';

export interface EnergyBarProps {
  energy: number;
  /** Drawn as a notch, so the danger zone is visible before it is entered. */
  bombCost?: number;
}

/**
 * The bar's full-scale value. NOT the run's starting energy: carrots push you
 * above it, and a bar that pinned at the start value would stop telling you
 * anything the moment you were doing well.
 */
const SCALE = ENERGY.MAX;

export function EnergyBar({ energy, bombCost = ENERGY.BOMB_LOSS }: EnergyBarProps) {
  const pct = Math.max(0, Math.min(1, energy / SCALE));
  // Below one bomb's worth, the next blast ends the run. That is the moment the
  // bar exists to announce.
  const critical = energy <= bombCost;
  const color = critical ? 'var(--danger)' : energy <= bombCost * 2 ? '#ffb03a' : 'var(--carrot)';

  return (
    <div className="rr-energy" title={`${energy} energy`}>
      <span className="rr-energy-icon" aria-hidden>⚡</span>
      <div
        className="rr-energy-tube"
        role="meter"
        aria-valuenow={energy}
        aria-valuemin={0}
        aria-valuemax={SCALE}
        aria-label="Energy"
      >
        <i
          className={`rr-energy-fill${critical ? ' critical' : ''}`}
          style={{
            width: `${pct * 100}%`,
            background: color,
            // The glow scales with the fill, so a full bar reads as loud and a
            // nearly-empty one as faint — the state is legible peripherally.
            boxShadow: `0 0 ${4 + 8 * pct}px ${color}`,
          }}
        />
        {/* The death line: one bomb's worth. Painted over the fill so a full
            bar cannot hide the thing the player most needs to see. */}
        <span className="rr-energy-mark" style={{ left: `${(bombCost / SCALE) * 100}%` }} />
      </div>
      <span className="rr-energy-value">{energy}</span>
    </div>
  );
}
