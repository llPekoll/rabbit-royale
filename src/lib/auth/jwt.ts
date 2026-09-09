/**
 * Session tokens. Self-issued: this game has its own identity, so there is no
 * hub secret to share and no cross-service revocation to check.
 *
 * The WS server verifies the same token at the socket handshake, which is what
 * makes the server authoritative about WHO is moving a rabbit — the player id
 * always comes from the verified token, never from the message payload.
 */
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'rabbit-royale';
const AUDIENCE = 'rabbit-royale-game';
export const SESSION_COOKIE = 'rr_session';
const TTL = '30d';

export interface SessionClaims {
  /** Player id — `sol:<address>`. */
  sub: string;
  wallet: string;
  name: string;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SIGNING_SECRET;
  if (!s) throw new Error('JWT_SIGNING_SECRET must be set');
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ wallet: claims.wallet, name: claims.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub) return null;
    return { sub: payload.sub, wallet: String(payload.wallet ?? ''), name: String(payload.name ?? '') };
  } catch {
    return null;
  }
}

/** Bearer header first, then the session cookie. Does NOT verify. */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  const cookie = req.headers.get('cookie');
  const m = cookie?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function getSession(req: Request): Promise<SessionClaims | null> {
  const token = extractToken(req);
  return token ? verifySession(token) : null;
}
