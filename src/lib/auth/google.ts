/**
 * "Continue with Google", done by the server.
 *
 * The game never talks to Google: it opens the system browser on the URL this
 * builds, and Google redirects to OUR callback, which trades the code for the
 * player's identity with the client secret. No SDK and no native plugin — the
 * APK is a shell and a plugin would mean resubmitting it — and the same code
 * serves the Seeker, the web build and, later, iOS.
 *
 * Each region answers its own callback (`ws.rabbit.rip`, `ws-sg…`, `ws-us…`):
 * accounts are per region, so the region that started the sign-in is the one
 * that must finish it. All three callbacks are registered on the one OAuth
 * client.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * This server's public origin, which Google redirects back to. `AUTH_ORIGIN`
 * when set; otherwise the request's own, as rebuilt by the router from the
 * Host and X-Forwarded-Proto the proxy (Traefik, Caddy) passes.
 */
export function authOrigin(req: Request): string {
  return process.env.AUTH_ORIGIN?.replace(/\/+$/, '') || new URL(req.url).origin;
}

export function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export function googleAuthUrl(state: string, origin: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email',
    state,
    // Always ask which account: a shared family tablet must not quietly
    // sign the second child into the first one's burrow.
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${q}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string | null;
}

/**
 * Trade the callback's `code` for who signed in.
 *
 * The id_token comes straight from Google's token endpoint over TLS, in
 * exchange for our secret, so its signature need not be checked again (OIDC
 * Core §3.1.3.7); its audience, issuer and expiry still are. An address
 * Google has not verified is dropped rather than trusted: it is what would
 * let someone claim another player's email burrow.
 */
export async function exchangeGoogleCode(code: string, origin: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error('google token: no id_token');

  const claims = JSON.parse(Buffer.from(id_token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    sub?: string; aud?: string; iss?: string; exp?: number; email?: string; email_verified?: boolean | string;
  };
  if (!claims.sub) throw new Error('google id_token: no sub');
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('google id_token: wrong audience');
  if (!ISSUERS.includes(claims.iss ?? '')) throw new Error('google id_token: wrong issuer');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('google id_token: expired');

  const verified = claims.email_verified === true || claims.email_verified === 'true';
  return { sub: claims.sub, email: verified && claims.email ? claims.email.toLowerCase() : null };
}
