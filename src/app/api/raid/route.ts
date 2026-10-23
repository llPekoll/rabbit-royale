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
import { and, desc, eq, gt, gte, inArray, isNull, ne, or, sql as raw } from 'drizzle-orm';
import { db, sql } from '@/lib/db';
import { deliveredHere, pushToPlayer, type PlayerPush } from '@/lib/game/raid-events';
import { defenderRaidView } from '@/lib/game/defence';
import { lookOf } from '@/lib/game/look';
import { burrowCuts, inventory, players, raidRuns, raids, traps, fences } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { crownHolderId } from '@/lib/leaderboard';
import { connectedAmong, connectedIds, onlineAmong } from '@/lib/presence';
import {
  asleep, awakeSince, distanceToField, nothingToTake, raiderView, settleRaid, trapClues,
} from '@/lib/game/raid';
import { isOnIsland } from '@/lib/game/live-seats';
import { raidDoors } from '@/lib/game/raid-door';
import { burrowNeighbors, entranceTile, burrowCell, setBurrowEdits } from '@/game/burrow/board';
import { loadBurrowEdits } from '@/lib/game/burrowEdits';
import { raiderSteps } from '@/game/burrow/fence';
import { fencedSpans } from '@/lib/game/fences';
import { axeTargets, planksTouching } from '@/lib/game/axe';
import { smokeActive } from '@/lib/game/inventory';
import { standingTraps } from '@/lib/game/traps';
import { RABBIT_LEVELS } from '@config/tuning';
import { RAID, RAID_RUN, TRAPS, raidFloor } from '@/lib/tuning/tables';
import { currentEnergy, gardenAfterLoot, gardenYield } from '@/lib/game/regen';
import { chargeEnergy, msToHave } from '@/lib/game/burrow';
import { payEnergy, type EnergyCharge } from '@/lib/game/pay-crossing';
import {
  dropRaid, groundChanged, groundOf, heldRaid, holdRaid, loadOnce, raidWritten, raiderOf, writeBehind,
  type Ground, type LiveRaid, type RaidRun, type Raider,
} from '@/lib/game/raid-live';

/**
 * THE TOLL, from the one tank (RAID_RUN.TOLL's note): paid on the first step,
 * behind a floor of the toll plus the longest crossing (RAID_RUN.WALK_FLOOR)
 * so a raid that is let in can at least reach an undefended field.
 */
/** How long the raid list runs: everyone connected (up to LIVE), then the
 *  richest burrows (RICH), deduplicated. Was 20 by stock alone. */
const RAID_LIST = { LIVE: 50, RICH: 50, OWED: 20 } as const;

/** How far back a raid against me still owes a revenge on the list. */
const OWED_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** No raid has taken anything from this burrow since its owner was last seen. */
const notRaidedSinceSeen = raw`not exists (select 1 from raid_runs r where r.defender_id = ${players.id} and r.started_at > ${players.lastSeenAt} and r.carrots_looted > 0)`;

const TOLL: EnergyCharge = {
  // Getters: both are live (`tuning` table), read at each charge.
  get cost() { return RAID_RUN.TOLL; },
  get need() { return raidFloor(); },
};

/**
 * Everything the raid screen draws, for a raid in progress.
 *
 * Takes the run row when the caller has it (a step just wrote it), and the
 * ground and the raider when the caller has read them (`raid-live`'s
 * loaders) — whatever is missing is read here, in parallel.
 */
async function raidView(runOrId: RaidRun | string, known: { ground?: Ground; raider?: Raider } = {}) {
  const run = typeof runOrId === 'string'
    ? await db.query.raidRuns.findFirst({ where: eq(raidRuns.id, runOrId) })
    : runOrId;
  if (!run) return null;

  const [ground, raider] = await Promise.all([
    known.ground ?? groundOf(run.defenderId),
    known.raider ?? raiderOf(run.attackerId),
  ]);
  return viewOf(run, ground, raider);
}

/** The view itself, from rows in hand: no trip, for a raid held in memory. */
function viewOf(run: RaidRun, ground: Ground, raider: Raider) {
  const { defender, edits, mined, walled } = ground;
  if (!defender) return null;
  // The board functions below read the layout from the per-seed cache: lay
  // THIS ground's on it, whatever was loaded there since.
  setBurrowEdits(run.defenderId, edits);

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
  const tank = raider.attacker ? currentEnergy(raider.attacker) : null;
  const axeUsed = run.cutAt !== null;

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
      /** How its owner rearranged it (`BurrowEdits`): the raider's client
       *  grows the burrow from the id, then lays these on top — the one part
       *  of the ground that no longer follows from the seed alone. */
      edits: edits ?? {},
    },
    tile: run.tile,
    energy: run.energy,
    tank,
    trapsSprung: run.trapsSprung,
    /**
     * Tiles walked, plus their neighbours — nothing further.
     *
     * The debug `?reveal=1` that handed back the whole homestead is gone: a
     * raider who reads every clue number reads every trap, and the flag was
     * live on the game's own routes.
     */
    view: raiderView(seed, run.visited, clues, smoked, mined.map((t) => t.tile)),
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
    /**
     * THE AXE (2026-10-12): how many the raider carries, whether this raid's
     * one is spent, and what it can bring down from where they stand —
     * computed here like `steps`, so the board only lights what the server
     * accepts. No targets once it is used or the raid is over.
     */
    axe: {
      held: raider.axes,
      used: axeUsed,
      ...(axeUsed || run.endedAt ? { trees: [], planks: [] } : axeTargets(seed, walled, run.tile)),
    },
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
async function tellDefender(
  run: RaidRun,
  /** The raider's row, when the caller already holds it. */
  attacker?: Attacker | null,
): Promise<void> {
  const who = attacker ?? await db.query.players.findFirst({ where: eq(players.id, run.attackerId) });
  if (!who) return;
  await pushToPlayer(sql, incomingPush(run, who));
}

type Attacker = { id: string; name: string; avatar: string | null; equippedSkin: string | null };

/** The defender's push for this run, from the raider's row in hand. */
function incomingPush(run: RaidRun, attacker: Attacker): PlayerPush {
  return {
    to: run.defenderId,
    event: 'raid_incoming',
    payload: defenderRaidView(run, attacker, lookOf(attacker.avatar, attacker.equippedSkin)),
  };
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

/**
 * WHO OWES ME (2026-10-11): whoever took something from me this week and
 * has not been paid back since — the profile's REVENGE rows, same rule
 * (profile.gd `_avenged_at`: a debt is settled by taking their carrots or
 * their run). Offline and poor, they were on neither list below, and the
 * user looked for their raider here and did not find them. First on the
 * list: a feud beats a stranger's purse.
 */
function owedTo(viewerId: string) {
  return db.selectDistinctOn([raids.attackerId], { id: raids.attackerId, at: raids.createdAt })
    .from(raids)
    .where(and(
      eq(raids.defenderId, viewerId),
      ne(raids.attackerId, viewerId),
      gt(raids.createdAt, new Date(Date.now() - OWED_WINDOW_MS)),
      or(ne(raids.kind, 'burrow'), gt(raids.carrotsLooted, 0)),
      raw`not exists (select 1 from raids back where back.attacker_id = ${viewerId} and back.defender_id = ${raids.attackerId} and back.created_at > ${raids.createdAt} and (back.kind <> 'burrow' or back.carrots_looted > 0))`,
    ))
    .orderBy(raids.attackerId, desc(raids.createdAt));
}

/**
 * The raider's open raid, as this process holds it (`raid-live`) — rebuilt
 * from its row when it does not (a restart, a deploy): the run and the
 * raider together, then the ground the run names. Null when none is open.
 */
function openRaidOf(attackerId: string): Promise<LiveRaid | null> {
  return loadOnce(attackerId, async () => {
    const [run, raider] = await Promise.all([
      db.query.raidRuns.findFirst({
        where: and(eq(raidRuns.attackerId, attackerId), isNull(raidRuns.endedAt)),
        orderBy: desc(raidRuns.startedAt),
      }),
      raiderOf(attackerId),
    ]);
    if (!run) return null;
    return { run, ground: await groundOf(run.defenderId), raider, tankRow: raider.attacker };
  });
}

/** A held raid's ground, read again if the defender changed it since. */
async function freshGround(raid: LiveRaid): Promise<Ground> {
  if (!raid.ground) raid.ground = await groundOf(raid.run.defenderId);
  return raid.ground;
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // A raid already in progress wins over anything else: an attacker who
  // refreshes mid-crossing must land back where they were standing. Held
  // here, it is answered from memory.
  const held = heldRaid(session.sub);
  if (held) return Response.json({ raid: viewOf(held.run, await freshGround(held), held.raider) });
  await raidWritten(session.sub);

  // Everything this answer might need from the first trip, asked at once:
  // the open raid, the struck one, who I am, who owes me, who is online. Most
  // of it is wasted when a raid is open — a few small reads, against a round
  // trip each to a database that may be on another continent.
  const [open, struck, me, owedRows, online] = await Promise.all([
    db.query.raidRuns.findFirst({
      where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
      orderBy: desc(raidRuns.startedAt),
    }),
    recentlyStruck(session.sub),
    db.query.players.findFirst({ where: eq(players.id, session.sub), columns: { level: true, solo: true } }),
    owedTo(session.sub),
    connectedIds(),
  ]);
  if (open) {
    // Open in the row but not held here (a restart): hold it again.
    const raid = await openRaidOf(session.sub);
    if (raid) return Response.json({ raid: viewOf(raid.run, await freshGround(raid), raid.raider) });
  }

  // No open raid, but one that was just ended BY LIGHTNING is still the
  // raider's news: answered as the finished raid it is, flagged `struck`, so
  // the client can play the shock. The client dismisses it by id on leaving.
  if (struck) return Response.json({ raid: await raidView(struck) });

  // NO RAIDS BELOW RAID_MIN, either way (2026-09-23). A rabbit still climbing
  // the levels sees nobody to raid, and is on nobody's list.
  if ((me?.level ?? 1) < RABBIT_LEVELS.RAID_MIN) {
    return Response.json({ targets: [], locked: { level: me?.level ?? 1, need: RABBIT_LEVELS.RAID_MIN } });
  }
  // SOLO, either way (2026-10-02): out of PvP is out of the raid list too.
  if (me?.solo) return Response.json({ targets: [], solo: true });

  // Otherwise: who is worth attacking. Ordered by stock, because the reason to
  // raid somebody is what they are holding — but whoever is PLAYING right now
  // comes first, whatever they hold (2026-10-01). Ordered by stock alone, the
  // list was the same twenty rich accounts for everyone, and two players
  // online together never found each other on it.
  const columns = {
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
    lastSeenAt: players.lastSeenAt,
  };
  const raidable = and(
    ne(players.id, session.sub),
    gte(players.level, RABBIT_LEVELS.RAID_MIN),
    // A SOLO burrow is not on anyone's list — not even shown as shut.
    eq(players.solo, false),
  );
  const liveIds = online.filter((id) => id !== session.sub).slice(0, RAID_LIST.LIVE);
  const owedIds = owedRows
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, RAID_LIST.OWED)
    .map((r) => r.id);
  const [owed, live, rich] = await Promise.all([
    owedIds.length
      ? db.select(columns).from(players)
        // ALWAYS LISTED (2026-10-14) : asleep and already raided, or with
        // nothing left to take, they still owe me — the user looked for who
        // raided them and did not find them. Their row says why it is shut
        // (`door`), like the leaderboard does.
        .where(and(raidable, inArray(players.id, owedIds)))
      : Promise.resolve([]),
    liveIds.length
      ? db.select(columns).from(players)
        .where(and(raidable, inArray(players.id, liveIds)))
        .orderBy(desc(players.stock))
      : Promise.resolve([]),
    // ASLEEP, RAIDED ONCE, NOT LISTED (RAID.ASLEEP_AFTER_MS): an owner away
    // for days pays one small raid per absence, then drops off the list until
    // they come back. The live list above needs no such rule — a connected
    // player is awake by definition.
    db.select(columns).from(players)
      .where(and(raidable, or(gte(players.lastSeenAt, awakeSince()), notRaidedSinceSeen)))
      .orderBy(desc(players.stock))
      .limit(RAID_LIST.RICH),
  ]);
  owed.sort((a, b) => owedIds.indexOf(a.id) - owedIds.indexOf(b.id));
  const listed = new Set(live.map((t) => t.id));
  const now = Date.now();
  // NOTHING TO TAKE, NOT LISTED (2026-10-09, RAID.NOTHING_TO_TAKE_BELOW): a
  // burrow a raid could not bring back 20 carrots from is left off the list
  // altogether — not shown shut, just not there. The user: "ceux qui ont rien
  // à perdre, tu les mets pas dans la liste". The door refuses them too (POST).
  const sleeping = (t: { id: string; lastSeenAt: Date }) => !listed.has(t.id) && asleep(t.lastSeenAt, now);
  const owing = new Set(owed.map((t) => t.id));
  const targets = [...owed, ...live.filter((t) => !owing.has(t.id)), ...rich.filter((t) => !listed.has(t.id) && !owing.has(t.id))]
    .filter((t) => owing.has(t.id) || !nothingToTake(t.stock, gardenYield(t, now), sleeping(t)));

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
   * Two round trips for every row, and EMPTY sets when Redis is down
   * (see `membersAmong`), in which case every target reads as `away` — the
   * silence the list had before any of this existed.
   */
  const ids = targets.map((t) => t.id);
  const [connected, digging, doors] = await Promise.all([
    connectedAmong(ids), onlineAmong(ids), raidDoors(session.sub, ids),
  ]);
  return Response.json({
    raid: null,
    targets: targets.map((t) => ({
      id: t.id,
      name: t.name,
      avatar: t.avatar,
      stock: t.stock,
      /** Carrots standing in their garden right now — the purse a raid is for. */
      garden: gardenYield(t, now),
      /** The owner is away (RAID.ASLEEP_AFTER_MS): the haul is a tenth, and
       *  only one raid will take it before they come back. */
      asleep: sleeping(t),
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
      /** They took something from me this week and I have not paid them back
       *  (`owedIds` above): the list puts them first, and says why — the
       *  Godot list draws them as the REVENGE pick (2026-10-14). */
      owed: owing.has(t.id),
      /** The leaderboard's verdict on this door (`raidDoors`), so the list and
       *  every other place a name is shown say the same thing: `open`,
       *  `shield` (with `doorWaitMs`, the shield or my cooldown), `bare`,
       *  `asleep`. Absent when the viewer cannot raid at all. */
      door: doors?.get(t.id)?.state ?? null,
      doorWaitMs: doors?.get(t.id)?.waitMs ?? 0,
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

  const body = (await req.json().catch(() => ({}))) as { defenderId?: unknown };
  if (typeof body.defenderId !== 'string') {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  if (body.defenderId === session.sub) {
    return Response.json({ error: 'cannot_raid_yourself' }, { status: 400 });
  }

  // Every read the door makes, in one trip: the target's ground (row, layout,
  // traps, fences — the view below draws from it), the raider, an open raid,
  // the last walked one on this target, whether the target is online. The
  // refusals below then cost nothing more, and an accepted raid one insert.
  const defenderId = body.defenderId;
  await raidWritten(session.sub);
  const [ground, raiderSide, open, recent, connectedNow] = await Promise.all([
    groundOf(defenderId),
    raiderOf(session.sub),
    db.query.raidRuns.findFirst({
      where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
    }),
    db.query.raidRuns.findFirst({
      where: and(
        eq(raidRuns.attackerId, session.sub),
        eq(raidRuns.defenderId, defenderId),
        raw`coalesce(array_length(${raidRuns.visited}, 1), 0) > 1`,
      ),
      orderBy: desc(raidRuns.startedAt),
    }),
    connectedAmong([defenderId]),
  ]);
  const defender = ground.defender;
  if (!defender) return Response.json({ error: 'unknown_player' }, { status: 404 });

  // Both ways: the target must have reached RAID_MIN, and so must the raider.
  const raider = raiderSide.attacker;
  if (defender.level < RABBIT_LEVELS.RAID_MIN || (raider?.level ?? 1) < RABBIT_LEVELS.RAID_MIN) {
    return Response.json({ error: 'level_locked', need: RABBIT_LEVELS.RAID_MIN }, { status: 403 });
  }
  // SOLO, both ways: a solo player raids nobody, and nobody raids them —
  // whatever door led here (an old list, a revenge button, a crafted call).
  if (raider?.solo) return Response.json({ error: 'solo_mode' }, { status: 403 });
  if (defender.solo) return Response.json({ error: 'target_solo' }, { status: 403 });

  // ONE DOOR AT A TIME. A rabbit out on an island digs with the tank, and
  // banking writes what it has left back over the column — a raid paid for
  // meanwhile would be erased with it. See `live-seats`.
  if (isOnIsland(session.sub)) {
    return Response.json({ error: 'on_island' }, { status: 409 });
  }

  const now = Date.now();
  if (defender.shieldedUntil && defender.shieldedUntil.getTime() > now) {
    return Response.json({ error: 'target_shielded' }, { status: 400 });
  }
  // Nothing worth taking is a shield too (RAID.NOTHING_TO_TAKE_BELOW) — the
  // same refusal, so a client that knows one knows both.
  // ASLEEP (RAID.ASLEEP_AFTER_MS), unless connected this very moment: a tenth
  // of the haul, and once per absence — a raid that already took something
  // since they were last seen is a shield until they come back.
  const sleeping = asleep(defender.lastSeenAt, now) && !connectedNow.has(defender.id);
  if (nothingToTake(defender.stock, gardenYield(defender, now), sleeping)) {
    return Response.json({ error: 'target_shielded', bare: true }, { status: 400 });
  }
  if (sleeping) {
    const [taken] = await db.select({ id: raidRuns.id }).from(raidRuns).where(and(
      eq(raidRuns.defenderId, defender.id),
      gt(raidRuns.startedAt, defender.lastSeenAt),
      gt(raidRuns.carrotsLooted, 0),
    )).limit(1);
    if (taken) return Response.json({ error: 'target_shielded', asleep: true }, { status: 400 });
  }

  // One raid at a time. Two crossings of two burrows at once is a UI nobody
  // asked for and a scoring problem nobody wants.
  const already = heldRaid(session.sub) ?? (open ? await openRaidOf(session.sub) : null);
  if (already) {
    return Response.json({
      error: 'raid_in_progress',
      raid: viewOf(already.run, await freshGround(already), already.raider),
    }, { status: 409 });
  }

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
  const attacker = raider;
  if (!attacker) return Response.json({ error: 'unknown_player' }, { status: 404 });
  if (currentEnergy(attacker, now) < TOLL.need) {
    return Response.json({
      error: 'no_energy',
      energy: currentEnergy(attacker, now),
      need: TOLL.need,
      nextRunInMs: msToHave(attacker, TOLL.need, now),
    }, { status: 400 });
  }

  // The layout `groundOf` loaded above is what the entrance is read from.
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
  }).returning();

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

  // HELD FROM HERE ON (`raid-live`): the steps are answered from memory.
  holdRaid({ run, ground, raider: raiderSide, tankRow: raiderSide.attacker });
  return Response.json({ raid: viewOf(run, ground, raiderSide) });
}

/** `{ tile }` — one step. The server decides everything that follows. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tile?: unknown; cut?: unknown };
  const to = Number(body.tile);

  // THE RAID IN MEMORY (`raid-live`): held since the door, or rebuilt from
  // its row when this process does not hold it. A step costs the database
  // nothing while the raider waits.
  const live = await openRaidOf(session.sub);
  if (!live) {
    // The step that lands after the defender's strike: the raid it was meant
    // for is gone, and the answer is the strike, not a refusal.
    const struck = await recentlyStruck(session.sub);
    if (struck) return Response.json({ raid: await raidView(struck), struck: true });
    return Response.json({ error: 'no_raid' }, { status: 404 });
  }
  // A raid opened, then a run joined, then a step: the same hole from the
  // other side (see the POST).
  if (isOnIsland(session.sub)) {
    return Response.json({ error: 'on_island' }, { status: 409 });
  }

  if (body.cut !== undefined) {
    // THE AXE is settled against the rows: the steps still on their way are
    // written first, and the held raid is let go — the next step holds it
    // again, with the tree down and the planks gone.
    await raidWritten(session.sub);
    dropRaid(session.sub);
    const run = await db.query.raidRuns.findFirst({
      where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
      orderBy: desc(raidRuns.startedAt),
    });
    if (!run) return Response.json({ error: 'no_raid' }, { status: 404 });
    return cut(session.sub, run, body.cut);
  }

  return step(session.sub, live, to);
}

/**
 * One step of a held raid.
 *
 * NOTHING IS AWAITED between reading the held raid and moving it: the checks,
 * the step and what it changes happen in one go, so two taps cannot both
 * leave the same tile — the second finds the raid already moved. The only
 * waits are BEFORE that (the defender's ground, read again if they changed
 * it; the tank, read again before refusing a first step), and each one sends
 * the step back to the top.
 */
async function step(attackerId: string, live: LiveRaid, to: number, tankChecked = false): Promise<Response> {
  const ground = await freshGround(live);
  if (live.settling || heldRaid(attackerId) !== live) {
    return Response.json({ error: 'step_conflict' }, { status: 409 });
  }
  const run = live.run;
  const raider = live.raider;
  const { walled, mined } = ground;
  setBurrowEdits(run.defenderId, ground.edits);

  // Adjacency is checked SERVER-SIDE. `burrowNeighbors` already excludes walls
  // and off-board indices, so a client naming a distant or blocked tile is
  // simply refused rather than teleported.
  //
  // The fences are read here, not in `raidView`, because THIS is the check
  // that binds — the view's `steps` is a convenience for drawing. A defender
  // who walls a side mid-raid stops the very next step, which is the right
  // answer: the wall is up when the foot lands, not when the screen loaded.
  // Read with the rest of the ground (`groundOf`) and held with the raid;
  // a plank put up since the last step marked it stale (`freshGround`).
  if (!Number.isInteger(to) || !burrowNeighbors(run.defenderId, run.tile).includes(to)) {
    return Response.json({ error: 'not_adjacent' }, { status: 400 });
  }
  // Refused by NAME rather than folded into `not_adjacent`: "there is a fence
  // there" is a fact about the defence the raider is meant to read and route
  // around, and calling it a bad step would read to them as a broken board.
  if (!raiderSteps(run.defenderId, walled, run.tile).includes(to)) {
    return Response.json({ error: 'fenced' }, { status: 400 });
  }

  // Only a STANDING trap can be stepped on, and it is found the same way the
  // clues were built. Asking the same function twice is what keeps the board
  // the raider reads and the board the server settles against identical.
  const trap = standingTraps(run.defenderId, mined).find((t) => t.tile === to);
  let energy = run.energy - RAID_RUN.STEP_COST;
  let sprung = run.trapsSprung;
  if (trap) {
    energy -= TRAPS.DRAIN;
    sprung += 1;
  }

  /**
   * THE FIRST STEP PAYS THE CROSSING. `visited` opens holding the entrance
   * tile alone, so a length of 1 is a raid nobody has stepped into yet — the
   * same test the cooldown and the defender's alert use, so the three agree
   * on the instant a raid begins.
   *
   * Charged before anything else is written: a bar that cannot pay refuses
   * the step and the raid stays where it stood, exactly as an unaffordable
   * join leaves the player on the burrow. The POST already refused a bar
   * short of this, so a refusal here is the rare race — a run joined from
   * another tab between opening the target and stepping in.
   *
   * THE STEP IS PAID FROM THE TANK, and the trap's drain with it — never
   * refused (`floor`): the budget above is what decides when the raid ends,
   * and it was cut to the tank at the door. ONE charge on the first step,
   * toll and step together behind the toll's floor: the floor is the toll
   * plus the longest walk, so whatever passes it pays both, and the tank ends
   * where the two charges in a row left it.
   */
  const stepCost = RAID_RUN.STEP_COST + (trap ? TRAPS.DRAIN : 0);
  const firstStep = run.visited.length <= 1;
  const charge: EnergyCharge = firstStep
    ? { cost: TOLL.cost + stepCost, need: TOLL.need }
    : { cost: stepCost, need: 0, floor: true };
  const now = new Date();
  const tank = raider.attacker ? chargeEnergy(raider.attacker, charge, now.getTime()) : null;
  if (firstStep && !tank) {
    // The tank in memory says no. It may be behind the row — a refill used
    // since the door — so the row is asked once before refusing.
    if (!tankChecked) {
      live.raider = await raiderOf(attackerId);
      return step(attackerId, live, to, true);
    }
    const row = raider.attacker;
    return Response.json({
      error: 'no_energy',
      energy: row ? currentEnergy(row, now.getTime()) : 0,
      need: TOLL.need,
      nextRunInMs: row ? msToHave(row, TOLL.need, now.getTime()) : null,
    }, { status: 400 });
  }

  const visited = [...run.visited, to];
  const stepped: RaidRun = { ...run, tile: to, visited, energy: Math.max(0, energy), trapsSprung: sprung };
  live.run = stepped;
  if (tank && raider.attacker) live.raider = { ...raider, attacker: { ...raider.attacker, ...tank } };
  // A sprung trap is REPAIRED, not replaced: it keeps its tile and rearms on
  // TRAPS.REARM_MS. Deleting it was pay-to-repair — the defender bought the
  // ground back every morning at the daily allowance's pace, while losing it
  // at the attackers' pace. Stamping it also RESTARTS the clock on a trap
  // sprung twice, which is what makes camping a known tile cost the raider
  // the full rearm each time rather than only the first.
  if (trap) live.ground = { ...ground, mined: mined.map((t) => (t.id === trap.id ? { ...t, sprungAt: now } : t)) };

  const reachedField = burrowCell(run.defenderId, to) === 'field';
  if (reachedField || energy <= 0) {
    return settleLastStep(attackerId, live, { run, to, energy, sprung, trap, reachedField, now, charge });
  }

  // THE DEFENDER SEES IT NOW when they are connected to this server
  // (`deliveredHere`); otherwise the push goes out with the row.
  const push = raider.attacker ? incomingPush(stepped, raider.attacker) : null;
  const toldHere = push ? deliveredHere(push) : false;

  /**
   * THE ROW FOLLOWS, behind the answer and in step order (`writeBehind`).
   *
   * Two PATCHes for the same raid (a double tap, a retried request) used to
   * both read the same row: both saw a first step and paid the toll twice,
   * and two final steps both settled the raid — loot moved twice, two log
   * rows, the walk refunded twice. The claim is a conditional write on the
   * position the step was read from: exactly one request moves the rabbit
   * off `run.tile`, the other finds the row changed and is told so.
   *
   * The held raid decides first now — in memory, one step at a time — and
   * the claim stays as the row's own guard: a raid the row says has ended
   * meanwhile (the defender's lightning) is not walked on, and is let go.
   *
   * The charge is written as a FLOOR charge whatever it was at the door: the
   * step was taken, and a tank the row finds short by then (a race the held
   * tank could not see) pays what it has rather than walking for free.
   */
  writeBehind(attackerId, run.defenderId, async () => {
    const [claimed] = await db.update(raidRuns)
      .set({ tile: to, visited, energy: Math.max(0, energy), trapsSprung: sprung })
      .where(and(
        eq(raidRuns.id, run.id),
        isNull(raidRuns.endedAt),
        eq(raidRuns.tile, run.tile),
        raw`cardinality(${raidRuns.visited}) = ${run.visited.length}`,
      ))
      .returning({ id: raidRuns.id });
    if (!claimed) {
      dropRaid(attackerId);
      return;
    }
    const [paid] = await Promise.all([
      payEnergy(attackerId, { cost: charge.cost, need: 0, floor: true }, heldRaid(attackerId)?.tankRow),
      trap ? db.update(traps).set({ sprungAt: now }).where(eq(traps.id, trap.id)) : null,
      push && !toldHere ? pushToPlayer(sql, push) : null,
    ]);
    const still = heldRaid(attackerId);
    if (paid.ok && still) {
      // Kept only over a row read whole: the regen rate rides on its level.
      if (still.tankRow) still.tankRow = { ...still.tankRow, energy: paid.energy, energyUpdatedAt: paid.at };
      // The row's tank wins over the prediction — unless a later step already
      // predicted on top of it, whose own write will set it right in turn.
      if (still.run === stepped && still.raider.attacker) {
        still.raider = { ...still.raider, attacker: { ...still.raider.attacker, energy: paid.energy, energyUpdatedAt: paid.at } };
      }
    }
  });

  return Response.json({
    raid: viewOf(stepped, live.ground ?? ground, live.raider),
    sprungTrap: !!trap,
  });
}

/**
 * The step that ENDS the raid — the field reached, or the budget spent —
 * settled against the database while the raider waits: the loot moves
 * between two players, and that is decided by the rows, locked. The held
 * raid is let go afterwards, whatever happens.
 */
async function settleLastStep(
  attackerId: string,
  live: LiveRaid,
  last: {
    run: RaidRun; to: number; energy: number; sprung: number;
    trap: (typeof traps.$inferSelect) | undefined;
    reachedField: boolean; now: Date; charge: EnergyCharge;
  },
): Promise<Response> {
  const { run, to, energy, sprung, trap, reachedField, now, charge } = last;
  const visited = [...run.visited, to];
  live.settling = true;
  try {
    // The crown's purse is bigger (CROWN.LOOT_MULT). Read before the lock: it
    // names a player, and holding a row lock across a scan of the table is how
    // two raids deadlock. Sent now, so it is in by the time the lock is asked.
    const crownedRead = crownHolderId().catch(() => null);
    // The steps before this one land in the row first (THE ROW FOLLOWS above):
    // at a player's pace they are in already.
    await raidWritten(attackerId);
    const raider = live.raider;
    const groundNow = live.ground ?? undefined;

    // THE WALK COMES BACK AT THE FIELD (RAID_RUN.STEP_REFUND_AT_FIELD): the
    // steps' cost, never a trap's, and only for a raid that got there. Paid
    // into the tank with a negative charge, which `chargeEnergy` caps at the
    // ceiling — in the transaction below, after this step's own charge, so the
    // medallion shows the refund on the same answer that shows the haul.
    const refunded = reachedField
      ? Math.round((visited.length - 1) * RAID_RUN.STEP_COST * RAID_RUN.STEP_REFUND_AT_FIELD)
      : 0;

    /**
     * ONE TRANSACTION, THE DEFENDER'S ROW LOCKED, THE RAID CLOSED EXACTLY ONCE.
     *
     * The haul used to be computed from a defender row read outside the
     * transaction, then debited with `greatest(0, …)` while the attacker was
     * credited the full figure: two raids settling on the same burrow both
     * computed from the same stock, the second pushed it under SAFE_FLOOR, and
     * the attacker was paid carrots the defender no longer had. Now the row is
     * read FOR UPDATE, the haul is computed from what it holds at that instant
     * (a shield raised by the raid that settled first counts), and the raid row
     * is closed with a guard on `endedAt` — a second settlement finds nothing
     * to close and moves nothing.
     *
     * THE RAIDER'S ROW IS LOCKED WITH IT (2026-10-23), and this step's charge
     * and the walk's refund are written in the transaction, from the row as it
     * stands: two trips less than paying before and refunding after, on the
     * one step a raider waits for. Both rows in ONE statement, ordered by id:
     * two raiders settling on each other's burrows at the same instant lock in
     * the same order, and neither waits on the other forever.
     */
    const settled = await db.transaction(async (tx) => {
      const crowned = (await crownedRead) === run.defenderId;
      // Close and lock in one trip: the statements of a transaction share one
      // connection, so sent together they go out back to back (pipelined) and
      // still run in this order. A close that finds the raid already ended
      // returns nothing, and the lock it took dies with the transaction.
      const [[closed], locked] = await Promise.all([
        tx.update(raidRuns).set({
          tile: to, energy: Math.max(0, energy), visited, trapsSprung: sprung,
          succeeded: reachedField,
          endedAt: now,
        }).where(and(eq(raidRuns.id, run.id), isNull(raidRuns.endedAt))).returning({ id: raidRuns.id }),
        tx.select().from(players)
          .where(inArray(players.id, [run.defenderId, attackerId]))
          .orderBy(players.id)
          .for('update'),
      ]);
      if (!closed) return null;
      const defender = locked.find((p) => p.id === run.defenderId);
      const attacker = locked.find((p) => p.id === attackerId);
      if (!defender || !attacker) return null;
      // This step paid, as every step is (a floor charge, THE ROW FOLLOWS),
      // then the walk handed back.
      const stepped = chargeEnergy(attacker, { cost: charge.cost, need: 0, floor: true }, now.getTime())!;
      const tank = refunded > 0
        ? chargeEnergy({ ...attacker, ...stepped }, { cost: -refunded, need: 0, floor: true }, now.getTime())!
        : stepped;

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
        crowned,
        // Asleep when the raid STARTED: an owner who comes back mid-crossing
        // does not turn a tenth into a full haul under the raider's feet.
        asleep: asleep(defender.lastSeenAt, run.startedAt.getTime()),
      }, Math.random, distanceToField(run.defenderId));

      // The writes below touch nothing the others read: pipelined, one trip.
      await Promise.all([
        tx.update(players).set({
          // Only the STOCK part leaves the stock and the score: garden carrots were
          // never in either yet (they land there at harvest), so the garden part
          // is taken by setting the garden's clock back instead — see
          // `gardenAfterLoot`. The row is locked and the haul computed from it, so
          // this can no longer overdraw; `greatest` stays as a belt.
          stock: raw`greatest(0, ${players.stock} - ${outcome.lootFromStock})`,
          seasonScore: raw`greatest(0, ${players.seasonScore} - ${outcome.lootFromStock})`,
          gardenCollectedAt: gardenAfterLoot(defender, gardenPending, outcome.lootFromGarden, now.getTime()),
          // A SACKED burrow earns its owner the long shield. THE anti-churn rule:
          // without it a player who logs off rich is farmed to zero by morning.
          // Keyed on the raider reaching the carrot field, and ONLY WHEN SOMETHING
          // WAS TAKEN (21 September 2026): a shield for a raid that took nothing is
          // a reward for having nothing worth stealing.
          ...(outcome.loot > 0 ? {
            shieldedUntil: reachedField
              ? new Date(now.getTime() + RAID.BROKEN_SHIELD_MS)
              : new Date(now.getTime() + RAID_RUN.SHIELD_AFTER_RAID_MS),
          } : {}),
        }).where(eq(players.id, run.defenderId)),

        // The attacker's side: the whole haul into the stock, and the raid COUNTED
        // either way ("Knock on a door" asks for a raid at any depth).
        //
        // THE SCORE IS TRANSFERRED, NOT MINTED: it moves by what left the
        // defender's score — the stock part. The garden part was never scored on
        // either side, so crediting it to the thief's score created season points
        // out of nothing (GDD: "only theft moves it: stolen carrots leave your
        // score and join the thief's").
        tx.update(players).set({
          ...(outcome.loot > 0
            ? {
              stock: raw`${players.stock} + ${outcome.loot}`,
              seasonScore: raw`${players.seasonScore} + ${outcome.lootFromStock}`,
            }
            : {}),
          raidsPlayed: raw`${players.raidsPlayed} + 1`,
          ...tank,
        }).where(eq(players.id, attackerId)),

        // A sprung trap is REPAIRED, not replaced (see the step above).
        trap ? tx.update(traps).set({ sprungAt: now }).where(eq(traps.id, trap.id)) : null,

        tx.update(raidRuns).set({ carrotsLooted: outcome.loot }).where(eq(raidRuns.id, run.id)),

        // The log the victim reads on their next visit. This is the only way
        // somebody learns who emptied their burrow overnight.
        tx.insert(raids).values({
          attackerId: attackerId,
          defenderId: run.defenderId,
          damage: outcome.damage,
          result: outcome.loot > 0 ? 'looted' : outcome.damage > 0 ? 'damaged' : 'blocked',
          carrotsLooted: outcome.loot,
          scoreTransferred: outcome.lootFromStock,
        }),
      ]);
      return { outcome, tank };
    });
    if (!settled) return Response.json({ error: 'step_conflict' }, { status: 409 });
    const { outcome, tank } = settled;
    const raiderEnd: Raider | undefined = raider.attacker
      ? { ...raider, attacker: { ...raider.attacker, ...tank } }
      : undefined;

    const ended: RaidRun = {
      ...run, tile: to, visited, energy: Math.max(0, energy), trapsSprung: sprung,
      succeeded: reachedField, endedAt: now, carrotsLooted: outcome.loot,
    };
    // The defender hears it once the row is in, without the raider waiting
    // on the telling (it never throws: see `pushToPlayer`).
    void tellDefender(ended, raider.attacker);
    const view = await raidView(ended, { ground: groundNow, raider: raiderEnd });

    return Response.json({
      raid: view,
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

  } finally {
    dropRaid(attackerId);
  }
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

  // No step lands after the retreat (`settling` refuses them), the steps
  // already taken reach the row before it is closed, and then the held raid
  // is let go.
  const held = heldRaid(session.sub);
  const wasSettling = held?.settling;
  if (held) held.settling = true;
  await raidWritten(session.sub);
  dropRaid(session.sub);
  // The raider's row comes with the run: the defender's alert below names
  // them, and read after it, it was one more trip. Held, both are in hand.
  const [run, attacker] = held && !wasSettling
    ? [held.run, held.raider.attacker]
    : await Promise.all([
      db.query.raidRuns.findFirst({
        where: and(eq(raidRuns.attackerId, session.sub), isNull(raidRuns.endedAt)),
        orderBy: desc(raidRuns.startedAt),
      }),
      db.query.players.findFirst({ where: eq(players.id, session.sub) }),
    ]);
  // Already gone: report success rather than an error. A double-tap on Retreat
  // must not look like a failure.
  if (!run) return Response.json({ raid: null });

  // Closed only if still open: a last step settling at this very moment, or
  // the defender's lightning, ended it already — and their ending stands.
  const retreated: RaidRun = { ...run, endedAt: new Date(), succeeded: false, carrotsLooted: 0 };
  const [closed] = await db.update(raidRuns)
    .set({ endedAt: retreated.endedAt, succeeded: false, carrotsLooted: 0 })
    .where(and(eq(raidRuns.id, run.id), isNull(raidRuns.endedAt)))
    .returning({ id: raidRuns.id });
  if (!closed) return Response.json({ raid: null });
  // The defender sees them turn back, rather than a rabbit that simply stops —
  // but only if they were ever told someone was coming. A raid abandoned
  // without a step was never announced (see the POST), so reporting the
  // retreat would be the first and only word the defender heard about it: a
  // rabbit appearing on their burrow purely in order to leave it.
  if (run.visited.length > 1) await tellDefender(retreated, attacker);

  return Response.json({ raid: null });
}

/**
 * `{ cut: { tile, side? } }` — THE AXE: a tree (`tile`) or a plank (`tile` +
 * `side`) next to the raider comes down.
 *
 * Takes no step and costs no energy: the axe is the price. Claimed ONCE per
 * raid with a conditional write on `cutAt` (a double tap spends one axe), the
 * axe taken from the bag under a `qty >= 1` guard, in one transaction — a
 * raider with none, or a target that is not one, changes nothing.
 */
async function cut(
  attackerId: string,
  run: { id: string; defenderId: string; tile: number; cutAt: Date | null },
  raw_: unknown,
): Promise<Response> {
  const target = (raw_ && typeof raw_ === 'object' ? raw_ : {}) as { tile?: unknown; side?: unknown };
  const tile = Number(target.tile);
  const side = typeof target.side === 'string' ? target.side : null;
  if (run.cutAt) return Response.json({ error: 'axe_used' }, { status: 409 });

  const [fenceRows] = await Promise.all([
    db.query.fences.findMany({ where: eq(fences.ownerId, run.defenderId) }),
    loadBurrowEdits(run.defenderId),
  ]);
  const walled = fencedSpans(fenceRows);
  const reach = axeTargets(run.defenderId, walled, run.tile);
  const isPlank = side !== null;
  const ok = Number.isInteger(tile) && (isPlank
    ? reach.planks.some((s) => s.tile === tile && s.side === side)
    : reach.trees.includes(tile));
  if (!ok) return Response.json({ error: 'not_cuttable' }, { status: 400 });

  const now = new Date();
  const outcome = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(raidRuns)
      .set({ cutAt: now, cutTile: tile, cutSide: side })
      .where(and(eq(raidRuns.id, run.id), isNull(raidRuns.endedAt), isNull(raidRuns.cutAt)))
      .returning({ id: raidRuns.id });
    if (!claimed) return 'axe_used' as const;
    const [spent] = await tx.update(inventory)
      .set({ qty: raw`${inventory.qty} - 1` })
      .where(and(eq(inventory.playerId, attackerId), eq(inventory.kind, 'axe'), raw`${inventory.qty} >= 1`))
      .returning({ qty: inventory.qty });
    if (!spent) {
      tx.rollback();
      return 'no_axe' as const;
    }
    // The planks fall and go home: back in their owner's bag, past the
    // ceiling if need be, like planks a rearrangement pushed off. A plank cut
    // on its own, or every plank touching a felled tree (`planksTouching`).
    const falling = isPlank ? [{ tile, side: side! }] : planksTouching(walled, tile);
    let back = 0;
    for (const s of falling) {
      const gone = await tx.delete(fences)
        .where(and(eq(fences.ownerId, run.defenderId), eq(fences.tile, s.tile), eq(fences.side, s.side)))
        .returning({ id: fences.id });
      back += gone.length;
    }
    if (back) {
      await tx.insert(inventory)
        .values({ playerId: run.defenderId, kind: 'fence', qty: back })
        .onConflictDoUpdate({
          target: [inventory.playerId, inventory.kind],
          set: { qty: raw`${inventory.qty} + ${back}` },
        });
    }
    if (!isPlank) {
      await tx.insert(burrowCuts).values({ ownerId: run.defenderId, tile, cutBy: attackerId, cutAt: now });
    }
    return 'cut' as const;
  }).catch((err: unknown) => {
    // drizzle's rollback throws; the 'no_axe' it carried is the answer.
    if (err instanceof Error && /rollback/i.test(err.message)) return 'no_axe' as const;
    throw err;
  });
  if (outcome !== 'cut') {
    return Response.json({ error: outcome }, { status: outcome === 'axe_used' ? 409 : 400 });
  }
  // The axe changed the row (`cutAt`) and the ground (a tree, planks): both
  // read again, once, for the defender's alert and the view alike — and by
  // any other raid on this burrow, at its next step.
  groundChanged(run.defenderId);
  const after = await db.query.raidRuns.findFirst({ where: eq(raidRuns.id, run.id) });
  if (!after) return Response.json({ error: 'no_raid' }, { status: 404 });
  const [, view] = await Promise.all([tellDefender(after), raidView(after)]);
  return Response.json({ raid: view, cut: { tile, side } });
}
