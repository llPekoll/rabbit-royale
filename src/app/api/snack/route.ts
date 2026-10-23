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
import { adoptGifts, firstRunSince, firstRunSinceClaim, layGifts, snackRowOf } from '@/lib/game/snackState';
import { clampTzOffset } from '@/lib/notify/schedule';
import { holdings, type ItemKind } from '@/lib/game/inventory';

export const dynamic = 'force-dynamic';

async function viewOf(playerId: string, row: SnackRow | null, now: number, tz: number) {
  const [player, firstRun] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, playerId), columns: { level: true } }),
    firstRunSince(playerId, row),
  ]);
  return snackView(row, now, tz, player?.level ?? 1, firstRun);
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const tz = clampTzOffset(new URL(req.url, 'http://x').searchParams.get('tz'));
  // The three reads in one trip — the region servers may sit a continent
  // away from the database.
  const [row, player, firstRun] = await Promise.all([
    snackRowOf(session.sub),
    db.query.players.findFirst({ where: eq(players.id, session.sub), columns: { level: true } }),
    firstRunSinceClaim(session.sub),
  ]);
  return Response.json({ snack: snackView(row, Date.now(), tz, player?.level ?? 1, firstRun) });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tz?: unknown };
  const tz = clampTzOffset(body.tz);
  const now = Date.now();
  const id = session.sub;

  const result = await db.transaction(async (tx) => {
    // Pipelined on the transaction's connection: one trip, still in order —
    // the row exists before it is locked.
    const [, [row], [player], ownedKeys] = await Promise.all([
      tx.insert(snackStreak).values({ playerId: id }).onConflictDoNothing(),
      tx.select().from(snackStreak).where(eq(snackStreak.playerId, id)).for('update'),
      tx.select({ level: players.level }).from(players).where(eq(players.id, id)).limit(1),
      ownedSkinKeys(id, tx),
    ]);
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

  const [after, bag, snack] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, id) }),
    db.query.inventory.findMany({ where: eq(inventory.playerId, id) }),
    viewOf(id, result.next, now, tz),
  ]);
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
    snack,
    // WITH its bag: the refills and the garden bottles live in the other
    // table, and a view built from the row alone reads them as zero.
    burrow: burrowView(after, Date.now(), holdings(bag, after)),
    ...(result.edits ? { edits: result.edits } : {}),
  });
}
