/**
 * What a brand new burrow is born holding.
 *
 * ONE PLACE, because there are two doors into this game — a guest presses play
 * (`guest.ts`), a wallet signs (`wallet-login.ts`) — and they lead to the same
 * player row. Everything a new account gets that is not a COLUMN is granted
 * here so the two doors cannot drift: the columns already have their own
 * careful defaults written inline at both call sites, and adding a third
 * hand-copied block was how the trap allowance nearly went out wrong once.
 *
 * Only `inventory` rows live here. Energy, the onboarding shield and the trap
 * allowance are fields on the player row and are set in the same INSERT that
 * creates it — they cannot be moved here without splitting one write into two.
 *
 * GRANTED AT CREATION, NOT PER RUN. A fence stands between runs; handing over
 * three more every time the player goes out would make the four-fence ceiling
 * meaningless within a night. "3 when you start the game" is read as the
 * account starting, which is the only reading under which the number stays 3.
 */
import { db } from '../db';
import { inventory } from '../db/schema';
import type { PgTransaction } from 'drizzle-orm/pg-core';

/**
 * Put the starting kit in a new player's bag.
 *
 * Runs AFTER the player row exists — the rows reference it. Idempotent by the
 * unique index on (player, kind): a retried sign-in cannot double the grant.
 */
export async function grantStartingKit(
  playerId: string,
  tx: typeof db | PgTransaction<never, never, never> = db,
): Promise<void> {
  const { FENCES } = await import('../../../config/tuning');
  await (tx as typeof db)
    .insert(inventory)
    .values({ playerId, kind: 'fence', qty: FENCES.STARTING })
    // Do NOTHING on conflict, never a set: a player who already has fences has
    // played, and re-running this must not top them back up to the starting
    // three — nor overwrite a bag they have spent down.
    .onConflictDoNothing();
}
