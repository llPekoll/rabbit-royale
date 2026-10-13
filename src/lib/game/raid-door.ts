/**
 * CAN I RAID THEM? — the raid door, asked of many names at once.
 *
 * The raid list (GET /api/raid) is not the only place a player meets another:
 * the season board and the profile's raid log name rivals too, and on those
 * rows the user wanted to read, beside the name, whether a raid would go
 * through — or that they are out on an island to be watched (and struck), or
 * how long until the shield drops (2026-10-13).
 *
 * The verdict MIRRORS POST /api/raid's refusals, in the same order, so a row
 * that says "raid" is a door that opens:
 *
 *   self → level (both ways) → solo (both ways) → shield → nothing to take /
 *   asleep and already taken → my per-victim cooldown.
 *
 * Energy is not here: it is the viewer's, the same for every row, and the
 * door says so itself when pressed.
 */
import { and, eq, gt, inArray, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, raidRuns } from '@/lib/db/schema';
import { connectedAmong, onlineAmong } from '@/lib/leaderboard';
import { asleep, nothingToTake } from '@/lib/game/raid';
import { gardenYield } from '@/lib/game/regen';
import { RABBIT_LEVELS } from '@config/tuning';
import { RAID_RUN } from '@/lib/tuning/tables';

export type Presence = 'away' | 'home' | 'digging';

/**
 *   open     — a raid goes through now.
 *   shield   — their shield, or my cooldown on them: `waitMs` until it does.
 *   bare     — nothing worth taking (RAID.NOTHING_TO_TAKE_BELOW).
 *   asleep   — away for days and already raided once this absence.
 *   locked   — they are under RABBIT_LEVELS.RAID_MIN.
 *   solo     — they play out of PvP: no raid, no watching either.
 */
export type DoorState = 'open' | 'shield' | 'bare' | 'asleep' | 'locked' | 'solo';

export type RaidDoor = {
  state: DoorState;
  /** Until the door opens, for `shield` — a DURATION, like the raid list's
   *  `shieldedFor`, so a client with a wrong clock still counts down right. */
  waitMs: number;
  /** `digging` is an island to watch, and to strike from. */
  presence: Presence;
};

type Target = {
  level: number;
  solo: boolean;
  shieldedUntil: Date | null;
  stock: number;
  garden: number;
  sleeping: boolean;
  takenWhileAsleep: boolean;
};

/** The verdict for one target, from what was read. Pure, for the tests. */
export function doorOf(t: Target, cooldownLeftMs: number, now = Date.now()): Omit<RaidDoor, 'presence'> {
  if (t.level < RABBIT_LEVELS.RAID_MIN) return { state: 'locked', waitMs: 0 };
  if (t.solo) return { state: 'solo', waitMs: 0 };
  const shieldMs = t.shieldedUntil ? Math.max(0, t.shieldedUntil.getTime() - now) : 0;
  if (shieldMs > 0) return { state: 'shield', waitMs: Math.max(shieldMs, cooldownLeftMs) };
  if (nothingToTake(t.stock, t.garden, t.sleeping)) return { state: 'bare', waitMs: 0 };
  if (t.sleeping && t.takenWhileAsleep) return { state: 'asleep', waitMs: 0 };
  if (cooldownLeftMs > 0) return { state: 'shield', waitMs: cooldownLeftMs };
  return { state: 'open', waitMs: 0 };
}

/**
 * The door of each of `ids` for `viewerId`. NULL when the viewer cannot raid
 * at all (under RAID_MIN, or solo): every row would say the same thing, and
 * the board says it once, at the RAID door.
 */
export async function raidDoors(viewerId: string, ids: string[]): Promise<Map<string, RaidDoor> | null> {
  const me = await db.query.players.findFirst({ where: eq(players.id, viewerId), columns: { level: true, solo: true } });
  if (!me || me.level < RABBIT_LEVELS.RAID_MIN || me.solo) return null;
  const others = [...new Set(ids)].filter((id) => id !== viewerId);
  const doors = new Map<string, RaidDoor>();
  if (others.length === 0) return doors;

  const now = Date.now();
  const [rows, recent, connected, digging] = await Promise.all([
    db.select({
      id: players.id,
      level: players.level,
      solo: players.solo,
      shieldedUntil: players.shieldedUntil,
      stock: players.stock,
      gardenCollectedAt: players.gardenCollectedAt,
      burrowLevel: players.burrowLevel,
      wateredUntil: players.wateredUntil,
      fertilisedUntil: players.fertilisedUntil,
      lastSeenAt: players.lastSeenAt,
      // POST's "asleep, and a raid already took something since they were
      // last seen". Qualified by hand: on a one-table select drizzle writes
      // bare "id", which inside the subquery is the raid run's own uuid.
      takenSinceSeen: raw<boolean>`exists (select 1 from raid_runs r where r.defender_id = "players"."id" and r.started_at > "players"."last_seen_at" and r.carrots_looted > 0)`,
    }).from(players).where(inArray(players.id, others)),
    // My last WALKED raid on each of them inside the cooldown window — the
    // same rows POST measures from (`visited` longer than the entrance).
    db.select({ id: raidRuns.defenderId, at: raw<Date>`max(${raidRuns.startedAt})` })
      .from(raidRuns)
      .where(and(
        eq(raidRuns.attackerId, viewerId),
        inArray(raidRuns.defenderId, others),
        gt(raidRuns.startedAt, new Date(now - RAID_RUN.COOLDOWN_MS)),
        raw`coalesce(array_length(${raidRuns.visited}, 1), 0) > 1`,
      ))
      .groupBy(raidRuns.defenderId),
    connectedAmong(others),
    onlineAmong(others),
  ]);
  const lastRaid = new Map(recent.map((r) => [r.id, new Date(r.at).getTime()]));
  for (const p of rows) {
    const at = lastRaid.get(p.id);
    const cooldownLeft = at ? Math.max(0, RAID_RUN.COOLDOWN_MS - (now - at)) : 0;
    const door = doorOf({
      level: p.level,
      solo: p.solo,
      shieldedUntil: p.shieldedUntil,
      stock: p.stock,
      garden: gardenYield(p, now),
      sleeping: asleep(p.lastSeenAt, now) && !connected.has(p.id),
      takenWhileAsleep: p.takenSinceSeen,
    }, cooldownLeft, now);
    doors.set(p.id, {
      ...door,
      presence: digging.has(p.id) ? 'digging' : connected.has(p.id) ? 'home' : 'away',
    });
  }
  return doors;
}
