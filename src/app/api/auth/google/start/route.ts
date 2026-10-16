/**
 * POST /api/auth/google/start — begin "Continue with Google".
 *
 * Body `{ link: true }` with a session attaches Google to the signed-in player
 * (a guest saving their burrow); anything else signs in. Answers the URL the
 * game opens in the browser and the `handoff` it then waits on
 * (GET /api/auth/handoff). See lib/auth/handoff.ts.
 */
import { getSession } from '@/lib/auth/jwt';
import { authOrigin, googleAuthUrl, googleConfigured } from '@/lib/auth/google';
import { startHandoff } from '@/lib/auth/handoff';

export async function POST(req: Request) {
  if (!googleConfigured()) return Response.json({ error: 'google_unavailable' }, { status: 503 });
  const { link } = (await req.json().catch(() => ({}))) as { link?: boolean };

  let playerId: string | null = null;
  if (link) {
    const session = await getSession(req);
    if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
    playerId = session.sub;
  }

  const { id, state } = await startHandoff(link ? 'link' : 'login', playerId);
  return Response.json({ url: googleAuthUrl(state, authOrigin(req)), handoff: id });
}
