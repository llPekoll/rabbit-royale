/**
 * The season pass: who holds it, what the pot holds, who it pays.
 *
 * A pass season is an ordinary season with `pass_on` set (see PASS in
 * config/tuning.ts). This module is the rules and the reads; the grant is in
 * grant.ts (a paid pass arrives through the same payment rail as a bomb), the
 * daily chest in the /api/pass route, and the payout list is written by the
 * season close (season.ts) through `writePassPayouts`.
 *
 * RELATIVE imports, like season.ts: the WS server imports this through the
 * season close, and it does not resolve the `@/` alias.
 */
import { and, eq, inArray, isNull, sql as raw } from 'drizzle-orm';
import { db } from '../db';
import { passPayouts, seasonPasses, seasons } from '../db/schema';
import { PASS, passPayoutShare } from '../../../config/tuning';
import { tuned } from '../tuning/live';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/** The `item_kind` a pass payment carries. Never in `inventory`. */
export const PASS_KIND = 'season_pass' as const;
export type PassKind = typeof PASS_KIND;

export function isPassKind(v: unknown): v is PassKind {
  return v === PASS_KIND;
}

/** Today's price, with the live override if one is set. */
export function passPriceUsd(): number {
  return tuned('PASS.PRICE_USD');
}

// ── Pure rules ───────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** The UTC day a timestamp falls in. The chest resets at midnight UTC for everyone. */
const utcDay = (t: number) => Math.floor(t / DAY_MS);

/** Today's chest is waiting: never claimed, or last claimed on an earlier UTC day. */
export function canClaimDaily(lastClaimAt: Date | null, now: number): boolean {
  return !lastClaimAt || utcDay(lastClaimAt.getTime()) < utcDay(now);
}

/** When the next chest opens: now if one is waiting, else the next UTC midnight. */
export function nextClaimAt(lastClaimAt: Date | null, now: number): Date {
  return canClaimDaily(lastClaimAt, now) ? new Date(now) : new Date((utcDay(now) + 1) * DAY_MS);
}

export interface PassSeason {
  id: number;
  endsAt: Date;
  endedAt: Date | null;
  passOn: boolean;
}

/**
 * Why a pass cannot be sold right now, or null when it can.
 *
 * 'pass_closed' — no pass this season; 'pass_owned' — already holds it;
 * 'pass_ending' — inside the last SALE_CUTOFF_MS, where a quote could still be
 * paid after the close and buy a seat at a pot already shared out.
 */
export function passSaleBlocker(season: PassSeason | null | undefined, holder: boolean, now: number): string | null {
  if (!season || season.endedAt || !season.passOn) return 'pass_closed';
  if (holder) return 'pass_owned';
  if (season.endsAt.getTime() - now < PASS.SALE_CUTOFF_MS) return 'pass_ending';
  return null;
}

/** What the passes raised that goes back to players, in cents. */
export function prizePoolCents(potCents: number): number {
  return Math.floor(potCents * PASS.POT_SHARE);
}

export interface RankedHolder {
  playerId: string;
  score: number;
}

/**
 * Cut the prize pool between the ranked holders (already ordered, best first).
 *
 * Only the first PAYOUT_SHARES.length are paid; with fewer holders the shares
 * are normalised over whoever is there (see passPayoutShare). Rounded DOWN to
 * the cent, so the sum never exceeds the pool.
 */
export function payoutPlan<T extends RankedHolder>(potCents: number, ranked: T[]): Array<T & { rank: number; usdCents: number }> {
  const pool = prizePoolCents(potCents);
  const paid = ranked.slice(0, PASS.PAYOUT_SHARES.length);
  return paid.map((h, i) => ({ ...h, rank: i + 1, usdCents: Math.floor(pool * passPayoutShare(i, paid.length)) }));
}

// ── Reads and writes ─────────────────────────────────────────────────────────

/** The running season, or null on a database that has none yet. */
export async function openSeason(tx: Tx = db): Promise<(PassSeason & { startedAt: Date }) | null> {
  const [row] = await tx.select({
    id: seasons.id, startedAt: seasons.startedAt, endsAt: seasons.endsAt,
    endedAt: seasons.endedAt, passOn: seasons.passOn,
  }).from(seasons).where(isNull(seasons.endedAt)).limit(1);
  return row ?? null;
}

export async function passOf(tx: Tx, seasonId: number, playerId: string) {
  const [row] = await tx.select().from(seasonPasses)
    .where(and(eq(seasonPasses.seasonId, seasonId), eq(seasonPasses.playerId, playerId)))
    .limit(1);
  return row ?? null;
}

/**
 * Seat a player in the running season, inside the caller's transaction.
 *
 * Seats them in the OPEN season even if its pass has just been switched off:
 * the money has landed by the time this runs, and a paid pass that went
 * nowhere is a refund. The sale cutoff keeps that window to almost nothing.
 * A second pass for the same season is ignored (unique index) and logged.
 */
export async function grantPass(
  tx: Tx,
  playerId: string,
  paid: { paymentId?: string | null; usdCents: number },
): Promise<{ seasonId: number } | null> {
  const season = await openSeason(tx);
  if (!season) {
    console.warn('[pass] no open season to seat', playerId);
    return null;
  }
  const seated = await tx.insert(seasonPasses).values({
    seasonId: season.id,
    playerId,
    paymentId: paid.paymentId ?? null,
    usdCents: paid.usdCents,
  }).onConflictDoNothing().returning({ seasonId: seasonPasses.seasonId });
  if (seated.length === 0) console.warn('[pass] already held — second payment kept, no second seat', playerId, paid.paymentId);
  return { seasonId: season.id };
}

/** Everything the passes of `seasonId` put in, in cents. */
export async function potCents(tx: Tx, seasonId: number): Promise<number> {
  const [row] = await tx.execute<{ cents: string | null }>(raw`
    select coalesce(sum(usd_cents), 0)::bigint as cents from season_passes where season_id = ${seasonId}
  `);
  return Number(row?.cents ?? 0);
}

export async function holderCount(tx: Tx, seasonId: number): Promise<number> {
  const [row] = await tx.execute<{ n: string }>(raw`
    select count(*)::bigint as n from season_passes where season_id = ${seasonId}
  `);
  return Number(row?.n ?? 0);
}

export interface HolderRow extends RankedHolder {
  name: string;
  avatar: string | null;
  wallet: string | null;
}

/**
 * Pass holders by season score, best first — the race for the pot.
 *
 * Only holders who SCORED: a pass bought and never played does not take a
 * prize from someone who dug all month. Ties go to whoever bought first.
 */
export async function rankedHolders(tx: Tx, seasonId: number, limit: number = PASS.PAYOUT_SHARES.length): Promise<HolderRow[]> {
  const rows = await tx.execute<{ player_id: string; score: string; name: string; avatar: string | null; wallet: string | null }>(raw`
    select sp.player_id, p.season_score::bigint as score, p.name, p.avatar, p.wallet
    from season_passes sp join players p on p.id = sp.player_id
    where sp.season_id = ${seasonId} and p.season_score > 0
    order by p.season_score desc, sp.bought_at asc
    limit ${limit}
  `);
  return [...rows].map((r) => ({
    playerId: r.player_id, score: Number(r.score), name: r.name, avatar: r.avatar, wallet: r.wallet,
  }));
}

/** Where a holder sits in the race (1-based), or null when they have not scored. */
export async function holderRank(tx: Tx, seasonId: number, playerId: string): Promise<number | null> {
  const [row] = await tx.execute<{ rank: string | null }>(raw`
    select r.rank from (
      select sp.player_id, rank() over (order by p.season_score desc, sp.bought_at asc) as rank
      from season_passes sp join players p on p.id = sp.player_id
      where sp.season_id = ${seasonId} and p.season_score > 0
    ) r where r.player_id = ${playerId}
  `);
  return row?.rank ? Number(row.rank) : null;
}

/**
 * Write what the closing pass season owes its top ten.
 *
 * Called by the season close BEFORE scores are reset, in its transaction.
 * Idempotent (unique index): a second close of the same season writes nothing.
 */
export async function writePassPayouts(tx: Tx, seasonId: number): Promise<number> {
  const pot = await potCents(tx, seasonId);
  const plan = payoutPlan(pot, await rankedHolders(tx, seasonId)).filter((p) => p.usdCents > 0);
  if (plan.length === 0) return 0;
  await tx.insert(passPayouts).values(plan.map((p) => ({
    seasonId,
    playerId: p.playerId,
    rank: p.rank,
    score: p.score,
    wallet: p.wallet,
    usdCents: p.usdCents,
  }))).onConflictDoNothing();
  return plan.length;
}

/** Who holds the pass this season — the board's gold ticket. */
export async function holdersAmong(seasonId: number, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.select({ playerId: seasonPasses.playerId }).from(seasonPasses)
    .where(and(eq(seasonPasses.seasonId, seasonId), inArray(seasonPasses.playerId, ids)));
  return new Set(rows.map((r) => r.playerId));
}
