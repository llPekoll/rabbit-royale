/**
 * The season leaderboard — and the list you pick a spectate target from.
 *
 * Served from Redis when it is up (a sorted set answers "top 100" in O(log n)
 * however many players there are) and from Postgres when it is not. Redis is a
 * CACHE here, never the record: losing it costs a rebuild, not anyone's score.
 */
import { desc, inArray, isNull, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, seasons } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { topPlayers, rankOf } from '@/lib/leaderboard';
import { SEASON } from '@config/tuning';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), SEASON.TOP_N);

  const season = await db.query.seasons.findFirst({ where: isNull(seasons.endedAt) });

  // Redis holds the ORDERING; the player rows still come from Postgres, because
  // a name or a burrow level has no business living in a sorted set.
  let rows: Array<{ id: string; name: string; seasonScore: number; lifetimeCarrots: number; burrowLevel: number }>;
  const ranked = season ? await topPlayers(season.id, limit) : [];

  if (ranked.length > 0) {
    const ids = ranked.map((r) => r.playerId);
    const found = await db.select({
      id: players.id, name: players.name, seasonScore: players.seasonScore,
      lifetimeCarrots: players.lifetimeCarrots, burrowLevel: players.burrowLevel,
    }).from(players).where(inArray(players.id, ids));
    const byId = new Map(found.map((p) => [p.id, p]));
    rows = ids.map((id) => byId.get(id)!).filter(Boolean);
  } else {
    // Redis down, or a season that has not scored yet. The query is the slow
    // path by design — it is correct, and it keeps the board working.
    rows = await db.select({
      id: players.id, name: players.name, seasonScore: players.seasonScore,
      lifetimeCarrots: players.lifetimeCarrots, burrowLevel: players.burrowLevel,
    }).from(players).orderBy(desc(players.seasonScore)).limit(limit);
  }

  const entries = rows.map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    name: p.name,
    score: p.seasonScore,
    lifetime: p.lifetimeCarrots,
    burrowLevel: p.burrowLevel,
    /** The #1 wears the crown: worth more when raided, and marked everywhere. */
    crowned: i === 0,
  }));

  // Where the viewer sits, even when they are nowhere near the top — a board
  // that cannot show you your own rank is a board you stop opening.
  const session = await getSession(req);
  let me: { rank: number | null; score: number } | null = null;
  if (session) {
    const row = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
    if (row) {
      me = {
        rank: season ? await rankOf(season.id, session.sub) : null,
        score: row.seasonScore,
      };
    }
  }

  return Response.json({
    entries,
    me,
    season: season ? { id: season.id, endsAt: season.endsAt } : null,
  });
}
