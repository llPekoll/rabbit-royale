/**
 * A PAYMENT THAT FAILED, reported by the client — to #payment-alerts.
 *
 * The client is the only one that sees every failure: a wallet that breaks
 * never talks to us, and a refused quote is answered by us but lived by the
 * player. So every failure the player is shown (not a plain refusal in the
 * wallet) is posted here, whatever the analytics consent, and rr-ws adds what
 * the client does not know: the region, the player, the quote.
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

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('payfail', session.sub, 10)) return tooMany();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const player = await db.query.players.findFirst({
    where: eq(players.id, session.sub),
    columns: { name: true, wallet: true },
  });

  const reason = text(body.reason, 600) || 'unknown';
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
