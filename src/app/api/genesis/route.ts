/**
 * GET /api/genesis — the RR Genesis pieces this player has won, newest first,
 * each with its image (base64 PNG) and where its transfer stands.
 *
 * Web3 only (WEB3_ONLY_ROUTES): the web2 world never draws a piece and answers
 * 404 here. `wallet` says whether this player can win one at all — a guest is
 * shown how to, not an empty shelf.
 */
import { desc, eq, isNotNull, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { genesisPieces, players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { viewOf } from '@/lib/genesis/award';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const [p] = await db.select({ wallet: players.wallet }).from(players).where(eq(players.id, session.sub));
  const rows = await db.select().from(genesisPieces)
    .where(and(eq(genesisPieces.playerId, session.sub), isNotNull(genesisPieces.assetId)))
    .orderBy(desc(genesisPieces.wonAt));
  return Response.json({
    wallet: p?.wallet ?? null,
    pieces: await Promise.all(rows.map(viewOf)),
  });
}
