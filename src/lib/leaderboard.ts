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

/**
 * The slice of the Redis client this module's ranking reads through.
 *
 * Named so `gapToNextRank` can accept a stand-in without depending on the real
 * client's full (very large) type.
 */
type RedisLike = {
  zRevRank(key: string, member: string): Promise<number | null>;
  zScore(key: string, member: string): Promise<number | null>;
  zRangeWithScores(
    key: string, start: number, stop: number, opts?: { REV?: boolean },
  ): Promise<Array<{ value: string; score: number }>>;
};

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
/** On an island right now — see `markOnline`. */
const ONLINE_KEY = 'rr:online';
/**
 * Has a live socket, ANYWHERE — island, burrow, shop, staring at the map.
 *
 * The companion to `rr:online`, and deliberately a second set rather than a
 * widening of the first: the two answer different questions and the raid list
 * needs both. `rr:online` says "out digging", which is a burrow left
 * unattended; this one says "at the keyboard", which is someone who will see
 * the intruder land (`tellDefender`) and can reach for the lightning.
 *
 * Without it the list could only say "digging" or nothing, and nothing had to
 * carry two meanings at once — away, and here-but-home. Those are opposite
 * advice to a raider, so they cannot share a blank.
 */
const CONNECTED_KEY = 'rr:connected';

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

/**
 * How far the player is from the rank above them.
 *
 * WHY THIS EXISTS. A rank on its own ("#5") is a fact about where you stand;
 * it does not say what to do about it. The gap to the player one place ahead
 * is the smallest actionable target the season has — the one number that turns
 * a standing into a goal.
 *
 * Reads the ordered set directly: the player above is the row at `rank - 1`,
 * which is one `zRange` rather than a scan. Returns null when there is nothing
 * to chase — the player is #1, has no score this season, or Redis is absent
 * (phases 1-2 are solo and have no board at all).
 *
 * The gap is in SEASON SCORE, the unit the ranking is actually made of. It is
 * deliberately not converted to banked carrots: the two move together but are
 * not the same quantity, and a target quoted in the wrong unit would send the
 * player after the wrong number.
 */
export async function gapToNextRank(
  season: number,
  playerId: string,
  /**
   * The client to read through. Defaults to the module's own, and exists so a
   * test can stand a fake sorted set in its place: the arithmetic and the edge
   * cases (the leader, an unranked player, a tie) are what need checking, and
   * spinning up Redis to check them would test the wrong thing.
   */
  client: Pick<RedisLike, 'zRevRank' | 'zScore' | 'zRangeWithScores'> | null = null,
): Promise<{ rank: number; gap: number } | null> {
  const r = client ?? await redis();
  if (!r) return null;

  const rank0 = await r.zRevRank(SEASON_KEY(season), playerId);
  if (rank0 === null || rank0 === 0) return null; // unranked, or already #1

  const mine = await r.zScore(SEASON_KEY(season), playerId);
  if (mine === null) return null;

  const [above] = await r.zRangeWithScores(
    SEASON_KEY(season), rank0 - 1, rank0 - 1, { REV: true },
  );
  if (!above) return null;

  return {
    rank: rank0 + 1,
    // Clamped at 0: scores can tie, and a "0 to pass" reads as "you are there"
    // rather than as a negative target.
    gap: Math.max(0, Math.ceil(above.score - mine)),
  };
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

/**
 * They have a socket. Called once the handshake names them, not on `join`.
 *
 * Separate from `markOnline` because the two have different lifetimes: this
 * one runs the moment a tab authenticates and lasts until the socket closes,
 * while `markOnline` comes and goes with each island. A player who walks off
 * an island back to their burrow leaves `rr:online` and stays here.
 */
export async function markConnected(playerId: string) {
  const r = await redis();
  await r?.sAdd(CONNECTED_KEY, playerId);
}

export async function markDisconnected(playerId: string) {
  const r = await redis();
  await r?.sRem(CONNECTED_KEY, playerId);
}

/**
 * Which of `ids` are out on an island right now.
 *
 * One round trip for the whole board rather than one per row: `SMISMEMBER`
 * answers the entire membership question at once, and the leaderboard asks it
 * about fifty players every time it opens.
 *
 * Note what this set actually means. A player is added in the `join` handler —
 * the moment they land on an island — and removed on disconnect, so it is
 * "currently digging", not "has the tab open". That is the more useful of the
 * two: it is the difference between a row worth watching and a row that is
 * merely someone's account. For "has the tab open", see `connectedAmong`.
 */
export async function onlineAmong(ids: string[]): Promise<Set<string>> {
  return membersAmong(ONLINE_KEY, ids);
}

/**
 * Which of `ids` have a live socket right now, wherever they are standing.
 *
 * A SUPERSET of `onlineAmong`: everyone out on an island is also connected,
 * so the raid list reads the two together — connected and digging is "out
 * digging", connected and not digging is "home", neither is "away".
 */
export async function connectedAmong(ids: string[]): Promise<Set<string>> {
  return membersAmong(CONNECTED_KEY, ids);
}

/**
 * `SMISMEMBER` for one set, with presence's failure rule applied once.
 *
 * Redis down returns an EMPTY set, never a throw. Presence is decoration on a
 * board that must render regardless; the failure mode is "nobody looks
 * online", which is wrong quietly rather than a page that will not load.
 */
async function membersAmong(key: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const r = await redis();
    if (!r) return new Set();
    const flags = await r.smIsMember(key, ids);
    return new Set(ids.filter((_, i) => flags[i]));
  } catch {
    return new Set();
  }
}
