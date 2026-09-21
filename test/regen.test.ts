/**
 * Regen is derived from timestamps, never ticked — so it must be correct for
 * arbitrary gaps, including the "player was away for a month" case that a cron
 * would have handled by accident.
 */
import { describe, expect, it } from 'vitest';
import { GARDEN, GARDEN_BOOST, OUT_OF_RUN_ENERGY, regenPerHour } from '../config/tuning';
import { capHoursFor, currentEnergy, gardenYield } from '../src/lib/game/regen';

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describe('currentEnergy', () => {
  it('refills over time', () => {
    const e = currentEnergy({ energy: 0, energyUpdatedAt: ago(2) });
    expect(e).toBe(Math.floor(2 * OUT_OF_RUN_ENERGY.REGEN_PER_HOUR));
  });

  it('caps, however long you were away', () => {
    expect(currentEnergy({ energy: 0, energyUpdatedAt: ago(24 * 365) })).toBe(OUT_OF_RUN_ENERGY.MAX);
  });
});

describe('gardenYield', () => {
  it('stops at the cap — the reason to come back daily', () => {
    const capped = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(GARDEN.CAP_HOURS * 10) });
    const atCap = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(GARDEN.CAP_HOURS) });
    expect(capped).toBe(atCap);
  });

  it('scales with burrow level', () => {
    const l1 = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(4) });
    const l5 = gardenYield({ burrowLevel: 5, gardenCollectedAt: ago(4) });
    expect(l5).toBeGreaterThan(l1);
  });
});


/**
 * The chest boosts. They are the reason a farmer opens a chest, so the rules
 * that keep them honest are worth pinning: a boost pays for the hours it
 * actually covered, and it cannot be banked into a permanent buff.
 */
describe('water — the rate boost', () => {
  /**
   * `wateredUntil` stores the END of the window, so a watering poured N hours
   * ago expires at `DURATION - N` from now. The tests build their timestamps
   * that way round rather than picking a bare future instant — an expiry far
   * enough ahead describes a window that has not started yet, and correctly
   * earns nothing.
   */
  const wateredAgo = (hours: number) =>
    new Date(Date.now() - hours * 3_600_000 + GARDEN_BOOST.WATER.DURATION_MS);

  it('pays more than a dry garden over the same hours', () => {
    // Watered at the moment of the last harvest: the whole interval is covered.
    const dry = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(4) });
    const wet = gardenYield({
      burrowLevel: 1, gardenCollectedAt: ago(4), wateredUntil: wateredAgo(4),
    });
    expect(wet).toBeGreaterThan(dry);
  });

  it('is worth nothing before its window has begun', () => {
    // An expiry a full duration into the future is a watering poured NOW, so it
    // overlaps none of the hours already banked.
    const dry = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(4) });
    const justPoured = gardenYield({
      burrowLevel: 1,
      gardenCollectedAt: ago(4),
      wateredUntil: new Date(Date.now() + GARDEN_BOOST.WATER.DURATION_MS),
    });
    expect(justPoured).toBe(dry);
  });

  /**
   * THE rule that stops water being a permanent buff. A watering that lapsed
   * an hour into a six-hour interval earned its bonus on that hour alone — if
   * the multiplier were applied to the whole interval it would keep paying for
   * the five dry hours, and go on paying more the longer the player waited.
   */
  it('only pays for the hours it actually covered', () => {
    const base = { burrowLevel: 1 as const, gardenCollectedAt: ago(6) };
    // Poured 6h ago, so it lapsed after covering the first stretch of the
    // interval; against a watering poured at the same moment but still running.
    const brief = gardenYield({ ...base, wateredUntil: ago(5) });
    const whole = gardenYield({ ...base, wateredUntil: wateredAgo(6) });
    const dry = gardenYield(base);

    expect(brief).toBeGreaterThan(dry);
    expect(brief).toBeLessThan(whole);
  });

  it('is worth nothing once it has lapsed before the last harvest', () => {
    // Collected an hour ago, watering ran out two hours ago: no overlap at all.
    const dry = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(1) });
    const stale = gardenYield({
      burrowLevel: 1, gardenCollectedAt: ago(1), wateredUntil: ago(2),
    });
    expect(stale).toBe(dry);
  });

  it('earns nothing on a garden already sitting at its cap', () => {
    // The clock stopped at the cap, so there are no further hours to multiply.
    const far = GARDEN.CAP_HOURS * 4;
    const capped = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(far) });
    const wateredAtCap = gardenYield({
      burrowLevel: 1, gardenCollectedAt: ago(far), wateredUntil: wateredAgo(1),
    });
    expect(wateredAtCap).toBe(capped);
  });
});

describe('fertiliser — the ceiling boost', () => {
  it('raises the cap while live, and only while live', () => {
    expect(capHoursFor({ fertilisedUntil: inHours(3) }))
      .toBe(GARDEN.CAP_HOURS + GARDEN_BOOST.FERTILISER.EXTRA_CAP_HOURS);
    expect(capHoursFor({ fertilisedUntil: ago(3) })).toBe(GARDEN.CAP_HOURS);
    expect(capHoursFor({ fertilisedUntil: null })).toBe(GARDEN.CAP_HOURS);
  });

  it('lets a garden accumulate past the daily wall', () => {
    // Left for longer than a bare garden can hold: the fed one is still filling.
    const over = GARDEN.CAP_HOURS + GARDEN_BOOST.FERTILISER.EXTRA_CAP_HOURS;
    const bare = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(over) });
    const fed = gardenYield({
      burrowLevel: 1, gardenCollectedAt: ago(over), fertilisedUntil: inHours(1),
    });
    expect(fed).toBeGreaterThan(bare);
  });

  it('does not raise the RATE — that is water\'s job', () => {
    // Well inside the bare cap, so the higher ceiling has nothing to bite on.
    const plain = gardenYield({ burrowLevel: 1, gardenCollectedAt: ago(2) });
    const fed = gardenYield({
      burrowLevel: 1, gardenCollectedAt: ago(2), fertilisedUntil: inHours(6),
    });
    expect(fed).toBe(plain);
  });
});

describe('a burrow level recharges faster', () => {
  it('adds a point an hour per level, and stops at the cap', () => {
    const { REGEN_PER_HOUR: base, REGEN_PER_LEVEL: step, REGEN_LEVEL_CAP: cap } = OUT_OF_RUN_ENERGY;
    expect(regenPerHour(1)).toBe(base);
    expect(regenPerHour(5)).toBe(base + 4 * step);
    expect(regenPerHour(cap)).toBe(base + (cap - 1) * step);
    expect(regenPerHour(cap + 10)).toBe(regenPerHour(cap));
    // A row without a level reads as level 1 — older fixtures, partial reads.
    const now = Date.now();
    const at = new Date(now - 2 * 3_600_000);
    expect(currentEnergy({ energy: 0, energyUpdatedAt: at }, now)).toBe(Math.floor(2 * base));
    expect(currentEnergy({ energy: 0, energyUpdatedAt: at, burrowLevel: cap }, now)).toBe(Math.floor(2 * regenPerHour(cap)));
  });
});
