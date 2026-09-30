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
import {
  type ConfirmedSignatureInfo, Connection, PublicKey, SystemProgram, Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { USDC } from '@config/tuning';
import { mintAddressFor, type PayTokenId } from './tokens';

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
  // No retry on a 429. web3.js otherwise backs off 0.5 → 4 s and tries again,
  // INSIDE the request: a rate-limited sweep held GET /api/shop past the
  // client's patience and the shop never opened (2026-09-30, first day on
  // mainnet). Every caller here already treats an RPC failure as "don't know
  // yet" and lets the next visit try again.
  if (!_connection) {
    _connection = new Connection(url, {
      commitment: USDC.COMMITMENT,
      disableRetryOnRateLimit: true,
    });
  }
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

export type PaymentCheck = {
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
};

export async function verifyPayment(opts: PaymentCheck & { signature: string }): Promise<VerifyResult> {
  return checkPayment(await readTransaction(opts.signature), opts);
}

/** The transaction behind a signature, or null when it has not landed, does
 *  not exist, or the RPC could not say — all three mean "not yet". */
export async function readTransaction(signature: string): Promise<ChainTx | null> {
  // The RPC THROWS on a malformed signature rather than returning null, and a
  // signature is a client-supplied string — so an unhandled throw here is a 500
  // on the payment route for anyone who sends junk. A signature the chain will
  // not even look up is, for our purposes, a transaction that does not exist.
  try {
    return await connection().getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    // An RPC that is down or rate-limiting is NOT the same as a bad signature:
    // reporting it as 'not_found' tells the caller to retry, which is right,
    // and never marks a real payment failed.
    console.warn('[pay] getTransaction failed', err);
    return null;
  }
}
type ChainTx = NonNullable<Awaited<ReturnType<Connection['getTransaction']>>>;

/**
 * Does this transaction pay this quote? No RPC: a caller holding one
 * transaction and many open quotes (the webhook) reads the chain once.
 */
export function checkPayment(tx: ChainTx | null, opts: PaymentCheck): VerifyResult {
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
 * The treasury's latest signatures, or null when the RPC could not say.
 *
 * An RPC that is down says nothing about whether the player paid: callers give
 * up quietly and let the next visit try again — never mark a quote failed on
 * the strength of a network error.
 */
export async function treasurySignatures(
  treasury: PublicKey,
  limit = 40,
): Promise<ConfirmedSignatureInfo[] | null> {
  try {
    return await connection().getSignaturesForAddress(treasury, { limit });
  } catch (err) {
    console.warn('[pay] getSignaturesForAddress failed', err);
    return null;
  }
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
  /** The treasury's listing, already read — a sweep over several quotes reads
   *  it once for all of them rather than once each. */
  listing?: ConfirmedSignatureInfo[] | null;
}): Promise<string | null> {
  const signatures = opts.listing !== undefined
    ? opts.listing
    : await treasurySignatures(opts.treasury, opts.limit);
  if (!signatures) return null;

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

/**
 * The mint for a token as a `PublicKey`, or null when it is not configured.
 *
 * The SERVER's half of `mintAddressFor` — that one lives in `./tokens`, which
 * is shared with the client and therefore must not import the Solana SDK. The
 * address is validated there; this only parses it into the object the chain
 * calls want. Kept here because this module is already server-only (the API
 * routes are its only importers), so the SDK stays out of the browser bundle.
 */
export function mintFor(id: PayTokenId): PublicKey | null {
  const raw = mintAddressFor(id);
  return raw ? new PublicKey(raw) : null;
}

/**
 * THE NETWORK, named by its genesis hash rather than guessed from the RPC URL.
 *
 * A native wallet (the Seeker's Seed Vault, through Mobile Wallet Adapter) is
 * told which chain to send on. Told the wrong one, it submits a devnet
 * transaction to mainnet — the blockhash is unknown there and the payment dies
 * after the player has already approved it. The genesis hash cannot lie about
 * which chain the treasury is on; a hostname can.
 */
export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet';
const GENESIS: Record<string, SolanaCluster> = {
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d': 'mainnet-beta',
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG: 'devnet',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY': 'testnet',
};
let _cluster: Promise<SolanaCluster> | null = null;
export function cluster(): Promise<SolanaCluster> {
  _cluster ??= connection().getGenesisHash()
    .then((hash) => GENESIS[hash] ?? 'mainnet-beta')
    .catch((err: unknown) => {
      // Not cached: the next quote asks again rather than living with a guess.
      _cluster = null;
      throw err;
    });
  return _cluster;
}

/** Why a transfer could not be built — each one a sentence the player can act on. */
export type BuildFailure = 'insufficient_funds' | 'no_token_account';

/**
 * THE TRANSFER, BUILT HERE, for clients that carry no Solana SDK.
 *
 * The browser build of the shop assembles this itself (use-usdc-pay.ts). The
 * Godot client cannot: GDScript has no web3.js, and the Seeker's wallet only
 * wants bytes to sign and send. So the server writes the exact same
 * transaction — system transfer or checked SPL transfer, the treasury's token
 * account created if it is missing, the reference in the memo — and hands it
 * back unsigned, with the player's wallet as fee payer.
 *
 * Nothing here is trusted later. The confirm step reads the chain exactly as
 * it does for a browser payment, so a client that swaps these bytes for
 * something else simply is not credited.
 */
export async function buildPaymentTx(opts: {
  payer: PublicKey;
  treasury: PublicKey;
  /** Null for native SOL. */
  mint: PublicKey | null;
  amount: number;
  decimals: number;
  reference: string;
}): Promise<{ ok: true; tx: string } | { ok: false; reason: BuildFailure }> {
  const conn = connection();
  const tx = new Transaction();

  if (opts.mint === null) {
    const lamports = await conn.getBalance(opts.payer);
    // The fee rides on top of the price; 10k lamports covers it with room.
    if (lamports < opts.amount + 10_000) return { ok: false, reason: 'insufficient_funds' };
    tx.add(SystemProgram.transfer({
      fromPubkey: opts.payer,
      toPubkey: opts.treasury,
      lamports: opts.amount,
    }));
  } else {
    // The token program is read off the mint rather than assumed: a Token-2022
    // mint has its accounts at different addresses, and a transfer built for
    // the classic program would point at accounts that do not exist.
    const mintInfo = await conn.getAccountInfo(opts.mint);
    const program = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
    const from = getAssociatedTokenAddressSync(opts.mint, opts.payer, false, program);
    const to = getAssociatedTokenAddressSync(opts.mint, opts.treasury, true, program);

    try {
      const account = await getAccount(conn, from, 'confirmed', program);
      if (account.amount < BigInt(opts.amount)) return { ok: false, reason: 'insufficient_funds' };
    } catch {
      return { ok: false, reason: 'no_token_account' };
    }

    // Created by the first payer if the treasury has never held this token —
    // the same one-off rent the browser path pays.
    if (!(await conn.getAccountInfo(to))) {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(
        opts.payer, to, opts.treasury, opts.mint, program,
      ));
    }
    tx.add(createTransferCheckedInstruction(
      from, opts.mint, to, opts.payer, BigInt(opts.amount), opts.decimals, [], program,
    ));
  }

  // The reference binds this transfer to its quote — see verifyPayment.
  tx.add(new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM,
    data: Buffer.from(opts.reference, 'utf8'),
  }));

  tx.feePayer = opts.payer;
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
  return {
    ok: true,
    tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
  };
}

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
