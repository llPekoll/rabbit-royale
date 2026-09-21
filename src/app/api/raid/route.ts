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
import { db, sql } from '@/lib/db';
import { pushToPlayer } from '@/lib/game/raid-events';
import { defenderRaidView } from '@/lib/game/defence';
import { players, raidRuns, raids, traps, fences } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { connectedAmong, onlineAmong } from '@/lib/leaderboard';
import {
  distanceToField, raiderView, settleRaid, trapClues,
} from '@/lib/game/raid';
import { burrowNeighbors, entranceTile, burrowCell, walkableTiles } from '@/game/burrow/board';
import { raiderSteps } from '@/game/burrow/fence';
import { fencedSpans } from '@/lib/game/fences';
import { smokeActive } from '@/lib/game/inventory';
import { standingTraps } from '@/lib/game/traps';
import { ENERGY, RAID, RAID_RUN, TRAPS } from '@config/tuning';
import { currentEnergy, gardenAfterLoot, gardenYield } from '@/lib/game/regen';
import { msToHave } from '@/lib/game/burrow';
import { payEnergy, type EnergyCharge } from '@/lib/game/pay-crossing';

/**
 * THE TOLL, from the one tank (RAID_RUN.TOLL's note): paid on the first step,
 * behind a floor of the toll plus the longest crossing (RAID_RUN.WALK_FLOOR)
 * so a raid that is let in can at least reach an undefended field.
 */
const TOLL: EnergyCharge = { cost: RAID_RUN.TOLL, need: RAID_RUN.TOLL + RAID_RUN.WALK_FLOOR * RAID_RUN.STEP_COST };

/** Everything the raid screen draws, for a raid in progress. */
async function raidView(runId: string, revealAll = false) {
  const run = await db.query.raidRuns.findFirst({ where: eq(raidRuns.id, runId) });
  if (!run) return null;

  const defender = await db.query.players.findFirst({ where: eq(players.id, run.defenderId) });
  if (!defender) return null;

  const mined = await db.query.traps.findMany({ where: eq(traps.ownerId, run.defenderId) });
  // The walls, which are the one part of the defence the attacker is TOLD.
  const walled = fencedSpans(
    await db.query.fences.findMany({ where: eq(fences.ownerId, run.defenderId) }),
  );
  // The burrow's ground is grown from its OWNER's id — see game/burrow/board.
  // Nothing about the terrain crosses the wire: the raider's client rebuilds
  // the same homestead from the defender id it is sent below.
  const seed = run.defenderId;
  // ARMED traps only. A trap still rearming cannot drain anyone, so counting
  // it in the clues would hand the raider a number no step could ever justify
  // — and worse, it would let them read the position of a trap that is down.
  const clues = trapClues(seed, standingTraps(seed, mined).map((t) => t.tile));
  const smoked = smokeActive(defender);
  // THE TANK, for the one gauge: the raid spends the attacker's own energy,
  // and the medallion on the carrot pill reads it from here between steps.
  const attacker = await db.query.players.findFirst({
    where: eq(players.id, run.attackerId),
    columns: { energy: true, energyUpdatedAt: true },
  });
  const tank = attacker ? currentEnergy(attacker) : null;

  return {
    raidId: run.id,
    defender: {
      id: defender.id,
      name: defender.name,
      avatar: defender.avatar,
      /** Their burrow's level, so the raider's client draws the building they
       *  are walking up to. Not a secret — it is the most visible thing about
       *  a burrow, and seeing a castle before you commit is the point. */
      level: defender.burrowLevel,
    },
    tile: run.tile,
    energy: run.energy,
    tank,
    trapsSprung: run.trapsSprung,
    /**
     * Tiles walked, plus their neighbours — nothing further.
     *
     * TEMPORARY — `?reveal=1` hands back the WHOLE homestead.
     *
     * A debug switch for looking at a generated burrow as a burrow, rather
     * than through the four cells a raider has earned: the generator, the
     * cliffs and the field are impossible to judge one tile at a time. It is
     * cheating by construction — a real raider who could read the whole board
     * would simply read the trap positions off the clue numbers — so it must
     * come out before this is a game anyone else plays. Delete with TapProbe.
     */
    view: revealAll
      ? raiderView(seed, walkableTiles(seed), clues, smoked)
      : raiderView(seed, run.visited, clues, smoked),
    /**
     * The tiles actually STOOD on, as opposed to merely seen from.
     *
     * Leaks nothing the raider does not already know — it is their own path —
     * and the client needs it to tell crossed ground from the frontier of what
     * they can see. Without it the board draws every uncovered cell the same
     * and a crossing shows no progress.
     */
    walked: run.visited,
    /**
     * Where they may step next.
     *
     * Sent rather than left to the client to work out, even though it is just
     * "the neighbours of where I stand". The server refuses an illegal step
     * anyway, so this is not a security boundary — it is a consistency one: two
     * implementations of the same rule drift, and the one that drifts is the
     * client's, which then offers a tile the server will reject.
     */
    /*
     * Fences are folded in HERE rather than on the client, for the reason the
     * note above gives: a board that offers a step the server refuses is the
     * bug this key exists to prevent, and a wall is the most visible possible
     * version of it. The sides themselves ride in `fenced` below, so the
     * raider sees the wall as well as being stopped by it.
     */
    steps: run.endedAt ? [] : raiderSteps(seed, walled, run.tile),
    /**
     * Which edges of the potager carry a plank.
     *
     * SENT TO THE RAIDER, unlike everything about traps. The two defences are
     * opposites: a trap works by being unknown, a fence works by being seen —
     * a wall nobody can see is a raid that ends for no reason the player can
     * read. So the attacker's board draws them from the door.
     */
    fenced: walled,
    /** The raider is told the numbers are hidden, and why. A blank board with
     *  no explanation reads as a bug rather than as a defence. */
    smoked,
    finished: run.endedAt !== null,
    succeeded: run.succeeded,
    carrotsLooted: run.carrotsLooted,
    /**
     * The DEFENDER ended it, with lightning. A finished, failed raid either
     * way — but the raider's screen plays the shock rather than the collapse,
     * and says who did it.
     */
    struck: run.struckAt !== null,
  };
}

/**
 * Tell the DEFENDER, if they are online, what just happened on their ground.
 *
 * On every change: the raid starting, each step, and every ending. Sent after
 * the row is written, over the Postgres push bus (`raid-events`), so a burrow
 * whose owner is at home draws the intruder live — and one whose owner is not
 * hears nothing and loses nothing, the row being the truth either way.
 */
async function tellDefender(runId: string): Promise<void> {
  const run = await db.query.raidRuns.findFirst({ where: eq(raidRuns.id, runId) });
  if (!run) return;
  const attacker = await db.query.players.findFirst({ where: eq(players.id, run.attackerId) });
  if (!attacker) return;
  await pushToPlayer(sql, {
    to: run.defenderId,
    event: 'raid_incoming',
    payload: defenderRaidView(run, attacker),
  });
}

/**
 * The raider's latest run, if the defender ended it by lightning recently.
 *
 * A strike closes a run from the OTHER side of the wire, between two of the
 * raider's own requests — so with no open run to answer with, the next request
 * is answered with this one instead, for `RAID_RUN.STRUCK_SHOWN_MS`. Without
 * it a struck raider got a bare `no_raid` and never saw what hit them.
 */
async function recentlyStruck(attackerId: string) {
  const last = await db.query.raidRuns.findFirst({
    where: eq(raidRuns.attackerId, attackerId),
    orderBy: desc(raidRuns.startedAt),
  });
  if (!last?.struckAt || !last.endedAt) return null;
  if (Date.now() - last.struckAt.getTime() > RAID_RUN.STRUCK_SHOWN_MS) return null;
  return last;
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // A raid already in progress wins over anything else: an attacker who
  // refreshes mid-crossing must land back where they were standing.
  // TEMPORARY: `?reveal=1` draws the whole burrow. See `raidView`.
  const reveal = new URL(req.url).searchParams.get('reveal') !== null;

  const open = await db.query.raidRuns.findFirst({
    where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
    orderBy: desc(raidRuns.startedAt),
  });
  if (open) return Response.json({ raid: await raidView(open.id, reveal) });

  // No open raid, but one that was just ended BY LIGHTNING is still the
  // raider's news: answered as the finished raid it is, flagged `struck`, so
  // the client can play the shock. The client dismisses it by id on leaving.
  const struck = await recentlyStruck(session.sub);
  if (struck) return Response.json({ raid: await raidView(struck.id, reveal) });

  // Otherwise: who is worth attacking. Ordered by stock, because the reason to
  // raid somebody is what they are holding.
  const targets = await db
    .select({
      id: players.id,
      name: players.name,
      avatar: players.avatar,
      stock: players.stock,
      shieldedUntil: players.shieldedUntil,
      // What the garden holds is DERIVED from these — see `gardenYield`. A
      // raid is for the garden first (RAID.GARDEN_LOOT_SHARE), so the list
      // has to say what is standing outside, not only what is banked.
      gardenCollectedAt: players.gardenCollectedAt,
      burrowLevel: players.burrowLevel,
      wateredUntil: players.wateredUntil,
      fertilisedUntil: players.fertilisedUntil,
    })
    .from(players)
    .where(ne(players.id, session.sub))
    .orderBy(desc(players.stock))
    .limit(20);

  const now = Date.now();
  /**
   * WHERE EACH OWNER IS STANDING — the one thing this list never said.
   *
   * A raider's real question is not only "how much are they holding" but
   * "where is the owner while I take it". Three answers, three different
   * raids, so the row carries three states rather than a flag:
   *
   *   away    — no socket. A walk. Nobody is coming.
   *   home    — connected, not on an island. The worst door to pick: they see
   *             the intruder land (`tellDefender`) and can end the crossing
   *             with lightning.
   *   digging — connected AND out on an island. Their burrow is unattended,
   *             but they will be told, and they can break off their own run to
   *             come back. The hunt.
   *
   * A flag could not say this: with one boolean, "not digging" had to mean
   * both away and home-and-watching, which is opposite advice.
   *
   * Two round trips for all twenty rows, and EMPTY sets when Redis is down
   * (see `membersAmong`), in which case every target reads as `away` — the
   * silence the list had before any of this existed.
   */
  const ids = targets.map((t) => t.id);
  const [connected, digging] = await Promise.all([connectedAmong(ids), onlineAmong(ids)]);
  return Response.json({
    raid: null,
    targets: targets.map((t) => ({
      id: t.id,
      name: t.name,
      avatar: t.avatar,
      stock: t.stock,
      /** Carrots standing in their garden right now — the purse a raid is for. */
      garden: gardenYield(t, now),
      /** Shielded targets are LISTED but not attackable — hiding them would
       *  make the board look empty for no visible reason. */
      shielded: !!t.shieldedUntil && t.shieldedUntil.getTime() > now,
      /** How long that shield still has to run, in ms — 0 when there is none.
       *  A raider's question about a shielded burrow is never "is it shielded"
       *  (the row already says so) but "is it worth coming back tonight", and
       *  a shield here lasts anywhere from 6h to 48h. Sent as a DURATION and
       *  not as the timestamp, so a client whose clock is wrong still counts
       *  down correctly from the moment the list arrived. */
      shieldedFor: t.shieldedUntil ? Math.max(0, t.shieldedUntil.getTime() - now) : 0,
      /**
       * Where the owner is: `away`, `home`, or `digging`. See the block above
       * the sets for what each one costs a raider.
       *
       * `digging` is checked FIRST and stands on its own: the two sets are
       * written by different events (the handshake, and landing on an island),
       * so a player can briefly sit in one and not the other — and of the two
       * readings, "out on an island" is the one that changes the raid.
       */
      presence: digging.has(t.id) ? 'digging' : connected.has(t.id) ? 'home' : 'away',
      /** The old boolean, kept for one release: a client from before `presence`
       *  is still reading this field, and dropping it would blank the dot for
       *  anyone who has not reloaded. */
      digging: digging.has(t.id),
    })),
  });
}

/** `{ defenderId }` — enter a burrow. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const reveal = new URL(req.url).searchParams.get('reveal') !== null;
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
  if (open) return Response.json({ error: 'raid_in_progress', raid: await raidView(open.id, reveal) }, { status: 409 });

  /**
   * Nobody gets farmed: one attack per victim per window.
   *
   * A raid NEVER WALKED does not start that window. `visited` opens holding
   * the entrance tile alone (see the insert below) and grows by one per step,
   * so a length of 1 is a raid that was opened and abandoned without a single
   * move — the defender's ground was never touched and nothing about their
   * burrow was learned beyond what the target list already showed.
   *
   * Charging the hour for it made opening a target to LOOK at it cost the
   * same as raiding it: "je fais un raid, je bouge pas, et la cible est
   * grillée pendant une heure". The cooldown exists to stop a victim being
   * farmed, and a raid that took nothing farmed nobody.
   *
   * Deliberately not a refund but an exclusion: the abandoned row stays on
   * file (it is history, and `raidView` may still be answering for it), it
   * simply stops being the row the window is measured from.
   */
  const recent = await db.query.raidRuns.findFirst({
    where: and(
      eq(raidRuns.attackerId, session.sub),
      eq(raidRuns.defenderId, body.defenderId),
      raw`coalesce(array_length(${raidRuns.visited}, 1), 0) > 1`,
    ),
    orderBy: desc(raidRuns.startedAt),
  });
  if (recent && now - recent.startedAt.getTime() < RAID_RUN.COOLDOWN_MS) {
    return Response.json({
      error: 'cooldown',
      retryInMs: RAID_RUN.COOLDOWN_MS - (now - recent.startedAt.getTime()),
    }, { status: 429 });
  }

  /**
   * A RAID COSTS THE ONE TANK — RAID_RUN.TOLL on the first step, then a step and a trap
   * the same bar. Until 21 September 2026 it cost nothing there: the raid's
   * own 26-point budget paid for the walk, and the burrow's bar was never
   * asked. "Pareil pour les raids": a crossing is a crossing.
   *
   * Refused HERE, at the door, when the bar cannot afford one — as the island
   * refuses a join — so the player learns it on the burrow, beside the wait
   * and the refill, and not on a board they cannot step onto. The charge
   * itself lands on the FIRST STEP (see the PATCH), so that opening a target
   * to look at it stays free.
   */
  const attacker = await db.query.players.findFirst({
    where: eq(players.id, session.sub),
    columns: { energy: true, energyUpdatedAt: true },
  });
  if (!attacker) return Response.json({ error: 'unknown_player' }, { status: 404 });
  if (currentEnergy(attacker, now) < TOLL.need) {
    return Response.json({
      error: 'no_energy',
      energy: currentEnergy(attacker, now),
      need: TOLL.need,
      nextRunInMs: msToHave(attacker, TOLL.need, now),
    }, { status: 400 });
  }

  const start = entranceTile(body.defenderId);
  const [run] = await db.insert(raidRuns).values({
    attackerId: session.sub,
    defenderId: body.defenderId,
    tile: start,
    // WHAT THE RAID WALKS WITH: the stake less the toll (RAID_RUN.STAKE's
    // note), or the tank less the toll when the tank holds less. The raid
    // spends the player's own energy (`payEnergy` per step); this column is
    // the budget it spends it against, and zero here ends the raid.
    energy: Math.min(RAID_RUN.STAKE, currentEnergy(attacker, now)) - RAID_RUN.TOLL,
    visited: [start],
  }).returning({ id: raidRuns.id });

  /**
   * THE DEFENDER IS NOT TOLD YET — the first STEP announces the raid.
   *
   * Opening a target is how you look at one: the entrance and its neighbours
   * are drawn from `visited`, and until a step is taken nothing of the
   * defender's ground has been touched. Announcing here put an intruder on
   * their burrow — live, with the siren — for someone who then walked back
   * out without moving, and a raid that costs the attacker nothing must not
   * cost the defender a scare.
   *
   * Moved to the PATCH (see `tellDefender` there), which is also where the
   * per-victim cooldown now starts, so the two agree on what a raid is: a
   * crossing begins when someone takes a step onto your ground.
   */

  // TEMPORARY: the flag has to ride the POST as well. This is the response
  // that draws the board on ARRIVAL, so without it a revealed raid showed the
  // usual nine cells until the first step.
  return Response.json({ raid: await raidView(run.id, reveal) });
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
  if (!run) {
    // The step that lands after the defender's strike: the raid it was meant
    // for is gone, and the answer is the strike, not a refusal.
    const struck = await recentlyStruck(session.sub);
    if (struck) return Response.json({ raid: await raidView(struck.id), struck: true });
    return Response.json({ error: 'no_raid' }, { status: 404 });
  }

  // Adjacency is checked SERVER-SIDE. `burrowNeighbors` already excludes walls
  // and off-board indices, so a client naming a distant or blocked tile is
  // simply refused rather than teleported.
  //
  // The fences are read here, not in `raidView`, because THIS is the check
  // that binds — the view's `steps` is a convenience for drawing. A defender
  // who walls a side mid-raid stops the very next step, which is the right
  // answer: the wall is up when the foot lands, not when the screen loaded.
  const walled = fencedSpans(
    await db.query.fences.findMany({ where: eq(fences.ownerId, run.defenderId) }),
  );
  if (!Number.isInteger(to) || !burrowNeighbors(run.defenderId, run.tile).includes(to)) {
    return Response.json({ error: 'not_adjacent' }, { status: 400 });
  }
  // Refused by NAME rather than folded into `not_adjacent`: "there is a fence
  // there" is a fact about the defence the raider is meant to read and route
  // around, and calling it a bad step would read to them as a broken board.
  if (!raiderSteps(run.defenderId, walled, run.tile).includes(to)) {
    return Response.json({ error: 'fenced' }, { status: 400 });
  }

  /**
   * THE FIRST STEP PAYS THE CROSSING. `visited` opens holding the entrance
   * tile alone, so a length of 1 is a raid nobody has stepped into yet — the
   * same test the cooldown and the defender's alert use, so the three agree
   * on the instant a raid begins.
   *
   * Charged BEFORE the step is written: a bar that cannot pay refuses the
   * step and the raid stays where it stood, exactly as an unaffordable join
   * leaves the player on the burrow. The POST already refused a bar short of
   * this, so a refusal here is the rare race — a run joined from another tab
   * between opening the target and stepping in.
   */
  const firstStep = run.visited.length <= 1;
  if (firstStep) {
    const paid = await payEnergy(session.sub, TOLL);
    if (!paid.ok) {
      return Response.json({
        error: 'no_energy',
        energy: paid.energy,
        need: TOLL.need,
        nextRunInMs: paid.nextRunInMs,
      }, { status: 400 });
    }
  }

  const mined = await db.query.traps.findMany({ where: eq(traps.ownerId, run.defenderId) });
  // Only a STANDING trap can be stepped on, and it is found the same way the
  // clues above were built. Asking the same function twice is what keeps the
  // board the raider reads and the board the server settles against identical.
  const trap = standingTraps(run.defenderId, mined).find((t) => t.tile === to);

  let energy = run.energy - RAID_RUN.STEP_COST;
  let sprung = run.trapsSprung;
  if (trap) {
    energy -= TRAPS.DRAIN;
    sprung += 1;
    // A sprung trap is REPAIRED, not replaced: it keeps its tile and rearms on
    // TRAPS.REARM_MS. Deleting it was pay-to-repair — the defender bought the
    // ground back every morning at the daily allowance's pace, while losing it
    // at the attackers' pace. Stamping it also RESTARTS the clock on a trap
    // sprung twice, which is what makes camping a known tile cost the raider
    // the full rearm each time rather than only the first.
    await db.update(traps).set({ sprungAt: new Date() }).where(eq(traps.id, trap.id));
  }
  // THE STEP IS PAID FROM THE TANK, and the trap's drain with it — never
  // refused (`floor`): the budget above is what decides when the raid ends,
  // and it was cut to the tank at the door. The tank rides back on the view
  // (`tank`) for the medallion.
  await payEnergy(session.sub, {
    cost: RAID_RUN.STEP_COST + (trap ? TRAPS.DRAIN : 0),
    need: 0,
    floor: true,
  });

  const visited = [...run.visited, to];
  const reachedField = burrowCell(run.defenderId, to) === 'field';
  const outOfEnergy = energy <= 0;

  // Still walking.
  if (!reachedField && !outOfEnergy) {
    await db.update(raidRuns)
      .set({ tile: to, energy, visited, trapsSprung: sprung })
      .where(eq(raidRuns.id, run.id));
    await tellDefender(run.id);
    return Response.json({
      raid: await raidView(run.id, new URL(req.url).searchParams.get('reveal') !== null),
      sprungTrap: !!trap,
    });
  }

  // The raid is over, one way or the other. Settle it.
  const defender = await db.query.players.findFirst({ where: eq(players.id, run.defenderId) });
  if (!defender) return Response.json({ error: 'unknown_player' }, { status: 404 });

  const now = new Date();
  // What is standing in the defender's garden right now: the purse a raid is
  // for (RAID.GARDEN_LOOT_SHARE). Read once and settled against, so the clock
  // below is set back from the same figure the haul was computed on.
  const gardenPending = gardenYield(defender, now.getTime());
  const outcome = settleRaid({
    seed: run.defenderId,
    endedAt: to,
    defenderStock: defender.stock,
    defenderGarden: gardenPending,
    defenderLevel: defender.burrowLevel,
    shielded: !!defender.shieldedUntil && defender.shieldedUntil.getTime() > now.getTime(),
  }, Math.random, distanceToField(run.defenderId));

  // Everything moves in ONE transaction: the loot leaving the defender, the
  // loot arriving, the burrow's damage, the shield, the log. A crash halfway
  // would either duplicate carrots or destroy them.
  await db.transaction(async (tx) => {
    // The stolen carrots take the SEASON SCORE with them — a stolen carrot
    // changes sides entirely rather than merely leaving the victim's bank
    // (GDD). Guarded in SQL so a concurrent raid cannot overdraw the stock.
    const [robbed] = await tx.update(players).set({
      // Only the STOCK part leaves the stock and the score: garden carrots were
      // never in either yet (they land there at harvest), so the garden part
      // is taken by setting the garden's clock back instead — see
      // `gardenAfterLoot`. The attacker still receives the whole haul.
      stock: raw`greatest(0, ${players.stock} - ${outcome.lootFromStock})`,
      seasonScore: raw`greatest(0, ${players.seasonScore} - ${outcome.lootFromStock})`,
      gardenCollectedAt: gardenAfterLoot(defender, gardenPending, outcome.lootFromGarden, now.getTime()),
      // A SACKED burrow earns its owner the long shield. THE anti-churn rule:
      // without it a player who logs off rich is farmed to zero by morning.
      //
      // The test used to be `damage >= hp` — the raid that emptied a hit-point
      // bar. That bar is gone (it defended nothing: traps are what a raider
      // fights, and the damage roll moved neither his loot nor his progress),
      // so the long shield now keys on the thing that actually made the raid
      // grave: he walked all the way onto the carrot field.
      //
      // ONLY WHEN SOMETHING WAS TAKEN (21 September 2026). A raid that ended
      // with nothing in the sack — an empty burrow, a garden already brought
      // in — did the defender no harm, and a shield for it was a reward for
      // having nothing worth stealing. Until loot actually leaves, a burrow
      // stays open to be raided; the shield answers a loss, not a visit.
      ...(outcome.loot > 0 ? {
        shieldedUntil: reachedField
          ? new Date(now.getTime() + RAID.BROKEN_SHIELD_MS)
          : new Date(now.getTime() + RAID_RUN.SHIELD_AFTER_RAID_MS),
      } : {}),
    }).where(eq(players.id, run.defenderId)).returning({ stock: players.stock });

    // The attacker's side: the haul, if any, and the raid COUNTED either way.
    // "Knock on a door" (config/quests.ts) asks for a raid at any depth — dying
    // on the doorstep is still a raid, and the lesson it teaches is the point.
    await tx.update(players).set({
      ...(robbed && outcome.loot > 0
        ? {
          stock: raw`${players.stock} + ${outcome.loot}`,
          seasonScore: raw`${players.seasonScore} + ${outcome.loot}`,
        }
        : {}),
      raidsPlayed: raw`${players.raidsPlayed} + 1`,
    }).where(eq(players.id, session.sub));

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
      // Score follows the stock carrots only: the garden's were not yet scored.
      scoreTransferred: outcome.lootFromStock,
    });
  });

  // THE WALK COMES BACK AT THE FIELD (RAID_RUN.STEP_REFUND_AT_FIELD): the
  // steps' cost, never a trap's, and only for a raid that got there. Paid
  // into the tank with a negative charge, which `chargeEnergy` caps at the
  // ceiling; `raidView` below reads the tank after it, so the medallion
  // shows the refund on the same answer that shows the haul.
  const refunded = reachedField
    ? Math.round((visited.length - 1) * RAID_RUN.STEP_COST * RAID_RUN.STEP_REFUND_AT_FIELD)
    : 0;
  if (refunded > 0) await payEnergy(session.sub, { cost: -refunded, need: 0, floor: true });

  await tellDefender(run.id);

  return Response.json({
    raid: await raidView(run.id, new URL(req.url).searchParams.get('reveal') !== null),
    sprungTrap: !!trap,
    outcome: {
      reachedField,
      refunded,
      loot: outcome.loot,
      lootFromGarden: outcome.lootFromGarden,
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
  // The defender sees them turn back, rather than a rabbit that simply stops —
  // but only if they were ever told someone was coming. A raid abandoned
  // without a step was never announced (see the POST), so reporting the
  // retreat would be the first and only word the defender heard about it: a
  // rabbit appearing on their burrow purely in order to leave it.
  if (run.visited.length > 1) await tellDefender(run.id);

  return Response.json({ raid: null });
}
