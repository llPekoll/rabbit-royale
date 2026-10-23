/**
 * A PAYMENT THAT FAILED, reported by the client — to #payment-alerts.
 *
 * The client is the only one that sees every failure: a wallet that breaks
 * never talks to us, and a refused quote is answered by us but lived by the
 * player. So every failure the player is shown (not a plain refusal in the
 * wallet) is posted here, whatever the analytics consent, and rr-ws adds what
 * the client does not know: the region, the player, the quote. Except the
 * refusals that are the player's own situation (PLAYER_SIDE): those are noise.
 *
 * Nothing is believed beyond "this is what the client saw": the fields only
 * go into a message for us to read.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { overLimit, tooMany } from '@/lib/rate-limit';
import { payAlert } from '@/lib/pay/alert';

const text = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Refusals that are the player's situation, not a breakage: the player was
 *  told what to do and nothing on our side is wrong. They still reach the
 *  analytics (client side), never the owner's phone. `not_confirmed_yet` is a
 *  202: the webhook, or the next shop opening, credits it. */
const PLAYER_SIDE = new Set([
  'insufficient_funds',
  'no_token_account',
  'skin_owned',
  'skin_purchase_pending',
  'wallet_required',
  'quote_expired',
  'not_confirmed_yet',
  'offline',
]);

/** The server code in a client reason: "quote: insufficient_funds (HTTP 400)". */
const codeOf = (reason: string): string => /^\w+: (\w+) \(HTTP \d+\)$/.exec(reason)?.[1] ?? '';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('payfail', session.sub, 10)) return tooMany();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = text(body.reason, 600) || 'unknown';
  if (PLAYER_SIDE.has(codeOf(reason))) return Response.json({ ok: true });

  const player = await db.query.players.findFirst({
    where: eq(players.id, session.sub),
    columns: { name: true, wallet: true },
  });

  payAlert({
    title: 'Payment failed: ' + (text(body.kind, 40) || '?') + ' (' + (text(body.stage, 20) || '?') + ')',
    playerId: session.sub,
    reason,
    fields: {
      player: player?.name ?? session.sub,
      rail: text(body.rail, 10),
      platform: text(body.platform, 40),
      'account wallet': player?.wallet ?? 'none',
      'paying wallet': text(body.payer, 60),
      quote: text(body.paymentId, 60),
      signature: text(body.signature, 100),
      shown: text(body.shown, 300),
    },
  });
  return Response.json({ ok: true });
}
