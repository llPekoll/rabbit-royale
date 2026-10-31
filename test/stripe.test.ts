import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { isCheckoutId, sachetName, webhookSigned } from '@/lib/pay/stripe';

const SECRET = 'whsec_test_secret';
const sign = (raw: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

describe('stripe webhook signature', () => {
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });
  const raw = '{"type":"checkout.session.completed"}';
  const now = 1_800_000_000_000;
  const t = now / 1000;

  it('takes a delivery Stripe signed', () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    expect(webhookSigned(raw, sign(raw, t), now)).toBe(true);
    // Stripe adds a v0 (and old secrets) beside v1: any matching v1 counts.
    expect(webhookSigned(raw, `${sign(raw, t)},v0=deadbeef`, now)).toBe(true);
  });

  it('refuses a body, a secret or a time that is not the signed one', () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    expect(webhookSigned(raw + ' ', sign(raw, t), now)).toBe(false);
    expect(webhookSigned(raw, sign(raw, t, 'whsec_other'), now)).toBe(false);
    expect(webhookSigned(raw, sign(raw, t - 600), now)).toBe(false);
    expect(webhookSigned(raw, 'garbage', now)).toBe(false);
    expect(webhookSigned(raw, null, now)).toBe(false);
  });

  it('is closed without a secret', () => {
    expect(webhookSigned(raw, sign(raw, t), now)).toBe(false);
  });
});

describe('stripe checkout ids and names', () => {
  it('knows a session id', () => {
    expect(isCheckoutId('cs_test_a1B2c3D4e5F6g7H8')).toBe(true);
    expect(isCheckoutId('cs_live_a1B2c3D4e5F6g7H8')).toBe(true);
    expect(isCheckoutId('pi_123')).toBe(false);
    expect(isCheckoutId('cs_test_../../v1/charges')).toBe(false);
  });

  it('names a sachet by its gold', () => {
    expect(sachetName('gold_6500')).toBe('6,500 Gold');
  });
});

describe('stripe checkout reading', () => {
  const real = globalThis.fetch;
  afterEach(() => { globalThis.fetch = real; delete process.env.STRIPE_SECRET_KEY; });
  const session = (over: Record<string, unknown>) => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 'cs_test_abcdefghijkl', client_reference_id: 'p1', metadata: { playerId: 'p1', productId: 'gold_550' },
      currency: 'eur', amount_total: 499, payment_status: 'paid', payment_intent: 'pi_1', created: 1_800_000_000,
      livemode: false, ...over,
    }))) as unknown as typeof fetch;
  };

  it('credits a paid session for its sachet and player', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    session({});
    const { readCheckout } = await import('@/lib/pay/stripe');
    expect(await readCheckout('cs_test_abcdefghijkl')).toMatchObject({ ok: true, playerId: 'p1', productId: 'gold_550', orderId: 'pi_1', test: true });
  });

  it('refuses unpaid, a wrong amount, a wrong player or currency', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { readCheckout } = await import('@/lib/pay/stripe');
    session({ payment_status: 'unpaid' });
    expect(await readCheckout('cs_test_abcdefghijkl')).toEqual({ ok: false, reason: 'unpaid' });
    session({ amount_total: 99 });
    expect(await readCheckout('cs_test_abcdefghijkl')).toEqual({ ok: false, reason: 'not_ours' });
    session({ currency: 'usd' });
    expect(await readCheckout('cs_test_abcdefghijkl')).toEqual({ ok: false, reason: 'not_ours' });
    session({ client_reference_id: 'p2' });
    expect(await readCheckout('cs_test_abcdefghijkl')).toEqual({ ok: false, reason: 'not_ours' });
  });

  it('sends the sachet in euros and comes back to the game', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    let sent = new URLSearchParams();
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
    }) as unknown as typeof fetch;
    const { createCheckout } = await import('@/lib/pay/stripe');
    expect(await createCheckout('p1', 'gold_1200', 'fr')).toEqual({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe('999');
    expect(sent.get('line_items[0][price_data][currency]')).toBe('eur');
    expect(sent.get('success_url')).toBe('https://rabbit.rip/play/?gold=done&session_id={CHECKOUT_SESSION_ID}');
    expect(sent.get('cancel_url')).toBe('https://rabbit.rip/play/?gold=cancel');
    expect(sent.get('locale')).toBe('fr');
    expect(sent.get('metadata[playerId]')).toBe('p1');
  });
});
