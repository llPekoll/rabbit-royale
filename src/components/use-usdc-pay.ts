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
 * ON CONVERSION: a dApp cannot make Phantom swap SOL (or SKR) into USDC — that
 * is a manual action inside the wallet. So if the player holds no USDC, the
 * transfer will fail to build and they are told, in those words, to swap in
 * their wallet first. Pretending otherwise would produce a button that silently
 * does nothing for anybody without a USDC balance.
 */
import { useCallback, useState } from 'react';
import {
  Connection, PublicKey, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { isNative } from './native-bridge';

/** The memo program — where the reference goes, so the server can match the
 *  transfer to the quote it issued. */
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface Quote {
  paymentId: string;
  treasury: string;
  mint: string;
  amount: number;
  decimals: number;
  usdc: number;
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

export function useUsdcPay(token: string | null, rpcUrl: string | null) {
  const [stage, setStage] = useState<PayStage>('idle');
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(async (kind: string, qty = 1) => {
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
    if (!rpcUrl) {
      setError('Payments are not configured on this server.');
      return null;
    }

    try {
      setStage('quoting');
      const quote: Quote & { error?: string } = await fetch('/api/shop/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, qty }),
      }).then((r) => r.json());
      if (quote.error) throw new Error(quote.error);

      const { publicKey } = await wallet.connect();
      const payer = new PublicKey(publicKey.toString());
      const mint = new PublicKey(quote.mint);
      const treasury = new PublicKey(quote.treasury);
      const connection = new Connection(rpcUrl, 'confirmed');

      const from = await getAssociatedTokenAddress(mint, payer);
      const to = await getAssociatedTokenAddress(mint, treasury);

      // No USDC account at all means no USDC — the wallet has nothing to send,
      // and this is where the "swap first" advice belongs.
      try {
        const account = await getAccount(connection, from);
        if (Number(account.amount) < quote.amount) {
          throw new Error(
            `Not enough USDC - this costs $${quote.usdc.toFixed(2)}. Swap some SOL for USDC in your wallet first.`,
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Not enough USDC')) throw e;
        throw new Error('No USDC in this wallet. Swap some SOL for USDC in your wallet first.');
      }

      const tx = new Transaction();

      // The treasury's token account may not exist yet — the first payment
      // creates it, paid for by that first payer. A few thousand lamports once,
      // rather than a deployment step that gets forgotten.
      try {
        await getAccount(connection, to);
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(payer, to, treasury, mint));
      }

      tx.add(
        createTransferCheckedInstruction(from, mint, to, payer, quote.amount, quote.decimals),
      );
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
  }, [token, rpcUrl]);

  return { pay, stage, error, setError };
}
