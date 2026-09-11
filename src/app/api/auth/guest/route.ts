/**
 * POST /api/auth/guest — play now, decide about a wallet later.
 *
 * No body, no proof, no challenge: there is nothing to prove yet. The session
 * this hands back is an ordinary one — same signature, same cookie, same thirty
 * days — so every route and the WS handshake treat a guest as the player they
 * are, with no branch anywhere except the two places a wallet is genuinely
 * required (paying, and showing the address).
 *
 * A player who already holds a session gets a NEW guest anyway if they call
 * this. That is the honest reading of the request: the caller is the client,
 * and the client only sends this when the player pressed "play as guest" from
 * the doorstep. Refusing it would leave a broken button for anyone whose token
 * outlived the screen it belongs to.
 */
import { createGuestPlayer } from '@/lib/auth/guest';
import { SESSION_COOKIE, signSession } from '@/lib/auth/jwt';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function POST() {
  const { id, name } = await createGuestPlayer();
  const token = await signSession({ sub: id, wallet: null, name });

  return Response.json(
    { token, player: { id, name, wallet: null, guest: true } },
    {
      headers: {
        'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${
          process.env.NODE_ENV === 'production' ? '; Secure' : ''
        }`,
      },
    },
  );
}
