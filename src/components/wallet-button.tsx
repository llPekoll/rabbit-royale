'use client';

/**
 * The wallet control, top-right on every screen.
 *
 * Signed out it is the ONLY thing to do; signed in it shrinks to a name chip.
 * Top-right because that is where a wallet lives in every app a Solana player
 * has already used — this is not the place to be original.
 */
import { useWalletLogin } from '@/components/use-wallet-login';

export function WalletButton() {
  const { player, busy, error, login, logout } = useWalletLogin();

  if (!player) {
    return (
      <button className="rr-wallet" onClick={login} disabled={busy}>
        {busy ? 'Waiting…' : 'Connect wallet'}
      </button>
    );
  }

  return (
    <button className="rr-wallet connected" onClick={logout} title={error ?? player.wallet}>
      <span aria-hidden>🐰</span> {player.name}
    </button>
  );
}
