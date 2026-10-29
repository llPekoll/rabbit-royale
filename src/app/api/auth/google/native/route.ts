/**
 * /api/auth/google/native — "Continue with Google" on the Play app, without a
 * browser (2026-10-29).
 *
 * Android's sign-in sheet (Credential Manager, RabbitFirebase.googleSignIn)
 * asks Google for an id_token addressed to our WEB client and hands it to the
 * game, which posts it here. The browser door (google/start → callback →
 * handoff) stays for the web build, iOS for now, and an app whose sheet
 * cannot run.
 *
 *   GET            → `{ clientId }`, the WEB client the sheet must name
 *   POST { idToken, link? } → a session, like every sign-in door; `link: true`
 *                    with a session attaches Google to that player instead
 */
import { getSession, sessionCookie } from '@/lib/auth/jwt';
import { googleConfigured, verifyGoogleIdToken } from '@/lib/auth/google';
import { identityOutcome } from '@/lib/auth/identity';

export async function GET() {
  if (!googleConfigured()) return Response.json({ error: 'google_unavailable' }, { status: 503 });
  return Response.json({ clientId: process.env.GOOGLE_CLIENT_ID });
}

export async function POST(req: Request) {
  if (!googleConfigured()) return Response.json({ error: 'google_unavailable' }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { idToken?: unknown; link?: boolean };
  if (typeof body.idToken !== 'string' || !body.idToken) return Response.json({ error: 'google_failed' }, { status: 400 });

  let linkTo: string | null = null;
  if (body.link === true) {
    const session = await getSession(req);
    if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
    linkTo = session.sub;
  }

  let g;
  try {
    g = await verifyGoogleIdToken(body.idToken);
  } catch (e) {
    console.error('[google] native :', e);
    return Response.json({ error: 'google_failed' }, { status: 401 });
  }

  const out = await identityOutcome(linkTo, { provider: 'google', subject: g.sub, email: g.email });
  if ('error' in out) return Response.json(out, { status: 409 });
  return Response.json(out, { headers: { 'Set-Cookie': sessionCookie(out.token as string) } });
}
