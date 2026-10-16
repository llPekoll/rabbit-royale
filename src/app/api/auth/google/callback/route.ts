/**
 * GET /api/auth/google/callback — where Google sends the browser back.
 *
 * Finishes the sign-in the game started, writes the outcome for the game to
 * collect (lib/auth/handoff.ts), and shows the player a page telling them to
 * go back to the game. The token is never in this page: it goes to the game
 * through its own waiting request.
 */
import { authOrigin, exchangeGoogleCode } from '@/lib/auth/google';
import { finishHandoff, handoffByState, type HandoffResult } from '@/lib/auth/handoff';
import { linkIdentity, sessionFor, signInWithIdentity } from '@/lib/auth/identity';

function page(title: string, line: string): Response {
  // window.close() works when the web build opened this as a popup; on a
  // phone the browser tab stays and the text says where to go.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rabbit Royale</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1d2b1f;color:#f4ecd8;font-family:system-ui,sans-serif;text-align:center">
<div style="padding:24px"><h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="font-size:16px;opacity:.85;margin:0">${line}</p></div>
<script>setTimeout(function(){window.close()},1200)</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const handoff = await handoffByState(q.get('state') ?? '');
  if (!handoff) return page('This sign-in has expired', 'Go back to Rabbit Royale and try again.');

  const code = q.get('code');
  if (!code) {
    await finishHandoff(handoff.id, { error: 'cancelled' });
    return page('Sign-in cancelled', 'You can go back to Rabbit Royale.');
  }

  let result: HandoffResult;
  try {
    const g = await exchangeGoogleCode(code, authOrigin(req));
    const idn = { provider: 'google' as const, subject: g.sub, email: g.email };
    if (handoff.mode === 'link' && handoff.playerId) {
      const linked = await linkIdentity(handoff.playerId, idn);
      result = linked.ok
        ? { ...(await sessionFor(handoff.playerId)), linked: 'google', email: g.email }
        : { error: linked.reason, ...('takenBy' in linked ? { takenBy: linked.takenBy } : {}) };
    } else {
      const { playerId, created } = await signInWithIdentity(idn);
      result = { ...(await sessionFor(playerId)), created };
    }
  } catch (e) {
    console.error('[google] callback :', e);
    result = { error: 'google_failed' };
  }

  await finishHandoff(handoff.id, result);
  return 'error' in result
    ? page('Something went wrong', 'Go back to Rabbit Royale and try again.')
    : page('You are signed in', 'Go back to Rabbit Royale.');
}
