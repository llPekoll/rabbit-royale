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
 *
 * ONE SESSION, SHARED. The state lives in a context, and `useWalletLogin` reads
 * it — it does not create it. That is not ceremony: this hook used to be called
 * independently by the page and by the wallet button, and a plain hook with
 * `useState` gives each caller its OWN state. Signing out through the button
 * cleared the button's copy (the chip went back to "Connect wallet") while the
 * page's copy still held a player, so the burrow, the carrot counter and the
 * leaderboard all stayed on screen for a signed-out player. Both halves read
 * the same localStorage token, which is exactly why it looked like it worked
 * until someone logged out.
 *
 * Mount `<WalletSessionProvider>` above anything that signs in.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

/**
 * What to do with a stored token after the server has answered.
 *
 * Pulled out of the effect so it can be tested: this is the decision that broke
 * once already. A refused token is not a transient error — it never becomes
 * valid on its own, so keeping it pins the player on "Connect wallet" and makes
 * signing in again write a second dead token behind the first.
 */
export function restoreDecision(status: number): 'keep' | 'discard' {
  // Refused outright: the token is expired, forged, signed with a secret this
  // deployment no longer has, or names a player who no longer exists.
  if (status === 401 || status === 403 || status === 404) return 'discard';
  // Anything else (a 500, a proxy hiccup, being offline) says nothing about the
  // token — throwing it away there would sign the player out over a blip.
  return 'keep';
}

function useWalletSession() {
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
    let alive = true;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${saved}` } })
      .then(async (r) => {
        if (!alive) return;
        if (r.ok) {
          const d = await r.json();
          if (d?.player) {
            setPlayer({ id: d.player.id, name: d.player.name, wallet: d.player.wallet });
            return;
          }
        }
        if (restoreDecision(r.status) === 'discard') {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      })
      // A network failure is NOT a bad token — the player may simply be offline,
      // so the session is kept and only the sign-in state stays unresolved.
      .catch(() => {});
    return () => {
      alive = false;
    };
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

export type WalletSession = ReturnType<typeof useWalletSession>;

/**
 * The session, created ONCE and handed to everyone below it.
 *
 * Null means no provider is mounted. That is a wiring mistake rather than a
 * state a player can reach, so `useWalletLogin` throws on it instead of
 * silently handing back a second, private session — which is precisely the
 * failure this context exists to end.
 */
const WalletSessionContext = createContext<WalletSession | null>(null);

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const session = useWalletSession();
  // The value is an object rebuilt every render; memoise on the fields that
  // actually change so consumers are not woken by identity churn alone.
  const value = useMemo(
    () => session,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.player, session.token, session.busy, session.error],
  );
  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  );
}

/**
 * Read the ONE session. Every caller gets the same player, the same token and
 * the same `logout` — so signing out empties every screen at once.
 */
export function useWalletLogin(): WalletSession {
  const ctx = useContext(WalletSessionContext);
  if (!ctx) {
    throw new Error('useWalletLogin needs a <WalletSessionProvider> above it.');
  }
  return ctx;
}
