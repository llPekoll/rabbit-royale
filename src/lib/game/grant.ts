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
import { inventory, players, purchases } from '@/lib/db/schema';
import { ENERGY_PACK, OUT_OF_RUN_ENERGY } from '@config/tuning';
import { currentEnergy } from './regen';
import { encodePush, PLAYER_PUSH_CHANNEL } from './raid-events';
import {
  extendSmoke, spendEnergyPack,
  type EnergyPackRow, type ItemKind, type SmokeRow,
} from './inventory';

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
  /** For a smoke screen: when the numbers come back. Null otherwise. */
  smokeUntil?: Date | null;
}

/**
 * What the purchase cost, for the receipt.
 *
 * Omitted by callers that are not selling — a chest drop grants an item too,
 * and a chest is not a purchase. No receipt is written without one.
 */
export interface Receipt {
  currency: 'carrots' | 'usdc';
  /** Whole carrots, or USDC base units (6 dp) — whichever `currency` names. */
  cost: number;
  /** The payment row that funded it. USDC only. */
  paymentId?: string;
}

/**
 * Credit `qty` of `kind` to a player, inside the caller's transaction.
 *
 * Three shapes, because the three storage decisions made elsewhere in the
 * schema are real and this is where they meet:
 *  - energy is APPLIED, not held — it tops the bar up and stamps the window;
 *  - smoke and the garden boosts are EXPIRY INSTANTS: what they give is a
 *    window, and a second one extends the first rather than replacing it;
 *  - traps live on the player row beside their free allowance;
 *  - everything else is a row in `inventory`.
 */
export async function grantItem(
  tx: Tx,
  playerId: string,
  kind: ItemKind,
  qty: number,
  now = Date.now(),
  receipt?: Receipt,
): Promise<GrantResult> {
  // The receipt is written in the caller's transaction, beside the debit and
  // the grant, so a receipt can never exist for an item that was not delivered
  // — nor an item be delivered without one.
  if (receipt) {
    await tx.insert(purchases).values({
      playerId,
      kind,
      qty,
      currency: receipt.currency,
      cost: receipt.cost,
      paymentId: receipt.paymentId ?? null,
    });
  }

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

    // A RABBIT OUT ON AN ISLAND DIGS WITH ITS OWN TANK, not with this column:
    // the run writes that tank back over `players.energy` when it banks
    // (bankRun, "the tank comes home"), so a refill bought mid-run landed
    // here, never showed on the island, and was erased at the end of the run.
    // The ws process holds the tank; it hears this and tops the rabbit up.
    // NOTIFY inside the transaction is delivered on COMMIT, so a refill that
    // rolls back tells nobody.
    const wire = encodePush({ to: playerId, event: 'energy_granted', payload: { amount: ENERGY_PACK.AMOUNT * qty } });
    if (wire) await tx.execute(raw`select pg_notify(${PLAYER_PUSH_CHANNEL}, ${wire})`);

    return { kind, qty, energy };
  }

  if (kind === 'smoke') {
    const player = await tx.query.players.findFirst({ where: eq(players.id, playerId) });
    if (!player) throw new Error('unknown player');

    // Extends an active screen rather than restarting it — see extendSmoke.
    const smokeUntil = extendSmoke(player as SmokeRow, qty, now);
    await tx.update(players).set({ smokeUntil }).where(eq(players.id, playerId));
    return { kind, qty, energy: null, smokeUntil };
  }

  // Water and fertiliser fall through to the bag below, like a bomb or a
  // shield. They used to be applied HERE — the drop opened its own window the
  // instant the chest was opened — which spent the best drops in the game on
  // whatever state the garden happened to be in, usually a full one, where a
  // watering is correctly worth nothing. The player pours them now, from the
  // burrow; see `gardenBoostBlocker` and the `water`/`fertilise` actions.

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
