/**
 * A per-player budget on the routes that read the chain.
 *
 * Every quote reads the payer's balance and token account, every confirm reads
 * a transaction, every claim lists the treasury — and a guest costs nothing to
 * make. Without a ceiling, one script loops POST /api/shop/pay and spends the
 * Alchemy quota everyone's purchases need (a single player already hit its
 * 429 on the first mainnet day, 2026-09-30).
 *
 * A fixed window in Redis: INCR, and EXPIRE on the first hit. Shared by every
 * process, so a restart or a second instance does not reset anyone's budget.
 * No Redis (local dev) means no limit — the same "absent is off" rule as the
 * leaderboard.
 */
// Relative, not `@/`: the WS server bundles this module too.
import { redis } from './leaderboard';

export async function overLimit(
  bucket: string,
  playerId: string,
  max: number,
  windowSeconds = 60,
): Promise<boolean> {
  try {
    const r = await redis();
    if (!r) return false;
    const key = `rr:rl:${bucket}:${playerId}`;
    const hits = await r.incr(key);
    if (hits === 1) await r.expire(key, windowSeconds);
    return hits > max;
  } catch (err) {
    // A limiter that cannot count must not lock players out of the shop.
    console.warn('[rate-limit] redis unavailable, not limiting', err);
    return false;
  }
}

/** The answer a limited route gives, the same everywhere. */
export function tooMany(): Response {
  return Response.json({ error: 'rate_limited' }, { status: 429 });
}
