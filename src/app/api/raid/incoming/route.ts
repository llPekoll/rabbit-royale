/**
 * The raid on YOUR burrow, right now.
 *
 * The other half of `/api/raid`. That one serves the attacker; this one serves
 * the burrow being crossed, which until now was never told anything until the
 * raid was history (`/api/player/history`). A defender who happens to be at
 * home polls this and watches the intruder step, and may answer — a bomb
 * buried ahead of them through `/api/traps` as usual, or the lightning through
 * `/api/raid/strike`.
 *
 * Read ONCE, on arrival. The live picture is PUSHED: every change to a raid
 * is announced on the socket as `raid_incoming` (see `lib/game/raid-events`),
 * so a burrow that is open when a raid begins never asks. This answers the
 * one case a push cannot — the owner loading the page while a raid is already
 * under way — and it is never polled.
 *
 *   GET → the open raid against you, or — for a few seconds after it ended —
 *         the ending, so a screen that arrives just late still sees it. Null
 *         otherwise.
 */
import { and, desc, eq, gt, isNull, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, raidRuns } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { defenderRaidView } from '@/lib/game/defence';
import { RAID_RUN } from '@config/tuning';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // WALKED raids only, matching the push. A raid that has been opened but not
  // stepped into is not announced on the socket (see the POST in ../route),
  // so surfacing it here would put an intruder on the burrow of a defender who
  // merely loaded their page at the wrong moment — the one scare the push was
  // changed to stop. `visited` holds the entrance tile alone until the first
  // step, hence > 1.
  const open = await db.query.raidRuns.findFirst({
    where: and(
      eq(raidRuns.defenderId, session.sub),
      isNull(raidRuns.endedAt),
      raw`coalesce(array_length(${raidRuns.visited}, 1), 0) > 1`,
    ),
    orderBy: desc(raidRuns.startedAt),
  });
  // Same rule for the one that just ended: an abandoned, unwalked raid has no
  // ending worth showing either.
  const run = open ?? await db.query.raidRuns.findFirst({
    where: and(
      eq(raidRuns.defenderId, session.sub),
      gt(raidRuns.endedAt, new Date(Date.now() - RAID_RUN.ENDED_SHOWN_MS)),
      raw`coalesce(array_length(${raidRuns.visited}, 1), 0) > 1`,
    ),
    orderBy: desc(raidRuns.startedAt),
  });
  if (!run) return Response.json({ raid: null });

  const attacker = await db.query.players.findFirst({ where: eq(players.id, run.attackerId) });
  if (!attacker) return Response.json({ raid: null });

  return Response.json({ raid: defenderRaidView(run, attacker) });
}
