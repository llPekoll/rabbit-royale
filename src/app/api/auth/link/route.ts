/**
 * POST /api/auth/link — a guest claims their burrow with a wallet.
 *
 * Requires BOTH credentials at once: a valid session (so the server knows which
 * burrow is being claimed) and a freshly signed challenge for the address (so
 * it knows the claimer owns the wallet). Either alone proves nothing useful —
 * a session without a signature could attach a stranger's address, and a
 * signature without a session names no burrow to attach it to.
 *
 * The challenge is the same one `/api/auth/challenge` mints for a plain
 * sign-in, so the client flow is identical up to the last call.
 *
 * On success the session is REISSUED, because `wallet` is one of its claims —
 * the old token would keep describing the player as walletless (and so keep the
 * shop's paid rail closed) until it expired.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession, SESSION_COOKIE, signSession } from '@/lib/auth/jwt';
import { linkWalletToPlayer } from '@/lib/auth/link';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Which HTTP status each refusal deserves. */
const STATUS: Record<string, number> = {
  invalid_signature: 401,
  already_linked: 409,
  wallet_taken: 409,
  unknown_player: 404,
};

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const { address, signature } = (await req.json().catch(() => ({}))) as {
    address?: string;
    signature?: string;
  };
  if (!address || !signature) {
    return Response.json({ error: 'address and signature required' }, { status: 400 });
  }

  const result = await linkWalletToPlayer(session.sub, address, signature);
  if (!result.ok) {
    // `wallet_taken` carries WHO holds it. The client turns that into a named
    // offer to switch, so the refusal ends somewhere the player can go —
    // sending back the bare reason left them re-pressing a button that could
    // only ever fail again. Nothing secret: they just proved they own this
    // wallet, so the burrow it belongs to is already theirs to see.
    return Response.json(
      result.reason === 'wallet_taken'
        ? { error: result.reason, takenBy: result.takenBy }
        : { error: result.reason },
      { status: STATUS[result.reason] ?? 400 },
    );
  }

  const player = await db.query.players.findFirst({ where: eq(players.id, result.playerId) });
  const token = await signSession({
    sub: result.playerId,
    wallet: result.wallet,
    name: result.name,
  });

  return Response.json(
    {
      token,
      player: {
        id: result.playerId,
        name: result.name,
        wallet: result.wallet,
        // False from here on: the row has a wallet, so nothing about this
        // account is device-bound any more.
        guest: false,
        avatar: player?.avatar ?? null,
      },
    },
    {
      headers: {
        'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${
          process.env.NODE_ENV === 'production' ? '; Secure' : ''
        }`,
      },
    },
  );
}
