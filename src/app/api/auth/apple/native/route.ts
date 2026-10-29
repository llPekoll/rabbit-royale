/**
 * POST /api/auth/apple/native — `{ identityToken, link? }` → a session.
 *
 * The token comes from Apple's sign-in sheet on the iOS app (RabbitApple
 * plugin, lib/auth/apple.ts). `link: true` with a session attaches Apple to
 * that player (a guest saving their burrow) instead of signing in.
 *
 * Still to do before the App Store review: deleting an account that signed in
 * with Apple must also revoke its Apple tokens (App Store rule 5.1.1(v)) —
 * that needs a "Sign in with Apple" key to trade the sheet's
 * authorizationCode, which the game already sends along.
 */
import { getSession, sessionCookie } from '@/lib/auth/jwt';
import { verifyAppleIdentityToken } from '@/lib/auth/apple';
import { identityOutcome } from '@/lib/auth/identity';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { identityToken?: unknown; link?: boolean };
  if (typeof body.identityToken !== 'string' || !body.identityToken) {
    return Response.json({ error: 'apple_failed' }, { status: 400 });
  }

  let linkTo: string | null = null;
  if (body.link === true) {
    const session = await getSession(req);
    if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
    linkTo = session.sub;
  }

  let apple;
  try {
    apple = await verifyAppleIdentityToken(body.identityToken);
  } catch (e) {
    console.error('[apple] native :', e);
    return Response.json({ error: 'apple_failed' }, { status: 401 });
  }

  const out = await identityOutcome(linkTo, { provider: 'apple', subject: apple.sub, email: apple.email });
  if ('error' in out) return Response.json(out, { status: 409 });
  return Response.json(out, { headers: { 'Set-Cookie': sessionCookie(out.token as string) } });
}
