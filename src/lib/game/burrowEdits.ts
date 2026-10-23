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
import { burrowCuts, players, raidRuns } from '@/lib/db/schema';
import { setBurrowEdits, burrowEditsOf } from '@/game/burrow/board';
import type { BurrowEdits } from '@/game/burrow/generate';
import { AXE } from '@config/tuning';

/**
 * Read a player's edits and hand them to the rules. Returns them too.
 *
 * WITH THE TREES AN AXE FELLED (`cuts`, 2026-10-12) laid on top: the raid,
 * the traps and the owner's own screen all judge the ground with its stumps.
 * `cuts` is never stored in `burrow_edits` — it is `burrow_cuts`, read here.
 */
export async function loadBurrowEdits(playerId: string): Promise<BurrowEdits | null> {
  // Together: one round trip, not two, to a database that may be overseas.
  const [row, active] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, playerId), columns: { burrowEdits: true } }),
    activeCuts(playerId),
  ]);
  const cuts = active.map((c) => c.tile);
  const edits = row?.burrowEdits ?? null;
  setBurrowEdits(playerId, cuts.length ? { ...(edits ?? {}), cuts } : edits);
  return burrowEditsOf(playerId);
}

/**
 * The trees down on a burrow right now, and when each stands again
 * (AXE.REGROW_MS after the cut). A tree felled twice before it regrows is
 * one stump, named by its LATEST cut. Expired rows are left in place — they are the
 * record of what happened — and simply stop counting.
 */
export async function activeCuts(playerId: string): Promise<Array<{ tile: number; regrowsAt: Date }>> {
  const since = new Date(Date.now() - AXE.REGROW_MS);
  const rows = await db.query.burrowCuts.findMany({
    where: and(eq(burrowCuts.ownerId, playerId), gt(burrowCuts.cutAt, since)),
    columns: { tile: true, cutAt: true },
  });
  const latest = new Map<number, Date>();
  for (const r of rows) {
    const was = latest.get(r.tile);
    if (!was || r.cutAt > was) latest.set(r.tile, r.cutAt);
  }
  return [...latest].sort((a, b) => a[0] - b[0])
    .map(([tile, at]) => ({ tile, regrowsAt: new Date(at.getTime() + AXE.REGROW_MS) }));
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
 * Only the known keys, each of the right shape — the body came off the
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
  // Read but never trusted: the layout route sets `gifts` from the Snack
  // Time streak, whatever came over the wire.
  if (r.gifts !== undefined && r.gifts !== null) {
    if (!Number.isInteger(r.gifts) || (r.gifts as number) < 0) return null;
    if ((r.gifts as number) > 0) out.gifts = r.gifts as number;
  }
  return out;
}
