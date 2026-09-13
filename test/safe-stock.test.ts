/**
 * The "safe" figure on the burrow card: what a raid cannot take.
 *
 * This number is shown to players as a guarantee, which makes it the kind of
 * claim that has to be checked against the thing it claims about rather than
 * against itself. `safeStock` restates `settleRaid`'s loot formula with every
 * term maximised; if someone retunes LOOT_SHARE, LOOT_CAP or the crown's
 * multiplier and only one of the two is updated, the card starts promising
 * protection the raid rules do not give. So the tests below run the REAL raid
 * resolver and assert the promise holds against its output.
 */
import { describe, expect, it } from 'vitest';
import { maxRaidLoss, safeStock, settleRaid, distanceToField } from '../src/lib/game/raid';
import { walkableTiles } from '../src/game/burrow/board';
import { RAID, RAID_RUN, CROWN } from '../config/tuning';

const SEEDS = ['player-1', 'player-2', 'guest:abc', 'sol:9xQeWvG816AUJHqBkAS8fcCQ'];

describe('safe stock', () => {
  it('is the stock minus the worst a raid can do', () => {
    for (const stock of [0, 1, 100, 1_000, 50_000, 1_000_000]) {
      expect(safeStock(stock)).toBe(stock - maxRaidLoss(stock));
    }
  });

  it('never exceeds the stock, and never goes negative', () => {
    for (const stock of [0, 1, 7, 999, 123_456]) {
      expect(safeStock(stock)).toBeGreaterThanOrEqual(0);
      expect(safeStock(stock)).toBeLessThanOrEqual(stock);
    }
  });

  /**
   * Garbage in, zero out. The stock reaches the card from a database row and
   * from the wire, so a missing or absurd value has to degrade to a number
   * rather than to `NaN` rendered into the UI.
   */
  it('degrades to 0 on values that are not a real stock', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1, -10_000]) {
      expect(safeStock(bad)).toBe(0);
      expect(maxRaidLoss(bad)).toBe(0);
    }
  });

  /**
   * THE PROMISE. No raid the resolver can produce — any seed, any depth, at
   * any progress, crowned or not — takes more than `maxRaidLoss`.
   */
  it('holds against every outcome the real resolver produces', () => {
    for (const seed of SEEDS) {
      const dist = distanceToField(seed);
      for (const endedAt of walkableTiles(seed)) {
        for (const crowned of [false, true]) {
          for (const stock of [500, 10_000, 500_000]) {
            const out = settleRaid(
              { seed, endedAt, defenderStock: stock, defenderLevel: 1, shielded: false, crowned },
              () => 0.5,
              dist,
            );
            expect(out.loot).toBeLessThanOrEqual(maxRaidLoss(stock));
            expect(stock - out.loot).toBeGreaterThanOrEqual(safeStock(stock));
          }
        }
      }
    }
  });

  /**
   * The cap is what protects a large stock, and it is the term most likely to
   * be forgotten: above the crossover a raid takes a flat amount, so nearly
   * everything a whale holds is safe.
   */
  it('is governed by the flat cap once the stock is large', () => {
    const huge = RAID.LOOT_CAP * 100;
    expect(maxRaidLoss(huge)).toBe(RAID.LOOT_CAP);
    expect(safeStock(huge)).toBe(huge - RAID.LOOT_CAP);
  });

  /**
   * ...and by the share below it, where the loss is proportional.
   */
  it('is governed by the share while the stock is small', () => {
    const small = 1_000;
    const byShare = Math.floor(small * RAID_RUN.LOOT_SHARE * CROWN.LOOT_MULT);
    expect(byShare).toBeLessThan(RAID.LOOT_CAP);
    expect(maxRaidLoss(small)).toBe(byShare);
  });

  /**
   * The crown is priced in even though the card does not know who wears it —
   * see `maxRaidLoss`. A crowned player must never be shown a figure that
   * their own 1.75x multiplier can eat through.
   */
  it('prices in the crown, so the figure holds for the season leader too', () => {
    const stock = 10_000;
    const crownedLoot = settleRaid(
      { seed: 'player-1', endedAt: 0, defenderStock: stock, defenderLevel: 1, shielded: false, crowned: true },
      () => 0.5,
    ).loot;
    expect(stock - crownedLoot).toBeGreaterThanOrEqual(safeStock(stock));
  });
});
