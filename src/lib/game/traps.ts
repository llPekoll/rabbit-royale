/**
 * The trap economy: how many you have, and what one costs.
 *
 * The free daily allowance is DERIVED from a timestamp, never granted by a job.
 * Same reasoning as energy and burrow HP: a per-player cron is O(players) every
 * day forever, and it is the first thing to fall over. A subtraction is O(1) and
 * only runs when someone actually opens their burrow.
 *
 * "3 free per day" is therefore a rolling allowance, not a midnight reset — you
 * are never punished for playing at the wrong hour, and there is no stampede.
 */
import { TRAPS } from '@config/tuning';

export interface TrapRow {
  /** Traps bought or looted — these never expire. */
  trapsOwned: number;
  /** When the free allowance was last drawn down. */
  trapsClaimedAt: Date;
}

/**
 * Free traps available right now.
 *
 * The allowance refills linearly over REFILL_MS: wait a third of a day and one
 * of the three comes back. Capped at FREE_PER_DAY, so leaving for a week banks
 * three, not twenty-one.
 */
export function freeTraps(row: TrapRow, now = Date.now()): number {
  const elapsed = Math.max(0, now - row.trapsClaimedAt.getTime());
  const perTrap = TRAPS.REFILL_MS / TRAPS.FREE_PER_DAY;
  return Math.min(TRAPS.FREE_PER_DAY, Math.floor(elapsed / perTrap));
}

/** Everything a player could place right now, free allowance included. */
export function availableTraps(row: TrapRow, now = Date.now()): number {
  return Math.min(TRAPS.MAX_HELD, row.trapsOwned + freeTraps(row, now));
}

/**
 * Spend one trap, preferring the FREE allowance over bought stock.
 *
 * Free-first because bought traps cost carrots and an allowance that expires
 * unused is worth nothing — spending the perishable resource first is what a
 * player would do by hand, so the game should not make them do it by hand.
 *
 * Returns the fields to write, or null when there is nothing to spend.
 */
export function spendTrap(
  row: TrapRow,
  now = Date.now(),
): { trapsOwned: number; trapsClaimedAt: Date } | null {
  const free = freeTraps(row, now);
  if (free > 0) {
    // Push the claim stamp forward by ONE trap's worth rather than resetting it
    // to now: resetting would throw away the progress already made towards the
    // other two, which is the bug this shape exists to avoid.
    const perTrap = TRAPS.REFILL_MS / TRAPS.FREE_PER_DAY;
    return {
      trapsOwned: row.trapsOwned,
      trapsClaimedAt: new Date(row.trapsClaimedAt.getTime() + perTrap),
    };
  }
  if (row.trapsOwned > 0) {
    return { trapsOwned: row.trapsOwned - 1, trapsClaimedAt: row.trapsClaimedAt };
  }
  return null;
}

/**
 * Give a trap back: the inverse of `spendTrap`, for one lifted off the board.
 *
 * It comes back as OWNED stock rather than as free allowance, whichever kind
 * paid for it. Rewinding `trapsClaimedAt` would be the exact inverse, and it
 * is the wrong one: the allowance refills on a clock, so a rewind hands back a
 * trap AND restarts the timer that was already running towards the next one —
 * lift and re-place on a loop and the burrow mines itself for free. Owned
 * stock has no clock, so a trap returned this way is worth exactly the one
 * that was spent.
 *
 * Capped at MAX_HELD so a defender who lifts a full board cannot end up
 * holding more than the bag allows.
 */
export function refundTrap(row: TrapRow, now = Date.now()): { trapsOwned: number } {
  return refundTraps(row, 1, now);
}

/**
 * Give back `count` traps at once — clearing the whole board in one gesture.
 *
 * The same rule as `refundTrap`, applied N times rather than looped by the
 * caller: stock returned, never allowance rewound, and the same MAX_HELD cap
 * measured against the free allowance standing right now.
 *
 * It has to be one call rather than N, because the cap is not distributive: a
 * defender lifting eight traps into a bag that can hold twelve, with three free
 * already waiting, ends at nine — not at eight separate saturating adds, which
 * is the same answer here but stops being so the moment either limit moves.
 * One function, one place to be right.
 */
export function refundTraps(
  row: TrapRow,
  count: number,
  now = Date.now(),
): { trapsOwned: number } {
  const free = freeTraps(row, now);
  const room = Math.max(0, TRAPS.MAX_HELD - free);
  return { trapsOwned: Math.min(room, row.trapsOwned + Math.max(0, count)) };
}

/** Why a trap cannot be placed, or null when it can. */
export function placementBlocker(
  row: TrapRow,
  placedCount: number,
  tileIsTrappable: boolean,
  tileAlreadyTrapped: boolean,
  now = Date.now(),
): string | null {
  if (!tileIsTrappable) return 'tile_not_trappable';
  if (tileAlreadyTrapped) return 'tile_already_trapped';
  if (placedCount >= TRAPS.MAX_PLACED) return 'board_full';
  if (availableTraps(row, now) <= 0) return 'no_traps';
  return null;
}

/** Carrots for one extra trap. Flat: a scaling price would let a rich player
 *  buy an impregnable burrow, which the balance explicitly rules out. */
export const trapCost = () => TRAPS.CARROT_COST;
