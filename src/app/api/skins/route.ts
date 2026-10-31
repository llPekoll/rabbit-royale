import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { SKINS, ownedSkinKeys } from '@/lib/game/skins';
import { lookOf } from '@/lib/game/look';
import { payEnabled } from '@/lib/pay/solana';
import { enabledTokens } from '@/lib/pay/tokens';
import { goldPrice } from '@/lib/game/gold';
import { isWeb2 } from '@/lib/world';
import { tokenUsdPrices } from '@/lib/pay/rates';

/** Read-only: recovery uses the existing POST /api/shop/claim. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const enabled = payEnabled();
  // One round trip for the whole page: the region servers may sit a
  // continent away from the database.
  const [player, owned, pending, rates] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, session.sub) }),
    ownedSkinKeys(session.sub),
    db.select({ kind: payments.kind }).from(payments)
      .where(and(eq(payments.playerId, session.sub), eq(payments.status, 'pending'))),
    enabled ? tokenUsdPrices().catch(() => null) : Promise.resolve(null),
  ]);
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });
  return Response.json({
    skins: SKINS.filter((skin) => skin.onSale).map((skin) => ({
      ...skin, owned: owned.includes(skin.key), equipped: player.equippedSkin === skin.key,
      // Web2 sells skins for gold (lib/game/gold.ts).
      ...(isWeb2() ? { gold: goldPrice(skin.kind) } : {}),
      pending: pending.some((payment) => payment.kind === skin.kind),
    })),
    owned, equipped: player.equippedSkin, look: lookOf(player.avatar, player.equippedSkin),
    paymentsEnabled: enabled, tokens: enabled ? enabledTokens() : [],
    // The shop's rates (api/shop), so the page prices in the chosen rail.
    rates,
  });
}
