/**
 * The end of a season — the only thing that ever resets the season score.
 *
 * GDD: "Seasons last 1 month. Season score resets; lifetime and stock never
 * do." The season rows had an `ends_at` and nothing ever read it: the first
 * season was created on first need and stayed open forever, its countdown
 * sitting at zero, the crown never changing hands for any reason but a raid.
 *
 * Closing a season, in one transaction:
 *   1. the open season is locked, and left alone unless its time is up;
 *   2. every scoring player's final rank and score are written to
 *      `season_standings` (the record the Mausoleum of Kings was meant to
 *      read — the Sacrifice is gone, the record of who won is not);
 *   3. the champion is stamped on the season row, and the season closed;
 *   4. every season score goes back to zero;
 *   5. the next season opens, a DURATION_MS long.
 *
 * Idempotent and race-safe: the lock and the `ends_at` test mean two callers
 * at the boundary close it once, and the second finds the new season open.
 */
import { and, eq, isNull, lte, sql as raw } from 'drizzle-orm';
import { db } from '../db';
import { seasons } from '../db/schema';
import { SEASON } from '../../../config/tuning';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SeasonRollover {
  closed: number;
  opened: number;
  championId: string | null;
  championScore: number | null;
  ranked: number;
}

/** Close the open season if its time is up, inside `tx`. Null when it is not. */
export async function closeSeasonIfDue(tx: Tx, now: Date = new Date()): Promise<SeasonRollover | null> {
  const [open] = await tx.select().from(seasons)
    .where(and(isNull(seasons.endedAt), lte(seasons.endsAt, now)))
    .for('update');
  if (!open) return null;

  const ranked = await tx.execute(raw`
    insert into season_standings (season_id, player_id, rank, score)
    select ${open.id}, id, rank() over (order by season_score desc), season_score
    from players where season_score > 0
    on conflict do nothing
  `);
  const [champion] = await tx.execute<{ id: string; score: number }>(raw`
    select id, season_score::bigint as score from players
    where season_score > 0 order by season_score desc, id limit 1
  `);

  await tx.update(seasons).set({
    endedAt: now,
    championId: champion?.id ?? null,
    championScore: champion ? Number(champion.score) : null,
  }).where(eq(seasons.id, open.id));

  await tx.execute(raw`update players set season_score = 0 where season_score <> 0`);

  const [next] = await tx.insert(seasons)
    .values({ startedAt: now, endsAt: new Date(now.getTime() + SEASON.DURATION_MS) })
    .returning({ id: seasons.id });

  return {
    closed: open.id,
    opened: next.id,
    championId: champion?.id ?? null,
    championScore: champion ? Number(champion.score) : null,
    ranked: Number((ranked as unknown as { count?: number }).count ?? 0),
  };
}

/** Close the open season if its time is up. What the server's clock calls. */
export function rolloverSeasonIfDue(now: Date = new Date()): Promise<SeasonRollover | null> {
  return db.transaction((tx) => closeSeasonIfDue(tx, now));
}
