/**
 * POST /api/auth/abandon — a guest deletes their burrow.
 *
 * The counterpart of `/api/auth/logout` for an account that cannot be signed
 * back into. Logging out keeps the row, because a wallet player returns to it;
 * a guest's row without its cookie is unreachable by anyone, and used to stay
 * on the season board and in the raid targets as a ghost. This removes it —
 * runs, traps, raids and standings go with it (see lib/auth/abandon.ts) — and
 * puts the cookie down the same way logout does.
 *
 * Refused for a wallet player with 403: the button they see says "disconnect",
 * and a client that sends this for them is wrong, not the player.
 */
import { getSession, SESSION_COOKIE } from '@/lib/auth/jwt';
import { deleteGuest } from '@/lib/auth/abandon';

const CLEAR_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
  process.env.NODE_ENV === 'production' ? '; Secure' : ''
}`;

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const result = await deleteGuest(session.sub);
  if (result === 'not_guest') return Response.json({ error: 'not_guest' }, { status: 403 });
  // Already gone (a double press, a purge that got there first): the cookie
  // still has to come down, so this is an ok rather than a 404.
  return Response.json({ ok: true, deleted: result === 'deleted' }, { headers: { 'Set-Cookie': CLEAR_COOKIE } });
}
