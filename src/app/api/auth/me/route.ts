/**
 * GET /api/auth/me — the signed-in player, with regen applied.
 *
 * Energy and burrow HP are DERIVED from timestamps at read time rather than
 * ticked by a job. With a lot of players a per-player cron is the thing that
 * falls over first; a timestamp and a subtraction scale to any number of them.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { applyRegen } from '@/lib/game/regen';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  return Response.json({ player: applyRegen(player) });
}
