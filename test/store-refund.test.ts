/** A sachet the store paid back comes off the gold, once (lib/pay/store.ts).
 *
 * Runs against the local DB:
 *   RR_AUTH_DB_TEST=1 bun run test -- test/store-refund.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { players, storePurchases } from '@/lib/db/schema';
import { creditStorePurchase, takeBackStorePurchase } from '@/lib/pay/store';

describe.skipIf(!process.env.RR_AUTH_DB_TEST)('store refunds', () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db.delete(players).where(inArray(players.id, ids));
  });
  const player = async (gold: number) => {
    const id = `guest:${randomUUID()}`;
    ids.push(id);
    await db.insert(players).values({ id, name: `refund-${id.slice(-6)}`, gold });
    return id;
  };
  const goldOf = async (id: string) =>
    (await db.query.players.findFirst({ where: eq(players.id, id), columns: { gold: true } }))!.gold;
  const buy = (playerId: string, orderId: string) => creditStorePurchase({
    platform: 'stripe', playerId, productId: 'gold_550', token: `cs_test_${randomUUID().replace(/-/g, '')}`,
    orderId, purchasedAt: new Date(), test: true,
  });

  it('takes the sachet back once, by its order number', async () => {
    const id = await player(0);
    const order = `pi_${randomUUID()}`;
    await buy(id, order);
    expect(await goldOf(id)).toBe(550);
    expect(await takeBackStorePurchase('stripe', { orderId: order })).toMatchObject({ playerId: id, qty: 550 });
    expect(await goldOf(id)).toBe(0);
    // Stripe sends charge.refunded AND a dispute can follow: the second is a no-op.
    expect(await takeBackStorePurchase('stripe', { orderId: order })).toBeNull();
    expect(await goldOf(id)).toBe(0);
    const row = await db.query.storePurchases.findFirst({ where: eq(storePurchases.orderId, order) });
    expect(row?.refundedAt).toBeInstanceOf(Date);
  });

  it('goes below zero when the gold was already spent', async () => {
    const id = await player(0);
    const order = `pi_${randomUUID()}`;
    await buy(id, order);
    await db.update(players).set({ gold: 50 }).where(eq(players.id, id));
    await takeBackStorePurchase('stripe', { orderId: order });
    expect(await goldOf(id)).toBe(-500);
  });

  it('ignores a payment this base never credited, or another store', async () => {
    const id = await player(0);
    const order = `pi_${randomUUID()}`;
    await buy(id, order);
    expect(await takeBackStorePurchase('stripe', { orderId: `pi_${randomUUID()}` })).toBeNull();
    expect(await takeBackStorePurchase('play', { orderId: order })).toBeNull();
    expect(await goldOf(id)).toBe(550);
  });
});
