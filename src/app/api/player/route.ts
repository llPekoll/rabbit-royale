/**
 * PATCH /api/player — the two things a player owns about themselves.
 *
 * A name and a face. Everything else on the player row is earned by playing and
 * is the server's to decide, which is why this route accepts exactly two fields
 * and ignores the rest of the body.
 *
 * The name is baked into the session token (see lib/auth/jwt), so a rename has
 * to REISSUE it — otherwise the WS handshake keeps introducing the player under
 * the old name until the token expires, up to thirty days later.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession, signSession, SESSION_COOKIE } from '@/lib/auth/jwt';
import { applyRegen } from '@/lib/game/regen';
import { isBuiltInAvatar } from '@/lib/game/avatars';
import { nameProblem, normalizeName } from '@/lib/game/player-name';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; avatar?: unknown };

  const patch: { name?: string; avatar?: string } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return Response.json({ error: 'bad_name' }, { status: 400 });
    }
    const problem = nameProblem(body.name);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    patch.name = normalizeName(body.name);
  }

  if (body.avatar !== undefined) {
    // Only the game's own rabbits for now. The column is plain text so a minted
    // NFT can become a second accepted kind of value here later, but until that
    // check exists an arbitrary string must not reach the row.
    if (typeof body.avatar !== 'string' || !isBuiltInAvatar(body.avatar)) {
      return Response.json({ error: 'unknown_avatar' }, { status: 400 });
    }
    patch.avatar = body.avatar;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'nothing_to_change' }, { status: 400 });
  }

  const [updated] = await db
    .update(players)
    .set(patch)
    .where(eq(players.id, session.sub))
    .returning();
  if (!updated) return Response.json({ error: 'unknown player' }, { status: 404 });

  // Only a rename invalidates the token; an avatar change is not in the claims.
  if (patch.name === undefined) {
    return Response.json({ player: applyRegen(updated) });
  }

  const token = await signSession({
    sub: updated.id,
    wallet: updated.wallet,
    name: updated.name,
  });
  return Response.json(
    { player: applyRegen(updated), token },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  );
}
