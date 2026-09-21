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
import { GARDEN, GARDEN_BOOST, OUT_OF_RUN_ENERGY, regenPerHour } from '../../../config/tuning';

const HOUR = 3_600_000;

export interface RegenRow {
  energy: number;
  energyUpdatedAt: Date;
  burrowLevel: number;
  gardenCollectedAt: Date;
  /** Chest boosts, live while in the future. Absent on rows that predate them. */
  wateredUntil?: Date | null;
  fertilisedUntil?: Date | null;
}

/** Energy now, capped. Regen runs while you are out of a run. */
/** The row a tank is read from: the bar, its stamp, and the burrow level
 *  that sets how fast it refills (`regenPerHour`). The level is optional so
 *  older fixtures and partial reads still type: absent, it reads as level 1. */
export type TankRow = Pick<RegenRow, 'energy' | 'energyUpdatedAt'> & { burrowLevel?: number };

export function currentEnergy(row: TankRow, now = Date.now()) {
  const hours = Math.max(0, now - row.energyUpdatedAt.getTime()) / HOUR;
  return Math.min(OUT_OF_RUN_ENERGY.MAX, Math.floor(row.energy + hours * regenPerHour(row.burrowLevel ?? 1)));
}

/**
 * Hours of the PAID window a boost expiring at `until` actually covered.
 *
 * The subtlety that makes this a function rather than a multiplier: a boost is
 * a WINDOW, and so is the stretch of time the garden is being paid for. A
 * watering that ran for two of the last ten hours earned its bonus on two
 * hours, not ten. Applying the multiplier to the whole interval would pay for
 * the eight dry hours as well — and worse, it would keep paying for them
 * forever, since the interval only grows while the window stays put.
 *
 * The paid window ENDS AT THE CAP, which is the part that is easy to get
 * wrong. A garden left for two days pays for its first twelve hours and
 * nothing after; a watering poured on it this morning overlaps the forty-first
 * hour, not the paid ones, and must earn nothing. Clipping the overlap to a
 * count of hours instead of to the window itself would credit it in full —
 * turning "water a full garden just before collecting" into the best play in
 * the game.
 *
 * Both windows are half-open intervals and this is their intersection, so the
 * order the player did things in cannot change the answer.
 */
function boostedHours(
  until: Date | null | undefined,
  durationMs: number,
  fromMs: number,
  paidUntilMs: number,
): number {
  if (!until) return 0;
  // The row stores only the END of the window, so the start is derived from how
  // long one unit runs for. Without this a boost expiring in the future would
  // be treated as having covered the whole interval since the last harvest —
  // including hours that came and went before the chest was even opened.
  const start = Math.max(until.getTime() - durationMs, fromMs);
  const end = Math.min(until.getTime(), paidUntilMs);
  return Math.max(0, end - start) / HOUR;
}

/** Is a boost live right now? */
export function boostActive(until: Date | null | undefined, now = Date.now()): boolean {
  return !!until && until.getTime() > now;
}

/**
 * The garden's ceiling in hours, fertiliser included.
 *
 * Fertiliser raises the CAP rather than the rate, so its whole effect is here:
 * a fed garden keeps accumulating past the twelve hours a bare one stops at.
 * Unlike water this is not pro-rated — the cap is a property of the garden at
 * the moment it is read, not something earned hour by hour, and a feeding that
 * has lapsed by the time the player collects has simply stopped holding the
 * extra room open.
 */
export function capHoursFor(row: Pick<RegenRow, 'fertilisedUntil'>, now = Date.now()): number {
  return boostActive(row.fertilisedUntil, now)
    ? GARDEN.CAP_HOURS + GARDEN_BOOST.FERTILISER.EXTRA_CAP_HOURS
    : GARDEN.CAP_HOURS;
}

/**
 * Carrots waiting in the garden. Capped at CAP_HOURS of production: the cap is
 * the reason to come back daily, and without it the garden would quietly become
 * the whole game for anyone who logs in weekly.
 *
 * The two chest boosts enter here, on the two different terms, which is what
 * stops them being the same item: water multiplies the RATE for the hours it
 * covered, fertiliser raises the CAP that clips the total.
 */
export function gardenYield(
  row: Pick<RegenRow, 'gardenCollectedAt' | 'burrowLevel' | 'wateredUntil' | 'fertilisedUntil'>,
  now = Date.now(),
) {
  const capHours = capHoursFor(row, now);
  const fromMs = row.gardenCollectedAt.getTime();
  const elapsed = Math.max(0, now - fromMs) / HOUR;
  const hours = Math.min(capHours, elapsed);
  const perHour = GARDEN.YIELD_PER_HOUR_BASE + GARDEN.YIELD_PER_LEVEL * (row.burrowLevel - 1);

  // The instant production stopped: `now` while the garden is still filling,
  // or the moment it hit the cap. Passing this rather than `now` is what makes
  // a watering poured on an already-full garden worth nothing.
  const paidUntilMs = fromMs + hours * HOUR;
  const wet = Math.min(
    boostedHours(row.wateredUntil, GARDEN_BOOST.WATER.DURATION_MS, fromMs, paidUntilMs),
    hours,
  );
  const dry = hours - wet;

  return Math.floor((dry + wet * GARDEN_BOOST.WATER.RATE_MULT) * perHour);
}

/**
 * The garden after a raid took `taken` of its `pending` carrots: the new
 * `gardenCollectedAt` to store.
 *
 * The garden is not a number in a column, it is a clock (see the top of this
 * file), so a theft cannot be subtracted — the clock is set BACK instead, to
 * the instant at which the garden would hold what is left. Exact for a plain
 * garden (carrots are hours × rate); proportional under a watering, where the
 * hours kept are the same share of the paid hours as the carrots kept. The cap
 * is honoured by construction: the paid hours were already clipped to it, so
 * what remains is at most the cap.
 *
 * Nothing is taken from a garden that holds nothing, and a theft of the whole
 * garden lands the clock on `now` — the same row a harvest writes.
 */
export function gardenAfterLoot(
  row: Pick<RegenRow, 'gardenCollectedAt' | 'fertilisedUntil'>,
  pending: number,
  taken: number,
  now = Date.now(),
): Date {
  if (pending <= 0 || taken <= 0) return row.gardenCollectedAt;
  const keep = Math.max(0, 1 - Math.min(taken, pending) / pending);
  const capHours = capHoursFor(row, now);
  const elapsed = Math.max(0, now - row.gardenCollectedAt.getTime()) / HOUR;
  const paidHours = Math.min(capHours, elapsed);
  return new Date(now - paidHours * keep * HOUR);
}

/** A player row with the derived values filled in — what an API hands a client. */
export function applyRegen<T extends RegenRow>(row: T, now = Date.now()) {
  return {
    ...row,
    energy: currentEnergy(row, now),
    gardenReady: gardenYield(row, now),
  };
}
