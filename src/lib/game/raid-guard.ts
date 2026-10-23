/**
 * THE BURROW'S GUARD (2026-10-23) — three rules that belong to the VICTIM,
 * whoever raids them. Until now every limit was the raider's: COOLDOWN_MS is
 * per pair, so two raiders (or one player on two accounts, Abols and Zicels)
 * took turns on the same burrow seconds apart, the first springing the bomb
 * and the second walking the cleared path to the 1 200 cap. A Discord report
 * (Steals_x, GrimClover93 in game) and the logs agreed.
 *
 *   rest      — after a raid that took carrots, nobody for VICTIM_REST_MS;
 *               and no more than VICTIM_DAY_CAP such raids per 24 h.
 *   busy      — one raider at a time: a crossing someone else opened under
 *               BUSY_MS ago holds the door.
 *   autoShield — losses of AUTO_SHIELD_LOSS inside AUTO_SHIELD_WINDOW_MS raise
 *               a shield from the owner's bag, without them.
 *
 * Tuned by replaying the fortnight's real raids: tools/raid-shield-replay.ts.
 */
import { and, eq, gt, inArray, isNull, ne, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventory, players, raidRuns } from '@/lib/db/schema';
import { RAID, RAID_RUN } from '@/lib/tuning/tables';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a burrow still rests, from when the raids that TOOK something from
 * it in the last 24 h ended. Pure, for the tests. 0 = open.
 */
export function restLeftMs(lootedAt: readonly number[], now = Date.now()): number {
  const recent = lootedAt.filter((t) => now - t < DAY_MS).sort((a, b) => b - a);
  if (!recent.length) return 0;
  const breather = Math.max(0, recent[0] + RAID_RUN.VICTIM_REST_MS - now);
  // The cap: the burrow opens again when the oldest of the last CAP raids
  // leaves the 24 h window.
  const cap = RAID_RUN.VICTIM_DAY_CAP;
  const capped = recent.length >= cap ? Math.max(0, recent[cap - 1] + DAY_MS - now) : 0;
  return Math.max(breather, capped);
}

/** `restLeftMs` for each of `ids`, read in one query. Absent = 0. */
export async function restOf(ids: readonly string[], now = Date.now()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const rows = await db.select({ id: raidRuns.defenderId, at: raidRuns.endedAt })
    .from(raidRuns)
    .where(and(
      inArray(raidRuns.defenderId, [...ids]),
      gt(raidRuns.endedAt, new Date(now - DAY_MS)),
      gt(raidRuns.carrotsLooted, 0),
    ));
  const byId = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.at) continue;
    const list = byId.get(r.id) ?? [];
    list.push(new Date(r.at).getTime());
    byId.set(r.id, list);
  }
  for (const [id, times] of byId) {
    const left = restLeftMs(times, now);
    if (left > 0) out.set(id, left);
  }
  return out;
}

/** Is someone else inside this burrow right now (RAID_RUN.BUSY_MS)? */
export async function burrowBusy(defenderId: string, attackerId: string, now = Date.now()): Promise<boolean> {
  if (RAID_RUN.BUSY_MS <= 0) return false;
  const [other] = await db.select({ id: raidRuns.id }).from(raidRuns).where(and(
    eq(raidRuns.defenderId, defenderId),
    ne(raidRuns.attackerId, attackerId),
    isNull(raidRuns.endedAt),
    gt(raidRuns.startedAt, new Date(now - RAID_RUN.BUSY_MS)),
    raw`coalesce(array_length(${raidRuns.visited}, 1), 0) > 1`,
  )).limit(1);
  return !!other;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Raise a shield from the defender's bag if the raids of the window have now
 * taken AUTO_SHIELD_LOSS. Called inside the settling transaction, AFTER this
 * raid's `carrotsLooted` is written, with the defender's row locked — so two
 * raids settling together cannot both spend a shield. Returns the new
 * `shieldedUntil`, or null when none went up.
 */
export async function autoShield(tx: Tx, defenderId: string, shieldedUntil: Date | null, now: Date): Promise<Date | null> {
  if (RAID.AUTO_SHIELD_LOSS <= 0) return null;
  if (shieldedUntil && shieldedUntil.getTime() > now.getTime()) return null;
  // Not "since the last shield lifted": `shieldedUntil` is rewritten by every
  // raid that takes something (RAID_RUN.SHIELD_AFTER_RAID_MS, 0 in every base
  // since 19 October, so it reads as that raid's end). The window is shorter
  // than any shield, so whatever it holds came after the last one anyway.
  const since = now.getTime() - RAID.AUTO_SHIELD_WINDOW_MS;
  const [sum] = await tx.select({ lost: raw<number>`coalesce(sum(${raidRuns.carrotsLooted}), 0)::int` })
    .from(raidRuns)
    .where(and(eq(raidRuns.defenderId, defenderId), gt(raidRuns.endedAt, new Date(since))));
  if ((sum?.lost ?? 0) < RAID.AUTO_SHIELD_LOSS) return null;
  const [spent] = await tx.update(inventory)
    .set({ qty: raw`${inventory.qty} - 1` })
    .where(and(eq(inventory.playerId, defenderId), eq(inventory.kind, 'shield'), raw`${inventory.qty} >= 1`))
    .returning({ qty: inventory.qty });
  if (!spent) return null;
  const until = new Date(now.getTime() + RAID.ITEM_SHIELD_MS);
  await tx.update(players).set({ shieldedUntil: until }).where(eq(players.id, defenderId));
  return until;
}
