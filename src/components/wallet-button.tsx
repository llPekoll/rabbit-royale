'use client';

/**
 * The wallet control, top-right on every screen.
 *
 * Signed out it is the ONLY thing to do; signed in it is the player's own face
 * and name, and opens their panel (see profile-menu). It used to sign the
 * player out on click, which is the single most destructive thing it could do
 * and the one they least often meant — disconnecting now lives inside the
 * panel, where it takes a deliberate second press.
 *
 * Top-right because that is where a wallet lives in every app a Solana player
 * has already used — this is not the place to be original.
 */
import { useEffect, useState } from 'react';
import { useWalletLogin } from '@/components/use-wallet-login';
import { ProfileMenu } from '@/components/profile-menu';
import { avatarSrc, AVATAR_FRAME } from '@/lib/game/avatars';

export function WalletButton() {
  const { player, token, busy, error, login, linkWallet, logout, applyProfile } =
    useWalletLogin();
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);

  // The chip carries the player's own face and their unread raids, so the
  // panel is worth opening (or reassuringly not) without opening it.
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch('/api/auth/me', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.player && setAvatar(d.player.avatar ?? null))
      .catch(() => {});
    fetch('/api/player/history', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUnseen(d.raids?.unseen ?? 0))
      .catch(() => {});
  }, [token]);

  if (!player) {
    return (
      <button className="rr-wallet" onClick={login} disabled={busy}>
        {busy ? 'Waiting...' : 'Connect wallet'}
      </button>
    );
  }

  return (
    <>
      <button
        className="rr-wallet connected"
        onClick={() => setOpen(true)}
        title={error ?? player.wallet ?? 'Guest burrow. Connect a wallet to keep it.'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          className="rr-avatar rr-wallet-face"
          style={{
            backgroundImage: `url('${avatarSrc(avatar)}')`,
            backgroundSize: `${AVATAR_FRAME * 8}px auto`,
          }}
          aria-hidden
        />
        {player.name}
        {/* A guest is MARKED on the chip. The state is temporary by design, and
            the corner is where a player already looks to see who they are —
            leaving it unsaid is how somebody loses a week of digging to a
            cleared browser without ever having been told it could happen. */}
        {player.guest && <em className="rr-guest-tag">GUEST</em>}
        {/* Unread raids ride on the chip: being robbed while away is only
            useful news if the game tells you before you go looking. */}
        {unseen > 0 && <em className="rr-badge">{unseen}</em>}
      </button>

      {open && token && (
        <ProfileMenu
          token={token}
          player={player}
          avatar={avatar}
          connecting={busy}
          // Only a guest is offered the upgrade; a wallet player has nothing
          // to link, and the panel hides the whole block for them.
          onConnectWallet={player.guest ? linkWallet : null}
          onUpdated={(patch) => {
            if (patch.avatar) setAvatar(patch.avatar);
            // The hook owns the token and the name: a rename reissues the
            // session, and it is the one place that knows where it is kept.
            applyProfile(patch);
          }}
          onClose={() => {
            setOpen(false);
            setUnseen(0);
          }}
          onLogout={() => {
            setOpen(false);
            logout();
          }}
        />
      )}
    </>
  );
}
