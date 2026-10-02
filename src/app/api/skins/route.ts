import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { SKINS, ownedSkinKeys } from '@/lib/game/skins';
import { lookOf } from '@/lib/game/look';
import { payEnabled } from '@/lib/pay/solana';
import { enabledTokens } from '@/lib/pay/tokens';

/** Read-only: recovery uses the existing POST /api/shop/claim. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });
  const owned = await ownedSkinKeys(session.sub);
  const pending = await db.select({ kind: payments.kind }).from(payments)
    .where(and(eq(payments.playerId, session.sub), eq(payments.status, 'pending')));
  const enabled = payEnabled();
  return Response.json({
    skins: SKINS.filter((skin) => skin.onSale).map((skin) => ({
      ...skin, owned: owned.includes(skin.key), equipped: player.equippedSkin === skin.key,
      pending: pending.some((payment) => payment.kind === skin.kind),
    })),
    owned, equipped: player.equippedSkin, look: lookOf(player.avatar, player.equippedSkin),
    paymentsEnabled: enabled, tokens: enabled ? enabledTokens() : [],
  });
}
