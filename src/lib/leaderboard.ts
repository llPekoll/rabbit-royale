/**
 * The season's standings — and the region's Redis client, which lives here.
 *
 * THE RANKING IS READ FROM POSTGRES ALONE (2026-10-23). It used to be ordered
 * by a Redis sorted set, mirrored from each run's banking. But Redis belongs
 * to a REGION, and the regions now share one database and one board: a set
 * that only ever heard its own region's runs ranked a Singapore player among
 * Singaporeans. Postgres is the one place every region's score lands, and the
 * board's roster already came from it; a rank is one indexed count beside it
 * (`standingOf`). Redis keeps what IS regional — rate limits, prices, and the
 * copy of who is online (presence.ts).
 */
import { createClient, type RedisClientType } from 'redis';
import { desc, gt, sql as raw } from 'drizzle-orm';
/* RELATIVE, not the `@/` alias: this module is imported by the WS server too
   (`server/index.ts`), which builds outside Next's path mapping. */
import { db } from './db';
import { players } from './db/schema';

const url = process.env.REDIS_URL;

let client: RedisClientType | null = null;

/** Null when REDIS_URL is unset — phases 1-2 are solo and do not need it. */
export async function redis(): Promise<RedisClientType | null> {
  if (!url) return null;
  if (client) return client;
  client = createClient({ url });
  client.on('error', (e) => console.error('[redis]', e.message));
  await client.connect();
  return client;
}

/**
 * Where the player stands: their rank (ties share the better one — two
 * players on 100 are both #1 and the next is #3), and the gap to the next
 * score STRICTLY above theirs, null when nothing is above (the leader, or a
 * tie for the lead). A zero score still ranks: last place is a standing.
 *
 * The gap is in SEASON SCORE, the unit the ranking is made of, and skips a
 * whole tied block — the row at rank - 1 can hold my own score, and "0 to
 * pass" would tell someone who has passed nobody that they are there.
 * Null when there is no such player.
 */
export async function standingOf(playerId: string): Promise<{ rank: number; score: number; gap: number | null } | null> {
  const me = await standingFromDb(playerId);
  if (!me) return null;
  return { rank: me.ahead + 1, score: me.mine, gap: me.above === null ? null : Math.max(0, Math.ceil(me.above - me.mine)) };
}

/**
 * My score, the next score strictly above it, and how many players are ahead
 * — ONE statement. Three reads in a row before (my row, then each figure),
 * three round trips to a database that may sit on another continent.
 */
async function standingFromDb(playerId: string): Promise<{ mine: number; above: number | null; ahead: number } | null> {
  const [row] = await db.execute<{ mine: number | null; above: number | null; ahead: number }>(raw`
    with me as (select ${players.seasonScore} as s from ${players} where ${players.id} = ${playerId})
    select (select s from me) as mine,
           (select min(${players.seasonScore}) from ${players} where ${players.seasonScore} > (select s from me)) as above,
           (select count(*) from ${players} where ${players.seasonScore} > (select s from me))::int as ahead`);
  if (!row || row.mine === null) return null;
  return { mine: Number(row.mine), above: row.above === null ? null : Number(row.above), ahead: Number(row.ahead) };
}

/**
 * The crowned player, read from Postgres — the season's #1 by score.
 *
 * The crown changes what a raid takes and what a run scores, so it is read
 * from the rows that ARE the score. Nobody wears it on a score of zero.
 */
export async function crownHolderId(): Promise<string | null> {
  const [top] = await db
    .select({ id: players.id })
    .from(players)
    .where(gt(players.seasonScore, 0))
    .orderBy(desc(players.seasonScore), players.id)
    .limit(1);
  return top?.id ?? null;
}
