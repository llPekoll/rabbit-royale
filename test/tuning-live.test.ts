/**
 * The `tuning` table actually moves the game.
 *
 * Declaring a key in config/overridable.ts used to be enough to seed a row and
 * nothing more: 29 of the declared keys were read straight from the file, so a
 * row changed nothing. These tests install overrides in the live snapshot (no
 * database: `setTuningOverrides` runs the same validation a refresh does) and
 * check that representative reads — garden, regen, raid toll, trap caps, the
 * one tank — follow, and that rows which would contradict each other are
 * refused rather than half-applied.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as FILE from '@config/tuning';
import { ALIASES, OVERRIDABLE, RELATIONS } from '@config/overridable';
import { clientOverrides, setTuningOverrides, resetTuningCache, tuned } from '@/lib/tuning/live';
import {
  DROWN, ENERGY, ENERGY_PACK, OUT_OF_RUN_ENERGY, RAID_RUN, itemCap, raidFloor, regenPerHour, upgradeCost,
} from '@/lib/tuning/tables';
import { gardenCapacity, yieldPerHour } from '@/lib/game/garden-growth';
import { currentEnergy, gardenYield } from '@/lib/game/regen';
import { availableTraps, placementBlocker } from '@/lib/game/traps';
import { maxRaidLoss } from '@/lib/game/raid';
import { chargeRun, canStartRun } from '@/lib/game/burrow';

const set = (rows: Record<string, number>) => {
  const warnings: string[] = [];
  setTuningOverrides(Object.entries(rows).map(([key, value]) => ({ key, value })), (m) => warnings.push(m));
  return warnings;
};

afterEach(() => resetTuningCache());

function fromFile(path: string): unknown {
  let node: unknown = FILE;
  for (const part of path.split('.')) node = (node as Record<string, unknown>)?.[part];
  return node;
}

describe('the registry against the file', () => {
  it('every declared key resolves to a number in config/tuning.ts', () => {
    for (const spec of OVERRIDABLE) expect(typeof fromFile(spec.path), spec.path).toBe('number');
  });

  it('every alias equals its source in the file', () => {
    for (const [alias, source] of ALIASES) expect(fromFile(alias), alias).toBe(fromFile(source));
  });

  it('the file satisfies every rule between keys', () => {
    const v = (p: string) => fromFile(p) as number;
    for (const rule of RELATIONS) expect(rule.holds(v), rule.why).toBe(true);
  });

  it('keys that reshape stored data are not declared', () => {
    const paths = OVERRIDABLE.map((s) => s.path);
    expect(paths).not.toContain('TRAPS.DOORSTEP');
    expect(paths).not.toContain('TRAPS.CARROT_COST');
  });
});

describe('a row in the table moves the read', () => {
  it('garden yield and cap', () => {
    const before = yieldPerHour(3);
    set({ 'GARDEN.YIELD_PER_HOUR_BASE': 50, 'GARDEN.YIELD_PER_LEVEL': 10, 'GARDEN.CAP_HOURS': 6 });
    expect(yieldPerHour(3)).toBe(70);
    expect(yieldPerHour(3)).not.toBe(before);
    expect(gardenCapacity(3)).toBe(420);
    // regen.ts's own yield maths reads the same live numbers: two hours at 70.
    const at = new Date('2026-10-01T00:00:00Z');
    const row = { gardenCollectedAt: at, burrowLevel: 3, wateredUntil: null, fertilisedUntil: null };
    expect(gardenYield(row, at.getTime() + 2 * 3_600_000)).toBe(140);
    // …and stops at the live cap: six hours, not the file's twelve.
    expect(gardenYield(row, at.getTime() + 24 * 3_600_000)).toBe(420);
  });

  it('regen per level, and the tank it fills', () => {
    set({ 'OUT_OF_RUN_ENERGY.REGEN_PER_HOUR': 60, 'OUT_OF_RUN_ENERGY.REGEN_PER_LEVEL': 2 });
    expect(regenPerHour(1)).toBe(60);
    expect(regenPerHour(4)).toBe(66);
    const at = new Date('2026-10-01T00:00:00Z');
    expect(currentEnergy({ energy: 0, energyUpdatedAt: at, burrowLevel: 1 }, at.getTime() + 3_600_000)).toBe(60);
  });

  it('the one tank: ENERGY.MAX and the pack follow OUT_OF_RUN_ENERGY.MAX', () => {
    set({ 'OUT_OF_RUN_ENERGY.MAX': 400 });
    expect(OUT_OF_RUN_ENERGY.MAX).toBe(400);
    expect(ENERGY.MAX).toBe(400);
    expect(ENERGY_PACK.AMOUNT).toBe(400);
    expect(tuned('ENERGY.MAX')).toBe(400);
    const at = new Date('2026-10-01T00:00:00Z');
    expect(currentEnergy({ energy: 390, energyUpdatedAt: at, burrowLevel: 1 }, at.getTime() + 3_600_000)).toBe(400);
    // The client gets both names.
    expect(clientOverrides()).toMatchObject({ 'OUT_OF_RUN_ENERGY.MAX': 400, 'ENERGY.MAX': 400, 'ENERGY_PACK.AMOUNT': 400 });
  });

  it('a row for an alias is refused, naming the key to set', () => {
    const warnings = set({ 'ENERGY.MAX': 400 });
    expect(ENERGY.MAX).toBe(FILE.ENERGY.MAX);
    expect(warnings.join()).toContain('OUT_OF_RUN_ENERGY.MAX');
  });

  it('the raid toll and its floor', () => {
    const fileFloor = FILE.RAID_RUN.TOLL + FILE.RAID_RUN.WALK_FLOOR * FILE.RAID_RUN.STEP_COST;
    expect(raidFloor()).toBe(fileFloor);
    set({ 'RAID_RUN.TOLL': 30, 'RAID_RUN.WALK_FLOOR': 10 });
    expect(RAID_RUN.TOLL).toBe(30);
    expect(raidFloor()).toBe(30 + 10 * FILE.RAID_RUN.STEP_COST);
  });

  it('the crossing fee and floor', () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const row = { energy: 20, energyUpdatedAt: at, burrowLevel: 1 };
    expect(canStartRun(row, at.getTime())).toBe(false);
    set({ 'ENERGY.MIN_TO_CROSS': 15, 'ENERGY.CROSSING_COST': 10 });
    expect(canStartRun(row, at.getTime())).toBe(true);
    expect(chargeRun(row, at.getTime())?.energy).toBe(10);
  });

  it('the bomb, and the sea that follows it', () => {
    expect(ENERGY.BOMB_LOSS).toBe(FILE.ENERGY.BOMB_LOSS);
    set({ 'ENERGY.BOMB_LOSS': 60 });
    expect(ENERGY.BOMB_LOSS).toBe(60);
    expect(DROWN.LOSS).toBe(60);
  });

  it('trap caps', () => {
    const row = { trapsOwned: 50, trapsClaimedAt: new Date() };
    expect(availableTraps(row)).toBe(FILE.TRAPS.MAX_HELD);
    expect(placementBlocker(row, FILE.TRAPS.MAX_PLACED, true, false)).toBe('board_full');
    set({ 'TRAPS.MAX_HELD': 20, 'TRAPS.MAX_PLACED': 10 });
    expect(availableTraps(row)).toBe(20);
    expect(itemCap('trap')).toBe(20);
    expect(placementBlocker(row, FILE.TRAPS.MAX_PLACED, true, false)).toBeNull();
  });

  it('raid loot cap and burrow ladder', () => {
    set({ 'RAID.LOOT_CAP': 10, 'BURROW.UPGRADE_BASE_COST': 1000, 'BURROW.UPGRADE_GROWTH': 2 });
    expect(maxRaidLoss(1_000_000)).toBe(10);
    expect(upgradeCost(3)).toBe(4000);
  });
});

describe('rows that contradict each other', () => {
  it('a toll above the stake is refused, file values kept', () => {
    const warnings = set({ 'RAID_RUN.TOLL': 80, 'RAID_RUN.STAKE': 60 });
    expect(RAID_RUN.TOLL).toBe(FILE.RAID_RUN.TOLL);
    expect(RAID_RUN.STAKE).toBe(FILE.RAID_RUN.STAKE);
    expect(warnings.join()).toContain('péage');
  });

  it('a tank too small to cross is refused', () => {
    set({ 'OUT_OF_RUN_ENERGY.MAX': 20 });
    expect(OUT_OF_RUN_ENERGY.MAX).toBe(FILE.OUT_OF_RUN_ENERGY.MAX);
  });

  it('a legal override survives beside a refused one', () => {
    set({ 'RAID_RUN.LOOT_SHARE_MIN': 0.5, 'GARDEN.CAP_HOURS': 6 });
    expect(RAID_RUN.LOOT_SHARE_MIN).toBe(FILE.RAID_RUN.LOOT_SHARE_MIN);
    expect(tuned('GARDEN.CAP_HOURS')).toBe(6);
  });
});
