/**
 * The USDC rail: quoting a payment, and proving one happened.
 *
 * The shape is deliberately the boring one. A dApp cannot move a player's money
 * — only their wallet can — so the game does not "take" a payment, it QUOTES a
 * price, waits for the player's wallet to sign a transfer, and then reads the
 * chain to find out whether that transfer really happened. The chain is the
 * source of truth; the client reports a signature and is believed about
 * nothing else.
 *
 * What `verifyPayment` is actually defending against, since each check below
 * exists for one of these:
 *  - a made-up signature, or one from an unrelated transaction;
 *  - a real transfer of the right amount to the WRONG address;
 *  - a real transfer of the right amount in the WRONG token (any SPL mint can
 *    be called "USDC" by its creator — the mint address is the only real name);
 *  - a real transfer of LESS than was quoted;
 *  - somebody else's transfer, replayed to credit your own account;
 *  - the same transfer redeemed twice (that one is caught by the unique index
 *    on `payments.signature`, not here — see the schema).
 *
 * A note on what is NOT checked: the SENDER is not required to be the player's
 * own wallet. Someone paying for a friend is a real thing people do, and the
 * reference in the memo already binds the transfer to one specific quote, which
 * is what stops a stranger's transaction being claimed.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { USDC } from '@config/tuning';

/**
 * The treasury and the mint come from the environment, never from source.
 *
 * A hardcoded mainnet address in a repo is how a test build takes real money,
 * and how a rotated treasury keeps paying into a wallet nobody controls any
 * more. Absent config disables the money route entirely rather than falling
 * back to a default — a default here is a wrong default.
 */
export function treasuryAddress(): PublicKey | null {
  const raw = process.env.USDC_TREASURY_ADDRESS;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    console.error('[pay] USDC_TREASURY_ADDRESS is not a valid public key');
    return null;
  }
}

/** The USDC mint for whichever network this deployment points at. */
export function usdcMint(): PublicKey | null {
  const raw = process.env.USDC_MINT;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    console.error('[pay] USDC_MINT is not a valid public key');
    return null;
  }
}

export function rpcUrl(): string | null {
  return process.env.SOLANA_RPC_URL ?? null;
}

/** Is the money route configured at all? */
export function payEnabled(): boolean {
  return treasuryAddress() !== null && usdcMint() !== null && rpcUrl() !== null;
}

let _connection: Connection | null = null;
export function connection(): Connection {
  const url = rpcUrl();
  if (!url) throw new Error('SOLANA_RPC_URL must be set to take payments');
  if (!_connection) _connection = new Connection(url, USDC.COMMITMENT);
  return _connection;
}

export type VerifyFailure =
  | 'not_found'
  | 'failed_on_chain'
  | 'wrong_reference'
  | 'no_matching_transfer';

export interface VerifyOk {
  ok: true;
  /** Base units actually received by the treasury in this transaction. */
  received: number;
}
export type VerifyResult = VerifyOk | { ok: false; reason: VerifyFailure };

/**
 * Did `signature` really pay `amount` base units of USDC to the treasury, for
 * this quote?
 *
 * Reads the transaction's TOKEN BALANCE DELTAS rather than trying to decode
 * instructions. The deltas are the post-execution truth: they account for a
 * transfer wrapped in any number of instructions, routed through a program, or
 * batched with unrelated ones, and they cannot be faked by an instruction that
 * looks like a transfer but reverts. Decoding instructions would have to
 * anticipate every shape a wallet might send.
 */
/**
 * Lamports the treasury gained, read off the account index.
 *
 * `preBalances`/`postBalances` are positional — they line up with the
 * transaction's account keys — so the treasury has to be located by index
 * rather than by name. A transfer to an address that is not in the keys simply
 * is not in this transaction, which is exactly the answer we want.
 */
function nativeReceived(
  tx: NonNullable<Awaited<ReturnType<Connection['getTransaction']>>>,
  treasury: PublicKey,
): number {
  const keys = tx.transaction.message.getAccountKeys?.({
    accountKeysFromLookups: tx.meta?.loadedAddresses,
  });
  const list = keys ? [...keys.keySegments().flat()] : [];
  const i = list.findIndex((k) => k.equals(treasury));
  if (i < 0) return 0;
  const before = tx.meta?.preBalances?.[i] ?? 0;
  const after = tx.meta?.postBalances?.[i] ?? 0;
  return after - before;
}

/**
 * Token base units the treasury gained. Matched on OWNER and MINT rather than
 * on the token account address, so a treasury whose associated token account
 * did not exist yet (it is created by the first payment) is handled by the same
 * code path.
 */
function splReceived(
  tx: NonNullable<Awaited<ReturnType<Connection['getTransaction']>>>,
  treasury: PublicKey,
  mint: PublicKey,
): number {
  const pick = (rows: NonNullable<typeof tx.meta>['preTokenBalances']) =>
    (rows ?? [])
      .filter((b) => b.owner === treasury.toBase58() && b.mint === mint.toBase58())
      .reduce((n, b) => n + Number(b.uiTokenAmount.amount ?? 0), 0);
  return pick(tx.meta?.postTokenBalances) - pick(tx.meta?.preTokenBalances);
}

export async function verifyPayment(opts: {
  signature: string;
  treasury: PublicKey;
  /**
   * The SPL mint that must have moved, or null for NATIVE SOL.
   *
   * Null is not "any token" — it selects the lamport path. A native transfer
   * shows up in `preBalances`/`postBalances` and moves no token balance at all,
   * so reading token balances for it finds nothing and reading lamports for an
   * SPL transfer finds only the fee. The two are different ledgers.
   */
  mint: PublicKey | null;
  /** Base units the quote asked for, in THAT token's decimals. */
  amount: number;
  /** The quote's reference, expected in the transaction's memo. */
  reference: string;
}): Promise<VerifyResult> {
  // The RPC THROWS on a malformed signature rather than returning null, and a
  // signature is a client-supplied string — so an unhandled throw here is a 500
  // on the payment route for anyone who sends junk. A signature the chain will
  // not even look up is, for our purposes, a transaction that does not exist.
  let tx: Awaited<ReturnType<Connection['getTransaction']>>;
  try {
    tx = await connection().getTransaction(opts.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    // An RPC that is down or rate-limiting is NOT the same as a bad signature:
    // reporting it as 'not_found' tells the caller to retry, which is right,
    // and never marks a real payment failed.
    console.warn('[pay] getTransaction failed', err);
    return { ok: false, reason: 'not_found' };
  }

  // Not landed yet, or never existed. The caller retries; it is not a failure.
  if (!tx || !tx.meta) return { ok: false, reason: 'not_found' };
  // A transaction can land and still have reverted — its balances would be
  // unchanged, but saying so plainly beats reporting "no transfer found".
  if (tx.meta.err) return { ok: false, reason: 'failed_on_chain' };

  // The reference binds this transfer to ONE quote. Without it, any USDC
  // transfer to the treasury of the right size could be claimed by anyone who
  // saw it in the explorer, including a payment somebody else made.
  const logs = tx.meta.logMessages ?? [];
  const memoed = logs.some((l) => l.includes(opts.reference));
  if (!memoed) return { ok: false, reason: 'wrong_reference' };

  const received = opts.mint === null
    ? nativeReceived(tx, opts.treasury)
    : splReceived(tx, opts.treasury, opts.mint);

  // `>=` rather than `===`: a wallet may round up, and refusing money somebody
  // actually sent is the worse failure. Underpayment is refused.
  if (received < opts.amount) return { ok: false, reason: 'no_matching_transfer' };

  return { ok: true, received };
}

/**
 * Find a paid transaction for a quote the player never came back to confirm.
 *
 * The gap this closes: a player signs, the transfer lands, and they close the
 * tab before the confirm round-trip completes. Their money is on chain, the
 * intent stays `pending`, and nothing ever credits them. Polling from the
 * client cannot help — the client is gone.
 *
 * So the server does what the client would have done, from the other end. It
 * reads the treasury's recent signatures and looks for the one carrying this
 * quote's reference in its memo. A webhook would do the same job with less
 * searching, but it would put a third party inside the payment path for a case
 * that is rare and cheap to sweep up on the next visit.
 *
 * `limit` is deliberately modest. This runs when a player opens the shop, not
 * on a timer, and an unpaid quote is the common case — so the cost of looking
 * has to stay small even when there is nothing to find.
 */
export async function findPaidSignature(opts: {
  treasury: PublicKey;
  reference: string;
  /** Only look at transactions after the quote was issued. */
  since: Date;
  limit?: number;
}): Promise<string | null> {
  let signatures;
  try {
    signatures = await connection().getSignaturesForAddress(opts.treasury, {
      limit: opts.limit ?? 40,
    });
  } catch (err) {
    // An RPC that is down says nothing about whether the player paid. Give up
    // quietly and let the next visit try again — never mark a quote failed on
    // the strength of a network error.
    console.warn('[pay] getSignaturesForAddress failed', err);
    return null;
  }

  const floor = Math.floor(opts.since.getTime() / 1000);
  for (const entry of signatures) {
    // Older than the quote: it cannot be this payment, and everything after it
    // is older still.
    if (entry.blockTime && entry.blockTime < floor) break;
    if (entry.err) continue;
    // The memo rides on the signature listing, so the common case — none of
    // these is ours — costs no extra round trips at all.
    if (entry.memo?.includes(opts.reference)) return entry.signature;
  }
  return null;
}
