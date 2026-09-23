/**
 * The owner's rearrangement of their burrow, between the database and the
 * rules (`BurrowEdits`, game/burrow/generate).
 *
 * The rules in game/burrow/board answer by seed, and since a burrow can be
 * rearranged the seed alone is not enough: every route that reads a burrow
 * calls `loadBurrowEdits` first, so the raid, the traps and the fences all
 * judge the ground the owner actually laid out.
 */
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, raidRuns } from '@/lib/db/schema';
import { setBurrowEdits, burrowEditsOf } from '@/game/burrow/board';
import type { BurrowEdits } from '@/game/burrow/generate';

/** Read a player's edits and hand them to the rules. Returns them too. */
export async function loadBurrowEdits(playerId: string): Promise<BurrowEdits | null> {
  const row = await db.query.players.findFirst({
    where: eq(players.id, playerId),
    columns: { burrowEdits: true },
  });
  setBurrowEdits(playerId, row?.burrowEdits ?? null);
  return burrowEditsOf(playerId);
}

/**
 * How long an open raid keeps the burrow locked. A raider who closed the app
 * mid-crossing leaves their run open until they come back, and a burrow must
 * not stay frozen on a raid nobody is walking. A real crossing is minutes.
 */
const RAID_LOCK_MS = 30 * 60 * 1000;

/**
 * Is someone walking this burrow right now? The one time it may not be
 * rearranged: a raider's view, their steps and the traps they are reading
 * are all measured on the ground as it was when they came in.
 */
export async function burrowUnderRaid(playerId: string): Promise<boolean> {
  const open = await db.query.raidRuns.findFirst({
    where: and(
      eq(raidRuns.defenderId, playerId),
      isNull(raidRuns.endedAt),
      gt(raidRuns.startedAt, new Date(Date.now() - RAID_LOCK_MS)),
    ),
    columns: { id: true },
  });
  return !!open;
}

/**
 * Only the three known keys, each of the right shape — the body came off the
 * wire. `null` when it is not an edit at all.
 */
export function parseBurrowEdits(raw: unknown): BurrowEdits | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: BurrowEdits = {};
  if (r.field !== undefined) {
    const f = r.field;
    if (!Array.isArray(f) || f.length !== 2 || !f.every(Number.isInteger)) return null;
    if (f[0] !== 0 || f[1] !== 0) out.field = [f[0], f[1]];
  }
  if (r.house !== undefined && r.house !== null) {
    if (!Number.isInteger(r.house)) return null;
    out.house = r.house as number;
  }
  if (r.moves !== undefined) {
    if (!Array.isArray(r.moves) || r.moves.length > 64) return null;
    const moves: [number, number][] = [];
    for (const m of r.moves) {
      if (!Array.isArray(m) || m.length !== 2 || !m.every(Number.isInteger)) return null;
      if (m[0] !== m[1]) moves.push([m[0], m[1]]);
    }
    if (moves.length) out.moves = moves;
  }
  return out;
}
