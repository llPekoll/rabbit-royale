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
import { useEffect, useState, type CSSProperties } from 'react';
import { useT } from '@/i18n/provider';
import { useWalletLogin } from '@/components/use-wallet-login';
import { ProfileMenu } from '@/components/profile-menu';
import { avatarSrc, AVATAR_FRAME } from '@/lib/game/avatars';
import { PxButton, pxLabel } from '@/components/px';

/* The chip's colours, as the stylesheet gave them: the dark panel face, the
   page ground under it for a bevel, the border's grey for its gloss, and the
   crown gold for a signed-in name. */
const FACE = '#161b22';
const BEVEL = '#0d1117';
const GLOSS = '#30363d';
const INK = '#e6edf3';
const CROWN = '#ffd45c';

/** The codex's pixel button at the top bar's 44px chip height, in web type. */
const chip: CSSProperties = {
  height: 44,
  /* The label's air, the same on every button in the game: the tight pad above
     and each side at the full pad, with the kit's bevel lip reserved under it
     so the text sits optically centred on the face rather than on the box. */
  padding: 'var(--rr-btn-pad)',
  fontFamily: pxLabel.fontFamily,
  fontSize: 12,
  fontWeight: 400,
  letterSpacing: 'normal',
  textTransform: 'none',
};

export interface WalletButtonProps {
  /**
   * Raid one of the players named in the profile's history.
   *
   * Passed straight through to `ProfileMenu` — the chip owns the panel, but
   * raiding belongs to the board, and the board is what mounts this. Absent
   * on any screen with no raid to launch, and the rows lose their button.
   */
  onRevenge?: (defenderId: string) => void;
  /** Where those players are standing, by id — see `ProfileMenu.presence`. */
  presence?: Record<string, 'away' | 'home' | 'digging'>;
  /** Follow their presence while the log is open — see `ProfileMenu`. */
  onWatchPresence?: (ids: string[]) => void;
}

export function WalletButton({ onRevenge, presence, onWatchPresence }: WalletButtonProps = {}) {
  const t = useT();
  const { player, token, busy, error, takenBy, login, linkWallet, logout, abandon, applyProfile } =
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
      <PxButton
        className="rr-wallet"
        onClick={login}
        disabled={busy}
        color={FACE}
        shadowColor={BEVEL}
        highlightColor={GLOSS}
        textColor={INK}
        style={chip}
      >
        <span>{busy ? t.auth.waiting : t.auth.connect}</span>
      </PxButton>
    );
  }

  return (
    <>
      <PxButton
        className="rr-wallet connected"
        color={FACE}
        shadowColor={BEVEL}
        highlightColor={GLOSS}
        textColor={CROWN}
        style={chip}
        onClick={() => setOpen(true)}
        title={error ?? player.wallet ?? t.auth.guestNote}
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
        {/* The name is the only part of this chip that can give ground, so it
            is the only part wrapped: a bare text node cannot be told to
            ellipsise, and on a narrow screen the chip grew until it ran into
            the carrot pill centred beside it. The avatar and the badge keep
            their size — they are fixed marks, and a half-drawn one reads as a
            glitch where a shortened name reads as a long name.
            NO GUEST TAG beside it any more: it took a third of the chip on a
            phone and the name paid for it ("Sil..."), and the state it marked
            is told where the chip leads — the profile panel's connect step,
            and this button's own title (Paul, 2026-09-21). */}
        <span className="rr-wallet-name">{player.name}</span>
        {/* Unread raids ride on the chip: being robbed while away is only
            useful news if the game tells you before you go looking. */}
        {unseen > 0 && <em className="rr-badge">{unseen}</em>}
      </PxButton>

      {open && token && (
        <ProfileMenu
          token={token}
          player={player}
          avatar={avatar}
          connecting={busy}
          onRevenge={onRevenge}
          presence={presence}
          onWatchPresence={onWatchPresence}
          connectError={player.guest ? error : null}
          takenBy={player.guest ? takenBy : null}
          // Signing in as the wallet's owner leaves the guest burrow behind —
          // `login` adopts the other session wholesale. The panel closes on
          // the way: everything in it describes the account being left.
          onSwitchToOwner={
            player.guest
              ? () => {
                  setOpen(false);
                  void login();
                }
              : null
          }
          // Only a guest is offered the upgrade; a wallet player has nothing
          // to link, and the panel hides the whole block for them.
          onConnectWallet={
            player.guest
              ? async () => {
                  const linked = await linkWallet();
                  // Closing on success is the acknowledgement: the chip behind
                  // has just lost its GUEST tag and gained the address, and
                  // leaving the panel open on the old copy is what made a
                  // SUCCESSFUL link look like nothing had happened either.
                  if (linked) setOpen(false);
                  return linked;
                }
              : null
          }
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
          onAbandon={() => {
            setOpen(false);
            void abandon();
          }}
        />
      )}
    </>
  );
}
