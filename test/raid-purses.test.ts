/**
 * The two purses a raid reaches into, and the floor it cannot.
 *
 * Wired on 15 September 2026 from the economy carnet: a raid takes a share of
 * the UNHARVESTED garden (the collector, raided hard) and a share of the stock
 * ABOVE a floor (the storage, raided lightly, never below the floor).
 */
import { describe, expect, it } from 'vitest';
import { RAID, RAID_RUN, GARDEN } from '../config/tuning';
import { distanceToField, exposedStock, safeStock, settleRaid } from '../src/lib/game/raid';
import { gardenAfterLoot, gardenYield } from '../src/lib/game/regen';
import { walkableTiles } from '../src/game/burrow/board';

const SEED = 'player-1';
const dist = distanceToField(SEED);
/** A tile on the carrot field: a raid that went all the way. */
const field = walkableTiles(SEED).find((t) => dist.get(t) === 0)!;
const settle = (stock: number, garden: number, rng = () => 0.5) =>
  settleRaid({ seed: SEED, endedAt: field, defenderStock: stock, defenderGarden: garden, defenderLevel: 1, shielded: false }, rng, dist);

describe('the warehouse floor', () => {
  it('leaves a stock at or under the floor untouched', () => {
    for (const stock of [0, 1, RAID.SAFE_FLOOR - 1, RAID.SAFE_FLOOR]) {
      expect(exposedStock(stock)).toBe(0);
      expect(settle(stock, 0).loot).toBe(0);
      expect(safeStock(stock)).toBe(stock);
    }
  });

  it('exposes only what stands above it', () => {
    const stock = RAID.SAFE_FLOOR + 1_000;
    expect(exposedStock(stock)).toBe(1_000);
    const out = settle(stock, 0, () => 1);
    expect(out.lootFromStock).toBe(Math.floor(1_000 * RAID_RUN.LOOT_SHARE));
    expect(out.lootFromGarden).toBe(0);
    expect(out.loot).toBe(out.lootFromStock);
  });
});

describe('the garden purse', () => {
  it('takes its share of a full garden, on top of the stock', () => {
    const out = settle(RAID.SAFE_FLOOR + 1_000, 400, () => 1);
    expect(out.lootFromGarden).toBe(Math.floor(400 * RAID.GARDEN_LOOT_SHARE));
    expect(out.lootFromStock).toBe(Math.floor(1_000 * RAID_RUN.LOOT_SHARE));
    expect(out.loot).toBe(out.lootFromGarden + out.lootFromStock);
  });

  it('is the only purse a beginner has', () => {
    // Under the floor, only what is left growing outside is at risk.
    const out = settle(100, 200, () => 1);
    expect(out.lootFromStock).toBe(0);
    expect(out.lootFromGarden).toBe(Math.floor(200 * RAID.GARDEN_LOOT_SHARE));
  });

  it('fills the cap first, and the stock gets what is left of it', () => {
    const out = settle(10_000_000, 10_000_000, () => 1);
    expect(out.lootFromGarden).toBe(RAID.LOOT_CAP);
    expect(out.lootFromStock).toBe(0);
    expect(out.loot).toBe(RAID.LOOT_CAP);
  });

  it('takes nothing behind a shield', () => {
    const out = settleRaid({ seed: SEED, endedAt: field, defenderStock: 5_000, defenderGarden: 500, defenderLevel: 1, shielded: true }, () => 1, dist);
    expect(out.loot).toBe(0);
    expect(out.lootFromGarden).toBe(0);
  });
});

describe('setting the garden back after a theft', () => {
  const HOUR = 3_600_000;
  const now = Date.UTC(2026, 8, 15, 12);
  const row = (hoursAgo: number) => ({
    gardenCollectedAt: new Date(now - hoursAgo * HOUR),
    burrowLevel: 1,
    wateredUntil: null,
    fertilisedUntil: null,
  });

  it('leaves exactly what the raid did not take', () => {
    const r = row(5);
    const pending = gardenYield(r, now);
    expect(pending).toBe(5 * GARDEN.YIELD_PER_HOUR_BASE);
    const taken = Math.floor(pending * RAID.GARDEN_LOOT_SHARE);
    const after = { ...r, gardenCollectedAt: gardenAfterLoot(r, pending, taken, now) };
    expect(gardenYield(after, now)).toBe(pending - taken);
  });

  it('measures a capped garden from the cap, not from the days it sat there', () => {
    // Three days away: the garden holds CAP_HOURS' worth, and a theft of a
    // third must leave two thirds of THAT — not two thirds of three days.
    const r = row(72);
    const pending = gardenYield(r, now);
    expect(pending).toBe(GARDEN.CAP_HOURS * GARDEN.YIELD_PER_HOUR_BASE);
    const after = { ...r, gardenCollectedAt: gardenAfterLoot(r, pending, pending / 3, now) };
    expect(gardenYield(after, now)).toBe(Math.floor(pending * 2 / 3));
  });

  it('changes nothing when nothing was taken, and empties on a total theft', () => {
    const r = row(5);
    const pending = gardenYield(r, now);
    expect(gardenAfterLoot(r, pending, 0, now)).toBe(r.gardenCollectedAt);
    expect(gardenAfterLoot(r, 0, 0, now)).toBe(r.gardenCollectedAt);
    const stripped = { ...r, gardenCollectedAt: gardenAfterLoot(r, pending, pending, now) };
    expect(gardenYield(stripped, now)).toBe(0);
  });
});
