/**
 * What a store purchase does once its store said PAID — the half that does
 * not care which store (web2: Google Play now, the App Store next).
 *
 * Each store has its own route that proves the payment its own way
 * (src/app/api/store/play: the Play Developer API; the App Store: Apple's
 * signed transaction) and then hands the SAME two questions here:
 *
 *   storeBlocker   may this player buy this product? (asked BEFORE the
 *                  store's sheet opens: once the store has the money, a sale
 *                  is never refused) — every product is gold now
 *   creditStore…   deliver it, once per store token, in one transaction
 *
 * The token is the store's own name for one purchase: Play's purchaseToken,
 * Apple's transactionId. The unique index (platform, token) on
 * store_purchases is what makes a retry, a restore at launch or a double tap
 * credit once.
 *
 * And the way back: a store that gives the money back (a refund, a
 * chargeback) takes the sachet back with `takeBackStorePurchase`.
 */
import { and, eq, isNull, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, storePurchases } from '@/lib/db/schema';
import { grantItem } from '@/lib/game/grant';
import { STORE_PRODUCTS, type StoreProductId } from '@config/store';

export type StorePlatform = 'play' | 'apple' | 'stripe';

/**
 * Why this player cannot buy `productId` right now, or null. Every product is
 * a sachet of gold (config/store.ts), and gold has no ceiling: only a player
 * who does not exist is refused.
 */
export async function storeBlocker(playerId: string, _productId: StoreProductId): Promise<string | null> {
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId), columns: { id: true } });
  return player ? null : 'unknown_player';
}

/** A token this store already credited: to whom. */
export async function creditedTo(platform: StorePlatform, token: string): Promise<{ playerId: string; kind: string; qty: number } | null> {
  const row = await db.query.storePurchases.findFirst({
    where: and(eq(storePurchases.platform, platform), eq(storePurchases.token, token)),
  });
  return row ? { playerId: row.playerId, kind: row.kind, qty: row.qty } : null;
}

export interface PaidPurchase {
  platform: StorePlatform;
  playerId: string;
  productId: StoreProductId;
  token: string;
  orderId: string | null;
  purchasedAt: Date | null;
  /** A tester's purchase (Play license tester, Apple sandbox): no revenue. */
  test: boolean;
}

/**
 * Deliver a purchase its store proved paid. Null when a concurrent request
 * with the same token got there first (it delivers, this one does not).
 */
export async function creditStorePurchase(p: PaidPurchase) {
  const product = STORE_PRODUCTS[p.productId];
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(storePurchases).values({
      playerId: p.playerId,
      platform: p.platform,
      productId: p.productId,
      kind: product.kind,
      qty: product.qty,
      token: p.token,
      orderId: p.orderId,
      purchasedAt: p.purchasedAt,
    }).onConflictDoNothing().returning({ id: storePurchases.id });
    if (!row) return null;
    return grantItem(tx, p.playerId, product.kind, product.qty, Date.now(), {
      currency: 'iap',
      // A tester's purchase is free: kept at 0 so it never reads as revenue.
      cost: p.test ? 0 : product.usdCents * 10_000,
    });
  });
}

/**
 * Take back a sachet its store gave the money back for — a refund, a
 * chargeback — once per purchase (store_purchases.refunded_at).
 *
 * The gold comes off the balance IN FULL, even below zero: a player who bought
 * 6,500, spent it and asked the bank for the money back owes the game what they
 * spent, and a balance below zero buys nothing until a new sachet covers it.
 * What the gold already bought stays (taking a skin back would be a second,
 * harder rule for the same debt).
 *
 * Found by the store's token (Play's purchaseToken, Apple's transactionId) or
 * by its order number (Stripe's PaymentIntent, which a charge names). Null
 * when this base never credited it, or already took it back.
 */
export async function takeBackStorePurchase(
  platform: StorePlatform,
  by: { token: string } | { orderId: string },
): Promise<{ playerId: string; productId: string; qty: number } | null> {
  const which = 'token' in by ? eq(storePurchases.token, by.token) : eq(storePurchases.orderId, by.orderId);
  return db.transaction(async (tx) => {
    const [row] = await tx.update(storePurchases)
      .set({ refundedAt: new Date() })
      .where(and(eq(storePurchases.platform, platform), which, isNull(storePurchases.refundedAt)))
      .returning({ playerId: storePurchases.playerId, productId: storePurchases.productId, kind: storePurchases.kind, qty: storePurchases.qty });
    if (!row) return null;
    if (row.kind === 'gold') {
      await tx.update(players)
        .set({ gold: raw`${players.gold} - ${row.qty}` })
        .where(eq(players.id, row.playerId));
    }
    return { playerId: row.playerId, productId: row.productId, qty: row.qty };
  });
}
