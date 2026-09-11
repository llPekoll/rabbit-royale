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
  lifetimeCarrots: 0,
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

describe('the farm button answers an empty tank', () => {
  /**
   * It used to be `disabled`, and that was the bug this suite now guards
   * against: the ONE control on the screen answered a tap with silence, so an
   * empty bar and a broken button looked the same. The press is always
   * answered — with the island when there is energy, and with the popup that
   * says why not and sells the way out when there is not.
   */
  it('is never disabled', () => {
    expect(PAGE).not.toMatch(/label="Go farm"[\s\S]{0,160}disabled/);
  });

  it('opens the popup instead of crossing when the tank is empty', () => {
    expect(PAGE).toMatch(/onClick=\{goFarm\}/);
    const gate = PAGE.slice(PAGE.indexOf('const goFarm'));
    expect(gate.slice(0, 200)).toMatch(/if \(!hasEnergy\) \{ setEnergyOpen\(true\); return; \}/);
  });

  it('treats "still loading" as usable, not as empty', () => {
    // A null burrow is a screen that has not answered yet. Offering a refill
    // there would be a shop pitch aimed at a player who may be full.
    expect(PAGE).toMatch(/burrow === null \|\| burrow\.energy > 0/);
  });
});

describe('the out-of-energy popup', () => {
  const POPUP = readFileSync(new URL('../src/components/energy-popup.tsx', import.meta.url), 'utf8');

  it('states the free route beside the paid one', () => {
    // A refill offered without the wait next to it is a toll, not a shortcut.
    expect(POPUP).toMatch(/nextEnergyInMs/);
    expect(POPUP).toMatch(/comes back on its own/);
  });

  it('offers the carrot price, and money only when the rail is on', () => {
    expect(POPUP).toMatch(/rr-pay-carrot/);
    expect(POPUP).toMatch(/onPayUsdc && item/);
    // Same rule as the Shed: no wallet, no USDC button rather than a button
    // that fails at the quote.
    expect(PAGE).toMatch(/onPayUsdc=\{payments && !player\.guest \? \(\) => void payEnergyUsdc\(\)/);
  });

  it('keeps the whole shed one press away', () => {
    expect(POPUP).toMatch(/onOpenShop/);
  });

  it('stays a small dialog on a phone', () => {
    // The Shed goes full-screen there because it is seven shelves; one
    // question blown up to full-screen reads as a page to escape from.
    expect(CSS).toMatch(/\.rr-shop-scrim:has\(\.rr-energy-modal\)/);
  });
});
