/**
 * POST /api/auth/logout — put down the session cookie.
 *
 * There was no such route while the client owned the whole session: signing out
 * cleared localStorage and that was genuinely the end of it. Now that `/me`
 * restores a player from the HttpOnly cookie alone, the cookie IS the session,
 * and a sign-out that leaves it standing is undone by the next reload — the
 * player presses disconnect, the page comes back, and they are signed in again.
 *
 * Expiring it is all this does. The row is untouched: disconnecting is not
 * abandoning, and a wallet player signs back in with the same wallet.
 */
import { SESSION_COOKIE } from '@/lib/auth/jwt';

export async function POST() {
  return Response.json(
    { ok: true },
    {
      headers: {
        // Max-Age=0 with the SAME Path the session was written on — a cookie
        // cleared on a different path is a second cookie, and the original
        // keeps being sent.
        'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
          process.env.NODE_ENV === 'production' ? '; Secure' : ''
        }`,
      },
    },
  );
}
