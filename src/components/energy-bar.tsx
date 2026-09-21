'use client';

/**
 * The run's energy — the bolt, a yellow bar, the number.
 *
 * It stands ON ITS OWN, outside the HUD's glass plate (Paul, 2026-09-17: "sors
 * la de son panel, car elle est trop petite"). Energy is the fuel of the run
 * since the red X: it moves on every dig, and it is the one reading a player
 * checks before each step. Inside the plate it was a 70px gauge sharing a row.
 *
 * DRAWN IN THE KIT'S OWN LINE. The track is a `PxPanel` — the same nine-slice
 * frame, at the same 2px source pixel, as every button and panel (see px.tsx)
 * — and the fill is flat colour with a one-pixel light band above and a
 * one-pixel dark band below, which is how the kit's button faces are shaded.
 * It used to wear Tiny Swords' wooden gauge, scaled by 0.55 to fit the strip:
 * a different material, at a fractional pixel, beside chrome that is neither.
 * (The burrow's meters still use those sprites; this component no longer does.)
 *
 * Colour is the reading: battery yellow while healthy, amber when two bombs
 * would end the run, red — and pulsing — when the next one does. The notch is
 * one bomb's worth, so the danger zone is visible before it is entered.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ENERGY, FLAG } from '@config/tuning';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';

export interface EnergyBarProps {
  energy: number;
  /** Drawn as a notch, so the danger zone is visible before it is entered. */
  bombCost?: number;
}

/** The bar's full-scale value: the ceiling, which is also where a run opens. */
const SCALE = ENERGY.MAX;

/** The smallest drop that counts as being HURT: a wrong red X. A bomb is twice it. */
const HURT_DROP = Math.min(FLAG.LOSS, ENERGY.BOMB_LOSS);

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
    <svg className="rr-energy-icon" viewBox="0 0 8 10" width="24" height="30" shapeRendering="crispEdges" aria-hidden>
      {BOLT_ROWS.map(([from, to], y) => (
        <rect key={y} x={from} y={y} width={to - from + 1} height={1} fill="#ffd60a" />
      ))}
    </svg>
  );
}

export function EnergyBar({ energy, bombCost = ENERGY.BOMB_LOSS }: EnergyBarProps) {
  const t = useT();
  const pct = Math.max(0, Math.min(1, energy / SCALE));

  // A REAL LOSS IS AN EVENT: the bar blinks red and the screen's edges flush
  // (Paul, 2026-09-17: "energy bar should blink red when the rabbit is hit by
  // a bomb or loses significant energy"). "Real" is a wrong X or worse — a
  // drop of at least FLAG.LOSS. A dig costs a point and happens every step:
  // an alarm on each of those is an alarm nobody hears when the bomb comes.
  // Keyed, so two losses in a row are two blinks; a gain is never hurt.
  const prev = useRef(energy);
  const [hurt, setHurt] = useState(0);
  useEffect(() => {
    if (prev.current - energy >= HURT_DROP) setHurt((k) => k + 1);
    prev.current = energy;
  }, [energy]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // THE WAKE: where the bar WAS, held for a moment behind where it now is.
  //
  // The fill alone moves too fast to be seen — it is one element whose width
  // changes, and at a dig's single point the eye gets no event at all. The
  // wake is a second, dimmer bar that lags: it sits at the old value while the
  // fill slides to the new one, so a loss reads as a bright bar retreating out
  // of a pale one and a gain as a bright bar advancing into it. It is the
  // MOVEMENT that is drawn, which is the thing a plain width change cannot say.
  //
  // It renders at the outer edge of the two values (see `wakePct`), so it is
  // always the span the energy crossed. The lag is CSS: the same duration as
  // the fill, on a delay (see .rr-energy-wake), so the fill leads and the wake
  // closes up behind it.
  const [wake, setWake] = useState(energy);
  useEffect(() => {
    // Settle the wake onto the current value one frame later, so the browser
    // gets a paint with the old width and actually runs a transition. Setting
    // it in the same commit is a no-op: React batches, and the element mounts
    // already at its final width.
    const id = requestAnimationFrame(() => setWake(energy));
    return () => cancelAnimationFrame(id);
  }, [energy]);
  const wakePct = Math.max(0, Math.min(1, wake / SCALE));

  // Below one bomb's worth, the next blast ends the run. That is the moment the
  // bar exists to announce.
  const critical = energy <= bombCost;
  const tone = critical ? 'danger' : energy <= bombCost * 2 ? 'warn' : 'energy';

  return (
    <div className="rr-energy" title={t.run.energy(energy, SCALE)}>
      <Bolt />
      <PxPanel color="#1d1608" className="rr-energy-track">
        <div
          className="rr-energy-meter"
          role="meter"
          aria-valuenow={energy}
          aria-valuemin={0}
          aria-valuemax={SCALE}
          aria-label={t.run.energy(energy, SCALE)}
        >
          {/* Behind the fill, and only while the two disagree: the span the
              energy is crossing. `gaining` colours it — a pale wash of the
              fill's own tone going up, a dim ember going down — so the
              direction reads without reading the number. */}
          <i
            className={`rr-energy-wake tone-${tone}${wakePct > pct ? ' losing' : ' gaining'}`}
            style={{ width: `${Math.max(pct, wakePct) * 100}%` }}
            aria-hidden
          />
          <i className={`rr-energy-fill tone-${tone}${critical ? ' critical' : ''}`} style={{ width: `${pct * 100}%` }} />
          {/* The death line: one bomb's worth, over the fill so a full bar
              cannot hide the thing the player most needs to see. */}
          <span className="rr-energy-mark" style={{ left: `${(bombCost / SCALE) * 100}%` }} />
          {/* The blink: a red wash over the WHOLE track, fill and empty alike,
              so it reads even when the bar is nearly dry. Re-keyed per loss,
              which is what restarts the animation. */}
          {hurt > 0 && <i key={hurt} className="rr-energy-hit" aria-hidden />}
        </div>
      </PxPanel>
      <span className="rr-energy-value">{energy}</span>
      {/* Portalled: the HUD strip is frosted glass, and a backdrop-filter
          makes it the containing block for anything `fixed` inside it. */}
      {mounted && hurt > 0 && createPortal(<div key={hurt} className="rr-hurt" aria-hidden />, document.body)}
    </div>
  );
}
