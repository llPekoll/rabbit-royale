/**
 * POST /api/auth/delete — DELETE ACCOUNT, for any player.
 *
 * Required by the stores of every app where an account can be made. The
 * confirmation is the client's (two presses, like ABANDON); this deletes the
 * row and everything hanging off it (lib/auth/abandon.ts) and puts the cookie
 * down.
 */
import { getSession, sessionCookie } from '@/lib/auth/jwt';
import { deleteAccount } from '@/lib/auth/abandon';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const result = await deleteAccount(session.sub);
  return Response.json({ ok: true, deleted: result === 'deleted' }, { headers: { 'Set-Cookie': sessionCookie(null) } });
}
