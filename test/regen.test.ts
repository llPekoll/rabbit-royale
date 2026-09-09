/**
 * Regen is derived from timestamps, never ticked — so it must be correct for
 * arbitrary gaps, including the "player was away for a month" case that a cron
 * would have handled by accident.
 */
import { describe, expect, it } from 'vitest';
import { BURROW, GARDEN, OUT_OF_RUN_ENERGY } from '../config/tuning';
import { currentEnergy, currentHp, gardenYield, maxHp } from '../src/lib/game/regen';

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

describe('currentEnergy', () => {
  it('refills over time', () => {
    const e = currentEnergy({ energy: 0, energyUpdatedAt: ago(2) });
    expect(e).toBe(Math.floor(2 * OUT_OF_RUN_ENERGY.REGEN_PER_HOUR));
  });

  it('caps, however long you were away', () => {
    expect(currentEnergy({ energy: 0, energyUpdatedAt: ago(24 * 365) })).toBe(OUT_OF_RUN_ENERGY.MAX);
  });
});

describe('currentHp', () => {
  it('regenerates towards the level cap', () => {
    const row = { burrowHp: 0, burrowLevel: 2, hpUpdatedAt: ago(1) };
    expect(currentHp(row)).toBe(Math.floor(maxHp(2) * BURROW.HP_REGEN_PER_HOUR));
  });

  it('never exceeds max HP', () => {
    expect(currentHp({ burrowHp: 0, burrowLevel: 3, hpUpdatedAt: ago(1000) })).toBe(maxHp(3));
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
