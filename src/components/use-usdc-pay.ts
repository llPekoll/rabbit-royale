'use client';

/**
 * Paying for something with USDC.
 *
 * Three steps, and the middle one is the player's, not ours:
 *   1. ask the server to QUOTE the purchase — it returns an amount, a treasury
 *      address and a reference;
 *   2. build an SPL transfer for exactly that, and hand it to the wallet to
 *      sign and send;
 *   3. give the server the signature so it can read the chain and credit the
 *      item.
 *
 * The game never touches the money. It states a price and then verifies that
 * the price was paid — which is why step 3 exists at all: what the wallet tells
 * this hook is a claim, and only the server's own look at the chain makes it a
 * purchase.
 *
 * THREE RAILS, ONE PRICE. An item costs a dollar amount; the token is only how
 * that dollar travels. The server quotes the rail, freezes the rate and states
 * the exact base units — this hook never prices anything, it only moves what it
 * was told to move.
 *
 * The two rails are genuinely different transactions: native SOL is a system
 * transfer of lamports, and USDC/SKR are SPL token transfers between token
 * accounts. That is why `mint` is nullable and why the branch below exists.
 *
 * It replaces a dead end. A dApp cannot make a wallet swap on the player's
 * behalf without their signature, so a USDC-only shop had nothing to offer a
 * player holding SOL beyond "go swap, then come back" — which most of them
 * simply did not do.
 */
import { useCallback, useState } from 'react';
import {
  Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { isNative } from './native-bridge';
import { PAY_TOKENS, type PayTokenId } from '@/lib/pay/tokens';

/** The memo program — where the reference goes, so the server can match the
 *  transfer to the quote it issued. */
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface Quote {
  paymentId: string;
  treasury: string;
  /** Which rail the server quoted. */
  token: PayTokenId;
  /** Null for native SOL: there is no token account, only lamports. */
  mint: string | null;
  amount: number;
  decimals: number;
  /** The dollar price — unchanged by the rail. */
  usdc: number;
  /** What that costs in the chosen token, for the message the player reads. */
  tokenAmount: number;
  symbol: string;
  reference: string;
  expiresAt: string;
}

/** A browser wallet that can sign and send, which sign-in did not require. */
interface PayingWallet {
  publicKey: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
}

export type PayStage = 'idle' | 'quoting' | 'signing' | 'confirming' | 'done';

/**
 * The relay, not Alchemy.
 *
 * The wallet has to make RPC calls to build a transfer, so something must be
 * reachable from the browser — but it is this deployment's own endpoint rather
 * than the provider's, which is what keeps the API key server-side. See
 * app/api/rpc.
 */
const RPC_RELAY = '/api/rpc';

export function useUsdcPay(token: string | null, enabled: boolean) {
  const [stage, setStage] = useState<PayStage>('idle');
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(async (kind: string, qty = 1, rail: PayTokenId = 'usdc') => {
    setError(null);
    if (!token) return null;

    // The Seeker's bridge signs MESSAGES (that is all sign-in needed) and has
    // no transaction path yet. Saying so beats a button that fails obscurely on
    // the one device this game is actually aimed at.
    if (isNative()) {
      setError('Paying in the app needs the next build. Buy with carrots for now.');
      return null;
    }

    const wallet = (window as unknown as { solana?: PayingWallet }).solana;
    if (!wallet) {
      setError('No Solana wallet found. Install Phantom to pay with USDC.');
      return null;
    }
    if (!enabled) {
      setError('Payments are not configured on this server.');
      return null;
    }

    try {
      setStage('quoting');
      const quote: Quote & { error?: string } = await fetch('/api/shop/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, qty, token: rail }),
      }).then((r) => r.json());
      if (quote.error) throw new Error(quote.error);

      const { publicKey } = await wallet.connect();
      const payer = new PublicKey(publicKey.toString());
      // No mint here on purpose: native SOL has none, and the SPL branch below
      // derives its own from the quote.
      const treasury = new PublicKey(quote.treasury);
      // The relay needs the session, and web3.js has no way to add a header —
      // so the token rides in the URL. It is this game's own endpoint and the
      // token is already in the client's hands, so nothing new is exposed.
      const connection = new Connection(
        `${window.location.origin}${RPC_RELAY}?t=${encodeURIComponent(token)}`,
        'confirmed',
      );

      const tx = new Transaction();
      const meta = PAY_TOKENS[quote.token];
      const short = (n: number) => n.toFixed(meta.displayDecimals);

      if (quote.mint === null) {
        // NATIVE SOL: lamports move between the accounts themselves, so there
        // is no token account to look up and none to create.
        const balance = await connection.getBalance(payer);
        // Leave room for the fee: spending the balance to the last lamport
        // produces a transaction that cannot pay for itself, and the wallet
        // rejects it with an error the player cannot act on.
        const FEE_HEADROOM = 5_000;
        if (balance < quote.amount + FEE_HEADROOM) {
          throw new Error(
            `Not enough SOL - this costs ${short(quote.tokenAmount)} SOL ($${quote.usdc.toFixed(2)}).`,
          );
        }
        tx.add(SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: treasury,
          lamports: quote.amount,
        }));
      } else {
        const mint = new PublicKey(quote.mint);
        const from = await getAssociatedTokenAddress(mint, payer);
        const to = await getAssociatedTokenAddress(mint, treasury);

        // No token account at all means none of that token — the wallet has
        // nothing to send. Now that the shop takes three rails, the advice is
        // to pick another one rather than to go swapping.
        try {
          const account = await getAccount(connection, from);
          if (Number(account.amount) < quote.amount) {
            throw new Error(
              `Not enough ${meta.symbol} - this costs ${short(quote.tokenAmount)} ${meta.symbol} ($${quote.usdc.toFixed(2)}).`,
            );
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('Not enough')) throw e;
          throw new Error(`No ${meta.symbol} in this wallet. Try another currency.`);
        }

        // The treasury's token account may not exist yet — the first payment
        // creates it, paid for by that first payer. A few thousand lamports
        // once, rather than a deployment step that gets forgotten.
        try {
          await getAccount(connection, to);
        } catch {
          tx.add(createAssociatedTokenAccountInstruction(payer, to, treasury, mint));
        }

        tx.add(
          createTransferCheckedInstruction(from, mint, to, payer, quote.amount, quote.decimals),
        );
      }
      // The reference, in the memo. This is what binds the transfer to THIS
      // quote — without it, any transfer of the right size to the treasury
      // could be claimed by whoever saw it in an explorer.
      tx.add(new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM,
        data: Buffer.from(quote.reference, 'utf8'),
      }));

      tx.feePayer = payer;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      setStage('signing');
      const { signature } = await wallet.signAndSendTransaction(tx);

      setStage('confirming');
      // The server may look before the transaction has landed, so a 202 means
      // "not yet" rather than "no". Retried a few times, then handed back to
      // the player rather than spun on forever.
      for (let attempt = 0; attempt < 12; attempt++) {
        const res = await fetch('/api/shop/pay', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ paymentId: quote.paymentId, signature }),
        }).then((r) => r.json());

        if (!res.error) {
          setStage('done');
          return res;
        }
        if (!res.retry) throw new Error(res.error);
        await new Promise((r) => setTimeout(r, 2500));
      }
      throw new Error(
        'Paid, but still confirming. Reopen the shop in a minute. Nothing is lost.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed');
      return null;
    } finally {
      setStage((s) => (s === 'done' ? 'done' : 'idle'));
    }
  }, [token, enabled]);

  return { pay, stage, error, setError };
}
