/**
 * Paying with USDC: quote, then confirm.
 *
 * Three steps, and the split matters:
 *   POST  /api/shop/pay          → a quote: what to send, where, with what memo
 *   (the player's wallet signs and submits the transfer itself)
 *   PATCH /api/shop/pay          → a signature to verify; the item is credited
 *
 * The server never touches the money. It states a price, then reads the chain
 * to find out whether that price was paid. Everything that decides what a
 * player gets — the price, the cap, the daily energy window — is evaluated
 * HERE, on both calls, so the paid route is subject to exactly the limits the
 * carrot route is. That is the GDD's "no exclusive power for money" written as
 * control flow rather than as a promise.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventory, payments, players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { holdings, isItemKind, purchaseBlocker, purchaseUsdc } from '@/lib/game/inventory';
import { grantItem } from '@/lib/game/grant';
import { USDC, usdcBaseUnits } from '@config/tuning';
import { payEnabled, treasuryAddress, usdcMint, verifyPayment } from '@/lib/pay/solana';
import { shopState } from '../route';

/** `{ kind, qty? }` → a quote the player's wallet can pay. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  if (!payEnabled()) {
    return Response.json({ error: 'payments_unavailable' }, { status: 503 });
  }
  const treasury = treasuryAddress()!;
  const mint = usdcMint()!;

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; qty?: unknown };
  if (!isItemKind(body.kind)) return Response.json({ error: 'unknown_item' }, { status: 400 });
  const kind = body.kind;
  const qty = body.qty === undefined ? 1 : Number(body.qty);

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  const rows = await db.query.inventory.findMany({ where: eq(inventory.playerId, session.sub) });
  const bag = holdings(rows, player);

  // No `stock` argument: carrots are irrelevant to a USDC purchase, but every
  // OTHER limit still applies. Quantity caps, inventory ceilings and the daily
  // energy window are the same for money as for grind.
  const blocker = purchaseBlocker(kind, qty, bag);
  if (blocker) return Response.json({ error: blocker }, { status: 400 });

  const usdc = purchaseUsdc(kind, qty);
  const amount = usdcBaseUnits(usdc);
  const reference = randomUUID();
  const expiresAt = new Date(Date.now() + USDC.INTENT_TTL_MS);

  // The quote is recorded BEFORE the player is asked to sign, which is what
  // makes the confirm step safe: it checks the transaction against a price this
  // server set, not against a number handed back with the signature.
  const [intent] = await db.insert(payments).values({
    playerId: session.sub,
    kind,
    qty,
    amount,
    treasury: treasury.toBase58(),
    reference,
    expiresAt,
  }).returning();

  return Response.json({
    paymentId: intent.id,
    /** What the wallet must send. */
    treasury: treasury.toBase58(),
    mint: mint.toBase58(),
    amount,
    decimals: USDC.DECIMALS,
    usdc,
    /** Must appear in the transaction's memo — it binds the transfer to THIS
     *  quote, so a payment cannot be claimed by anyone who saw it on chain. */
    reference,
    expiresAt: expiresAt.toISOString(),
  });
}

/** `{ paymentId, signature }` → verify on chain and credit the item. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  if (!payEnabled()) {
    return Response.json({ error: 'payments_unavailable' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    paymentId?: unknown; signature?: unknown;
  };
  if (typeof body.paymentId !== 'string' || typeof body.signature !== 'string') {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const signature = body.signature;

  const intent = await db.query.payments.findFirst({
    where: and(eq(payments.id, body.paymentId), eq(payments.playerId, session.sub)),
  });
  if (!intent) return Response.json({ error: 'unknown_payment' }, { status: 404 });

  // Already credited. Answering OK rather than erroring makes the confirm step
  // idempotent, which it has to be: a player who loses their connection between
  // paying and being credited will retry, and must not be told their money
  // vanished.
  if (intent.status === 'confirmed') {
    const state = await shopState(session.sub);
    return Response.json({ alreadyCredited: true, bought: { kind: intent.kind, qty: intent.qty }, ...state });
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    await db.update(payments).set({ status: 'expired' }).where(eq(payments.id, intent.id));
    return Response.json({ error: 'quote_expired' }, { status: 410 });
  }

  const check = await verifyPayment({
    signature,
    treasury: treasuryAddress()!,
    mint: usdcMint()!,
    amount: intent.amount,
    reference: intent.reference,
  });

  if (!check.ok) {
    // `not_found` means "not landed YET" as often as "never existed", so the
    // intent is left pending and the client is told to retry. Marking it failed
    // here would burn a real payment that was merely slow to confirm.
    if (check.reason === 'not_found') {
      return Response.json({ error: 'not_confirmed_yet', retry: true }, { status: 202 });
    }
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, intent.id));
    return Response.json({ error: check.reason }, { status: 400 });
  }

  // Claim the signature and credit the item in ONE transaction. The unique
  // index on `payments.signature` is what makes this safe: two requests
  // carrying the same signature race, one wins the update, the other's guard
  // (status still 'pending') matches nothing and it credits nothing.
  const granted = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(payments)
      .set({ status: 'confirmed', signature, confirmedAt: new Date() })
      .where(and(eq(payments.id, intent.id), eq(payments.status, 'pending')))
      .returning({ id: payments.id });
    if (!claimed) return null;

    // `intent.amount` is already in USDC base units, which is what the receipt
    // stores — and the payment id links it back to its on-chain proof.
    return grantItem(tx, session.sub, intent.kind, intent.qty, Date.now(), {
      currency: 'usdc',
      cost: intent.amount,
      paymentId: intent.id,
    });
  }).catch((err: unknown) => {
    // The unique index rejected the signature: it already credited another
    // quote. That is a replay, not a payment.
    if (String(err).includes('payments_signature_idx')) return 'replayed' as const;
    throw err;
  });

  if (granted === 'replayed') {
    return Response.json({ error: 'signature_already_used' }, { status: 409 });
  }
  if (!granted) {
    // Lost the race to a concurrent confirm of the same intent — which means it
    // IS credited, by the other request.
    const state = await shopState(session.sub);
    return Response.json({ alreadyCredited: true, bought: { kind: intent.kind, qty: intent.qty }, ...state });
  }

  const state = await shopState(session.sub);
  return Response.json({ bought: granted, paidUsdc: intent.amount / 10 ** USDC.DECIMALS, ...state });
}

/** Housekeeping: mark lapsed quotes expired. Called by the shop screen's load,
 *  so no cron is needed — the same "derive, never tick" rule as everything else. */
export async function expireStaleQuotes(): Promise<void> {
  await db.update(payments)
    .set({ status: 'expired' })
    .where(and(eq(payments.status, 'pending'), lt(payments.expiresAt, new Date())));
}
