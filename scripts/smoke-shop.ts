/**
 * A live walk through the shop, against a real database.
 *
 * Not a unit test — those are in test/, and they run on fixtures. This is the
 * thing they cannot do: prove the ROUTE HANDLERS work when wired to Postgres —
 * that a purchase really moves carrots, that a trap really lands on a tile, and
 * that the refusals fire against real rows.
 *
 * The handlers are called in-process rather than over HTTP, so the run needs a
 * database and nothing else — no server to start, no port to be free, and no
 * chance of testing a stale build of the routes.
 *
 *   bun run scripts/smoke-shop.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { inventory, payments, players, purchases, traps } from '../src/lib/db/schema';
import { signSession } from '../src/lib/auth/jwt';
import { SHOP, TRAPS, OUT_OF_RUN_ENERGY } from '../config/tuning';
import * as Shop from '../src/app/api/shop/route';
import * as Traps from '../src/app/api/traps/route';
import * as Pay from '../src/app/api/shop/pay/route';

const ID = 'sol:SMOKETEST1111111111111111111111111111111111';
const WALLET = 'SMOKETEST1111111111111111111111111111111111';
/** Any absolute URL: the handlers read the body and the Authorization header,
 *  never the path. */
const URL_ = 'http://smoke.test/api';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log('        ', detail); }
}

async function main() {
  // A clean player with enough carrots to buy one of everything.
  await db.delete(players).where(eq(players.id, ID));
  await db.insert(players).values({
    id: ID, wallet: WALLET, name: 'Smoke',
    stock: 100_000, energy: 1,
    // Backdate so there IS a free trap allowance to spend.
    trapsClaimedAt: new Date(Date.now() - TRAPS.REFILL_MS),
  });

  const token = await signSession({ sub: ID, wallet: WALLET, name: 'Smoke' });
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const req = (method: string, body?: unknown) =>
    new Request(URL_, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });

  const shopGet = () => Shop.GET(req('GET')).then((r) => r.json());
  const shopBuy = (body: unknown) => Shop.POST(req('POST', body)).then((r) => r.json());
  const trapsGet = () => Traps.GET(req('GET')).then((r) => r.json());
  const trapPlace = (body: unknown) => Traps.POST(req('POST', body)).then((r) => r.json());
  const trapLift = (body: unknown) => Traps.DELETE(req('DELETE', body)).then((r) => r.json());
  const quotePay = (body: unknown) => Pay.POST(req('POST', body)).then((r) => r.json());

  console.log('\nshop, against the real database\n');

  const shelf = await shopGet();
  check('the shelf lists every item', shelf.items?.length === 5, shelf);
  check('every line carries both prices',
    shelf.items?.every((i: { price: number; usdc: number }) => i.price > 0 && i.usdc > 0));
  // The shelf must AGREE with the environment: offering a USDC button with no
  // treasury configured is a payment that cannot complete, and hiding one that
  // is configured is a route nobody can find.
  const usdcOn = !!process.env.USDC_TREASURY_ADDRESS;
  check(`the shelf reports the money route as ${usdcOn ? 'on' : 'off'}`,
    shelf.usdcEnabled === usdcOn, shelf.usdcEnabled);

  // A carrot purchase.
  const before = shelf.stock;
  const bought = await shopBuy({ kind: 'bomb', qty: 2 });
  check('buying a bomb costs carrots', bought.stock === before - SHOP.PRICES.bomb * 2, bought);
  check('the bomb is in the bag',
    bought.items?.find((i: { kind: string }) => i.kind === 'bomb')?.held === 2);

  const row = await db.query.inventory.findFirst({
    where: eq(inventory.playerId, ID),
  });
  check('…and in the database', row?.kind === 'bomb' && row?.qty === 2, row);

  // Refusals.
  check('a made-up item is refused', (await shopBuy({ kind: 'crown' })).error === 'unknown_item');
  check('a silly quantity is refused', (await shopBuy({ kind: 'bomb', qty: 999 })).error === 'too_many_at_once');
  check('a negative quantity is refused', (await shopBuy({ kind: 'bomb', qty: -3 })).error === 'bad_quantity');

  // Energy: it is APPLIED, not carried.
  const energy = await shopBuy({ kind: 'energy' });
  check('buying energy refills the bar', energy.bought?.energy === OUT_OF_RUN_ENERGY.MAX, energy);
  const player = await db.query.players.findFirst({ where: eq(players.id, ID) });
  check('…and the bar is really full', player?.energy === OUT_OF_RUN_ENERGY.MAX, player?.energy);
  check('…and the daily window opened', player?.energyPacksBought === 1);
  check('energy is never carried in the bag',
    (await db.query.inventory.findMany({ where: eq(inventory.playerId, ID) }))
      .every((r) => r.kind !== 'energy'));

  // The receipt book. A purchase that leaves no trace is a support message
  // waiting to happen: the player sees a smaller number and nothing else.
  const receipts = await db.query.purchases.findMany({ where: eq(purchases.playerId, ID) });
  check('a carrot purchase writes a receipt', receipts.length >= 2, receipts.length);
  const bombReceipt = receipts.find((r) => r.kind === 'bomb');
  check('...naming what was bought', bombReceipt?.qty === 2, bombReceipt);
  check('...in the currency it was paid in', bombReceipt?.currency === 'carrots');
  check('...for what it actually cost',
    bombReceipt?.cost === SHOP.PRICES.bomb * 2, bombReceipt?.cost);
  check('...with no payment attached for a carrot purchase',
    bombReceipt?.paymentId === null);
  check('an energy refill is receipted too, though nothing is carried',
    receipts.some((r) => r.kind === 'energy'));

  // Traps: buy, place, and the refusals that protect the board.
  const trapState = await trapsGet();
  check('the free allowance is spendable', trapState.held >= 1, trapState);

  const walkable = 158;                     // a '.' tile in the burrow layout
  const placed = await trapPlace({ tile: walkable });
  check('a trap lands on a walkable tile', placed.tile === walkable, placed);
  check('…and is on the board', (await trapsGet()).placed.includes(walkable));

  check('the same tile cannot be mined twice',
    ['tile_already_trapped'].includes((await trapPlace({ tile: walkable })).error));
  check('a blocked tile is refused',
    (await trapPlace({ tile: 0 })).error === 'tile_not_trappable');
  check('the field itself cannot be mined',
    (await trapPlace({ tile: 32 })).error === 'tile_not_trappable');
  check('a nonsense tile is refused',
    (await trapPlace({ tile: -5 })).error === 'tile_not_trappable');
  check('a non-integer tile is refused',
    (await trapPlace({ tile: 1.5 })).error === 'tile_not_trappable');

  const lifted = await trapLift({ tile: walkable });
  check('a trap can be lifted', lifted.removed === walkable, lifted);
  check('…and lifting the same one twice is refused',
    (await trapLift({ tile: walkable })).error === 'no_trap_there');

  // The USDC route: a real quote when it is configured, a plain refusal when
  // it is not. Both are correct behaviour; which one is correct depends on the
  // environment, so the check follows it.
  const quote = await quotePay({ kind: 'bomb' });
  if (usdcOn) {
    check('a quote names a payment', typeof quote.paymentId === 'string', quote);
    check('a quote prices the item in base units',
      quote.amount === Math.round(SHOP.USDC_PRICES.bomb * 1e6), quote.amount);
    check('a quote carries a reference to match the transfer against',
      typeof quote.reference === 'string' && quote.reference.length > 0);
    check('a quote expires', new Date(quote.expiresAt).getTime() > Date.now());

    // The quote is recorded BEFORE the player signs anything — that row is what
    // the confirm step checks the transaction against.
    const intent = await db.query.payments.findFirst({ where: eq(payments.id, quote.paymentId) });
    check('…and is recorded as pending', intent?.status === 'pending', intent?.status);
    check('…for the right item', intent?.kind === 'bomb' && intent?.qty === 1);

    // Every non-carrot limit still binds the money route.
    const overQty = await quotePay({ kind: 'bomb', qty: 999 });
    check('a quote obeys the quantity limit', overQty.error === 'too_many_at_once', overQty);

    const confirmed = await Pay.PATCH(req('PATCH', { paymentId: quote.paymentId, signature: 'not-a-real-signature' }));
    check('an unpaid quote credits nothing',
      confirmed.status === 202 || confirmed.status === 400, confirmed.status);

    await db.delete(payments).where(eq(payments.playerId, ID));
  } else {
    check('a quote is refused without a treasury', quote.error === 'payments_unavailable', quote);
  }

  await db.delete(players).where(eq(players.id, ID));
  await db.delete(traps).where(eq(traps.ownerId, ID));

  console.log(failures === 0 ? '\nall good\n' : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
