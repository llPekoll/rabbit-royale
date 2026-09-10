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
export async function verifyPayment(opts: {
  signature: string;
  treasury: PublicKey;
  mint: PublicKey;
  /** Base units the quote asked for. */
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

  // What the treasury's USDC account held before and after. Matched on OWNER
  // and MINT rather than on the token account address, so a treasury whose
  // associated token account did not exist yet (it is created by the first
  // payment) is handled by the same code path.
  const before = (tx.meta.preTokenBalances ?? []).filter(
    (b) => b.owner === opts.treasury.toBase58() && b.mint === opts.mint.toBase58(),
  );
  const after = (tx.meta.postTokenBalances ?? []).filter(
    (b) => b.owner === opts.treasury.toBase58() && b.mint === opts.mint.toBase58(),
  );

  const sum = (rows: typeof before) =>
    rows.reduce((n, b) => n + Number(b.uiTokenAmount.amount ?? 0), 0);
  const received = sum(after) - sum(before);

  // `>=` rather than `===`: a wallet may round up, and refusing money somebody
  // actually sent is the worse failure. Underpayment is refused.
  if (received < opts.amount) return { ok: false, reason: 'no_matching_transfer' };

  return { ok: true, received };
}
