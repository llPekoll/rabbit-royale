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
 *   4. a PASS season writes what its top ten holders are owed (pass_payouts),
 *      from the scores as they stand, before they are wiped;
 *   5. every season score goes back to zero;
 *   6. the next season opens, a DURATION_MS long — or as `next` says, which is
 *      how `scripts/season-pass.ts open` starts a pass season on demand.
 *
 * Idempotent and race-safe: the lock and the `ends_at` test mean two callers
 * at the boundary close it once, and the second finds the new season open.
 */
import { and, eq, isNull, lte, sql as raw } from 'drizzle-orm';
import { db } from '../db';
import { seasons } from '../db/schema';
import { SEASON } from '../../../config/tuning';
import { writePassPayouts } from './season-pass';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SeasonRollover {
  closed: number;
  opened: number;
  championId: string | null;
  championScore: number | null;
  ranked: number;
  /** Prizes written for a pass season's top ten (0 for an ordinary season). */
  payouts: number;
}

export interface CloseOptions {
  /** Close it NOW, whatever its `ends_at` says. The admin's lever, never the clock's. */
  force?: boolean;
  /** The season that follows. Default: an ordinary one, DURATION_MS long. */
  next?: { passOn: boolean; durationMs: number };
}

/** Close the open season if its time is up (or `force`), inside `tx`. Null when it is not. */
export async function closeSeasonIfDue(tx: Tx, now: Date = new Date(), opts: CloseOptions = {}): Promise<SeasonRollover | null> {
  const [open] = await tx.select().from(seasons)
    .where(opts.force ? isNull(seasons.endedAt) : and(isNull(seasons.endedAt), lte(seasons.endsAt, now)))
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

  // Before the wipe: the prizes are read off the scores as they stand.
  const payouts = open.passOn ? await writePassPayouts(tx, open.id) : 0;

  await tx.execute(raw`update players set season_score = 0 where season_score <> 0`);

  const next = opts.next ?? { passOn: false, durationMs: SEASON.DURATION_MS };
  const [opened] = await tx.insert(seasons)
    .values({ startedAt: now, endsAt: new Date(now.getTime() + next.durationMs), passOn: next.passOn })
    .returning({ id: seasons.id });

  return {
    closed: open.id,
    opened: opened.id,
    championId: champion?.id ?? null,
    championScore: champion ? Number(champion.score) : null,
    ranked: Number((ranked as unknown as { count?: number }).count ?? 0),
    payouts,
  };
}

/** Close the open season if its time is up. What the server's clock calls. */
export function rolloverSeasonIfDue(now: Date = new Date()): Promise<SeasonRollover | null> {
  return db.transaction((tx) => closeSeasonIfDue(tx, now));
}
