/**
 * GET /api/player/history — what happened to this player, and who did it.
 *
 * Four lists, because the profile menu asks four questions:
 *  - `days`: carrots dug per day, so "how am I doing lately" has an answer that
 *    is not a single lifetime number;
 *  - `runs`: the individual runs behind those days;
 *  - `raids`: who crossed this burrow, what they took, and — the part that
 *    matters — WHO, by name, since being robbed while away is only a story if
 *    it has a culprit;
 *  - `purchases`: where the carrots WENT. Digging is only half the ledger, and
 *    a player who spent thousands on traps could previously find nothing to
 *    show for it but a smaller number.
 *
 * Only FINISHED runs count. A run row is created on join and completed when the
 * rabbit dies (server/index.ts bankRun), so a player who closed the tab leaves a
 * row with a null `endedAt` and no carrots — counting those would report a day
 * of zeroes that never happened.
 */
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { players, purchases, raids, runs } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';

/** How far back the profile looks. Long enough to see a habit, short enough to stay one query. */
const DAYS = 14;
const RUN_LIMIT = 20;
const RAID_LIMIT = 20;
const PURCHASE_LIMIT = 20;

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const since = new Date(Date.now() - DAYS * 86_400_000);

  // Carrots per day. Grouped in SQL rather than in JS: the (player_id,
  // started_at) index already orders this, and shipping 14 days of rows to
  // add them up here would be the same query with extra steps.
  const days = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${runs.startedAt}), 'YYYY-MM-DD')`.as('day'),
      carrots: sql<number>`coalesce(sum(${runs.carrots}), 0)::int`.as('carrots'),
      runs: sql<number>`count(*)::int`.as('runs'),
      tilesDug: sql<number>`coalesce(sum(${runs.tilesDug}), 0)::int`.as('tiles_dug'),
    })
    .from(runs)
    .where(and(eq(runs.playerId, session.sub), isNotNull(runs.endedAt), gte(runs.startedAt, since)))
    .groupBy(sql`date_trunc('day', ${runs.startedAt})`)
    .orderBy(desc(sql`date_trunc('day', ${runs.startedAt})`));

  const recentRuns = await db
    .select({
      id: runs.id,
      carrots: runs.carrots,
      tilesDug: runs.tilesDug,
      bombsHit: runs.bombsHit,
      durationMs: runs.durationMs,
      islandTier: runs.islandTier,
      endedAt: runs.endedAt,
    })
    .from(runs)
    .where(and(eq(runs.playerId, session.sub), isNotNull(runs.endedAt)))
    .orderBy(desc(runs.startedAt))
    .limit(RUN_LIMIT);

  // Raids AGAINST this player, joined to the attacker so the log can name them.
  // Aliased because the same table is joined again below for the other
  // direction, and two joins to `players` need two names.
  const attacker = alias(players, 'attacker');
  const against = await db
    .select({
      id: raids.id,
      result: raids.result,
      damage: raids.damage,
      carrotsLooted: raids.carrotsLooted,
      scoreTransferred: raids.scoreTransferred,
      seenByDefender: raids.seenByDefender,
      createdAt: raids.createdAt,
      otherId: raids.attackerId,
      otherName: attacker.name,
      otherAvatar: attacker.avatar,
    })
    .from(raids)
    .innerJoin(attacker, eq(attacker.id, raids.attackerId))
    .where(eq(raids.defenderId, session.sub))
    .orderBy(desc(raids.createdAt))
    .limit(RAID_LIMIT);

  // ...and raids BY this player, so the log reads as a feud rather than a list
  // of grievances.
  const defender = alias(players, 'defender');
  const by = await db
    .select({
      id: raids.id,
      result: raids.result,
      damage: raids.damage,
      carrotsLooted: raids.carrotsLooted,
      scoreTransferred: raids.scoreTransferred,
      seenByDefender: raids.seenByDefender,
      createdAt: raids.createdAt,
      otherId: raids.defenderId,
      otherName: defender.name,
      otherAvatar: defender.avatar,
    })
    .from(raids)
    .innerJoin(defender, eq(defender.id, raids.defenderId))
    .where(eq(raids.attackerId, session.sub))
    .orderBy(desc(raids.createdAt))
    .limit(RAID_LIMIT);

  // What the carrots bought. Reads `purchases` rather than `payments`: the
  // latter is the USDC rail's own ledger and holds quotes that were never paid,
  // whereas this table only ever holds goods actually delivered — which is what
  // a receipt list should show.
  const recentPurchases = await db
    .select({
      id: purchases.id,
      kind: purchases.kind,
      qty: purchases.qty,
      currency: purchases.currency,
      cost: purchases.cost,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(eq(purchases.playerId, session.sub))
    .orderBy(desc(purchases.createdAt))
    .limit(PURCHASE_LIMIT);

  return Response.json({
    days,
    runs: recentRuns,
    purchases: recentPurchases,
    raids: {
      against: against.map((r) => ({ ...r, direction: 'against' as const })),
      by: by.map((r) => ({ ...r, direction: 'by' as const })),
      /** The badge on the button: raids the player has not looked at yet. */
      unseen: against.filter((r) => !r.seenByDefender).length,
    },
  });
}

/**
 * POST /api/player/history — mark the raid log as read.
 *
 * Separate from the GET so that merely fetching the profile does not clear the
 * badge: the player has to actually open the log.
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  await db
    .update(raids)
    .set({ seenByDefender: true })
    .where(and(eq(raids.defenderId, session.sub), eq(raids.seenByDefender, false)));

  return Response.json({ ok: true });
}
