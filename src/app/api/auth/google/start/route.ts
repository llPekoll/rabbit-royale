/**
 * POST /api/auth/google/start — begin "Continue with Google".
 *
 * Body `{ link: true }` with a session attaches Google to the signed-in player
 * (a guest saving their burrow); anything else signs in. Answers the URL the
 * game opens in the browser and the `handoff` it then waits on
 * (GET /api/auth/handoff). `return: 'android'` (the Play app) asks the callback
 * to send the browser back into the app, `return: 'ios'` to close the iOS
 * sheet. See lib/auth/handoff.ts.
 */
import { getSession } from '@/lib/auth/jwt';
import { authOrigin, googleAuthUrl, googleConfigured } from '@/lib/auth/google';
import { isHandoffReturn, startHandoff } from '@/lib/auth/handoff';
import { appleBundleId } from '@/lib/world';

export async function POST(req: Request) {
  if (!googleConfigured()) return Response.json({ error: 'google_unavailable' }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { link?: boolean; return?: unknown };
  const link = body.link === true;

  let playerId: string | null = null;
  if (link) {
    const session = await getSession(req);
    if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
    playerId = session.sub;
  }

  const returnTo = isHandoffReturn(body.return) ? body.return : null;
  const { id, state } = await startHandoff(link ? 'link' : 'login', playerId, returnTo);
  return Response.json({
    url: googleAuthUrl(state, authOrigin(req)),
    handoff: id,
    // The scheme the iOS sheet closes on: the callback redirects there.
    ...(returnTo === 'ios' ? { scheme: appleBundleId() } : {}),
  });
}
