/**
 * The back office's session: a token handed out for a good code, naming the
 * address that signed in (admin/team.ts).
 *
 * Signed with a key DERIVED from `ADMIN_TOTP_SECRET`, which only the site
 * (admin.rabbit.rip) holds. Never the game's `JWT_SIGNING_SECRET` as is: a
 * player's token can never pass for it (other key, other audience).
 * The role is read again from the team at every call: a member removed is
 * out at once, not in twelve hours.
 */
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { roleOf, type Role } from './team';
import { adminSecret } from './totp';

const ISSUER = 'rabbit-royale';
const AUDIENCE = 'rabbit-royale-admin';
const TTL = '12h';

function key(secret: string): Uint8Array {
  return createHash('sha256').update(`rr-admin-session:${secret}`).digest();
}

function bearer(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

export async function signAdmin(email: string): Promise<string> {
  const secret = adminSecret();
  if (!secret) throw new Error('ADMIN_TOTP_SECRET must be set');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key(secret));
}

/** Who is calling, and as what — or null. */
export async function sessionOf(req: Request): Promise<{ email: string; role: Role } | null> {
  const secret = adminSecret();
  const token = bearer(req);
  if (!secret || !token) return null;
  let email: string | undefined;
  try {
    email = (await jwtVerify(token, key(secret), { issuer: ISSUER, audience: AUDIENCE })).payload.sub;
  } catch {
    return null;
  }
  if (!email) return null;
  const role = await roleOf(email);
  return role ? { email, role } : null;
}

// ── Region to region ─────────────────────────────────────────────────────────
// admin.rabbit.rip (Europe) asks Singapore and the US for their numbers,
// server to server, with a token that lives one minute. Signed with a key
// DERIVED from the game's `JWT_SIGNING_SECRET`, which the three regions
// already share: nothing new to copy onto the VPS. Another key and another
// audience than a player's token, so neither can pass for the other.
const AGENT_AUDIENCE = 'rabbit-royale-admin-agent';

function agentKey(): Uint8Array | null {
  const s = process.env.JWT_SIGNING_SECRET;
  return s ? createHash('sha256').update(`rr-admin-agent:${s}`).digest() : null;
}

export async function signAgent(): Promise<string> {
  const k = agentKey();
  if (!k) throw new Error('JWT_SIGNING_SECRET must be set');
  return new SignJWT({ role: 'agent' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuer(ISSUER)
    .setAudience(AGENT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(k);
}

/** True when the request comes from the back office of another region. */
export async function isAgent(req: Request): Promise<boolean> {
  const k = agentKey();
  if (!k) return false;
  const token = bearer(req);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, k, { issuer: ISSUER, audience: AGENT_AUDIENCE });
    return payload.role === 'agent';
  } catch {
    return false;
  }
}
