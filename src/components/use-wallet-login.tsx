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
 * THERE IS A SECOND DOOR. `playAsGuest` asks the server for a session with no
 * wallet at all, so someone who has never held one can press play and get a
 * real burrow. The session it returns is an ordinary session — the same token,
 * read the same way by every screen and by the WS handshake — and `linkWallet`
 * later attaches a proven address to that same account, keeping everything
 * built in the meantime.
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
  /** Null for a guest who has not connected one yet. */
  wallet: string | null;
  /** True while this account lives only in this browser. See `playAsGuest`. */
  guest: boolean;
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
  /**
   * The burrow already holding the wallet a guest just tried to link.
   *
   * Non-null means the last link was refused as `wallet_taken` and the player
   * can be offered that burrow instead of being told to go find it themselves.
   * An empty string is the same refusal without a name (the unique index
   * caught the race, and the winner's row is not read back for one).
   */
  const [takenBy, setTakenBy] = useState<string | null>(null);

  // Restore a previous session before deciding to show a login button — the
  // token is what the WS handshake needs, so it is kept where JS can read it.
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    let alive = true;
    /**
     * ASK EVEN WITH NO TOKEN IN HAND.
     *
     * The session cookie is HttpOnly and outlives localStorage, so "no token
     * here" does not mean "not signed in" — it means this browser cannot read
     * the one it has. Returning early on a missing token was what sent a
     * returning player to the doorstep and let them open a SECOND burrow on top
     * of the one the server still held, stranding the first for good.
     *
     * With no token the request carries the cookie alone, and `/me` mints a
     * fresh token from it, which is adopted below.
     */
    fetch('/api/auth/me', saved ? { headers: { Authorization: `Bearer ${saved}` } } : undefined)
      .then(async (r) => {
        if (!alive) return;
        if (r.ok) {
          const d = await r.json();
          if (d?.player) {
            // Only sent when the cookie did the proving; keep the stored one
            // otherwise so a rename's reissued token is not overwritten.
            if (d.token) {
              localStorage.setItem(TOKEN_KEY, d.token);
              setToken(d.token);
            }
            setPlayer({
              id: d.player.id,
              name: d.player.name,
              wallet: d.player.wallet ?? null,
              guest: Boolean(d.player.guest),
            });
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

  /**
   * Take the wallet through the challenge and hand back a proven signature.
   *
   * Shared by `login` and `linkWallet` because they are the same proof: one
   * lands on a new session, the other on an existing account. Duplicating it
   * would be two places for the native/browser split and for the base58
   * encoding to drift apart in.
   */
  const proveWallet = useCallback(async (): Promise<{ address: string; signature: string }> => {
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

    return { address, signature };
  }, []);

  /** Adopt a session the server just issued: store the token, take the player. */
  const adopt = useCallback((res: { token: string; player: Player }) => {
    localStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    setPlayer({
      id: res.player.id,
      name: res.player.name,
      wallet: res.player.wallet ?? null,
      guest: Boolean(res.player.guest),
    });
  }, []);

  const login = useCallback(async () => {
    setError(null);
    setTakenBy(null);
    setBusy(true);
    try {
      const { address, signature } = await proveWallet();

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);

      adopt(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }, [adopt, proveWallet]);

  /**
   * Start playing with no wallet at all.
   *
   * One POST and no prompt: this is the cheapest possible first step, and it
   * has to stay that way — every second between pressing play and digging is
   * paid for by a player who has not been given a reason to wait yet.
   */
  const playAsGuest = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      adopt(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a guest burrow');
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  /**
   * Attach a wallet to the guest account already signed in.
   *
   * The SAME burrow: the server keeps the row and only fills in its address,
   * so nothing a guest earned is at stake in pressing this. The one refusal
   * worth naming for the player is `wallet_taken` — that wallet already has a
   * burrow of its own, and merging two is not something to decide inside a
   * login, so the honest advice is to sign out and sign in with it.
   */
  const linkWallet = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    setError(null);
    setTakenBy(null);
    setBusy(true);
    try {
      const { address, signature } = await proveWallet();

      const res = await fetch('/api/auth/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, signature }),
      }).then((r) => r.json());

      if (res.error === 'wallet_taken') {
        // Named, and remembered: the panel turns this into a button that signs
        // into that burrow, so the dead end becomes one press. The name may be
        // absent when the unique index (not the read) caught the clash.
        setTakenBy(typeof res.takenBy === 'string' && res.takenBy ? res.takenBy : '');
        throw new Error(
          res.takenBy
            ? `That wallet already digs for "${res.takenBy}".`
            : 'That wallet already has a burrow.',
        );
      }
      if (res.error === 'already_linked') {
        throw new Error('This burrow already has a wallet.');
      }
      if (res.error) throw new Error(res.error);

      adopt(res);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect that wallet');
      return false;
    } finally {
      setBusy(false);
    }
  }, [adopt, proveWallet, token]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPlayer(null);
    // The cookie has to go too, or `/me` signs the player straight back in on
    // the next reload. Fire-and-forget: the local state is already cleared, and
    // a failed request must not leave the player looking signed in.
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
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

  return {
    player, token, busy, error, takenBy,
    login, playAsGuest, linkWallet, logout, applyProfile,
  };
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
