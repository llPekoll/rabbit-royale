/**
 * Stripe Checkout, the server's half (web2, the game on rabbit.rip/play/).
 *
 * The web build has no store sheet: it sells the SAME sachets of gold as Play
 * (config/store.ts) through Stripe Checkout. Since 2026-11-01 the form is
 * EMBEDDED: Stripe's iframe opens over the game (window.rrStripeCheckout,
 * godot/web/shell.html) and the game never reloads. A card pays in place;
 * only a bank that must be visited (iDEAL, Bancontact…) takes the page away,
 * and it comes back with the session id in its address, as the hosted page
 * did. Without a publishable key, or for a build from before, the game still
 * leaves for the page Stripe hosts. Stripe also tells us by webhook. Neither the browser nor
 * the webhook body is believed: both only name a Checkout Session, and the
 * server reads that session from Stripe itself (`readCheckout`) before
 * crediting — paid, for which sachet, to which player, all from Stripe.
 *
 * Two paths, as for the USDC rail, because they fail differently:
 *
 *   the player coming back  → credits in a second, lost if the tab closes
 *   the webhook             → survives a closed tab, lost during a deploy
 *
 * and store_purchases (platform 'stripe', token = session id) credits once.
 *
 * Priced in EUROS at the sachet's number (`usdCents` 499 → 4,99 €): the
 * account settles in euros, and a card charged in dollars would pay a
 * conversion on top.
 *
 * CONFIGURATION
 *   STRIPE_SECRET_KEY      sk_live_… in prod, sk_test_… on the stage (a test
 *                          key takes test cards only: 4242 4242 4242 4242).
 *                          Absent: the web build offers no sachet.
 *   STRIPE_WEBHOOK_SECRET  whsec_… of the endpoint /api/store/stripe/webhook.
 *                          Absent: the webhook is CLOSED, the return still
 *                          credits.
 *   STRIPE_PUBLISHABLE_KEY pk_live_… / pk_test_…, public, for Stripe.js in the
 *                          page. Absent: the hosted page, as before.
 *   STRIPE_RETURN_URL      where Stripe sends the player back, the game's page:
 *                          https://rabbit.rip/play/ by default,
 *                          https://stage.rabbit.rip/play/ on the stage.
 *
 * No stripe package: one POST, one GET and an HMAC.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { STORE_PRODUCTS, isStoreProductId, type StoreProductId } from '@config/store';

const API = 'https://api.stripe.com/v1';
/** A webhook signed longer ago than this is a replay. Stripe's own default. */
const TOLERANCE_S = 300;

export const STRIPE_CURRENCY = 'eur';

function secretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? '';
}

export function stripeEnabled(): boolean {
  return secretKey().startsWith('sk_');
}

/** The key Stripe.js opens the embedded form with ('' = hosted page only). */
export function publishableKey(): string {
  const k = process.env.STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  return k.startsWith('pk_') ? k : '';
}

/** A test key: Stripe's test mode, no real money (the stage). */
export function stripeTestMode(): boolean {
  return secretKey().startsWith('sk_test_');
}

export function returnUrl(): string {
  return process.env.STRIPE_RETURN_URL?.trim() || 'https://rabbit.rip/play/';
}

/** The name a sachet carries on Stripe's page and the receipt. */
export function sachetName(productId: StoreProductId): string {
  return `${STORE_PRODUCTS[productId].qty.toLocaleString('en-US')} Gold`;
}

async function stripe(method: 'GET' | 'POST', path: string, form?: URLSearchParams) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined;
    throw new Error(`stripe ${method} ${path} → ${res.status}: ${err?.message ?? ''}`);
  }
  return body;
}

/**
 * Stripe's checkout for one sachet, bound to this player. `locale` is the
 * game's language when Stripe has it ('auto' otherwise: the browser's).
 * `embedded`: a form for Stripe.js over the game (its `clientSecret`), which
 * leaves the page only for a payment method that must (redirect_on_completion
 * 'if_required'); otherwise the page Stripe hosts (its `url`).
 *
 * 'embedded' is the ui_mode of the account's API version (2026-11-01); newer
 * versions call it 'embedded_page' and refuse this one.
 */
export async function createCheckout(playerId: string, productId: StoreProductId, locale: string, embedded = false) {
  const p = STORE_PRODUCTS[productId];
  const back = new URL(returnUrl());
  const done = new URL(back);
  done.searchParams.set('gold', 'done');
  const cancel = new URL(back);
  cancel.searchParams.set('gold', 'cancel');
  // Stripe fills {CHECKOUT_SESSION_ID} itself: the braces must reach it raw.
  const doneUrl = `${done.toString()}&session_id={CHECKOUT_SESSION_ID}`;
  const form = new URLSearchParams({
    mode: 'payment',
    ...(embedded
      ? { ui_mode: 'embedded', redirect_on_completion: 'if_required', return_url: doneUrl }
      : { success_url: doneUrl, cancel_url: cancel.toString() }),
    client_reference_id: playerId,
    'metadata[playerId]': playerId,
    'metadata[productId]': productId,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': STRIPE_CURRENCY,
    'line_items[0][price_data][unit_amount]': String(p.usdCents),
    'line_items[0][price_data][product_data][name]': sachetName(productId),
    'line_items[0][price_data][product_data][description]': 'Gold for the Rabbit Royale shop: items, packs and skins.',
    locale: STRIPE_LOCALES.has(locale) ? locale : 'auto',
    // The 14-day right of withdrawal ends once digital content is delivered
    // with the buyer's consent (EU 2011/83, art. 16(m)): said where they pay.
    'custom_text[submit][message]': 'The gold is credited to your burrow right away: by paying, you ask for it now and lose the 14-day right of withdrawal.',
    // A sachet of gold is not shipped: no address to collect.
    'payment_intent_data[description]': `Rabbit Royale — ${sachetName(productId)}`,
  });
  const s = await stripe('POST', '/checkout/sessions', form);
  return { id: String(s.id), url: String(s.url ?? ''), clientSecret: String(s.client_secret ?? '') };
}

/** Stripe Checkout's languages that the game also speaks (src/i18n). */
const STRIPE_LOCALES: ReadonlySet<string> = new Set(['en', 'fr', 'es', 'it', 'pt-BR', 'vi', 'zh']);

export type CheckoutVerdict =
  | { ok: true; playerId: string; productId: StoreProductId; orderId: string | null; paidAt: Date; test: boolean }
  | { ok: false; reason: 'unpaid' | 'not_ours' | 'store_unreachable' };

/** A session id as Stripe writes them: cs_test_… or cs_live_…. */
export function isCheckoutId(v: unknown): v is string {
  return typeof v === 'string' && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(v);
}

/** What Stripe says about one Checkout Session: paid, for what, for whom. */
export async function readCheckout(sessionId: string): Promise<CheckoutVerdict> {
  let s: Record<string, unknown>;
  try {
    s = await stripe('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  } catch (e) {
    console.error('[stripe]', (e as Error).message);
    return { ok: false, reason: 'store_unreachable' };
  }
  const meta = (s.metadata ?? {}) as Record<string, string>;
  const productId = meta.productId;
  const playerId = meta.playerId;
  if (!isStoreProductId(productId) || !playerId || s.client_reference_id !== playerId) {
    return { ok: false, reason: 'not_ours' };
  }
  // The amount charged must be the sachet's: a session made with an older
  // price (or by hand on the dashboard) is not credited as this one.
  if (s.currency !== STRIPE_CURRENCY || Number(s.amount_total) !== STORE_PRODUCTS[productId].usdCents) {
    return { ok: false, reason: 'not_ours' };
  }
  if (s.payment_status !== 'paid') return { ok: false, reason: 'unpaid' };
  return {
    ok: true,
    playerId,
    productId,
    orderId: typeof s.payment_intent === 'string' ? s.payment_intent : null,
    paidAt: new Date(Number(s.created) * 1000),
    test: s.livemode === false,
  };
}

export type ReversalVerdict =
  | { ok: true; orderId: string }
  | { ok: false; reason: 'not_reversed' | 'not_ours' | 'store_unreachable' };

/**
 * Money Stripe gave back, read from Stripe itself as `readCheckout` reads a
 * payment: a charge REFUNDED IN FULL (`charge.refunded` also fires for a
 * partial refund, which is a gesture made by hand on the dashboard and takes
 * nothing back), or a dispute the bank opened (`charge.dispute.created`: the
 * money is held from that moment, and a chargeback lost weeks later would come
 * after the gold was spent). Names the PaymentIntent, the order number a
 * credited sachet keeps (store_purchases.order_id).
 */
export async function readReversal(id: string): Promise<ReversalVerdict> {
  const path = /^ch_[A-Za-z0-9]{10,200}$/.test(id) ? `/charges/${id}`
    : /^(dp|du)_[A-Za-z0-9]{10,200}$/.test(id) ? `/disputes/${id}`
    : null;
  if (!path) return { ok: false, reason: 'not_ours' };
  let o: Record<string, unknown>;
  try {
    o = await stripe('GET', path);
  } catch (e) {
    console.error('[stripe]', (e as Error).message);
    return { ok: false, reason: 'store_unreachable' };
  }
  if (typeof o.payment_intent !== 'string') return { ok: false, reason: 'not_ours' };
  if (path.startsWith('/charges/') && o.refunded !== true) return { ok: false, reason: 'not_reversed' };
  return { ok: true, orderId: o.payment_intent };
}

/**
 * A webhook delivery genuinely from Stripe: `Stripe-Signature` is
 * `t=<unix>,v1=<hex hmac of "t.body">`, over the RAW body. No secret = closed.
 */
export function webhookSigned(raw: string, header: string | null, now = Date.now()): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const parts = header.split(',').map((kv) => kv.trim().split('=') as [string, string]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex');
  return parts.some(([k, v]) => {
    if (k !== 'v1' || !v || v.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v, 'hex'));
    } catch {
      return false;
    }
  });
}
