/**
 * Snack Time between the database and the rules (`lib/game/snack.ts`): the
 * streak row, the run the bonus of the day went to, and the gifts a closed
 * week puts in the burrow.
 */
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, runs, snackStreak } from '@/lib/db/schema';
import { baseBurrowFor, setBurrowEdits } from '@/game/burrow/board';
import { withGifts, type BurrowEdits } from '@/game/burrow/generate';
import { buffBonus, buffLive, giftsOwned, type SnackRow } from './snack';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function snackRowOf(playerId: string, tx: Tx = db): Promise<SnackRow | null> {
  const [row] = await tx.select().from(snackStreak).where(eq(snackStreak.playerId, playerId)).limit(1);
  return row ?? null;
}

/**
 * The carrots of the first run that paid anything since the box was opened —
 * the run the bonus of the day went to — or null when none has banked yet.
 */
export async function firstRunSince(playerId: string, row: SnackRow | null, tx: Tx = db): Promise<number | null> {
  if (!row?.claimedAt) return null;
  const [run] = await tx.select({ carrots: runs.carrots }).from(runs)
    .where(and(eq(runs.playerId, playerId), gt(runs.endedAt, row.claimedAt), gt(runs.carrots, 0)))
    .orderBy(asc(runs.endedAt))
    .limit(1);
  return run ? run.carrots : null;
}

/**
 * THE BONUS OF THE DAY for a run banking `carrots` now: what to add on top,
 * zero when no box was opened today or a paying run already took it. Read
 * BEFORE the run's own row is closed, so it never counts itself.
 */
export async function snackBonus(playerId: string, carrots: number, level: number, now = Date.now()): Promise<number> {
  if (carrots <= 0) return 0;
  const row = await snackRowOf(playerId);
  if (!buffLive(row, now, false)) return 0;
  if ((await firstRunSince(playerId, row)) !== null) return 0;
  return buffBonus(carrots, level);
}

/**
 * Lay the gifts the streak owns in the burrow, inside the caller's
 * transaction: `burrow_edits.gifts` follows the streak, each gift on a cell
 * the rules accept. Returns the edits written (or the ones there, unchanged).
 * The rules' cache is the caller's to refresh once the transaction is in —
 * `adoptGifts` — so a rollback cannot leave it ahead of the database.
 */
export async function layGifts(tx: Tx, playerId: string, row: SnackRow | null): Promise<BurrowEdits | null> {
  const [player] = await tx.select({ edits: players.burrowEdits }).from(players)
    .where(eq(players.id, playerId)).limit(1);
  if (!player) return null;
  const was = (player.edits ?? {}) as BurrowEdits;
  const want = giftsOwned(row);
  if ((was.gifts ?? 0) === want) return was;
  const next = withGifts(baseBurrowFor(playerId), was, want);
  if (!next) return was;
  await tx.update(players).set({ burrowEdits: next }).where(eq(players.id, playerId));
  return next;
}

export function adoptGifts(playerId: string, edits: BurrowEdits | null): void {
  setBurrowEdits(playerId, edits);
}
