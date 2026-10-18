/**
 * THE TUTORIAL'S REWARD (config/tuning.ts TUTORIAL_REWARD): what the quest
 * board used to pay, given once at level 1 → 2 — carrots into all three
 * counters, like a quest claim did, and the shield into the bag.
 *
 * Two ways to get it: the tutorial island's chest (server/index.ts), and NO
 * TUTORIAL under SKIP in the queen's book (`skip_tutorial`, /api/burrow,
 * 2026-10-17: straight to RAID_MIN) — skipping must not leave a player broke.
 */
import { eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { TUTORIAL_REWARD } from '@config/tuning';
import { grantItem } from './grant';

export async function tutorialReward(playerId: string): Promise<void> {
  const carrots = TUTORIAL_REWARD.CARROTS;
  await db.transaction(async (tx) => {
    await tx.update(players).set({
      stock: raw`${players.stock} + ${carrots}`,
      seasonScore: raw`${players.seasonScore} + ${carrots}`,
      lifetimeCarrots: raw`${players.lifetimeCarrots} + ${carrots}`,
    }).where(eq(players.id, playerId));
    for (const it of TUTORIAL_REWARD.ITEMS) await grantItem(tx, playerId, it.kind, it.qty);
  });
}
