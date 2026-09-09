/**
 * The live leaderboard and cross-process presence, in Redis.
 *
 * Shared by BOTH tiers: the WS server writes a score when a run banks, the web
 * API reads the board. One implementation rather than two, because a
 * leaderboard that disagrees with itself depending on which service you asked
 * is worse than no leaderboard.
 *
 * Postgres holds the truth about season scores; Redis holds the ORDERING. A
 * sorted set answers "top 100" and "my rank" in O(log n) no matter how many
 * players there are, which a `ORDER BY score LIMIT 100` over a growing table
 * will not once this gets busy.
 *
 * Redis is treated as a CACHE, never as the record: every score written here is
 * written to Postgres too, and `rebuildLeaderboard` restores the set from
 * Postgres after a flush or a cold start. Losing Redis costs a rebuild, not
 * anyone's progress.
 */
import { createClient, type RedisClientType } from 'redis';

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

const SEASON_KEY = (season: number) => `rr:season:${season}:scores`;
const ONLINE_KEY = 'rr:online';

/** Mirror a player's season score into the sorted set. */
export async function setScore(season: number, playerId: string, score: number) {
  const r = await redis();
  await r?.zAdd(SEASON_KEY(season), { score, value: playerId });
}

export async function topPlayers(season: number, n: number) {
  const r = await redis();
  if (!r) return [];
  const rows = await r.zRangeWithScores(SEASON_KEY(season), 0, n - 1, { REV: true });
  return rows.map((row, i) => ({ rank: i + 1, playerId: row.value, score: row.score }));
}

/** 1-based rank, or null when the player has no score this season. */
export async function rankOf(season: number, playerId: string): Promise<number | null> {
  const r = await redis();
  if (!r) return null;
  const rank = await r.zRevRank(SEASON_KEY(season), playerId);
  return rank === null ? null : rank + 1;
}

/** The crowned player — the #1 of the current season. */
export async function crownHolder(season: number): Promise<string | null> {
  const [top] = await topPlayers(season, 1);
  return top?.playerId ?? null;
}

/** Rebuild the whole set from Postgres. Cold start, or after a Redis flush. */
export async function rebuildLeaderboard(
  season: number,
  rows: Array<{ id: string; seasonScore: number }>,
) {
  const r = await redis();
  if (!r || rows.length === 0) return;
  await r.del(SEASON_KEY(season));
  await r.zAdd(SEASON_KEY(season), rows.map((p) => ({ score: p.seasonScore, value: p.id })));
}

/**
 * Online presence, as a set rather than a counter: a counter drifts every time
 * a process dies without cleaning up, and it can go negative. A set can be
 * recounted and cleaned.
 */
export async function markOnline(playerId: string) {
  const r = await redis();
  await r?.sAdd(ONLINE_KEY, playerId);
}

export async function markOffline(playerId: string) {
  const r = await redis();
  await r?.sRem(ONLINE_KEY, playerId);
}

export async function onlineCount(): Promise<number> {
  const r = await redis();
  return (await r?.sCard(ONLINE_KEY)) ?? 0;
}
