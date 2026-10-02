/** Local DB integration: actual routes/transactions, a mocked chain, no transfer.
 * RR_SKIN_DB_TEST=1 bun run test -- test/skins-payment.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { Keypair, PublicKey } from '@solana/web3.js';

const chain = vi.hoisted(() => ({ valid: true }));
vi.mock('@/lib/pay/solana', () => ({
  payEnabled: () => true,
  treasuryAddress: () => new PublicKey('11111111111111111111111111111111'),
  mintFor: () => new PublicKey('11111111111111111111111111111111'),
  verifyPayment: vi.fn(async () => chain.valid ? { ok: true } : { ok: false, reason: 'wrong_amount' }),
  treasurySignatures: vi.fn(async () => []),
  findPaidSignature: vi.fn(async () => null),
  buildPaymentTx: vi.fn(),
  cluster: async () => 'devnet',
}));
vi.mock('@/lib/pay/rates', () => ({ usdPriceFor: async () => 1 }));
vi.mock('@/lib/rate-limit', () => ({ overLimit: async () => false, tooMany: vi.fn() }));
vi.mock('@/app/api/shop/route', () => ({ shopState: async () => ({ stock: 0 }) }));
vi.mock('@/lib/pay/tokens', async (original) => ({
  ...await original<typeof import('@/lib/pay/tokens')>(), enabledTokens: () => ['usdc'],
}));

import { db } from '@/lib/db';
import { inventory, payments, players, playerSkins, purchases } from '@/lib/db/schema';
import { signSession } from '@/lib/auth/jwt';
import { POST as quote, PATCH as confirm, claimUnfinishedPayments } from '@/app/api/shop/pay/route';
import { PATCH as equip } from '@/app/api/player/route';
import { GET as catalog } from '@/app/api/skins/route';
import { playerLook } from '@/lib/game/look';

const enabled = process.env.RR_SKIN_DB_TEST === '1';
const id = `test:skin:${randomUUID()}`;
let token: string;
let guest: string;
let created = false;
function req(body: unknown, method = 'POST', jwt = token) {
  return new Request('http://localhost/api/skins-test', {
    method, headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}

describe.skipIf(!enabled)('skin checkout, ownership and equipment (local DB)', () => {
  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL!).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Skin integration tests require a local database');
    const wallet = Keypair.generate().publicKey.toBase58();
    await db.insert(players).values({ id, wallet, name: 'SkinTest', avatar: 'white' });
    created = true;
    token = await signSession({ sub: id, wallet, name: 'SkinTest' });
    guest = await signSession({ sub: id, wallet: null, name: 'SkinTest' });
  });
  afterAll(async () => {
    if (created) await db.delete(players).where(eq(players.id, id));
  });

  it('requires authentication, ownership, one copy and a connected wallet', async () => {
    expect((await catalog(req({}, 'GET', 'invalid'))).status).toBe(401);
    const before = await (await catalog(req({}, 'GET'))).json();
    expect(before.skins[0]).toMatchObject({ key: 'solana', usdCents: 99, owned: false });
    expect((await equip(req({ skin: 'solana' }, 'PATCH'))).status).toBe(403);
    expect((await equip(req({ skin: 'invented' }, 'PATCH'))).status).toBe(400);
    expect((await quote(req({ kind: 'skin_solana' }, 'POST', guest))).status).toBe(403);
    for (const qty of [0, 2, -1]) expect((await quote(req({ kind: 'skin_solana', qty }))).status).toBe(400);
  });

  it('sets the server price and reserves only one outstanding checkout across concurrent requests', async () => {
    const responses = await Promise.all([0, 1].map(() => quote(req({ kind: 'skin_solana', usdc: 0.01, amount: 1 }))));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const paid = await responses.find((response) => response.status === 200)!.json();
    expect(paid).toMatchObject({ usdc: 0.99, amount: 990000 });
    chain.valid = false;
    expect((await confirm(req({ paymentId: paid.paymentId, signature: 'fake-wrong-amount' }, 'PATCH'))).status).toBe(400);
    expect(await db.select().from(playerSkins).where(eq(playerSkins.playerId, id))).toHaveLength(0);
  });

  it('grants only after verification and credits a replay/concurrent confirm exactly once', async () => {
    chain.valid = true;
    const intent = await (await quote(req({ kind: 'skin_solana' }))).json();
    const proofs = await Promise.all([0, 1].map(() => confirm(req({ paymentId: intent.paymentId, signature: `verified-${id}` }, 'PATCH'))));
    expect(proofs.map((response) => response.status)).toEqual([200, 200]);
    expect((await confirm(req({ paymentId: intent.paymentId, signature: `verified-${id}` }, 'PATCH'))).status).toBe(200);
    expect(await db.select().from(playerSkins).where(eq(playerSkins.playerId, id))).toHaveLength(1);
    const receipts = await db.select().from(purchases).where(eq(purchases.playerId, id));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ kind: 'skin_solana', qty: 1, cost: 990000, currency: 'usdc' });
    expect(await db.select().from(inventory).where(eq(inventory.playerId, id))).toHaveLength(0);
    expect(await (await quote(req({ kind: 'skin_solana' }))).json()).toMatchObject({ error: 'skin_owned' });
  });

  it('persists equipment and lets a player return to free fur without losing ownership', async () => {
    const worn = await (await equip(req({ skin: 'solana' }, 'PATCH'))).json();
    expect(worn.player).toMatchObject({ equippedSkin: 'solana', look: 'solana' });
    expect(await playerLook({ id, avatar: 'white' })).toBe('solana');
    expect(await (await catalog(req({}, 'GET'))).json()).toMatchObject({ owned: ['solana'], equipped: 'solana' });
    const free = await (await equip(req({ avatar: 'gray' }, 'PATCH'))).json();
    expect(free.player).toMatchObject({ equippedSkin: null, look: 'gray' });
    expect((await (await catalog(req({}, 'GET'))).json()).owned).toContain('solana');
  });

  it.each([
    { key: 'carrot', kind: 'skin_carrot', owned: ['carrot', 'solana'] },
  ] as const)('buys $key for 99 cents independently of the ticket', async ({ key, kind, owned }) => {
    expect((await equip(req({ skin: key }, 'PATCH'))).status).toBe(403);
    const offered = await (await catalog(req({}, 'GET'))).json();
    expect(offered.skins.find((skin: { key: string }) => skin.key === key))
      .toMatchObject({ usdCents: 99, owned: false });
    const intent = await (await quote(req({ kind, usdc: 0.01, amount: 1 }))).json();
    expect(intent).toMatchObject({ usdc: 0.99, amount: 990000 });
    expect((await confirm(req({ paymentId: intent.paymentId, signature: `${key}-${id}` }, 'PATCH'))).status).toBe(200);
    const wardrobe = await (await catalog(req({}, 'GET'))).json();
    expect(wardrobe.owned.sort()).toEqual([...owned]);
    expect(wardrobe.owned).not.toContain('kuro-violet');
    const worn = await (await equip(req({ skin: key }, 'PATCH'))).json();
    expect(worn.player).toMatchObject({ equippedSkin: key, look: key });
    expect(await (await quote(req({ kind }))).json()).toMatchObject({ error: 'skin_owned' });
    const receipts = await db.select().from(purchases)
      .where(and(eq(purchases.playerId, id), eq(purchases.kind, kind)));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ qty: 1, cost: 990000, currency: 'usdc' });
  });

  it('releases an expired unpaid reservation via recovery', async () => {
    // A different player keeps this independent of the owned-skin guard.
    const other = `${id}:unpaid`;
    await db.insert(players).values({ id: other, name: 'Unpaid' });
    try {
      await db.insert(payments).values({ playerId: other, kind: 'skin_solana', amount: 990000,
        treasury: '11111111111111111111111111111111', reference: randomUUID(),
        purchaseKey: JSON.stringify([other, 'skin_solana']), expiresAt: new Date(Date.now() - 1000) });
      expect(await claimUnfinishedPayments(other)).toEqual([]);
      expect(await db.select().from(payments).where(and(eq(payments.playerId, other), eq(payments.status, 'pending')))).toHaveLength(0);
    } finally {
      await db.delete(players).where(eq(players.id, other));
    }
  });
});
