/**
 * Energy is shown where the decision is made, and it gates the one action.
 *
 * A player pressing "go farm" with nothing in the tank lands on an island that
 * ends immediately — the worst possible way to learn they had to wait. The
 * number belongs on the burrow, beside the button it governs.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { OUT_OF_RUN_ENERGY } from '../config/tuning';
import { burrowView, msToNextEnergy } from '../src/lib/game/burrow';

const PAGE = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

const now = Date.now();
const row = (energy: number, agoMs = 0) => ({
  stock: 0,
  burrowLevel: 1,
  burrowHp: 100,
  hpUpdatedAt: new Date(now),
  energy,
  energyUpdatedAt: new Date(now - agoMs),
  gardenCollectedAt: new Date(now),
});

describe('energy in the burrow view', () => {
  it('reports the value and its ceiling', () => {
    const v = burrowView(row(12), now);
    expect(v.energy).toBe(12);
    expect(v.maxEnergy).toBe(OUT_OF_RUN_ENERGY.MAX);
  });

  it('counts down to the next point', () => {
    const v = burrowView(row(0), now);
    expect(v.nextEnergyInMs).toBeGreaterThan(0);
    // Never longer than one point's worth of waiting.
    expect(v.nextEnergyInMs!).toBeLessThanOrEqual(3_600_000 / OUT_OF_RUN_ENERGY.REGEN_PER_HOUR);
  });

  it('stops counting at the ceiling', () => {
    // A "next in" beside a full bar is a countdown to nothing.
    expect(msToNextEnergy({ energy: OUT_OF_RUN_ENERGY.MAX, energyUpdatedAt: new Date(now) }, now))
      .toBeNull();
  });

  it('regenerates while the player is away', () => {
    const hour = 3_600_000;
    expect(burrowView(row(0, 3 * hour), now).energy)
      .toBe(Math.floor(3 * OUT_OF_RUN_ENERGY.REGEN_PER_HOUR));
  });
});

describe('the farm button is gated', () => {
  it('is disabled with no energy', () => {
    expect(PAGE).toMatch(/disabled=\{!hasEnergy\}/);
  });

  it('treats "still loading" as usable, not as empty', () => {
    // A null burrow is a screen that has not answered yet. Greying the button
    // there would flash it disabled on every load.
    expect(PAGE).toMatch(/burrow === null \|\| burrow\.energy > 0/);
  });

  it('greys the ARROW too, not just the label', () => {
    // The sprite is the louder half: a dimmed word beside a bright bouncing
    // arrow still reads as "press me".
    expect(CSS).toMatch(/\.rr-go:disabled \.rr-go-arrow/);
    const block = CSS.slice(CSS.indexOf('.rr-go:disabled .rr-go-arrow'));
    expect(block.slice(0, 300)).toMatch(/animation:\s*none/);
  });
});
