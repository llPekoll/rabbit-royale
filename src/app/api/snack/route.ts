/**
 * SNACK TIME, the daily gift (`lib/game/snack.ts`).
 *
 * GET  /api/snack?tz=<minutes east of UTC>   — the week, today's snack, and
 *                                              when the next one comes.
 * POST /api/snack { tz, pick? }               — take today's; `pick` names the
 *                                              pack on the seventh day.
 *
 * `tz` is the phone's offset, sent with every call, because the day is the
 * phone's: a snack is due at ITS midnight (`snackReadyAt`).
 *
 * The claim is ONE transaction on the locked streak row: two taps, two tabs
 * or a replayed request find the row already moved and are told `not_ready`.
 */
import { eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, snackStreak } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { burrowView } from '@/lib/game/burrow';
import { grantItem } from '@/lib/game/grant';
import { claimSnack, snackView, type SnackRow } from '@/lib/game/snack';
import { clampTzOffset } from '@/lib/notify/schedule';

export const dynamic = 'force-dynamic';

async function rowOf(playerId: string): Promise<SnackRow | null> {
  const [row] = await db.select().from(snackStreak).where(eq(snackStreak.playerId, playerId)).limit(1);
  return row ?? null;
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const tz = clampTzOffset(new URL(req.url, 'http://x').searchParams.get('tz'));
  return Response.json({ snack: snackView(await rowOf(session.sub), Date.now(), tz) });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tz?: unknown; pick?: unknown };
  const tz = clampTzOffset(body.tz);
  const now = Date.now();
  const id = session.sub;

  const result = await db.transaction(async (tx) => {
    await tx.insert(snackStreak).values({ playerId: id }).onConflictDoNothing();
    const [row] = await tx.select().from(snackStreak).where(eq(snackStreak.playerId, id)).for('update');
    const claim = claimSnack(row ?? null, now, tz, body.pick);
    if (!claim.ok) return claim;

    await tx.update(snackStreak).set(claim.next).where(eq(snackStreak.playerId, id));
    // A snack feeds the three counters like a quest does: a carrot event,
    // not a coupon (SNACK in config/tuning.ts).
    if (claim.carrots > 0) {
      await tx.update(players).set({
        stock: raw`${players.stock} + ${claim.carrots}`,
        seasonScore: raw`${players.seasonScore} + ${claim.carrots}`,
        lifetimeCarrots: raw`${players.lifetimeCarrots} + ${claim.carrots}`,
      }).where(eq(players.id, id));
    }
    // A gift: each item stops at the bag's ceiling (grantItem, no receipt),
    // and the answer says what actually arrived.
    const granted: { kind: string; qty: number }[] = [];
    for (const item of claim.items) {
      const got = await grantItem(tx, id, item.kind, item.qty, now);
      granted.push({ kind: item.kind, qty: got.qty });
    }
    return { ...claim, granted };
  });

  if (!result.ok) {
    const status = result.error === 'not_ready' ? 409 : 400;
    return Response.json({ error: result.error, snack: snackView(await rowOf(id), now, tz) }, { status });
  }

  const after = await db.query.players.findFirst({ where: eq(players.id, id) });
  if (!after) return Response.json({ error: 'unknown player' }, { status: 404 });
  return Response.json({
    reward: { day: result.day, carrots: result.carrots, pack: result.pack, items: result.granted },
    snack: snackView(result.next, now, tz),
    burrow: burrowView(after),
  });
}
