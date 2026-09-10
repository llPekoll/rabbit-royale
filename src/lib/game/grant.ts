/**
 * Giving a player what they bought.
 *
 * ONE function, called by both payment routes. That is the point: a bomb bought
 * with carrots and a bomb bought with USDC have to be the same bomb, and the
 * cheapest way to guarantee that is for there to be one piece of code that
 * creates one. The GDD's "no exclusive power for money, ever" is a promise
 * about behaviour, and behaviour is easiest to keep identical when it is not
 * written twice.
 *
 * The caller owns the transaction. Both routes need the debit (carrots) or the
 * payment row (USDC) to move in the same commit as the grant, and a function
 * that opened its own would make that impossible.
 */
import { eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventory, players } from '@/lib/db/schema';
import { ENERGY_PACK, OUT_OF_RUN_ENERGY } from '@config/tuning';
import { currentEnergy } from './regen';
import { spendEnergyPack, type EnergyPackRow, type ItemKind } from './inventory';

/**
 * A Drizzle transaction, or the handle itself.
 *
 * Typed as the union so a caller with no other work to commit can pass `db`
 * directly rather than opening a transaction around a single statement.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface GrantResult {
  kind: ItemKind;
  qty: number;
  /** For an energy refill: the bar after the top-up. Null for carried items. */
  energy: number | null;
}

/**
 * Credit `qty` of `kind` to a player, inside the caller's transaction.
 *
 * Three shapes, because the three storage decisions made elsewhere in the
 * schema are real and this is where they meet:
 *  - energy is APPLIED, not held — it tops the bar up and stamps the window;
 *  - traps live on the player row beside their free allowance;
 *  - everything else is a row in `inventory`.
 */
export async function grantItem(
  tx: Tx,
  playerId: string,
  kind: ItemKind,
  qty: number,
  now = Date.now(),
): Promise<GrantResult> {
  if (kind === 'energy') {
    const player = await tx.query.players.findFirst({ where: eq(players.id, playerId) });
    if (!player) throw new Error('unknown player');

    // Top up from where the bar ACTUALLY is — the stored number is stale by
    // however long the player has been away, and writing `stored + AMOUNT`
    // would silently pocket the energy that regenerated in between.
    const energy = Math.min(
      OUT_OF_RUN_ENERGY.MAX,
      currentEnergy(player, now) + ENERGY_PACK.AMOUNT * qty,
    );
    const window = spendEnergyPack(player as EnergyPackRow, now);

    await tx.update(players).set({
      energy,
      // Stamping the clock is what makes the new value the new baseline;
      // without it the next read would re-add the elapsed regen on top.
      energyUpdatedAt: new Date(now),
      energyPacksBought: window.energyPacksBought,
      energyPacksSince: window.energyPacksSince,
    }).where(eq(players.id, playerId));

    return { kind, qty, energy };
  }

  if (kind === 'trap') {
    await tx.update(players)
      .set({ trapsOwned: raw`${players.trapsOwned} + ${qty}` })
      .where(eq(players.id, playerId));
    return { kind, qty, energy: null };
  }

  await tx.insert(inventory)
    .values({ playerId, kind, qty })
    .onConflictDoUpdate({
      target: [inventory.playerId, inventory.kind],
      set: { qty: raw`${inventory.qty} + ${qty}` },
    });
  return { kind, qty, energy: null };
}
