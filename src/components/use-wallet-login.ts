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
import { isNative, nativeWallet } from './native-bridge';

export interface Player {
  id: string;
  name: string;
  wallet: string;
}

interface InjectedWallet {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  /** Raw bytes from a browser wallet; a base58 string from the native bridge. */
  signMessage(msg: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array | string }>;
}

declare global {
  interface Window {
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
      // Native shell (Seeker / Seed Vault) first, browser wallet second. Both
      // present the same interface — see native-bridge.ts.
      const native = isNative() ? nativeWallet() : null;
      const wallet = native ?? window.solana;
      if (!wallet) throw new Error('No wallet found. Open in the Rabbit Royale app or install a Solana wallet.');

      const { publicKey } = await wallet.connect();
      const address = publicKey.toString();

      const challenge = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      }).then((r) => r.json());
      if (challenge.error) throw new Error(challenge.error);

      // The native bridge signs the string itself and hands back base58; a
      // browser wallet returns raw bytes we encode here.
      native?.setMessage(challenge.message);
      const signed = await wallet.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
      const signature =
        typeof signed.signature === 'string' ? signed.signature : bs58.encode(signed.signature);

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

  /**
   * Adopt a profile change made elsewhere (the profile menu renaming the
   * player). A rename REISSUES the session token, because the name is one of
   * its claims — so the new one has to replace the stored one here, or the WS
   * handshake keeps introducing the player under the old name until the old
   * token expires.
   */
  const applyProfile = useCallback((patch: { name?: string; token?: string }) => {
    if (patch.token) {
      localStorage.setItem(TOKEN_KEY, patch.token);
      setToken(patch.token);
    }
    if (patch.name) setPlayer((p) => (p ? { ...p, name: patch.name! } : p));
  }, []);

  return { player, token, busy, error, login, logout, applyProfile };
}
