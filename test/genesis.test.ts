/** RR Genesis pieces: from the crown chest to the winner's wallet.
 *
 * The pure part always runs. The award and the sender run against the local
 * DB with a fake chain (no RPC, no SOL):
 *   RR_AUTH_DB_TEST=1 bun run test -- test/genesis.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import { db } from '@/lib/db';
import { genesisPieces, players, runs } from '@/lib/db/schema';
import { RABBIT_WALLET, isTransient, liveChain, rarityOf, type GenesisChain } from '@/lib/genesis/chain';
import { awardGenesis, genesisOpen, setGenesisChain, warmGenesis } from '@/lib/genesis/award';
import { sendPending } from '@/lib/genesis/send';

const addr = () => Keypair.generate().publicKey.toBase58();

describe('the game wallet', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('is the dedicated one, never the RR treasury', () => {
    expect(RABBIT_WALLET).toBe('8jv4N9KWwuG4ww8E8CqGz6A3eaheyUT4B6qsjoxsjqMy');
    expect(RABBIT_WALLET).not.toBe('FChwsKVeuDjgToaP5HHrk9u4oz1QiPbnJH1zzpbMKuHB');
  });

  it('follows the key, whatever GENESIS_WALLET_ADDRESS says', () => {
    const kp = Keypair.generate();
    process.env.GENESIS_RPC_URL = 'http://127.0.0.1:1';
    process.env.GENESIS_WALLET_SECRET_KEY = bs58.encode(kp.secretKey);
    process.env.GENESIS_WALLET_ADDRESS = addr();
    const c = liveChain()!;
    expect(c.wallet).toBe(kp.publicKey.toBase58());
    expect(c.canSend).toBe(true);
  });

  it('reads the default wallet and sends nothing without a key', () => {
    process.env.GENESIS_RPC_URL = 'http://127.0.0.1:1';
    delete process.env.GENESIS_WALLET_SECRET_KEY;
    delete process.env.GENESIS_WALLET_ADDRESS;
    const c = liveChain()!;
    expect(c.wallet).toBe(RABBIT_WALLET);
    expect(c.canSend).toBe(false);
  });

  it('is off without an RPC', () => {
    delete process.env.GENESIS_RPC_URL;
    delete process.env.SOLANA_RPC_URL;
    expect(liveChain()).toBeNull();
  });
});

describe('chain helpers', () => {
  it('reads the tier trait as the rarity', () => {
    expect(rarityOf([{ trait_type: 'Season', value: 'Genesis' }, { trait_type: 'Tier', value: 'Legendary ' }])).toBe('legendary');
    expect(rarityOf([{ trait_type: 'rarity', value: 'Rare' }])).toBe('rare');
    expect(rarityOf([{ trait_type: 'Hat', value: 'Crown' }])).toBeNull();
    expect(rarityOf(null)).toBeNull();
  });

  it('waits on throttling and empty wallets, gives up on nothing else', () => {
    for (const m of ['429 Too Many Requests', 'fetch failed', 'TransactionExpiredBlockheightExceededError: block height exceeded', 'insufficient lamports']) {
      expect(isTransient(new Error(m))).toBe(true);
    }
    expect(isTransient(new Error('Account does not exist'))).toBe(false);
  });
});

/** The chain as a map of asset -> owner. */
function fakeChain(wallet: string, assets: string[]) {
  const owners = new Map(assets.map((a) => [a, wallet]));
  const transfers: { asset: string; to: string }[] = [];
  let failNext: Error | null = null;
  const c: GenesisChain = {
    wallet,
    canSend: true,
    async stock() { return [...owners].filter(([, o]) => o === wallet).map(([a]) => a); },
    async ownerOf(a) {
      const o = owners.get(a);
      // A row this test did not write: leave it alone (transient = untouched).
      if (!o) throw new Error('timeout: not a test asset');
      return o;
    },
    async look(a) { return { name: `RR Genesis ${a.slice(0, 4)}`, imageUrl: null, rarity: 'rare' }; },
    async transfer(a, to) {
      if (failNext) { const e = failNext; failNext = null; throw e; }
      if (owners.get(a) !== wallet) throw new Error('not the owner');
      owners.set(a, to);
      transfers.push({ asset: a, to });
      return `sig-${a}`;
    },
  };
  return { c, owners, transfers, failOnce: (e: Error) => { failNext = e; } };
}

const enabled = process.env.RR_AUTH_DB_TEST === '1';

describe.skipIf(!enabled)('award and send (local DB, fake chain)', () => {
  const game = addr();
  const winner = { id: `guest:test:${randomUUID()}`, wallet: addr() };
  const guest = { id: `guest:test:${randomUUID()}` };
  let runId = '';
  let tile = 0;
  const nextTile = () => ++tile;
  const rowsOf = (id: string) => db.select().from(genesisPieces).where(eq(genesisPieces.playerId, id));
  // The sender works oldest first; ours are dated far back so a local DB's
  // own waiting rows never come before them.
  const age = (id: string) => db.update(genesisPieces).set({ wonAt: new Date('2000-01-01') }).where(eq(genesisPieces.id, id));

  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL!).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Genesis integration tests require a local database');
    await db.insert(players).values([{ id: winner.id, wallet: winner.wallet, name: 'GenesisWin' }, { id: guest.id, name: 'GenesisGuest' }]);
    const [r] = await db.insert(runs).values({ playerId: winner.id, islandSeed: 'test', islandTier: 'test' }).returning();
    runId = r.id;
  });
  afterAll(async () => {
    await db.delete(genesisPieces).where(inArray(genesisPieces.playerId, [winner.id, guest.id]));
    await db.delete(runs).where(eq(runs.playerId, winner.id));
    await db.delete(players).where(inArray(players.id, [winner.id, guest.id]));
    setGenesisChain(null);
  });

  let chain: ReturnType<typeof fakeChain>;
  beforeEach(async () => {
    chain = fakeChain(game, [addr(), addr(), addr()]);
    setGenesisChain(chain.c);
    await warmGenesis();
  });

  it('opens the crown chest only while the wallet holds a piece', async () => {
    expect(genesisOpen()).toBe(true);
    setGenesisChain(fakeChain(game, []).c);
    await warmGenesis();
    expect(genesisOpen()).toBe(false);
  });

  it('tells a guest what they missed, and keeps nothing for them', async () => {
    expect(await awardGenesis(guest.id, undefined, nextTile())).toEqual({ kind: 'missed' });
    expect(await rowsOf(guest.id)).toHaveLength(0);
  });

  it('gives a wallet player a real piece, once per tile even when the dig replays', async () => {
    const t = nextTile();
    const first = await awardGenesis(winner.id, runId, t);
    expect(first.kind).toBe('won');
    const piece = first.kind === 'won' ? first.piece : null;
    expect(chain.owners.has(piece!.assetId!)).toBe(true);
    expect(piece).toMatchObject({ status: 'sending', rarity: 'rare', name: expect.stringMatching(/^RR Genesis/) });

    const again = await awardGenesis(winner.id, runId, t);
    expect(again.kind === 'won' && again.piece.assetId).toBe(piece!.assetId);
    expect((await rowsOf(winner.id)).filter((r) => r.tile === t)).toHaveLength(1);
  });

  it('sends the piece to the winner and records the signature', async () => {
    const award = await awardGenesis(winner.id, runId, nextTile());
    const id = award.kind === 'won' ? award.piece.id : '';
    await age(id);
    await sendPending(50);
    const [row] = await db.select().from(genesisPieces).where(eq(genesisPieces.id, id));
    expect(row.status).toBe('sent');
    expect(row.signature).toBe(`sig-${row.assetId}`);
    expect(chain.owners.get(row.assetId!)).toBe(winner.wallet);
    expect(chain.transfers.filter((t) => t.asset === row.assetId)).toHaveLength(1);
  });

  it('never sends twice: a piece already in the wallet is just recorded', async () => {
    const award = await awardGenesis(winner.id, runId, nextTile());
    const id = award.kind === 'won' ? award.piece.id : '';
    const asset = award.kind === 'won' ? award.piece.assetId! : '';
    await age(id);
    chain.owners.set(asset, winner.wallet); // a run died after the transfer
    await sendPending(50);
    const [row] = await db.select().from(genesisPieces).where(eq(genesisPieces.id, id));
    expect(row.status).toBe('sent');
    expect(chain.transfers).toHaveLength(0);
  });

  it('gives another piece when this one left by another path', async () => {
    const award = await awardGenesis(winner.id, runId, nextTile());
    const id = award.kind === 'won' ? award.piece.id : '';
    const gone = award.kind === 'won' ? award.piece.assetId! : '';
    await age(id);
    chain.owners.set(gone, addr());
    await sendPending(50);
    const [row] = await db.select().from(genesisPieces).where(eq(genesisPieces.id, id));
    expect(row.assetId).not.toBe(gone);
    expect(row.assetId).not.toBeNull();
    await sendPending(50);
    const [sent] = await db.select().from(genesisPieces).where(eq(genesisPieces.id, id));
    expect(sent.status).toBe('sent');
    expect(chain.owners.get(sent.assetId!)).toBe(winner.wallet);
  });

  it('keeps a piece waiting through a throttled RPC, then sends it', async () => {
    const award = await awardGenesis(winner.id, runId, nextTile());
    const id = award.kind === 'won' ? award.piece.id : '';
    await age(id);
    chain.failOnce(new Error('429 Too Many Requests'));
    await sendPending(50);
    const [waiting] = await db.select().from(genesisPieces).where(eq(genesisPieces.id, id));
    expect(waiting.status).toBe('sending');
    expect(waiting.attempts).toBe(1);
    expect(waiting.lastError).toMatch(/429/);
    await sendPending(50);
    const [row] = await db.select().from(genesisPieces).where(eq(genesisPieces.id, id));
    expect(row.status).toBe('sent');
  });

  it('holds every piece without a key, and sends nothing', async () => {
    const award = await awardGenesis(winner.id, runId, nextTile());
    const id = award.kind === 'won' ? award.piece.id : '';
    await age(id);
    setGenesisChain({ ...chain.c, canSend: false });
    const out = await sendPending(50);
    expect(out.waiting).toBeGreaterThan(0);
    const [row] = await db.select().from(genesisPieces).where(eq(genesisPieces.id, id));
    expect(row.status).toBe('sending');
    expect(chain.transfers).toHaveLength(0);
  });

  it('promises nothing once the wallet is empty', async () => {
    setGenesisChain(fakeChain(game, []).c);
    await warmGenesis();
    expect(await awardGenesis(winner.id, runId, nextTile())).toEqual({ kind: 'none' });
  });
});
