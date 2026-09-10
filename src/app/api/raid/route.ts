/**
 * The raid: walking someone else's burrow.
 *
 * A mini-run, and the server owns every step of it. The attacker sends ONE
 * thing — the tile they want to step onto — and is told what they may see from
 * where they now stand. They are never sent the trap positions, only the clue
 * numbers around tiles they have actually reached, because a raider who can
 * read the whole board has nothing to fear and burying a trap stops meaning
 * anything.
 *
 *   GET    → the raid in progress, or the state of a chosen target
 *   POST   → start a raid on a target
 *   PATCH  → take one step
 *
 * The walk is persisted rather than held in memory: a raid is something an
 * attacker can be disconnected from mid-crossing, and losing a haul to a
 * dropped connection is the kind of thing players do not forgive.
 */
import { and, desc, eq, isNull, ne, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, raidRuns, raids, traps } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import {
  distanceToField, raiderView, settleRaid, trapClues,
} from '@/lib/game/raid';
import { burrowNeighbors, entranceTile, burrowCell } from '@/config/burrowConfig';
import { currentHp } from '@/lib/game/regen';
import { smokeActive } from '@/lib/game/inventory';
import { RAID, RAID_RUN, TRAPS } from '@config/tuning';

/** Everything the raid screen draws, for a raid in progress. */
async function raidView(runId: string) {
  const run = await db.query.raidRuns.findFirst({ where: eq(raidRuns.id, runId) });
  if (!run) return null;

  const defender = await db.query.players.findFirst({ where: eq(players.id, run.defenderId) });
  if (!defender) return null;

  const mined = await db.query.traps.findMany({ where: eq(traps.ownerId, run.defenderId) });
  const clues = trapClues(mined.map((t) => t.tile));
  const smoked = smokeActive(defender);

  return {
    raidId: run.id,
    defender: { id: defender.id, name: defender.name, avatar: defender.avatar },
    tile: run.tile,
    energy: run.energy,
    trapsSprung: run.trapsSprung,
    /** Tiles walked, plus their neighbours — nothing further. */
    view: raiderView(run.visited, clues, smoked),
    /**
     * Where they may step next.
     *
     * Sent rather than left to the client to work out, even though it is just
     * "the neighbours of where I stand". The server refuses an illegal step
     * anyway, so this is not a security boundary — it is a consistency one: two
     * implementations of the same rule drift, and the one that drifts is the
     * client's, which then offers a tile the server will reject.
     */
    steps: run.endedAt ? [] : burrowNeighbors(run.tile),
    /** The raider is told the numbers are hidden, and why. A blank board with
     *  no explanation reads as a bug rather than as a defence. */
    smoked,
    finished: run.endedAt !== null,
    succeeded: run.succeeded,
    carrotsLooted: run.carrotsLooted,
  };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // A raid already in progress wins over anything else: an attacker who
  // refreshes mid-crossing must land back where they were standing.
  const open = await db.query.raidRuns.findFirst({
    where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
    orderBy: desc(raidRuns.startedAt),
  });
  if (open) return Response.json({ raid: await raidView(open.id) });

  // Otherwise: who is worth attacking. Ordered by stock, because the reason to
  // raid somebody is what they are holding.
  const targets = await db
    .select({
      id: players.id,
      name: players.name,
      avatar: players.avatar,
      stock: players.stock,
      shieldedUntil: players.shieldedUntil,
    })
    .from(players)
    .where(ne(players.id, session.sub))
    .orderBy(desc(players.stock))
    .limit(20);

  const now = Date.now();
  return Response.json({
    raid: null,
    targets: targets.map((t) => ({
      id: t.id,
      name: t.name,
      avatar: t.avatar,
      stock: t.stock,
      /** Shielded targets are LISTED but not attackable — hiding them would
       *  make the board look empty for no visible reason. */
      shielded: !!t.shieldedUntil && t.shieldedUntil.getTime() > now,
    })),
  });
}

/** `{ defenderId }` — enter a burrow. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { defenderId?: unknown };
  if (typeof body.defenderId !== 'string') {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  if (body.defenderId === session.sub) {
    return Response.json({ error: 'cannot_raid_yourself' }, { status: 400 });
  }

  const defender = await db.query.players.findFirst({ where: eq(players.id, body.defenderId) });
  if (!defender) return Response.json({ error: 'unknown_player' }, { status: 404 });

  const now = Date.now();
  if (defender.shieldedUntil && defender.shieldedUntil.getTime() > now) {
    return Response.json({ error: 'target_shielded' }, { status: 400 });
  }

  // One raid at a time. Two crossings of two burrows at once is a UI nobody
  // asked for and a scoring problem nobody wants.
  const open = await db.query.raidRuns.findFirst({
    where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
  });
  if (open) return Response.json({ error: 'raid_in_progress', raid: await raidView(open.id) }, { status: 409 });

  // Nobody gets farmed: one attack per victim per window.
  const recent = await db.query.raidRuns.findFirst({
    where: and(eq(raidRuns.attackerId, session.sub), eq(raidRuns.defenderId, body.defenderId)),
    orderBy: desc(raidRuns.startedAt),
  });
  if (recent && now - recent.startedAt.getTime() < RAID_RUN.COOLDOWN_MS) {
    return Response.json({
      error: 'cooldown',
      retryInMs: RAID_RUN.COOLDOWN_MS - (now - recent.startedAt.getTime()),
    }, { status: 429 });
  }

  const start = entranceTile();
  const [run] = await db.insert(raidRuns).values({
    attackerId: session.sub,
    defenderId: body.defenderId,
    tile: start,
    energy: RAID_RUN.START_ENERGY,
    visited: [start],
  }).returning({ id: raidRuns.id });

  return Response.json({ raid: await raidView(run.id) });
}

/** `{ tile }` — one step. The server decides everything that follows. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tile?: unknown };
  const to = Number(body.tile);

  const run = await db.query.raidRuns.findFirst({
    where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
    orderBy: desc(raidRuns.startedAt),
  });
  if (!run) return Response.json({ error: 'no_raid' }, { status: 404 });

  // Adjacency is checked SERVER-SIDE. `burrowNeighbors` already excludes walls
  // and off-board indices, so a client naming a distant or blocked tile is
  // simply refused rather than teleported.
  if (!Number.isInteger(to) || !burrowNeighbors(run.tile).includes(to)) {
    return Response.json({ error: 'not_adjacent' }, { status: 400 });
  }

  const mined = await db.query.traps.findMany({ where: eq(traps.ownerId, run.defenderId) });
  const trap = mined.find((t) => t.tile === to);

  let energy = run.energy - RAID_RUN.STEP_COST;
  let sprung = run.trapsSprung;
  if (trap) {
    energy -= TRAPS.DRAIN;
    sprung += 1;
    // A sprung trap is SPENT. It is replaced, not repaired — otherwise a
    // defender's ground would be permanently mined at a one-off cost.
    await db.delete(traps).where(eq(traps.id, trap.id));
  }

  const visited = [...run.visited, to];
  const reachedField = burrowCell(to) === 'field';
  const outOfEnergy = energy <= 0;

  // Still walking.
  if (!reachedField && !outOfEnergy) {
    await db.update(raidRuns)
      .set({ tile: to, energy, visited, trapsSprung: sprung })
      .where(eq(raidRuns.id, run.id));
    return Response.json({ raid: await raidView(run.id), sprungTrap: !!trap });
  }

  // The raid is over, one way or the other. Settle it.
  const defender = await db.query.players.findFirst({ where: eq(players.id, run.defenderId) });
  if (!defender) return Response.json({ error: 'unknown_player' }, { status: 404 });

  const now = new Date();
  const hp = currentHp(defender, now.getTime());
  const outcome = settleRaid({
    endedAt: to,
    defenderStock: defender.stock,
    defenderHp: hp,
    defenderLevel: defender.burrowLevel,
    shielded: !!defender.shieldedUntil && defender.shieldedUntil.getTime() > now.getTime(),
  }, Math.random, distanceToField());

  // Everything moves in ONE transaction: the loot leaving the defender, the
  // loot arriving, the burrow's damage, the shield, the log. A crash halfway
  // would either duplicate carrots or destroy them.
  await db.transaction(async (tx) => {
    // The stolen carrots take the SEASON SCORE with them — a stolen carrot
    // changes sides entirely rather than merely leaving the victim's bank
    // (GDD). Guarded in SQL so a concurrent raid cannot overdraw the stock.
    const [robbed] = await tx.update(players).set({
      stock: raw`greatest(0, ${players.stock} - ${outcome.loot})`,
      seasonScore: raw`greatest(0, ${players.seasonScore} - ${outcome.loot})`,
      burrowHp: Math.max(0, hp - outcome.damage),
      hpUpdatedAt: now,
      // A broken burrow earns its owner a shield. THE anti-churn rule: without
      // it a player who logs off rich is farmed to zero by morning.
      shieldedUntil: outcome.damage >= hp
        ? new Date(now.getTime() + RAID.BROKEN_SHIELD_MS)
        : new Date(now.getTime() + RAID_RUN.SHIELD_AFTER_RAID_MS),
    }).where(eq(players.id, run.defenderId)).returning({ stock: players.stock });

    if (robbed && outcome.loot > 0) {
      await tx.update(players).set({
        stock: raw`${players.stock} + ${outcome.loot}`,
        seasonScore: raw`${players.seasonScore} + ${outcome.loot}`,
      }).where(eq(players.id, session.sub));
    }

    await tx.update(raidRuns).set({
      tile: to, energy: Math.max(0, energy), visited, trapsSprung: sprung,
      succeeded: reachedField,
      carrotsLooted: outcome.loot,
      endedAt: now,
    }).where(eq(raidRuns.id, run.id));

    // The log the victim reads on their next visit. This is the only way
    // somebody learns who emptied their burrow overnight.
    await tx.insert(raids).values({
      attackerId: session.sub,
      defenderId: run.defenderId,
      damage: outcome.damage,
      result: outcome.loot > 0 ? 'looted' : outcome.damage > 0 ? 'damaged' : 'blocked',
      carrotsLooted: outcome.loot,
      scoreTransferred: outcome.loot,
    });
  });

  return Response.json({
    raid: await raidView(run.id),
    sprungTrap: !!trap,
    outcome: {
      reachedField,
      loot: outcome.loot,
      damage: outcome.damage,
      progress: outcome.progress,
    },
  });
}

/**
 * Abandon the raid you are inside. Nothing is taken and nothing is damaged.
 *
 * This was missing, and its absence was a trap in the literal sense: `leave()`
 * on the client only cleared local state, so the row stayed open with a null
 * `endedAt` and every later raid came back `raid_in_progress`. A player who
 * walked into a burrow and thought better of it could not raid again until the
 * one they had abandoned somehow finished — which it never would, because they
 * had left.
 *
 * Retreating is a real decision rather than a courtesy: the energy already
 * spent crossing is energy not spent digging, so walking out early costs
 * something. It just must not cost the rest of the game.
 *
 * The run is CLOSED, not deleted: it still counts for the per-victim cooldown
 * (`RAID_RUN.COOLDOWN_MS`), or abandoning would be a free way to re-roll a
 * board until the traps fell somewhere convenient. No `raids` row is written —
 * that table is the victim's log of what was done to them, and nothing was.
 */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const run = await db.query.raidRuns.findFirst({
    where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
    orderBy: desc(raidRuns.startedAt),
  });
  // Already gone: report success rather than an error. A double-tap on Retreat
  // must not look like a failure.
  if (!run) return Response.json({ raid: null });

  await db.update(raidRuns)
    .set({ endedAt: new Date(), succeeded: false, carrotsLooted: 0 })
    .where(eq(raidRuns.id, run.id));

  return Response.json({ raid: null });
}
