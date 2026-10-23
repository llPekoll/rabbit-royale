/**
 * The season leaderboard — and the list you pick a spectate target from.
 *
 * Served from Postgres, the one database every region writes its scores to.
 */
import { desc, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, seasons } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { standingOf } from '@/lib/leaderboard';
import { onlineAmong } from '@/lib/presence';
import { SEASON } from '@config/tuning';
import { holdersAmong } from '@/lib/game/season-pass';
import { looksOf } from '@/lib/game/look';
import { raidDoors } from '@/lib/game/raid-door';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), SEASON.TOP_N);

  // The page's columns. `equippedSkin` rides along so the look (look.ts) is
  // worked out from the row, without a trip of its own.
  const columns = {
    id: players.id, name: players.name, avatar: players.avatar, equippedSkin: players.equippedSkin,
    seasonScore: players.seasonScore,
    lifetimeCarrots: players.lifetimeCarrots, burrowLevel: players.burrowLevel,
  };
  const session = await getSession(req);

  // ONE trip, all at once: the season, the top of the table, and where the
  // viewer stands. The region servers sit up to 170 ms from the database;
  // these used to go out one after another.
  //
  // Postgres alone, roster AND order (2026-10-23): a Redis sorted set used
  // to order the board, but it belongs to one region and the board is the
  // world's now — see lib/leaderboard.ts.
  const [season, rows, standing] = await Promise.all([
    db.query.seasons.findFirst({ where: isNull(seasons.endedAt) }),
    db.select(columns).from(players).orderBy(desc(players.seasonScore)).limit(limit),
    session ? standingOf(session.sub) : Promise.resolve(null),
  ]);

  const ids = rows.map((p) => p.id);
  // Everything else on the page, in one trip:
  //  - who is out digging right now (a failure costs a dot, not the board —
  //    see onlineAmong);
  //  - the gold ticket: who holds this season's pass, empty outside one;
  //  - CAN I RAID THEM, written on the row (2026-10-13): the board is where a
  //    player meets rivals by name, and a row is a door — raid, watch, or the
  //    wait until the shield drops. Only for a signed-in viewer who can raid.
  const [online, passHolders, doors] = await Promise.all([
    onlineAmong(ids),
    season?.passOn ? holdersAmong(season.id, ids) : Promise.resolve(new Set<string>()),
    session ? raidDoors(session.sub, ids) : Promise.resolve(null),
  ]);

  // The sheet each one wears (look.ts) — the podium draws the rabbit they
  // play as, skin included, not just the fur they picked. From the rows.
  const looks = await looksOf(rows);

  const entries = rows.map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    name: p.name,
    /**
     * Which rabbit they picked, or null for a player who never chose.
     *
     * The board's top three are DRAWN now rather than listed, so the face has
     * to be the one they actually wear — a podium of three identical rabbits
     * says nothing, and a player who changed their colour would not recognise
     * themselves on it. Null is fine: the renderer falls back to the default
     * sheet, which is what a new player is anyway.
     */
    avatar: p.avatar,
    look: looks.get(p.id),
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
    /** Holds this season's pass — in the race for the pot. */
    pass: passHolders.has(p.id),
    /** The raid door for the viewer (lib/game/raid-door.ts); absent for
     *  themselves, and for a viewer who cannot raid at all. */
    raid: doors?.get(p.id) ?? null,
  }));

  // Where the viewer sits, even when they are nowhere near the top — a board
  // that cannot show you your own rank is a board you stop opening.
  const me: { rank: number | null; score: number; toPass: number | null } | null = standing
    ? {
      rank: season ? standing.rank : null,
      score: standing.score,
      /* The gap to the rank above, so the caller can say what it would take
         to climb rather than only where the player stands. Null when there is
         nothing to chase (#1, or tied for it) — see `standingOf`. */
      toPass: standing.gap,
    }
    : null;

  return Response.json({
    entries,
    me,
    season: season ? { id: season.id, endsAt: season.endsAt, passOn: season.passOn } : null,
  });
}
