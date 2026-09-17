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
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ENERGY } from '@config/tuning';
import { useT } from '@/i18n/provider';

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

/**
 * The bolt off a battery, as pixels: eight rows on a 7-wide grid, drawn with
 * crisp edges at a whole multiple. Not the emoji it replaces — that one is
 * orange on one phone, purple-shadowed on another, and never the bar's yellow.
 */
/** The bolt's lit pixels, row by row: [first column, last column] on an 8-wide grid. */
const BOLT_ROWS: ReadonlyArray<readonly [number, number]> = [
  [4, 6], [3, 5], [2, 4], [1, 6], [3, 6], [3, 5], [2, 4], [1, 3], [1, 2], [1, 1],
];

function Bolt() {
  return (
    <svg className="rr-energy-icon" viewBox="0 0 8 10" width="16" height="20" shapeRendering="crispEdges" aria-hidden>
      {BOLT_ROWS.map(([from, to], y) => (
        <rect key={y} x={from} y={y} width={to - from + 1} height={1} fill="#ffd60a" />
      ))}
    </svg>
  );
}

export function EnergyBar({ energy, bombCost = ENERGY.BOMB_LOSS }: EnergyBarProps) {
  const t = useT();
  const pct = Math.max(0, Math.min(1, energy / SCALE));

  // LOSING ENERGY IS AN EVENT — the screen's edges flush red for half a
  // second, as they did when a heart broke. Only a DROP counts: an X that
  // paid, a golden carrot or a respawn is not hurt. Keyed so two losses in a
  // row are two flushes.
  const prev = useRef(energy);
  const [hurt, setHurt] = useState(0);
  useEffect(() => {
    if (energy < prev.current) setHurt((k) => k + 1);
    prev.current = energy;
  }, [energy]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Below one bomb's worth, the next blast ends the run. That is the moment the
  // bar exists to announce.
  const critical = energy <= bombCost;
  const tone = critical ? 'danger' : energy <= bombCost * 2 ? 'warn' : 'energy';

  return (
    <div className="rr-energy" title={t.run.energy(energy, SCALE)}>
      <Bolt />
      <div
        className="rr-energy-tube"
        role="meter"
        aria-valuenow={energy}
        aria-valuemin={0}
        aria-valuemax={SCALE}
        aria-label={t.run.energy(energy, SCALE)}
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
      {/* Portalled: the HUD strip is frosted glass, and a backdrop-filter
          makes it the containing block for anything `fixed` inside it. */}
      {mounted && hurt > 0 && createPortal(<div key={hurt} className="rr-hurt" aria-hidden />, document.body)}
    </div>
  );
}
