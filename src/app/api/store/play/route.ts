/**
 * Buying through Google Play (web2).
 *
 *   PUT  /api/store/play  { productId }                 → may this player buy it?
 *   POST /api/store/play  { productId, purchaseToken }  → Play says paid: credit
 *
 * The order is the reverse of the USDC rail's. There, the server quotes and
 * then reads the chain; here the STORE takes the money first, so the limits a
 * purchase must respect (a skin already owned, a bag that cannot take a pack)
 * are asked BEFORE the client opens Play's sheet. Once Play has the money the
 * purchase is delivered in full whatever changed in between — a sale is never
 * clipped (grantItem), and a player who paid is never told no.
 *
 * POST is idempotent on the token: a client that lost the answer, a restore
 * on the next launch (queryPurchases) and a double tap all send the same token,
 * and the unique index on store_purchases credits it once. The checks and the
 * credit are shared with the App Store (lib/pay/store.ts); only the proof is
 * Play's.
 */
import { getSession } from '@/lib/auth/jwt';
import { acknowledgePlayPurchase, playEnabled, verifyPlayPurchase } from '@/lib/pay/play';
import { creditStorePurchase, creditedTo, storeBlocker } from '@/lib/pay/store';
import { overLimit, tooMany } from '@/lib/rate-limit';
import { STORE_PRODUCTS, isStoreProductId } from '@config/store';
import { shopState } from '../../shop/route';

async function read(req: Request): Promise<{ productId?: unknown; purchaseToken?: unknown }> {
  return (await req.json().catch(() => ({}))) as { productId?: unknown; purchaseToken?: unknown };
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('store-check', session.sub, 30)) return tooMany();
  if (!playEnabled()) return Response.json({ error: 'store_unavailable' }, { status: 503 });
  const { productId } = await read(req);
  if (!isStoreProductId(productId)) return Response.json({ error: 'unknown_item' }, { status: 400 });
  const blocker = await storeBlocker(session.sub, productId);
  if (blocker) return Response.json({ error: blocker }, { status: 400 });
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('store-credit', session.sub, 20)) return tooMany();
  if (!playEnabled()) return Response.json({ error: 'store_unavailable' }, { status: 503 });

  const { productId, purchaseToken } = await read(req);
  if (!isStoreProductId(productId)) return Response.json({ error: 'unknown_item' }, { status: 400 });
  if (typeof purchaseToken !== 'string' || purchaseToken.length < 10 || purchaseToken.length > 4096) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const product = STORE_PRODUCTS[productId];

  // Already credited: say so, from our own row, without asking Play again.
  const known = await creditedTo('play', purchaseToken);
  if (known) {
    if (known.playerId !== session.sub) return Response.json({ error: 'token_used' }, { status: 409 });
    return Response.json({
      alreadyCredited: true, consumable: product.consumable,
      bought: { kind: known.kind, qty: known.qty }, ...(await shopState(session.sub)),
    });
  }

  const verdict = await verifyPlayPurchase(productId, purchaseToken, session.sub);
  if (!verdict.ok) {
    // Pending (cash at a shop, a slow card): Play will send the same token
    // again once it is paid, and the client retries then.
    if (verdict.reason === 'pending') return Response.json({ error: 'pending', retry: true }, { status: 202 });
    if (verdict.reason === 'store_unreachable') return Response.json({ error: 'store_unreachable', retry: true }, { status: 503 });
    return Response.json({ error: verdict.reason }, { status: 400 });
  }

  const granted = await creditStorePurchase({
    platform: 'play',
    playerId: session.sub,
    productId,
    token: purchaseToken,
    orderId: verdict.orderId,
    purchasedAt: verdict.purchasedAt,
    test: verdict.test,
  });

  if (!product.consumable) await acknowledgePlayPurchase(productId, purchaseToken);

  const state = await shopState(session.sub);
  if (!granted) {
    return Response.json({ alreadyCredited: true, consumable: product.consumable, bought: { kind: product.kind, qty: product.qty }, ...state });
  }
  return Response.json({ bought: granted, consumable: product.consumable, usdCents: product.usdCents, ...state });
}
