/**
 * What a USDC payment has to prove before anything is credited.
 *
 * These are the checks that stand between the shop and free items, so each
 * test here is a specific way of getting paid for nothing:
 *  - a transfer to the wrong address;
 *  - a transfer of the wrong TOKEN (any SPL mint can call itself "USDC" —
 *    the mint address is the only real name);
 *  - a transfer of less than was quoted;
 *  - somebody else's transfer, replayed against your own quote.
 *
 * The RPC is stubbed: what is under test is the decision made about a
 * transaction, not Solana's ability to return one.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const TREASURY = new PublicKey('11111111111111111111111111111112');
const MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const OTHER = new PublicKey('So11111111111111111111111111111111111111112');
const REFERENCE = 'e9a1f0c2-0000-4000-8000-000000000001';

/** The transaction the stubbed RPC will return. */
let transaction: unknown = null;

vi.mock('@solana/web3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...actual,
    Connection: class {
      getTransaction() {
        // A thrown RPC is modelled too: web3.js throws on a malformed
        // signature rather than returning null, and `transaction` set to an
        // Error is how a test asks for that.
        if (transaction instanceof Error) return Promise.reject(transaction);
        return Promise.resolve(transaction);
      }
    },
  };
});

/** A landed transaction moving `amount` of `mint` to `owner`. */
function tx(opts: {
  owner?: string; mint?: string; before?: number; after?: number;
  reference?: string; err?: unknown;
}) {
  const owner = opts.owner ?? TREASURY.toBase58();
  const mint = opts.mint ?? MINT.toBase58();
  const balance = (amount: number) => [{
    owner, mint, uiTokenAmount: { amount: String(amount) },
  }];
  return {
    meta: {
      err: opts.err ?? null,
      logMessages: [`Program log: Memo (len 36): "${opts.reference ?? REFERENCE}"`],
      preTokenBalances: balance(opts.before ?? 0),
      postTokenBalances: balance(opts.after ?? 0),
    },
  };
}

const { verifyPayment } = await import('../src/lib/pay/solana');

const verify = (amount = 400_000) =>
  verifyPayment({ signature: 'sig', treasury: TREASURY, mint: MINT, amount, reference: REFERENCE });

beforeEach(() => {
  process.env.SOLANA_RPC_URL = 'http://localhost:8899';
  transaction = null;
});

describe('verifyPayment', () => {
  it('accepts a transfer of the quoted amount to the treasury', async () => {
    transaction = tx({ before: 0, after: 400_000 });
    await expect(verify()).resolves.toEqual({ ok: true, received: 400_000 });
  });

  it('accepts an overpayment', async () => {
    // Refusing money somebody actually sent is the worse failure.
    transaction = tx({ before: 0, after: 500_000 });
    await expect(verify()).resolves.toMatchObject({ ok: true });
  });

  it('refuses an underpayment', async () => {
    transaction = tx({ before: 0, after: 399_999 });
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'no_matching_transfer' });
  });

  it('refuses a transfer to somebody else', async () => {
    transaction = tx({ owner: OTHER.toBase58(), before: 0, after: 400_000 });
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'no_matching_transfer' });
  });

  it('refuses a transfer of a different token', async () => {
    // The attack this stops: mint a worthless SPL token, name it USDC, send
    // 0.40 of it. Only the mint ADDRESS distinguishes them.
    transaction = tx({ mint: OTHER.toBase58(), before: 0, after: 400_000 });
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'no_matching_transfer' });
  });

  it("refuses a transaction that does not carry this quote's reference", async () => {
    // Somebody else's real payment, replayed against your own quote.
    transaction = tx({ before: 0, after: 400_000, reference: 'a-different-quote' });
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'wrong_reference' });
  });

  it('refuses a transaction that landed but reverted', async () => {
    transaction = tx({ before: 0, after: 400_000, err: { InstructionError: [0, 'Custom'] } });
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'failed_on_chain' });
  });

  it('reports a missing transaction as not-found rather than as a failure', async () => {
    // "Not landed YET" and "never existed" look identical here, so the caller
    // must be told to retry — marking the intent failed would burn a real
    // payment that was merely slow.
    transaction = null;
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('survives an RPC that throws on a junk signature', async () => {
    // web3.js throws rather than returning null for a signature the chain will
    // not even parse — and `signature` comes straight off the wire, so an
    // unhandled throw is a 500 on the payment route for anyone sending junk.
    transaction = new Error('failed to get transaction: Invalid param: Invalid');
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('treats an unreachable RPC as not-found rather than as a bad payment', async () => {
    // An RPC that is down or rate-limiting says NOTHING about the transaction.
    // Reporting it as a failure would mark a real payment failed and keep the
    // money; 'not_found' tells the caller to retry.
    transaction = new Error('fetch failed');
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('measures the DELTA, not the ending balance', async () => {
    // A treasury that already held USDC would otherwise verify any transaction
    // at all, since its post balance is large regardless of this transfer.
    transaction = tx({ before: 10_000_000, after: 10_000_000 });
    await expect(verify()).resolves.toEqual({ ok: false, reason: 'no_matching_transfer' });

    transaction = tx({ before: 10_000_000, after: 10_400_000 });
    await expect(verify()).resolves.toMatchObject({ ok: true, received: 400_000 });
  });
});
