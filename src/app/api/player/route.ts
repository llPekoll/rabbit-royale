/**
 * PATCH /api/player — the things a player owns about themselves.
 *
 * A name, a face, and SOLO (2026-10-02) — stepping out of PvP. Everything else
 * on the player row is earned by playing and is the server's to decide, which
 * is why this route accepts exactly these fields and ignores the rest of the
 * body.
 *
 * The name is baked into the session token (see lib/auth/jwt), so a rename has
 * to REISSUE it — otherwise the WS handshake keeps introducing the player under
 * the old name until the token expires, up to thirty days later.
 */
import { and, desc, eq, isNull, sql as raw } from 'drizzle-orm';
import { db, sql } from '@/lib/db';
import { players, raidRuns } from '@/lib/db/schema';
import { getSession, signSession, SESSION_COOKIE } from '@/lib/auth/jwt';
import { applyRegen } from '@/lib/game/regen';
import { isBuiltInAvatar } from '@/lib/game/avatars';
import { playerLook } from '@/lib/game/look';
import { isSkinKey, ownsSkin } from '@/lib/game/skins';
import { pushToPlayer } from '@/lib/game/raid-events';
import { nameProblem, normalizeName } from '@/lib/game/player-name';
import { racesNow } from '@/lib/game/season-pass';
import { RAID_RUN } from '@/lib/tuning/tables';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; avatar?: unknown; solo?: unknown; skin?: unknown };

  const patch: { name?: string; avatar?: string; solo?: boolean; equippedSkin?: string | null } = {};

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
    patch.equippedSkin = null;
  }

  if (body.skin !== undefined) {
    if (body.skin !== null && !isSkinKey(body.skin)) {
      return Response.json({ error: 'unknown_skin' }, { status: 400 });
    }
    if (body.skin !== null && !await ownsSkin(session.sub, body.skin as string)) {
      return Response.json({ error: 'skin_not_owned' }, { status: 403 });
    }
    patch.equippedSkin = body.skin as string | null;
  }

  if (body.solo !== undefined) {
    if (typeof body.solo !== 'boolean') {
      return Response.json({ error: 'bad_solo' }, { status: 400 });
    }
    if (body.solo) {
      // The Crown Race is run against the others: a ticket holder stays in.
      if (await racesNow(session.sub)) {
        return Response.json({ error: 'solo_ticket' }, { status: 403 });
      }
      // Not halfway across someone's burrow: a raider does not get to pull
      // up the drawbridge behind them.
      const open = await db.query.raidRuns.findFirst({
        where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
        columns: { id: true },
      });
      if (open) return Response.json({ error: 'raid_in_progress' }, { status: 409 });
      // Nor just after one (RAID_RUN.SOLO_AFTER_RAID_MS): the victim gets
      // their window to answer. A raid opened and never walked took nothing
      // and does not count — the same rule as the raid cooldown.
      const last = await db.query.raidRuns.findFirst({
        where: and(
          eq(raidRuns.attackerId, session.sub),
          raw`coalesce(array_length(${raidRuns.visited}, 1), 0) > 1`,
        ),
        orderBy: desc(raidRuns.startedAt),
        columns: { startedAt: true, endedAt: true },
      });
      const since = last ? Date.now() - (last.endedAt ?? last.startedAt).getTime() : Infinity;
      if (since < RAID_RUN.SOLO_AFTER_RAID_MS) {
        return Response.json({ error: 'solo_cooldown', retryInMs: RAID_RUN.SOLO_AFTER_RAID_MS - since }, { status: 429 });
      }
    }
    patch.solo = body.solo;
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
  // A new fur is a new LOOK — unless a skin sits on top of it (look.ts).
  const player = { ...applyRegen(updated), look: await playerLook(updated) };
  if (patch.avatar !== undefined || patch.equippedSkin !== undefined) {
    await pushToPlayer(sql, { to: session.sub, event: 'look_changed', payload: {
      look: player.look, skin: updated.equippedSkin,
    } });
  }

  // Only a rename invalidates the token; an avatar change is not in the claims.
  if (patch.name === undefined) {
    return Response.json({ player });
  }

  const token = await signSession({
    // Null for a guest, and it has to STAY null: re-minting the session is the
    // one place a rename could quietly hand a walletless player a wallet claim.
    sub: updated.id,
    wallet: updated.wallet,
    name: updated.name,
  });
  return Response.json(
    { player, token },
    { headers: { 'Set-Cookie': sessionCookie(token) } },
  );
}
