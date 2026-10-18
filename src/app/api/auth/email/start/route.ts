/**
 * POST /api/auth/email/start — send a six-digit code to `{ email }`.
 *
 * `{ link: true }` with a session attaches the address to the signed-in
 * player once the code is typed (POST /api/auth/email/verify).
 */
import { getSession } from '@/lib/auth/jwt';
import { issueEmailCode, normalizeEmail } from '@/lib/auth/email-code';
import { mailConfigured } from '@/lib/mail';

export async function POST(req: Request) {
  if (!mailConfigured()) return Response.json({ error: 'email_unavailable' }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { email?: string; link?: boolean };
  const email = normalizeEmail(body.email);
  if (!email) return Response.json({ error: 'invalid_email' }, { status: 400 });

  let playerId: string | null = null;
  if (body.link) {
    const session = await getSession(req);
    if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
    playerId = session.sub;
  }

  const sent = await issueEmailCode(email, body.link ? 'link' : 'login', playerId);
  if (!sent.ok) return Response.json({ error: sent.reason }, { status: sent.reason === 'too_soon' ? 429 : 502 });
  return Response.json({ ok: true });
}
