/**
 * The shop. GET the shelf, POST to buy with carrots.
 *
 * The USDC route is its own endpoint (api/shop/pay), because paying with money
 * is not one request but three — quote, sign, verify — and folding that into
 * this one would put a chain call on the path of a carrot purchase that has no
 * business waiting for an RPC.
 *
 * The server prices everything. The client is TOLD what things cost so it can
 * grey out a button, and is believed about none of it — the same rule the run
 * follows, for the same reason.
 */
import { and, eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventory, players, traps as trapsTable } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import {
  holdings, isItemKind, purchaseBlocker, purchaseCost, shopShelf,
} from '@/lib/game/inventory';
import { grantItem } from '@/lib/game/grant';
import { availableTraps } from '@/lib/game/traps';
import { TRAPS } from '@config/tuning';
import { enabledTokens } from '@/lib/pay/tokens';
import { tokenUsdPrices } from '@/lib/pay/rates';
import { treasuryAddress } from '@/lib/pay/solana';
import { claimUnfinishedPayments } from './pay/route';

/** Everything the shop screen needs, in one round trip. */
export async function shopState(playerId: string) {
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  if (!player) return null;

  const rows = await db.query.inventory.findMany({ where: eq(inventory.playerId, playerId) });
  const bag = holdings(rows, player);

  // Placed traps are OFF the bag's count in spirit — they are on the ground,
  // not in your pocket — so the screen reports both. Otherwise a player who has
  // placed their three free ones reads "0 traps" and concludes the game ate them.
  const placed = await db.$count(trapsTable, eq(trapsTable.ownerId, playerId));

  const money = treasuryAddress() !== null;

  /**
   * What a dollar is worth on each rail, right now.
   *
   * Sent with the shelf so the tile can say `0.0021 SOL` instead of `$0.25`
   * when the player has chosen SOL — a price in a currency you do not hold is
   * a price you have to do arithmetic on before you can decide.
   *
   * It is INDICATIVE, not a quote. The binding number is still the one
   * api/shop/pay freezes at signing time; this is the same feed read through
   * the same cache, so the two agree to within five minutes of drift, and the
   * tile says so by staying a rounded display figure.
   *
   * Failures here do not fail the shop: `tokenUsdPrices` already degrades to
   * its last good price and then to its baked fallback, so the worst case is a
   * slightly stale number rather than a shelf that will not load.
   */
  const rates = money ? await tokenUsdPrices() : null;

  return {
    stock: player.stock,
    items: shopShelf(bag, player.stock),
    traps: {
      held: availableTraps(player),
      placed,
      maxPlaced: TRAPS.MAX_PLACED,
      drain: TRAPS.DRAIN,
      freePerDay: TRAPS.FREE_PER_DAY,
    },
    /** Null when no treasury is configured — the UI hides the USDC button
     *  rather than offering a payment that cannot be made. */
    usdcEnabled: money,
    /**
     * The rails this deployment can actually take money on.
     *
     * Sent rather than assumed: a currency switch offering SKR on a server with
     * no SKR mint configured is a button that quotes and then fails, which is
     * worse than not offering it.
     */
    tokens: money ? enabledTokens() : [],
    /** USD per whole token, per rail. Null when the money route is off. */
    rates,
  };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // Before anything else: did they pay for something and never come back for
  // it? A player who closes the tab between signing and confirming has money on
  // chain and nothing in their bag, and the shop is exactly where they will
  // next look for it. Failures here are swallowed — a sweep that cannot run is
  // not a reason to refuse someone their shop.
  let recovered: { kind: string; qty: number }[] = [];
  try {
    recovered = await claimUnfinishedPayments(session.sub);
  } catch (err) {
    console.error('[shop] claiming unfinished payments failed', err);
  }

  const state = await shopState(session.sub);
  if (!state) return Response.json({ error: 'unknown player' }, { status: 404 });
  // Named rather than left for the player to notice a changed number: money
  // that arrives silently reads as money that went missing.
  return Response.json({ ...state, recovered });
}

/** `{ kind, qty? }` — buys with CARROTS. Money goes through api/shop/pay. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; qty?: unknown };
  if (!isItemKind(body.kind)) return Response.json({ error: 'unknown_item' }, { status: 400 });
  const kind = body.kind;
  const qty = body.qty === undefined ? 1 : Number(body.qty);

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  const rows = await db.query.inventory.findMany({ where: eq(inventory.playerId, session.sub) });
  const bag = holdings(rows, player);

  const blocker = purchaseBlocker(kind, qty, bag, player.stock);
  if (blocker) {
    return Response.json(
      { error: blocker, need: purchaseCost(kind, qty), have: player.stock },
      { status: 400 },
    );
  }

  const cost = purchaseCost(kind, qty);

  // One transaction: the carrots leaving and the item arriving are the same
  // event, and a crash between them either bills for nothing or gives stock
  // away. The debit is ALSO guarded in SQL, so two purchases racing on the same
  // row cannot both pass the check above and overdraw.
  const granted = await db.transaction(async (tx) => {
    const [charged] = await tx
      .update(players)
      .set({ stock: raw`${players.stock} - ${cost}` })
      .where(and(eq(players.id, session.sub), raw`${players.stock} >= ${cost}`))
      .returning({ stock: players.stock });
    if (!charged) return null;

    // The receipt rides along in the same transaction as the debit above.
    return grantItem(tx, session.sub, kind, qty, Date.now(), {
      currency: 'carrots',
      cost,
    });
  });

  // The guard bounced it: the same carrots were spent by a parallel request.
  if (!granted) {
    return Response.json(
      { error: 'insufficient_carrots', need: cost, have: player.stock },
      { status: 400 },
    );
  }

  const state = await shopState(session.sub);
  return Response.json({ bought: granted, spent: cost, ...state });
}
