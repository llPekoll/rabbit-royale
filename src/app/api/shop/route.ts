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
  holdings, isShopKind, purchaseBlocker, purchaseCost, shopShelf, type Holdings,
} from '@/lib/game/inventory';
import { grantItem } from '@/lib/game/grant';
import { isPackKind, packBlocker, packPrice, packShelf } from '@/lib/game/packs';
import { refreshTuningIfStale } from '@/lib/tuning/live';
import { armedTraps, availableTraps, rearmingTraps } from '@/lib/game/traps';
import { TRAPS } from '@/lib/tuning/tables';
import { enabledTokens } from '@/lib/pay/tokens';
import { tokenUsdPrices } from '@/lib/pay/rates';
import { treasuryAddress } from '@/lib/pay/solana';
import { playEnabled } from '@/lib/pay/play';
import { STRIPE_CURRENCY, stripeEnabled, stripeTestMode } from '@/lib/pay/stripe';
import { isWeb2 } from '@/lib/world';
import { GOLD_DEBT, goldPrice, inGoldDebt, isGoldKind, type GoldKind } from '@/lib/game/gold';
import { isSkinKind, ownsSkin, skinForKind, skinSaleBlocker } from '@/lib/game/skins';
import { STORE_PRODUCTS } from '@config/store';

/** Everything the shop screen needs, in one round trip. */
export async function shopState(playerId: string) {
  const money = treasuryAddress() !== null;
  /**
   * The row, the bag, the board and the rates, asked together — they were
   * four trips in a row, each a continent long for a region whose database
   * is elsewhere.
   *
   * `rates`: what a dollar is worth on each rail, right now.
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
  const [player, rows, placedRows, rates] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, playerId) }),
    db.query.inventory.findMany({ where: eq(inventory.playerId, playerId) }),
    db.query.traps.findMany({ where: eq(trapsTable.ownerId, playerId) }),
    money ? tokenUsdPrices() : Promise.resolve(null),
  ]);
  if (!player) return null;
  const bag = holdings(rows, player);

  // Placed traps are OFF the bag's count in spirit — they are on the ground,
  // not in your pocket — so the screen reports both. Otherwise a player who has
  // placed their three free ones reads "0 traps" and concludes the game ate them.
  //
  // Counted as ROWS rather than as armed traps: a trap rearming still occupies
  // its tile, so it still counts against MAX_PLACED and the shed still cannot
  // take another. The split into standing / coming back is reported beside it.
  const placed = placedRows.length;
  const armed = armedTraps(placedRows).length;
  const coming = rearmingTraps(placedRows);

  // Web2 prices everything in gold too (lib/game/gold.ts): the shelf says it.
  const web2 = isWeb2();
  const withGold = <T extends { kind: GoldKind }>(row: T) => (web2 ? { ...row, gold: goldPrice(row.kind) } : row);
  return {
    stock: player.stock,
    /** Web2: the gold in the purse. Absent in web3, which has no gold. */
    ...(web2 ? { gold: player.gold } : {}),
    items: shopShelf(bag, player.stock).map(withGold),
    /** The packs (SHOP_PACKS), with what is inside each. */
    packs: packShelf(bag, player.stock).map(withGold),
    traps: {
      held: availableTraps(player),
      placed,
      /**
       * Standing versus coming back.
       *
       * Sent as two numbers rather than left for the client to subtract,
       * because the stagger means "how many are up" is a function of the whole
       * SET of down traps and their spring times — not something a count can
       * be derived from once it has crossed the wire.
       */
      armed,
      rearming: coming.length,
      /** When the next one lands, so the shelf can count down without polling
       *  for the answer. Null when the board is whole. */
      nextRearmAt: coming.length ? new Date(coming[0].readyAt).toISOString() : null,
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
    /**
     * What the stores sell here (web2, config/store.ts): sachets of gold, by
     * the store's product id, with the gold each credits. Empty in web3, and
     * while no store is configured. The apps show their store's own localized
     * price; the web build (Stripe) shows `web`, the euros Stripe charges.
     */
    storeProducts: web2 && (playEnabled() || stripeEnabled())
      ? Object.entries(STORE_PRODUCTS).map(([id, p]) => ({
        id, kind: p.kind, qty: p.qty, consumable: p.consumable,
        /** The extra gold over 1 gold = 1 cent, in % (« +20 % »). */
        bonus: Math.max(0, Math.round((p.qty / p.usdCents - 1) * 100)),
        ...(stripeEnabled() ? { web: { currency: STRIPE_CURRENCY.toUpperCase(), cents: p.usdCents, test: stripeTestMode() } } : {}),
      }))
      : [],
  };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // Les prix affichés doivent être ceux qui seront facturés. Non bloquant : la
  // page s'ouvre avec l'instantané courant et le suivant sera à jour, ce qui
  // garde la lecture de la base hors du chemin critique de l'affichage.
  refreshTuningIfStale();

  // No chain reads here: this is read from six places in the client. Unclaimed
  // payments are swept by POST /api/shop/claim, which the shop calls on opening.
  const state = await shopState(session.sub);
  if (!state) return Response.json({ error: 'unknown player' }, { status: 404 });
  return Response.json(state);
}

/** `{ kind, qty?, currency? }` — buys with CARROTS, or with GOLD in web2
 *  (`currency: 'gold'`, skins too). USDC goes through api/shop/pay. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // Sur l'achat aussi : c'est la lecture qui débite, et elle doit voir le même
  // prix que celui montré au joueur un instant plus tôt.
  refreshTuningIfStale();

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; qty?: unknown; currency?: unknown };
  if (body.currency === 'gold') {
    if (!isWeb2()) return Response.json({ error: 'unknown_currency' }, { status: 400 });
    return buyWithGold(session.sub, body.kind, body.qty);
  }
  // isShopKind, not isItemKind: the enum now also carries the chest-only garden
  // boosts, and those have no price. Guarding on the wider set would let a
  // crafted POST reach `itemPrice` with a kind that has no entry.
  // A pack is bought the same way, under its own rules (packBlocker).
  if (!isShopKind(body.kind) && !isPackKind(body.kind)) return Response.json({ error: 'unknown_item' }, { status: 400 });
  const kind = body.kind;
  const qty = body.qty === undefined ? 1 : Number(body.qty);
  const blockerOf = (b: Holdings, stock: number) =>
    isPackKind(kind) ? packBlocker(kind, qty, b, stock) : purchaseBlocker(kind, qty, b, stock);
  const cost = isPackKind(kind) ? packPrice(kind) * qty : purchaseCost(kind, qty);

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });
  if (inGoldDebt(player)) return Response.json({ error: GOLD_DEBT, have: player.stock }, { status: 403 });

  const rows = await db.query.inventory.findMany({ where: eq(inventory.playerId, session.sub) });
  const bag = holdings(rows, player);

  const blocker = blockerOf(bag, player.stock);
  if (blocker) {
    return Response.json(
      { error: blocker, need: cost, have: player.stock },
      { status: 400 },
    );
  }

  // One transaction: the carrots leaving and the item arriving are the same
  // event, and a crash between them either bills for nothing or gives stock
  // away. The debit is ALSO guarded in SQL, so two purchases racing on the same
  // row cannot both pass the check above and overdraw.
  //
  // ONE PURCHASE AT A TIME PER PLAYER. The check above read the bag before the
  // transaction, so fifty taps racing each other would all have passed it —
  // each paying, but together walking past the bag's ceiling or the five daily
  // refills. The transaction locks the player row first and checks again on
  // what it locked: the taps queue, and each one sees the one before it.
  const outcome = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(players)
      .where(eq(players.id, session.sub)).for('update');
    if (!locked) return { error: 'unknown player' } as const;
    const lockedBag = holdings(
      await tx.query.inventory.findMany({ where: eq(inventory.playerId, session.sub) }),
      locked,
    );
    const late = inGoldDebt(locked) ? GOLD_DEBT : blockerOf(lockedBag, locked.stock);
    if (late) return { error: late, have: locked.stock } as const;

    const [charged] = await tx
      .update(players)
      .set({ stock: raw`${players.stock} - ${cost}` })
      .where(and(eq(players.id, session.sub), raw`${players.stock} >= ${cost}`))
      .returning({ stock: players.stock });
    if (!charged) return { error: 'insufficient_carrots', have: locked.stock } as const;

    // The receipt rides along in the same transaction as the debit above.
    const granted = await grantItem(tx, session.sub, kind, qty, Date.now(), {
      currency: 'carrots',
      cost,
    });
    return { granted } as const;
  });

  // A parallel tap got there first: the bag filled, or the carrots went.
  if (!('granted' in outcome)) {
    return Response.json(
      { error: outcome.error, need: cost, have: 'have' in outcome ? outcome.have : player.stock },
      { status: outcome.error === 'unknown player' ? 404 : 400 },
    );
  }
  const granted = outcome.granted;

  const state = await shopState(session.sub);
  return Response.json({ bought: granted, spent: cost, ...state });
}

/**
 * GOLD (web2). The carrot purchase's twin: the same blockers (bag ceilings,
 * a skin owned once), the same locked row, the same grant — but the debit is
 * gold, and skins are on the shelf too. No stock check: gold is not carrots.
 */
async function buyWithGold(playerId: string, rawKind: unknown, rawQty: unknown) {
  if (!isGoldKind(rawKind)) return Response.json({ error: 'unknown_item' }, { status: 400 });
  const kind = rawKind;
  const qty = rawQty === undefined ? 1 : Number(rawQty);
  const cost = goldPrice(kind, Number.isInteger(qty) && qty > 0 ? qty : 1);

  const outcome = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(players).where(eq(players.id, playerId)).for('update');
    if (!locked) return { error: 'unknown player' } as const;
    if (inGoldDebt(locked)) return { error: GOLD_DEBT, have: locked.gold } as const;
    const bag = holdings(await tx.query.inventory.findMany({ where: eq(inventory.playerId, playerId) }), locked);
    const blocker = isSkinKind(kind)
      ? skinSaleBlocker(qty, await ownsSkin(playerId, skinForKind(kind).key, tx), skinForKind(kind).onSale)
      : isPackKind(kind) ? packBlocker(kind, qty, bag) : purchaseBlocker(kind, qty, bag);
    if (blocker) return { error: blocker, have: locked.gold } as const;

    const [charged] = await tx
      .update(players)
      .set({ gold: raw`${players.gold} - ${cost}` })
      .where(and(eq(players.id, playerId), raw`${players.gold} >= ${cost}`))
      .returning({ gold: players.gold });
    if (!charged) return { error: 'insufficient_gold', have: locked.gold } as const;

    const granted = await grantItem(tx, playerId, kind, qty, Date.now(), { currency: 'gold', cost });
    return { granted } as const;
  });

  if (!('granted' in outcome)) {
    return Response.json(
      { error: outcome.error, need: cost, have: 'have' in outcome ? outcome.have : 0 },
      { status: outcome.error === 'unknown player' ? 404 : 400 },
    );
  }
  const state = await shopState(playerId);
  return Response.json({ bought: outcome.granted, spent: cost, currency: 'gold', ...state });
}
