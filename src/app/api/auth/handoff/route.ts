/**
 * GET /api/auth/handoff?id=… — the game waiting for its browser sign-in.
 *
 * Held open up to ~20 s while the player is in the browser, answering as soon
 * as the callback has written the outcome: `{ status: 'pending' }` means ask
 * again, anything else is final (`token` + `player`, or `error`). One request
 * every twenty seconds instead of one a second.
 */
import { sessionCookie } from '@/lib/auth/jwt';
import { takeHandoff } from '@/lib/auth/handoff';

const HOLD_MS = 20_000;
const STEP_MS = 1_000;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f]{48}$/.test(id)) return Response.json({ error: 'expired' }, { status: 404 });

  const until = Date.now() + HOLD_MS;
  for (;;) {
    const result = await takeHandoff(id);
    if (result) {
      const token = typeof result.token === 'string' ? result.token : null;
      return Response.json(
        { status: 'done', ...result },
        token ? { headers: { 'Set-Cookie': sessionCookie(token) } } : undefined,
      );
    }
    if (Date.now() + STEP_MS > until) return Response.json({ status: 'pending' });
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
}
