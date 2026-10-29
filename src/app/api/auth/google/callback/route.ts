/**
 * GET /api/auth/google/callback — where Google sends the browser back.
 *
 * Finishes the sign-in the game started, writes the outcome for the game to
 * collect (lib/auth/handoff.ts), and shows the player a page telling them to
 * go back to the game. The token is never in this page: it goes to the game
 * through its own waiting request.
 *
 * The Play app (handoff.returnTo 'android') is not left on that page: the
 * answer is a redirect into the app, with the page as Chrome's fallback. The
 * iOS app ('ios') gets the redirect that closes its sign-in sheet.
 */
import { authOrigin, exchangeGoogleCode } from '@/lib/auth/google';
import { androidReturnUrl, appleReturnUrl, finishHandoff, handoffByState, type HandoffResult } from '@/lib/auth/handoff';
import { identityOutcome } from '@/lib/auth/identity';
import { appleBundleId, playPackage } from '@/lib/world';

type Outcome = 'signed_in' | 'cancelled' | 'failed';

const WORDS: Record<Outcome, [string, string]> = {
  signed_in: ['You are signed in', 'Go back to Rabbit Royale.'],
  cancelled: ['Sign-in cancelled', 'You can go back to Rabbit Royale.'],
  failed: ['Something went wrong', 'Go back to Rabbit Royale and try again.'],
};

function page(title: string, line: string, back?: string): Response {
  // window.close() works when the web build opened this as a popup; on a
  // phone the browser tab stays and the text says where to go — or, for the
  // Play app, the button takes the player there (a tap always may).
  const button = back
    ? `<a href="${back}" style="display:inline-block;margin-top:24px;padding:14px 28px;border-radius:12px;background:#f4ecd8;color:#1d2b1f;font-weight:700;text-decoration:none">Back to Rabbit Royale</a>`
    : '';
  const close = back ? '' : '<script>setTimeout(function(){window.close()},1200)</script>';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rabbit Royale</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1d2b1f;color:#f4ecd8;font-family:system-ui,sans-serif;text-align:center">
<div style="padding:24px"><h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="font-size:16px;opacity:.85;margin:0">${line}</p>${button}</div>
${close}</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/**
 * Done: the page; for the Play app a redirect into it (the page behind); for
 * the iOS app the URL that closes its sheet.
 */
function finish(req: Request, outcome: Outcome, returnTo: string | null): Response {
  if (returnTo === 'ios') {
    return new Response(null, {
      status: 302,
      headers: { Location: appleReturnUrl(appleBundleId()), 'Cache-Control': 'no-store' },
    });
  }
  if (returnTo !== 'android') return page(...WORDS[outcome]);
  const fallback = `${authOrigin(req)}/api/auth/google/callback?shown=${outcome}&app=android`;
  return new Response(null, {
    status: 302,
    headers: { Location: androidReturnUrl(playPackage(), fallback), 'Cache-Control': 'no-store' },
  });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  // Chrome's fallback when the redirect into the app did not happen: the
  // words, and a button that opens the app on a tap.
  const shown = q.get('shown');
  if (shown === 'signed_in' || shown === 'cancelled' || shown === 'failed') {
    const back = q.get('app') === 'android' ? androidReturnUrl(playPackage()) : undefined;
    return page(...WORDS[shown], back);
  }

  const handoff = await handoffByState(q.get('state') ?? '');
  if (!handoff) return page('This sign-in has expired', 'Go back to Rabbit Royale and try again.');

  const code = q.get('code');
  if (!code) {
    await finishHandoff(handoff.id, { error: 'cancelled' });
    return finish(req, 'cancelled', handoff.returnTo);
  }

  let result: HandoffResult;
  try {
    const g = await exchangeGoogleCode(code, authOrigin(req));
    const linkTo = handoff.mode === 'link' ? handoff.playerId : null;
    result = await identityOutcome(linkTo, { provider: 'google', subject: g.sub, email: g.email });
  } catch (e) {
    console.error('[google] callback :', e);
    result = { error: 'google_failed' };
  }

  await finishHandoff(handoff.id, result);
  return finish(req, 'error' in result ? 'failed' : 'signed_in', handoff.returnTo);
}
