/**
 * Claim what was paid for but never confirmed — once, when the shop opens.
 *
 * This used to ride on GET /api/shop, and GET /api/shop is read from six places
 * in the client (burrow load, raid, kit, energy, chrome, the shop itself). Every
 * one of them searched the chain for the player's pending quotes: on the first
 * mainnet day (2026-09-30) three taps became dozens of getSignaturesForAddress
 * and Alchemy answered 429. A READ must not touch the chain. The shop screen
 * calls this, and only on opening — the one moment a player looks for an item
 * they paid for.
 *
 * Cost scales with payments, not with screens: a player with no pending quote
 * costs one indexed query and no RPC at all.
 */
import { getSession } from '@/lib/auth/jwt';
import { overLimit, tooMany } from '@/lib/rate-limit';
import { claimUnfinishedPayments } from '../pay/route';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('claim', session.sub, 6)) return tooMany();

  // Failures are swallowed: a sweep that cannot run is not a reason to refuse
  // someone their shop, and the next opening tries again.
  let recovered: { kind: string; qty: number }[] = [];
  try {
    recovered = await claimUnfinishedPayments(session.sub);
  } catch (err) {
    console.error('[shop] claiming unfinished payments failed', err);
  }
  // Named rather than left for the player to notice a changed number: money
  // that arrives silently reads as money that went missing.
  return Response.json({ recovered });
}
