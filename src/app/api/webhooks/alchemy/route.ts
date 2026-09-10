/**
 * Alchemy's webhook: a nudge, never an authority.
 *
 * This endpoint is PUBLIC — anyone on the internet can POST to it — so the one
 * rule that matters here is that nothing it says is believed. A webhook body
 * claiming "player X paid 5 USDC" credits nothing. What it does is point at a
 * transaction, and the server then goes and reads that transaction on chain
 * itself, through exactly the same `verifyPayment` a client-supplied signature
 * goes through.
 *
 * That is why adding a webhook does not widen the attack surface in the way it
 * normally would: the trust boundary is unchanged. The chain is still the only
 * thing believed. Alchemy just gets to say "look now" instead of the player's
 * browser saying it.
 *
 * Two independent paths now cover a payment, and they fail differently, which
 * is the point of having both:
 *
 *   the player's browser   → confirms in seconds, dies if the tab closes
 *   this webhook           → survives a closed tab, dies if it fires during a
 *                            deploy or if Alchemy has an outage
 *   the shop's own sweep   → catches whatever both of them missed, next visit
 *
 * Signature verification is HMAC-SHA256 over the RAW body, so the body must not
 * be parsed before it is checked — a re-serialised object is a different string
 * and will not match.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments } from '@/lib/db/schema';
import { grantItem } from '@/lib/game/grant';
import { payEnabled, treasuryAddress, usdcMint, verifyPayment } from '@/lib/pay/solana';

/** Alchemy signs every delivery with the signing key from its dashboard. */
function signatureValid(raw: string, header: string | null): boolean {
  const secret = process.env.ALCHEMY_WEBHOOK_SECRET;
  // No secret configured means the endpoint is CLOSED, not open. An unsigned
  // webhook that credited items would be a public "give me things" button.
  if (!secret || !header) return false;

  const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const got = header.trim();
  // Length check first: timingSafeEqual throws on a length mismatch, and a
  // throw here would be a 500 that tells an attacker their guess was the wrong
  // size.
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(got, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Pull every transaction signature out of a delivery, whatever shape it took.
 *
 * Alchemy's Solana payloads have changed shape before and will again, and the
 * ONLY thing wanted from the body is a list of candidate signatures — every
 * other field is ignored, because every other field would have to be trusted.
 * So this walks the whole object and collects anything that looks like a
 * signature, rather than reaching into a path that a format change would break.
 */
export function signaturesIn(body: unknown, found = new Set<string>()): Set<string> {
  if (typeof body === 'string') {
    // base58, 64 bytes → 87-88 characters. Cheap shape check; the real
    // validation is that the chain has such a transaction.
    if (/^[1-9A-HJ-NP-Za-km-z]{86,90}$/.test(body)) found.add(body);
    return found;
  }
  if (Array.isArray(body)) {
    for (const item of body) signaturesIn(item, found);
    return found;
  }
  if (body && typeof body === 'object') {
    for (const value of Object.values(body)) signaturesIn(value, found);
  }
  return found;
}

export async function POST(req: Request) {
  // The raw text, before any parsing: the HMAC is over these exact bytes.
  const raw = await req.text();

  if (!signatureValid(raw, req.headers.get('x-alchemy-signature'))) {
    // Deliberately terse. An endpoint that explains why it rejected you is an
    // endpoint that helps you get it right next time.
    return Response.json({ error: 'bad_signature' }, { status: 401 });
  }
  if (!payEnabled()) return Response.json({ ok: true, skipped: 'payments_disabled' });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }

  const treasury = treasuryAddress()!;
  const mint = usdcMint()!;
  const candidates = [...signaturesIn(body)].slice(0, 20);
  const credited: string[] = [];

  for (const signature of candidates) {
    // Already credited, or belongs to nobody's quote: either way, nothing to do.
    // This is also the replay guard — a webhook delivered twice finds the
    // payment already confirmed the second time.
    const already = await db.query.payments.findFirst({
      where: eq(payments.signature, signature),
    });
    if (already) continue;

    // Read the chain. THE step that makes this endpoint safe: the webhook has
    // told us where to look and nothing more.
    const pending = await db.query.payments.findMany({
      where: eq(payments.status, 'pending'),
      limit: 50,
    });

    for (const intent of pending) {
      if (intent.expiresAt.getTime() < Date.now()) continue;

      const check = await verifyPayment({
        signature,
        treasury,
        mint,
        amount: intent.amount,
        reference: intent.reference,
      });
      if (!check.ok) continue;

      const granted = await db.transaction(async (tx) => {
        const [claimed] = await tx.update(payments)
          .set({ status: 'confirmed', signature, confirmedAt: new Date() })
          .where(and(eq(payments.id, intent.id), eq(payments.status, 'pending')))
          .returning({ id: payments.id });
        if (!claimed) return null;

        return grantItem(tx, intent.playerId, intent.kind, intent.qty, Date.now(), {
          currency: 'usdc',
          cost: intent.amount,
          paymentId: intent.id,
        });
      }).catch((err: unknown) => {
        // The unique index caught a race with the player's own confirm. They
        // got there first; nothing to do.
        if (String(err).includes('payments_signature_idx')) return null;
        throw err;
      });

      if (granted) credited.push(signature);
      break;
    }
  }

  // Always 200 once the signature checks out. A non-2xx makes Alchemy retry,
  // and there is nothing to retry for: a transaction that did not match any
  // open quote will not match one later either.
  return Response.json({ ok: true, credited: credited.length });
}
