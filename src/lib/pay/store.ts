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
 *                  is never refused)
 *   creditStore…   deliver it, once per store token, in one transaction
 *
 * The token is the store's own name for one purchase: Play's purchaseToken,
 * Apple's transactionId. The unique index (platform, token) on
 * store_purchases is what makes a retry, a restore at launch or a double tap
 * credit once.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventory, players, storePurchases } from '@/lib/db/schema';
import { holdings } from '@/lib/game/inventory';
import { grantItem } from '@/lib/game/grant';
import { isPackKind, packBlocker } from '@/lib/game/packs';
import { isSkinKind, ownsSkin, skinForKind } from '@/lib/game/skins';
import { STORE_PRODUCTS, type StoreProductId } from '@config/store';

export type StorePlatform = 'play' | 'apple';

/** Why this player cannot buy `productId` right now, or null. */
export async function storeBlocker(playerId: string, productId: StoreProductId): Promise<string | null> {
  const { kind } = STORE_PRODUCTS[productId];
  if (isSkinKind(kind)) {
    return await ownsSkin(playerId, skinForKind(kind).key) ? 'skin_owned' : null;
  }
  if (isPackKind(kind)) {
    const [player, rows] = await Promise.all([
      db.query.players.findFirst({ where: eq(players.id, playerId) }),
      db.query.inventory.findMany({ where: eq(inventory.playerId, playerId) }),
    ]);
    if (!player) return 'unknown_player';
    return packBlocker(kind, 1, holdings(rows, player));
  }
  return 'unknown_item';
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
