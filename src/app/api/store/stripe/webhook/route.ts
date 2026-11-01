/**
 * Stripe's webhook (web2): a nudge, never an authority — as Alchemy's.
 *
 * PUBLIC, so nothing its body says is believed beyond its signature: a
 * genuine delivery names a Checkout Session, and the server reads that
 * session from Stripe itself (readCheckout) before crediting, exactly as when
 * the player comes back with it (../route.ts). It covers the player who paid
 * and closed the tab, and the slow methods Stripe confirms later.
 *
 * Endpoint to declare in Stripe (Developers → Webhooks), events
 * checkout.session.completed and checkout.session.async_payment_succeeded:
 *   https://ws2.rabbit.rip/api/store/stripe/webhook        (prod, live key)
 *   https://ws2-stage.rabbit.rip/api/store/stripe/webhook  (stage, test key)
 * Its signing secret goes in STRIPE_WEBHOOK_SECRET.
 *
 * Always 200 once signed, even for a session it cannot credit: a non-2xx makes
 * Stripe retry for three days something that will never change.
 */
import { isCheckoutId, readCheckout, stripeEnabled, webhookSigned } from '@/lib/pay/stripe';
import { creditStorePurchase } from '@/lib/pay/store';

const CREDITING = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

export async function POST(req: Request) {
  const raw = await req.text();
  if (!stripeEnabled() || !webhookSigned(raw, req.headers.get('stripe-signature'))) {
    return Response.json({ error: 'bad_signature' }, { status: 400 });
  }
  let event: { type?: string; data?: { object?: { id?: unknown } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const id = event.data?.object?.id;
  if (!CREDITING.has(event.type ?? '') || !isCheckoutId(id)) return Response.json({ ok: true });

  const verdict = await readCheckout(id);
  // Stripe unreachable from here: a 503 so that Stripe tries again.
  if (!verdict.ok && verdict.reason === 'store_unreachable') return Response.json({ retry: true }, { status: 503 });
  if (!verdict.ok) return Response.json({ ok: true, skipped: verdict.reason });
  try {
    const granted = await creditStorePurchase({
      platform: 'stripe',
      playerId: verdict.playerId,
      productId: verdict.productId,
      token: id,
      orderId: verdict.orderId,
      purchasedAt: verdict.paidAt,
      test: verdict.test,
    });
    return Response.json({ ok: true, credited: granted !== null });
  } catch (e) {
    // A player this base does not have (a session from another world or
    // deployment sharing the account): nothing to credit, nothing to retry.
    console.error('[stripe] webhook credit', id, (e as Error).message);
    return Response.json({ ok: true, skipped: 'credit_failed' });
  }
}
