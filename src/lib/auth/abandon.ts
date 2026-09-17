/**
 * A guest walking away for good — and the rows nobody could ever reach again.
 *
 * THE TOKEN IS THE ACCOUNT. A wallet player who disconnects signs back in with
 * the same wallet; a guest has nothing to sign back in WITH, so "abandon" used
 * to drop the cookie and leave the row standing: a burrow nobody can open,
 * still holding a rank on the season board and a slot in the raid targets.
 * Every abandoned guest was a ghost with a garden worth raiding. This module
 * deletes the row, and with it (the schema cascades) the runs, traps, raids,
 * inventory, purchases and standings that pointed at it.
 *
 * Two callers, one rule:
 *  - `deleteGuest`: the player pressed ABANDON, twice. Immediate.
 *  - `purgeOrphanGuests`: the janitor. A guest who has not been seen for
 *    longer than a session can live (the token's 30 days) cannot come back —
 *    the cookie that named them has expired. A guest who never banked a
 *    single run and has not been back in a day is the same thing sooner:
 *    they pressed PLAY, saw the island, and left. Both are gone by the only
 *    test that matters, which is whether any browser can still open them.
 *
 * NEVER a wallet. A guest who linked a wallet keeps `guest:` as their id (see
 * link.ts) but has a wallet on the row — that account is reachable for ever
 * and is not a guest by this module's reading. Both callers check the column,
 * not the id.
 */
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db';
import { players, seasons } from '../db/schema';
import { isGuestId } from './guest';
import { redis } from '../leaderboard';

/** How long a session token lives — `TTL` in jwt.ts, as milliseconds. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A guest with no runs is written off after this long unseen. */
export const NEVER_PLAYED_TTL_MS = 24 * 60 * 60 * 1000;

export interface GuestRow {
  id: string;
  wallet: string | null;
  runsPlayed: number;
  lastSeenAt: Date;
}

/**
 * Whether no browser can reach this row any more.
 *
 * Pure, so the rule is testable without a database — it is the one decision
 * in here that deletes somebody's progress, and it has to be readable in full.
 */
export function isOrphanGuest(row: GuestRow, now: Date = new Date()): boolean {
  if (!isGuestId(row.id) || row.wallet !== null) return false;
  const idle = now.getTime() - row.lastSeenAt.getTime();
  if (idle >= SESSION_TTL_MS) return true;
  return row.runsPlayed === 0 && idle >= NEVER_PLAYED_TTL_MS;
}

/**
 * Take a player off the season board's cache.
 *
 * Postgres cascades; Redis does not. The sorted set would otherwise keep
 * ranking a row that no longer exists, and the board's join against the
 * players table would print a blank row for it.
 */
async function forgetScores(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const r = await redis().catch(() => null);
  if (!r) return;
  const keys = await r.keys('rr:season:*:scores');
  for (const key of keys) await r.zRem(key, ids);
  await r.sRem('rr:online', ids);
}

/**
 * Delete rows by id — the shared tail of both callers.
 *
 * A season's `championId` points at players WITHOUT a cascade (a champion is
 * history, not a live reference), so it is cleared first or the delete is
 * refused by the constraint.
 */
async function deleteRows(ids: string[]): Promise<void> {
  for (const id of ids) {
    await db.update(seasons).set({ championId: null }).where(eq(seasons.championId, id));
    await db.delete(players).where(eq(players.id, id));
  }
  await forgetScores(ids);
}

export type AbandonResult = 'deleted' | 'not_guest' | 'unknown_player';

/**
 * The player's own ABANDON. Only ever a guest: a wallet player pressing the
 * same button is disconnected, not deleted, and the route refuses this for
 * them rather than trusting the client's reading of who they are.
 */
export async function deleteGuest(id: string): Promise<AbandonResult> {
  if (!isGuestId(id)) return 'not_guest';
  const row = await db.query.players.findFirst({
    where: eq(players.id, id),
    columns: { id: true, wallet: true },
  });
  if (!row) return 'unknown_player';
  if (row.wallet !== null) return 'not_guest';
  await deleteRows([id]);
  return 'deleted';
}

/**
 * The janitor. Returns the ids it removed, so a caller can log them.
 *
 * `dryRun` answers the same question without deleting anything — what the
 * one-off script prints before it is told to go ahead.
 */
export async function purgeOrphanGuests(
  now: Date = new Date(),
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<GuestRow[]> {
  // The SQL mirrors `isOrphanGuest` so the database does the narrowing; the
  // rows that come back are then re-checked by the pure rule, which is the
  // one the tests pin.
  const rows = await db
    .select({
      id: players.id,
      wallet: players.wallet,
      runsPlayed: players.runsPlayed,
      lastSeenAt: players.lastSeenAt,
    })
    .from(players)
    .where(and(
      isNull(players.wallet),
      or(
        lt(players.lastSeenAt, new Date(now.getTime() - SESSION_TTL_MS)),
        and(eq(players.runsPlayed, 0), lt(players.lastSeenAt, new Date(now.getTime() - NEVER_PLAYED_TTL_MS))),
      ),
    ));
  const orphans = rows.filter((r) => isOrphanGuest(r, now));
  if (!dryRun && orphans.length) await deleteRows(orphans.map((r) => r.id));
  return orphans;
}
