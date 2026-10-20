/**
 * GET /api/genesis — the RR Genesis pieces this player has won, newest first.
 *
 * Web3 only (WEB3_ONLY_ROUTES): the web2 world never draws a piece and answers
 * 404 here. A piece is SEALED until the mint exists (`minted` false, no
 * address); the profile's GENESIS tab shows it with the island tier it came
 * from, read off the run that banked it.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { genesisPieces, runs } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const rows = await db
    .select({
      id: genesisPieces.id,
      wonAt: genesisPieces.wonAt,
      mintAddress: genesisPieces.mintAddress,
      islandTier: runs.islandTier,
    })
    .from(genesisPieces)
    .leftJoin(runs, eq(runs.id, genesisPieces.runId))
    .where(eq(genesisPieces.playerId, session.sub))
    .orderBy(desc(genesisPieces.wonAt));
  return Response.json({
    pieces: rows.map((r) => ({
      id: r.id,
      wonAt: r.wonAt.toISOString(),
      islandTier: r.islandTier,
      minted: r.mintAddress != null,
      mintAddress: r.mintAddress,
    })),
  });
}
