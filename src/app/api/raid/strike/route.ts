/**
 * Call the lightning down on whoever is crossing your burrow.
 *
 * The defender's one direct answer to a raid in progress (the other is a bomb,
 * which is `/api/traps` and does not know it is being used mid-raid). It ends
 * the run where the raider stands: they take nothing, and the burrow gets the
 * short shield any ended raid earns.
 *
 * It COSTS a lightning — the same item the island's strike spends, from the
 * same shelf. A free, unlimited strike made a burrow unraidable by anyone
 * whose owner was at home, which is not a defence but a switch; an item is a
 * price the shop already knows how to charge.
 *
 * Spent BEFORE the run is closed, and refunded if the run turns out to have
 * ended in the same instant (a last step that reached the field as the bolt
 * came down): a strike that landed on a raid already over must not cost the
 * carrot, and one that ended a raid must not go unpaid.
 *
 *   POST → the raid as it now stands: finished, struck.
 */
import { and, eq, isNull, sql as raw } from 'drizzle-orm';
import { db, sql } from '@/lib/db';
import { pushToPlayer } from '@/lib/game/raid-events';
import { inventory, players, raidRuns, raids } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { defenderRaidView } from '@/lib/game/defence';
import { RAID_RUN } from '@config/tuning';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const run = await db.query.raidRuns.findFirst({
    where: and(eq(raidRuns.defenderId, session.sub), isNull(raidRuns.endedAt)),
  });
  if (!run) return Response.json({ error: 'no_raid' }, { status: 404 });

  // Conditional on the row still holding one, so two taps racing the same last
  // bolt cannot both win — the island's strike spends its item the same way.
  const spent = await db
    .update(inventory)
    .set({ qty: raw`${inventory.qty} - 1` })
    .where(and(
      eq(inventory.playerId, session.sub),
      eq(inventory.kind, 'lightning'),
      raw`${inventory.qty} > 0`,
    ))
    .returning({ qty: inventory.qty });
  if (spent.length === 0) return Response.json({ error: 'none_held' }, { status: 400 });

  const now = new Date();
  // Guarded on the run being OPEN: the raider's own step can close it in the
  // same instant, and a strike must not overwrite an ending that already
  // settled carrots. If nothing was updated the bolt hit a raid that was
  // over — the item goes back.
  const [closed] = await db.update(raidRuns)
    .set({ struckAt: now, endedAt: now, succeeded: false, carrotsLooted: 0 })
    .where(and(eq(raidRuns.id, run.id), isNull(raidRuns.endedAt)))
    .returning({ id: raidRuns.id });
  if (!closed) {
    await db.update(inventory)
      .set({ qty: raw`${inventory.qty} + 1` })
      .where(and(eq(inventory.playerId, session.sub), eq(inventory.kind, 'lightning')));
    return Response.json({ error: 'raid_over' }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    // A raid ended, so the burrow earns the short shield any ending earns —
    // the pile-on protection, not the sacked-burrow one.
    await tx.update(players)
      .set({ shieldedUntil: new Date(now.getTime() + RAID_RUN.SHIELD_AFTER_RAID_MS) })
      .where(eq(players.id, session.sub));
    // The attacker's raid COUNTED: they knocked on the door, and the quest
    // board asks for the knock, not the haul.
    await tx.update(players)
      .set({ raidsPlayed: raw`${players.raidsPlayed} + 1` })
      .where(eq(players.id, run.attackerId));
    // The log — and already SEEN: the defender did this, they were watching.
    await tx.insert(raids).values({
      attackerId: run.attackerId,
      defenderId: session.sub,
      damage: 0,
      result: 'blocked',
      carrotsLooted: 0,
      scoreTransferred: 0,
      seenByDefender: true,
    });
  });

  const attacker = await db.query.players.findFirst({ where: eq(players.id, run.attackerId) });
  if (!attacker) return Response.json({ error: 'unknown_player' }, { status: 404 });
  const after = await db.query.raidRuns.findFirst({ where: eq(raidRuns.id, run.id) });
  if (!after) return Response.json({ error: 'no_raid' }, { status: 404 });

  // The RAIDER is told now, over the push bus, rather than on their next
  // step: their client re-reads the raid and plays the shock they were dealt.
  await pushToPlayer(sql, { to: run.attackerId, event: 'raid_struck', payload: { raidId: run.id } });

  return Response.json({ raid: defenderRaidView(after, attacker) });
}
