/**
 * POST /api/auth/email/verify — `{ email, code }` → a session.
 *
 * A code asked for with `link` attaches the address to the player who asked,
 * and only that player's session may spend it.
 */
import { getSession, sessionCookie } from '@/lib/auth/jwt';
import { normalizeEmail, verifyEmailCode } from '@/lib/auth/email-code';
import { linkIdentity, sessionFor, signInWithIdentity } from '@/lib/auth/identity';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  const email = normalizeEmail(body.email);
  if (!email || typeof body.code !== 'string') return Response.json({ error: 'invalid_code' }, { status: 400 });

  const checked = await verifyEmailCode(email, body.code);
  if (!checked.ok) return Response.json({ error: checked.reason }, { status: 401 });

  const idn = { provider: 'email' as const, subject: email, email };
  if (checked.mode === 'link' && checked.playerId) {
    const session = await getSession(req);
    if (session?.sub !== checked.playerId) return Response.json({ error: 'unauthenticated' }, { status: 401 });
    const linked = await linkIdentity(checked.playerId, idn);
    if (!linked.ok) {
      return Response.json(
        { error: linked.reason, ...('takenBy' in linked ? { takenBy: linked.takenBy } : {}) },
        { status: 409 },
      );
    }
    const out = await sessionFor(checked.playerId);
    return Response.json({ ...out, linked: 'email', email }, { headers: { 'Set-Cookie': sessionCookie(out.token) } });
  }

  const { playerId, created } = await signInWithIdentity(idn);
  const out = await sessionFor(playerId);
  return Response.json({ ...out, created }, { headers: { 'Set-Cookie': sessionCookie(out.token) } });
}
