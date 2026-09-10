/**
 * Put the seeded players into the season's Redis sorted set.
 *
 * WHY THIS EXISTS AS A SECOND STEP. The leaderboard is served from Redis, not
 * from Postgres: `rr:season:<n>:scores` holds the ORDERING, and the row data is
 * then fetched from Postgres for whatever ids that set names. So a player
 * inserted straight into Postgres is invisible on the board — which is exactly
 * what happened to `Thistle`, who has been in the database at 25000 and has
 * never once appeared in the season list.
 *
 * ADDITIVE ONLY. `zAdd` updates the score of a member that is already there and
 * appends one that is not; nothing is deleted, so a mistake here costs a wrong
 * number rather than a wiped board. The rebuild-from-Postgres path exists in
 * `src/lib/leaderboard.ts` (`rebuildLeaderboard`) and does a DEL first — that is
 * the right tool for a corrupted set and the wrong one for adding two rows.
 *
 * Run it INSIDE the web container, which already holds REDIS_URL:
 *
 *   ssh datemeee
 *   docker cp seed-demo-leaderboard.cjs <web-container>:/tmp/
 *   docker exec <web-container> node /tmp/seed-demo-leaderboard.cjs
 *
 * Idempotent: running it twice sets the same three scores to the same values.
 */
const { createClient } = require('redis');

/** The season whose set is being written. Check before running on a new season. */
const SEASON = 1;

/**
 * Who to add, and at what score.
 *
 * These MUST match `players.season_score` in Postgres. Redis is a cache here,
 * never the record — a score that disagrees with the database is a bug that
 * survives until the next rebuild, and it shows up as a board that reorders
 * itself for no reason.
 */
const MEMBERS = [
  { value: 'sol:DEMObramb1ethumper00000000000000000000', score: 6480 },
  { value: 'sol:DEMOc1ementinewarren000000000000000000', score: 3140 },
  // Already in Postgres at 25000 but never in the set, so never on the board.
  { value: 'sol:TESTDUMMY1111111111111111111111111111111', score: 25000 },
];

(async () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error('REDIS_URL is unset — run this inside the web container.');
    process.exit(1);
  }
  const key = `rr:season:${SEASON}:scores`;
  const r = createClient({ url });
  await r.connect();

  const before = await r.zRangeWithScores(key, 0, -1, { REV: true });
  console.log(`before (${before.length}):`, JSON.stringify(before));

  await r.zAdd(key, MEMBERS);

  const after = await r.zRangeWithScores(key, 0, -1, { REV: true });
  console.log(`after  (${after.length}):`, JSON.stringify(after, null, 1));

  await r.quit();
})().catch((e) => { console.error(e); process.exit(1); });
