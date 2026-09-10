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
import { topPlayers, rankOf, onlineAmong } from '@/lib/leaderboard';
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

  // Postgres is asked for the top `limit` REGARDLESS of what Redis said.
  //
  // The sorted set used to decide not just the order but the ROSTER: whoever
  // was missing from it did not appear, however high their score. A player only
  // enters that set when the WS server mirrors their score on join (see
  // server/index.ts), so anyone who has not started a run since the season
  // opened was invisible on the board forever — with a perfectly good score
  // sitting in the database. That is not a cache miss that heals; nothing ever
  // backfills it. It hid a 25k-point player for the whole season.
  //
  // Redis keeps the job it is good at (ordering a large set cheaply) and loses
  // the one it was never entitled to (deciding who exists). Both sources are
  // merged below, so a player shows up if EITHER knows about them.
  const fromDb = await db.select({
    id: players.id, name: players.name, seasonScore: players.seasonScore,
    lifetimeCarrots: players.lifetimeCarrots, burrowLevel: players.burrowLevel,
  }).from(players).orderBy(desc(players.seasonScore)).limit(limit);

  if (ranked.length > 0) {
    // Anyone Redis names who is NOT already in the Postgres page — a player
    // ranked by the cache but pushed out of the top `limit` by rows the cache
    // does not know about. Fetching them keeps the two views consistent
    // instead of silently dropping whichever source the other disagrees with.
    const known = new Set(fromDb.map((p) => p.id));
    const missing = ranked.map((r) => r.playerId).filter((id) => !known.has(id));
    const extra = missing.length > 0
      ? await db.select({
          id: players.id, name: players.name, seasonScore: players.seasonScore,
          lifetimeCarrots: players.lifetimeCarrots, burrowLevel: players.burrowLevel,
        }).from(players).where(inArray(players.id, missing))
      : [];

    // Ordered by the SCORE IN POSTGRES, which is the record. A stale Redis
    // score would otherwise reorder the board around a number nobody has.
    rows = [...fromDb, ...extra]
      .sort((a, b) => b.seasonScore - a.seasonScore)
      .slice(0, limit);
  } else {
    // Redis down, or a season that has not scored yet. Postgres alone already
    // answered the question.
    rows = fromDb;
  }

  // Who is out digging right now. One round trip for the whole page — and a
  // failure here costs a dot, not the board (see onlineAmong).
  const online = await onlineAmong(rows.map((p) => p.id));

  const entries = rows.map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    name: p.name,
    score: p.seasonScore,
    lifetime: p.lifetimeCarrots,
    burrowLevel: p.burrowLevel,
    /** The #1 wears the crown: worth more when raided, and marked everywhere. */
    crowned: i === 0,
    /**
     * Out on an island at this moment — so there is something to WATCH.
     *
     * This is the one fact on the row that changes minute to minute, and it is
     * what makes spectating worth a tap: every other column describes a player,
     * this one describes a run in progress.
     */
    digging: online.has(p.id),
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
