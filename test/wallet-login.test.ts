/** Local DB integration: a guest who linked a wallet signs back in with it.
 * RR_AUTH_DB_TEST=1 bun run test -- test/wallet-login.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, or } from 'drizzle-orm';
import { Keypair } from '@solana/web3.js';

import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { resolveWalletPlayer } from '@/lib/auth/wallet-login';

const enabled = process.env.RR_AUTH_DB_TEST === '1';
const id = `guest:test:${randomUUID()}`;
const wallet = Keypair.generate().publicKey.toBase58();

describe.skipIf(!enabled)('wallet sign-in after a guest link (local DB)', () => {
  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL!).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Auth integration tests require a local database');
    // What /api/auth/link leaves behind: the guest id, now holding a wallet.
    await db.insert(players).values({ id, wallet, name: 'LinkTest' });
  });
  afterAll(async () => {
    await db.delete(players).where(or(eq(players.id, id), eq(players.id, `sol:${wallet}`)));
  });

  it('finds the linked guest burrow instead of minting a sol: one', async () => {
    expect(await resolveWalletPlayer(wallet)).toBe(id);
    expect(await db.query.players.findFirst({ where: eq(players.id, `sol:${wallet}`) })).toBeUndefined();
  });
});
