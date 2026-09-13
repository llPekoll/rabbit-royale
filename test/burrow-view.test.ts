/**
 * What the burrow screen shows.
 *
 * A price with no stated benefit is a number the player cannot judge, and a
 * garden reading "+0" with nothing beside it reads as broken rather than as
 * recently picked. These assert that the screen has the figures it needs to be
 * readable, not just the ones it needs to function.
 */
import { describe, expect, it } from 'vitest';
import { BURROW, GARDEN, upgradeCost } from '../config/tuning';
import { burrowView, yieldPerHour } from '../src/lib/game/burrow';

const now = Date.now();
const row = (level: number, stock = 0, pickedHoursAgo = 0) => ({
  stock,
  lifetimeCarrots: 0,
  burrowLevel: level,
  energy: 30,
  energyUpdatedAt: new Date(now),
  gardenCollectedAt: new Date(now - pickedHoursAgo * 3_600_000),
});

describe('burrowView', () => {
  it('states the garden RATE, not only the pile', () => {
    const v = burrowView(row(1), now);
    expect(v.yieldPerHour).toBe(GARDEN.YIELD_PER_HOUR_BASE);
    expect(v.gardenCapacity).toBe(v.yieldPerHour * GARDEN.CAP_HOURS);
    expect(v.capHours).toBe(GARDEN.CAP_HOURS);
  });

  it('says what the next level buys', () => {
    const v = burrowView(row(2), now);
    expect(v.next).not.toBeNull();
    // The number must MOVE, or the upgrade is a price for nothing. It used to
    // quote HP too; that stat is gone, so the garden rate is the whole offer
    // and it carries the burden of justifying the price on its own.
    expect(v.next!.yieldPerHour).toBeGreaterThan(v.yieldPerHour);
  });

  it('offers nothing further at max level', () => {
    const v = burrowView(row(BURROW.MAX_LEVEL), now);
    expect(v.next).toBeNull();
    expect(v.upgradeCost).toBeNull();
    expect(v.canUpgrade).toBe(false);
  });

  it('quotes the price the upgrade actually charges', () => {
    // A displayed cost that disagrees with the one deducted is the worst
    // possible bug in a shop.
    //
    // NOTE the argument order: `row(level, stock)`. Passing the stock to
    // burrowView's second parameter instead — which is `now` — is what the
    // first draft of this test did, and it silently asked for the burrow's
    // state at the epoch.
    const v = burrowView(row(3, 10_000), now);
    expect(v.upgradeCost).toBe(upgradeCost(3));
    expect(v.canUpgrade).toBe(true);
  });

  it('grows the garden rate with the level', () => {
    expect(yieldPerHour(2)).toBeGreaterThan(yieldPerHour(1));
    expect(yieldPerHour(10)).toBeGreaterThan(yieldPerHour(9));
  });
});
