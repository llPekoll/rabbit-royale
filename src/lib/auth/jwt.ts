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
  /** Player id — `sol:<address>` for a wallet, `guest:<uuid>` for a guest. */
  sub: string;
  /**
   * The proven wallet, or null for a guest who has not connected one.
   *
   * Null is MEANINGFUL rather than missing: it is what the paid routes read to
   * refuse a quote there is no wallet to pay from, and what the profile reads
   * to offer the upgrade. An empty string would be a wallet whose address is
   * blank, which nothing can act on.
   */
  wallet: string | null;
  name: string;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SIGNING_SECRET;
  if (!s) throw new Error('JWT_SIGNING_SECRET must be set');
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  // The wallet claim is OMITTED for a guest rather than set to null: a token
  // is read by the WS server and by the Android wrapper too, and a claim that
  // is absent is unambiguous everywhere a `null` would have to be special-cased.
  return new SignJWT({ ...(claims.wallet ? { wallet: claims.wallet } : {}), name: claims.name })
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
    return {
      sub: payload.sub,
      // A guest's token carries no wallet claim at all; older wallet tokens
      // carry a string. Both have to land on the same two shapes here.
      wallet: payload.wallet ? String(payload.wallet) : null,
      name: String(payload.name ?? ''),
    };
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
