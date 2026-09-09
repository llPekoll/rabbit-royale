'use client';

/**
 * Wallet sign-in, client side.
 *
 * Two transports behind one hook:
 *  - the Seeker / Android wrapper injects `window.rrWallet` (Mobile Wallet
 *    Adapter, Seed Vault) — this is the primary target;
 *  - a desktop browser wallet exposes `window.solana` (Phantom et al).
 *
 * Both do the same thing: sign the server's challenge. The server never sees a
 * key, only a signature over a nonce it minted.
 */
import { useCallback, useEffect, useState } from 'react';
import bs58 from 'bs58';

export interface Player {
  id: string;
  name: string;
  wallet: string;
}

interface InjectedWallet {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(msg: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
}

declare global {
  interface Window {
    /** Injected by the Android wrapper — Mobile Wallet Adapter over the bridge. */
    rrWallet?: InjectedWallet;
    solana?: InjectedWallet;
  }
}

const TOKEN_KEY = 'rr_token';

export function useWalletLogin() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a previous session before deciding to show a login button — the
  // token is what the WS handshake needs, so it is kept where JS can read it.
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    setToken(saved);
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${saved}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.player && setPlayer({ id: d.player.id, name: d.player.name, wallet: d.player.wallet }))
      .catch(() => localStorage.removeItem(TOKEN_KEY));
  }, []);

  const login = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const wallet = window.rrWallet ?? window.solana;
      if (!wallet) throw new Error('No wallet found. Open in the Seeker app or install a Solana wallet.');

      const { publicKey } = await wallet.connect();
      const address = publicKey.toString();

      const challenge = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      }).then((r) => r.json());
      if (challenge.error) throw new Error(challenge.error);

      const signed = await wallet.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
      const signature = bs58.encode(signed.signature);

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);

      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setPlayer(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPlayer(null);
  }, []);

  return { player, token, busy, error, login, logout };
}
