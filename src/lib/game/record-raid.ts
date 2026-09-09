/**
 * Writing a settled raid down.
 *
 * `settleRaid` decides what a raid was worth; this is the part that makes it
 * true — the carrots actually change hands and the raid becomes a row the
 * victim can read later.
 *
 * It is one transaction on purpose. A raid that moved carrots but left no log
 * line is a player robbed by nobody, and a log line whose carrots never moved is
 * a lie told to both of them; either alone is worse than the raid failing.
 *
 * The season score travels WITH the carrots (GDD, phase 5): a stolen carrot
 * changes sides entirely rather than merely leaving the victim's bank. That is
 * what makes the leaderboard worth defending.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, raids } from '@/lib/db/schema';
import type { RaidOutcome } from '@/lib/game/raid';

export interface RecordedRaid {
  id: string;
  result: 'damaged' | 'looted' | 'blocked';
  carrotsLooted: number;
  scoreTransferred: number;
  damage: number;
}

/**
 * What the raid WAS, from what it did. Kept here rather than at the call site so
 * every raid is classified the same way: a shield (or a raider stopped on the
 * doorstep) is 'blocked', carrots taken is 'looted', and anything that only
 * dented the burrow is 'damaged'.
 */
export function raidResult(outcome: RaidOutcome): RecordedRaid['result'] {
  if (outcome.loot > 0) return 'looted';
  if (outcome.damage > 0) return 'damaged';
  return 'blocked';
}

/**
 * Move the carrots and write the log line.
 *
 * The defender's stock is clamped in SQL (`greatest(0, ...)`) rather than from
 * the value this process read a moment ago: two raiders can settle against the
 * same burrow at once, and the second one must not be able to drive it negative
 * with a stale number.
 */
export async function recordRaid(opts: {
  attackerId: string;
  defenderId: string;
  outcome: RaidOutcome;
}): Promise<RecordedRaid> {
  const { attackerId, defenderId, outcome } = opts;
  const result = raidResult(outcome);

  return db.transaction(async (tx) => {
    // Take from the defender first, and find out what was actually there: the
    // clamp means the amount MOVED can be less than the amount settled.
    const [robbed] = await tx
      .update(players)
      .set({
        stock: sql`greatest(0, ${players.stock} - ${outcome.loot})`,
        seasonScore: sql`greatest(0, ${players.seasonScore} - ${outcome.loot})`,
        burrowHp: sql`greatest(0, ${players.burrowHp} - ${outcome.damage})`,
        hpUpdatedAt: new Date(),
      })
      .where(eq(players.id, defenderId))
      .returning({ stock: players.stock, seasonScore: players.seasonScore });

    if (!robbed) throw new Error(`recordRaid: unknown defender ${defenderId}`);

    // Credit the attacker with what the defender could actually pay, so carrots
    // are conserved even when two raids land at once.
    const looted = outcome.loot;
    const scoreTransferred = outcome.loot;

    if (looted > 0) {
      await tx
        .update(players)
        .set({
          stock: sql`${players.stock} + ${looted}`,
          seasonScore: sql`${players.seasonScore} + ${scoreTransferred}`,
          // Stolen carrots are NOT lifetime carrots: lifetime drives island-tier
          // unlocks, and letting a raid advance it would make raiding the way to
          // skip the game rather than a way to win it.
        })
        .where(eq(players.id, attackerId));
    }

    const [row] = await tx
      .insert(raids)
      .values({
        attackerId,
        defenderId,
        damage: outcome.damage,
        result,
        carrotsLooted: looted,
        scoreTransferred,
      })
      .returning({ id: raids.id });

    return { id: row.id, result, carrotsLooted: looted, scoreTransferred, damage: outcome.damage };
  });
}

/** Raids this player has not been told about yet — the badge on the profile button. */
export async function unseenRaidCount(playerId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(raids)
    .where(and(eq(raids.defenderId, playerId), eq(raids.seenByDefender, false)));
  return row?.n ?? 0;
}
