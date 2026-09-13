/**
 * Burrow economics: what an upgrade costs, what the garden owes you.
 *
 * Pure functions over a player row, so the same maths answers the API, the UI's
 * "can I afford this?" and the tests. The numbers themselves all live in
 * config/tuning.ts — nothing here invents one.
 */
import { BURROW, GARDEN, OUT_OF_RUN_ENERGY, upgradeCost } from '../../../config/tuning';
import { currentEnergy, gardenYield, type RegenRow } from './regen';
import { gardenCapacity, yieldPerHour } from './garden-growth';

export interface BurrowRow extends RegenRow {
  stock: number;
  /** Never reset, never stolen — the counter the codex unlocks on. */
  lifetimeCarrots: number;
  /** Raids bounce off until this instant, or null if never shielded. */
  shieldedUntil?: Date | null;
}

export interface BurrowView {
  level: number;
  maxLevel: number;
  stock: number;
  /**
   * Lifetime carrots — the third counter, and the only one that never moves
   * backwards. It rides on the burrow view because the burrow screen is where
   * it is read: it is what opens the codex's chapters (config/lore.ts), and a
   * story hung on `stock` or `seasonScore` would be un-read by a raid.
   */
  lifetime: number;
  /** Carrots waiting to be collected right now. */
  gardenReady: number;
  /**
   * Energy available for a run, and its ceiling.
   *
   * Shown on the burrow because that is where the decision is made: a player
   * about to press "go farm" needs to know whether there is a run in them, and
   * finding out by landing on an island that ends immediately is the worst
   * possible way to learn it.
   */
  energy: number;
  maxEnergy: number;
  /** How long until one more point of energy. Null when already full. */
  nextEnergyInMs: number | null;
  /** Carrots the garden makes per hour at this level. */
  yieldPerHour: number;
  /** Hours of production the garden holds before it stops — the reason to
   *  come back daily rather than weekly. */
  capHours: number;
  /** Carrots waiting when the garden is completely full. */
  gardenCapacity: number;
  /**
   * Milliseconds of shield left, or null when raids can land right now.
   *
   * This replaced a HIT POINTS gauge. HP were never a defence — traps are what
   * a raider actually fights, and the damage number changed neither his loot
   * nor his progress. All the HP ever decided was how soon the next raid could
   * land, so the screen now states THAT directly instead of dressing it as a
   * health bar the burrow does not have.
   */
  shieldMs: number | null;
  /** Cost of the next level, or null at max. */
  upgradeCost: number | null;
  canUpgrade: boolean;
  /** What the next level buys, so the price has something to sit against. A
   *  cost with no stated benefit is a number the player cannot judge. */
  next: { yieldPerHour: number } | null;
}

/**
 * Milliseconds until the next point of energy, or null at the ceiling.
 *
 * Derived from the same timestamp the energy itself is, so the countdown can
 * never disagree with the number beside it.
 */
export function msToNextEnergy(
  row: Pick<RegenRow, 'energy' | 'energyUpdatedAt'>,
  now = Date.now(),
): number | null {
  if (currentEnergy(row, now) >= OUT_OF_RUN_ENERGY.MAX) return null;
  const perPoint = 3_600_000 / OUT_OF_RUN_ENERGY.REGEN_PER_HOUR;
  const elapsed = Math.max(0, now - row.energyUpdatedAt.getTime());
  return perPoint - (elapsed % perPoint);
}

/**
 * Milliseconds of shield remaining, or null once raids can land again.
 *
 * Null rather than 0 for "unshielded" so the caller can tell "the shield just
 * ran out" from "there is no shield" without comparing against a clock twice.
 */
export function msOfShield(until: Date | null, now = Date.now()): number | null {
  if (!until) return null;
  const left = until.getTime() - now;
  return left > 0 ? left : null;
}

/**
 * Carrots per hour a garden makes at `level`, and the ceiling it fills to.
 *
 * Both re-exported from `garden-growth` rather than worked out again here. The
 * picture of the field divides by the SAME capacity this view reports, so
 * "holds 576" in the panel and a field drawn full are one fact stated twice —
 * see the note on `gardenCapacity`.
 */
export { yieldPerHour, gardenCapacity };

export function burrowView(row: BurrowRow, now = Date.now()): BurrowView {
  const atMax = row.burrowLevel >= BURROW.MAX_LEVEL;
  const cost = atMax ? null : upgradeCost(row.burrowLevel);
  return {
    level: row.burrowLevel,
    maxLevel: BURROW.MAX_LEVEL,
    stock: row.stock,
    lifetime: row.lifetimeCarrots,
    gardenReady: gardenYield(row, now),
    energy: currentEnergy(row, now),
    maxEnergy: OUT_OF_RUN_ENERGY.MAX,
    nextEnergyInMs: msToNextEnergy(row, now),
    yieldPerHour: yieldPerHour(row.burrowLevel),
    capHours: GARDEN.CAP_HOURS,
    gardenCapacity: gardenCapacity(row.burrowLevel),
    shieldMs: msOfShield(row.shieldedUntil ?? null, now),
    upgradeCost: cost,
    canUpgrade: cost !== null && row.stock >= cost,
    next: atMax ? null : { yieldPerHour: yieldPerHour(row.burrowLevel + 1) },
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
