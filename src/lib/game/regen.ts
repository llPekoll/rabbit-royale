/**
 * Time-derived regeneration: energy and garden yield.
 *
 * NOTHING here is ticked by a job. Each value is computed from its `*UpdatedAt`
 * timestamp at the moment someone reads it, which is what lets this hold a lot
 * of players: a per-player cron is O(players) every minute forever, whereas a
 * subtraction is O(1) and only runs when a player actually shows up.
 *
 * The functions are pure — they take a row and a clock and return numbers. The
 * caller decides whether to write the new values back.
 */
import { GARDEN, OUT_OF_RUN_ENERGY } from '../../../config/tuning';

const HOUR = 3_600_000;

export interface RegenRow {
  energy: number;
  energyUpdatedAt: Date;
  burrowLevel: number;
  gardenCollectedAt: Date;
}

/** Energy now, capped. Regen runs while you are out of a run. */
export function currentEnergy(row: Pick<RegenRow, 'energy' | 'energyUpdatedAt'>, now = Date.now()) {
  const hours = Math.max(0, now - row.energyUpdatedAt.getTime()) / HOUR;
  return Math.min(OUT_OF_RUN_ENERGY.MAX, Math.floor(row.energy + hours * OUT_OF_RUN_ENERGY.REGEN_PER_HOUR));
}

/**
 * Carrots waiting in the garden. Capped at CAP_HOURS of production: the cap is
 * the reason to come back daily, and without it the garden would quietly become
 * the whole game for anyone who logs in weekly.
 */
export function gardenYield(row: Pick<RegenRow, 'gardenCollectedAt' | 'burrowLevel'>, now = Date.now()) {
  const hours = Math.min(GARDEN.CAP_HOURS, Math.max(0, now - row.gardenCollectedAt.getTime()) / HOUR);
  const perHour = GARDEN.YIELD_PER_HOUR_BASE + GARDEN.YIELD_PER_LEVEL * (row.burrowLevel - 1);
  return Math.floor(hours * perHour);
}

/** A player row with the derived values filled in — what an API hands a client. */
export function applyRegen<T extends RegenRow>(row: T, now = Date.now()) {
  return {
    ...row,
    energy: currentEnergy(row, now),
    gardenReady: gardenYield(row, now),
  };
}
