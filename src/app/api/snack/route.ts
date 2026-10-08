/**
 * SNACK TIME, the daily surprise box (`lib/game/snack.ts`).
 *
 * GET  /api/snack?tz=<minutes east of UTC>   — today's box, its odds, the
 *                                              gifts, the bonus of the day.
 * POST /api/snack { tz }                      — open today's box.
 *
 * `tz` is the phone's offset, sent with every call, because the day is the
 * phone's: a box is due at ITS midnight (`snackReadyAt`).
 *
 * The claim is ONE transaction on the locked streak row: two taps, two tabs
 * or a replayed request find the row already moved and are told `not_ready`.
 * The draw happens HERE, never on the client — the window only shows it.
 */
import { eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventory, players, snackStreak } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { burrowView } from '@/lib/game/burrow';
import { grantItem } from '@/lib/game/grant';
import { ownedSkinKeys, SKINS, isSkinKind } from '@/lib/game/skins';
import { claimSnack, prizeItems, snackView, type SnackRow } from '@/lib/game/snack';
import { adoptGifts, firstRunSince, layGifts, snackRowOf } from '@/lib/game/snackState';
import { clampTzOffset } from '@/lib/notify/schedule';
import { holdings, type ItemKind } from '@/lib/game/inventory';

export const dynamic = 'force-dynamic';

async function viewOf(playerId: string, row: SnackRow | null, now: number, tz: number) {
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId), columns: { level: true } });
  return snackView(row, now, tz, player?.level ?? 1, await firstRunSince(playerId, row));
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const tz = clampTzOffset(new URL(req.url, 'http://x').searchParams.get('tz'));
  const row = await snackRowOf(session.sub);
  return Response.json({ snack: await viewOf(session.sub, row, Date.now(), tz) });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tz?: unknown };
  const tz = clampTzOffset(body.tz);
  const now = Date.now();
  const id = session.sub;

  const result = await db.transaction(async (tx) => {
    await tx.insert(snackStreak).values({ playerId: id }).onConflictDoNothing();
    const [row] = await tx.select().from(snackStreak).where(eq(snackStreak.playerId, id)).for('update');
    const [player] = await tx.select({ level: players.level }).from(players).where(eq(players.id, id)).limit(1);
    const ownedKeys = await ownedSkinKeys(id, tx);
    const ownedKinds = SKINS.filter((s) => ownedKeys.includes(s.key)).map((s) => s.kind as string);
    const claim = claimSnack(row ?? null, now, tz, player?.level ?? 1, ownedKinds);
    if (!claim.ok) return claim;

    await tx.update(snackStreak).set(claim.next).where(eq(snackStreak.playerId, id));
    const { prize } = claim;
    let qty = prize.qty;
    const items: { kind: string; qty: number }[] = [];
    if (prize.kind === 'carrots') {
      // A snack feeds the three counters like a quest does: a carrot event,
      // not a coupon (SNACK in config/tuning.ts).
      await tx.update(players).set({
        stock: raw`${players.stock} + ${prize.qty}`,
        seasonScore: raw`${players.seasonScore} + ${prize.qty}`,
        lifetimeCarrots: raw`${players.lifetimeCarrots} + ${prize.qty}`,
      }).where(eq(players.id, id));
    } else if (prizeItems(prize).length) {
      // A pack opens into the bag; each item a gift, stopping at its ceiling.
      for (const it of prizeItems(prize)) {
        const got = await grantItem(tx, id, it.kind as ItemKind, it.qty, now);
        items.push({ kind: it.kind, qty: got.qty });
      }
    } else if (isSkinKind(prize.kind)) {
      await grantItem(tx, id, prize.kind, 1, now);
    } else {
      // A gift (no receipt): it stops at the bag's ceiling, and the answer
      // says what actually arrived.
      const got = await grantItem(tx, id, prize.kind as ItemKind, prize.qty, now);
      qty = got.qty;
    }
    const edits = claim.gift ? await layGifts(tx, id, claim.next) : null;
    return { ...claim, qty, items, edits };
  });

  if (!result.ok) {
    return Response.json({ error: result.error, snack: await viewOf(id, await snackRowOf(id), now, tz) }, { status: 409 });
  }
  if (result.edits) adoptGifts(id, result.edits);

  const after = await db.query.players.findFirst({ where: eq(players.id, id) });
  if (!after) return Response.json({ error: 'unknown player' }, { status: 404 });
  return Response.json({
    reward: {
      day: result.day,
      golden: result.golden,
      tier: result.tier,
      kind: result.prize.kind,
      qty: result.qty,
      items: result.items,
      gift: result.gift,
    },
    snack: await viewOf(id, result.next, now, tz),
    burrow: await viewWithBag(after),
    ...(result.edits ? { edits: result.edits } : {}),
  });
}

/** The burrow WITH its bag: the refills and the garden bottles live in the
 *  other table, and a view built from the row alone reads them as zero. */
async function viewWithBag(row: NonNullable<Awaited<ReturnType<typeof db.query.players.findFirst>>>) {
  const rows = await db.query.inventory.findMany({ where: eq(inventory.playerId, row.id) });
  return burrowView(row, Date.now(), holdings(rows, row));
}
