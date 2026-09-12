'use client';

/**
 * The energy bar — the run's life, made visible.
 *
 * Energy was a number in the HUD, which is the one thing it must not be: it is
 * the only resource in the game, it falls with every dig, and a player has to
 * price "is this tile worth it?" at a glance without reading. So it gets a bar,
 * drawn in Tiny Swords' wooden gauge sprites — the same 9-slice pixel art as
 * the rest of the game's UI (see tools/gen_energy_bar.py).
 *
 * Colour is not a style here, it is the reading: gold while the run is healthy,
 * amber when a bomb would hurt, red when the next one ends it. So the component
 * picks a SPRITE SET, never a hex value — the palette lives in the art.
 *
 * The threshold is the low-energy line: below it a bomb ends the run outright,
 * which is the fact the player needs before they choose a tile, not after.
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

/** The fill sprites, by what the bar is saying. */
const FILL = '/assets/gauge/bar-fill';

export function EnergyBar({ energy, bombCost = ENERGY.BOMB_LOSS }: EnergyBarProps) {
  const pct = Math.max(0, Math.min(1, energy / SCALE));
  // Below one bomb's worth, the next blast ends the run. That is the moment the
  // bar exists to announce.
  const critical = energy <= bombCost;
  const tone = critical ? 'danger' : energy <= bombCost * 2 ? 'warn' : 'carrot';

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
        {/* Same 9-slice as the shell: the crest pinned to the leading edge, the
            1px middle repeated back to the start. The fill is inset to the
            channel by CSS, so its width is a share of the channel — not of the
            tube, which would run the crest under the shell's end cap. */}
        <i
          className={`rr-energy-fill${critical ? ' critical' : ''}`}
          hidden={pct === 0}
          style={{
            // Snapped to whole SCREEN pixels: a fill that ends mid-pixel makes
            // the crest render as two half-lit columns, which is the one thing
            // pixel art must never do. The step used to be one source pixel,
            // but the wooden sprite scales by a fraction now — rounding to
            // 0.55px would snap to nothing.
            width: `round(down, (100% - 2 * var(--rr-gauge-wall)) * ${pct}, 1px)`,
            background: `
              url('${FILL}-${tone}-cap.webp') right center / auto 100% no-repeat,
              url('${FILL}-${tone}-mid.webp') left center / auto 100% repeat-x`,
          }}
        />
        {/* The death line: one bomb's worth. Painted over the fill so a full
            bar cannot hide the thing the player most needs to see. Positioned
            in the channel, so it lines up with the fill it is measuring. */}
        <span
          className="rr-energy-mark"
          style={{
            left: `calc(var(--rr-gauge-wall) + round(down, (100% - 2 * var(--rr-gauge-wall)) * ${bombCost / SCALE}, 1px))`,
          }}
        />
      </div>
      <span className="rr-energy-value">{energy}</span>
    </div>
  );
}
