/**
 * Buying gold on the web (web2, rabbit.rip/play/), through Stripe Checkout.
 *
 *   POST /api/store/stripe  { productId, locale, embedded? }
 *        → { url } Stripe's page, or with `embedded` (and a publishable key)
 *          { sessionId, clientSecret, publishableKey } for the form over the game
 *   GET  /api/store/stripe?session=cs_…            → back from it: credit
 *
 * The same sachets as Play (config/store.ts), the same credit
 * (lib/pay/store.ts), keyed by the Checkout Session id. GET is what the game
 * calls on coming back; the webhook (./webhook) credits the same session if
 * the player never comes back. Whichever is second finds the row and says
 * alreadyCredited.
 */
import { getSession } from '@/lib/auth/jwt';
import { createCheckout, isCheckoutId, publishableKey, readCheckout, stripeEnabled } from '@/lib/pay/stripe';
import { creditStorePurchase, creditedTo, storeBlocker } from '@/lib/pay/store';
import { overLimit, tooMany } from '@/lib/rate-limit';
import { STORE_PRODUCTS, isStoreProductId } from '@config/store';
import { shopState } from '../../shop/route';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('store-check', session.sub, 30)) return tooMany();
  if (!stripeEnabled()) return Response.json({ error: 'store_unavailable' }, { status: 503 });
  const { productId, locale, embedded } = (await req.json().catch(() => ({}))) as {
    productId?: unknown;
    locale?: unknown;
    embedded?: unknown;
  };
  if (!isStoreProductId(productId)) return Response.json({ error: 'unknown_item' }, { status: 400 });
  const blocker = await storeBlocker(session.sub, productId);
  if (blocker) return Response.json({ error: blocker }, { status: 400 });
  try {
    const pk = embedded === true ? publishableKey() : '';
    const page = await createCheckout(session.sub, productId, typeof locale === 'string' ? locale : '', pk !== '');
    if (pk) return Response.json({ sessionId: page.id, clientSecret: page.clientSecret, publishableKey: pk });
    return Response.json({ url: page.url });
  } catch (e) {
    console.error('[stripe]', (e as Error).message);
    return Response.json({ error: 'store_unreachable' }, { status: 503 });
  }
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('store-credit', session.sub, 20)) return tooMany();
  if (!stripeEnabled()) return Response.json({ error: 'store_unavailable' }, { status: 503 });
  const id = new URL(req.url).searchParams.get('session');
  if (!isCheckoutId(id)) return Response.json({ error: 'bad_request' }, { status: 400 });

  const known = await creditedTo('stripe', id);
  if (known) {
    if (known.playerId !== session.sub) return Response.json({ error: 'token_used' }, { status: 409 });
    return Response.json({ alreadyCredited: true, bought: { kind: known.kind, qty: known.qty }, ...(await shopState(session.sub)) });
  }

  const verdict = await readCheckout(id);
  if (!verdict.ok) {
    // Paid by a slow method (a bank transfer): the webhook credits it later.
    if (verdict.reason === 'unpaid') return Response.json({ error: 'pending', retry: true }, { status: 202 });
    if (verdict.reason === 'store_unreachable') return Response.json({ error: 'store_unreachable', retry: true }, { status: 503 });
    return Response.json({ error: verdict.reason }, { status: 400 });
  }
  if (verdict.playerId !== session.sub) return Response.json({ error: 'token_used' }, { status: 409 });

  const product = STORE_PRODUCTS[verdict.productId];
  const granted = await creditStorePurchase({
    platform: 'stripe',
    playerId: verdict.playerId,
    productId: verdict.productId,
    token: id,
    orderId: verdict.orderId,
    purchasedAt: verdict.paidAt,
    test: verdict.test,
  });
  const state = await shopState(session.sub);
  if (!granted) return Response.json({ alreadyCredited: true, bought: { kind: product.kind, qty: product.qty }, ...state });
  return Response.json({ bought: granted, usdCents: product.usdCents, ...state });
}
