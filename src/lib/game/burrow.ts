/**
 * Burrow economics: what an upgrade costs, what the garden owes you.
 *
 * Pure functions over a player row, so the same maths answers the API, the UI's
 * "can I afford this?" and the tests. The numbers themselves all live in
 * config/tuning.ts — nothing here invents one.
 */
import { BURROW, GARDEN, upgradeCost } from '../../../config/tuning';
import { gardenYield, maxHp, type RegenRow } from './regen';

export interface BurrowRow extends RegenRow {
  stock: number;
}

export interface BurrowView {
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
  stock: number;
  /** Carrots waiting to be collected right now. */
  gardenReady: number;
  /** Carrots the garden makes per hour at this level. */
  yieldPerHour: number;
  /** Hours of production the garden holds before it stops — the reason to
   *  come back daily rather than weekly. */
  capHours: number;
  /** Carrots waiting when the garden is completely full. */
  gardenCapacity: number;
  /** Cost of the next level, or null at max. */
  upgradeCost: number | null;
  canUpgrade: boolean;
  /** What the next level buys, so the price has something to sit against. A
   *  cost with no stated benefit is a number the player cannot judge. */
  next: { hp: number; yieldPerHour: number } | null;
}

/** Carrots per hour a garden makes at `level`. */
export const yieldPerHour = (level: number) =>
  GARDEN.YIELD_PER_HOUR_BASE + GARDEN.YIELD_PER_LEVEL * (level - 1);

export function burrowView(row: BurrowRow, now = Date.now()): BurrowView {
  const atMax = row.burrowLevel >= BURROW.MAX_LEVEL;
  const cost = atMax ? null : upgradeCost(row.burrowLevel);
  return {
    level: row.burrowLevel,
    maxLevel: BURROW.MAX_LEVEL,
    hp: row.burrowHp,
    maxHp: maxHp(row.burrowLevel),
    stock: row.stock,
    gardenReady: gardenYield(row, now),
    yieldPerHour: yieldPerHour(row.burrowLevel),
    capHours: GARDEN.CAP_HOURS,
    gardenCapacity: yieldPerHour(row.burrowLevel) * GARDEN.CAP_HOURS,
    upgradeCost: cost,
    canUpgrade: cost !== null && row.stock >= cost,
    next: atMax
      ? null
      : { hp: maxHp(row.burrowLevel + 1), yieldPerHour: yieldPerHour(row.burrowLevel + 1) },
  };
}

/**
 * Why an upgrade cannot happen, or null when it can. Returning the REASON
 * rather than a boolean is what lets the API say "you need 300 more carrots"
 * instead of a bare 400.
 */
export function upgradeBlocker(row: BurrowRow): string | null {
  if (row.burrowLevel >= BURROW.MAX_LEVEL) return 'max_level';
  if (row.stock < upgradeCost(row.burrowLevel)) return 'insufficient_carrots';
  return null;
}
