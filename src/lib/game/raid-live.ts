/**
 * THE RAID IN PROGRESS, held by the region's game server (2026-10-23).
 *
 * The regions are moving to ONE database, possibly a continent away from the
 * server a player talks to. A raid is a walk of twenty steps, and every step
 * used to be a chain of reads and writes to that database: 7 s a step from
 * Singapore to Europe at first, 0.9 s once the queries were tightened, still
 * far too slow for a game. So a raid in progress lives here, like an island
 * does (`server/islands/store.ts`): a step is checked and decided in memory,
 * answered at once, and the database is written BEHIND it, in order.
 *
 * THE ROW STAYS THE RECORD. Nothing here is the only copy of anything: the
 * writes go out in the order the steps were taken (`writeBehind`), and a raid
 * this process does not hold — a restart, a deploy, a write that failed — is
 * rebuilt from its row on the next request (`loadOnce`). A crash between an
 * answer and its write costs that one step, which the raider takes again.
 *
 * Process memory and not Redis: there is one game server per region, and
 * that server already holds every island the same way. Memory answers in no
 * time at all; the day a region runs several processes, this is the one
 * module to back with Redis (the same move `IslandStore` documents).
 *
 * WHAT CAN CHANGE UNDER A HELD RAID, and how it reaches it:
 *  - the defender's ground (a plank, a bomb, a rearrangement, smoke): every
 *    write the defender makes through the API marks the ground stale
 *    (`groundChanged`, from api-router), and the next step reads it again —
 *    so the wall is up when the foot lands, as before;
 *  - the raid ending elsewhere (the defender's lightning, a run joined):
 *    those routes wait for the raider's pending writes, close the row, and
 *    drop the held raid (`dropRaid`).
 * Both are said to the OTHER game servers too, over the shared database's
 * NOTIFY bus (`listenForRaidNews`): the defender may be playing on another
 * continent's server than the raider (2026-10-23). What does not cross is
 * `raidWritten` — a server cannot wait on another's queue — so a defender's
 * lightning from another region reads the raider's row up to one step
 * behind; the raid still ends there, and the raider's next write, whose
 * claim is conditional, finds it closed.
 *
 * RELATIVE imports: the WS server imports this (see look.ts).
 */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../db';
import { fences, inventory, players, raidRuns, traps } from '../db/schema';
import { loadBurrowEdits } from './burrowEdits';
import { fencedSpans } from './fences';
import { traced } from '../db/trace';

export type RaidRun = typeof raidRuns.$inferSelect;

/**
 * Everything a raid reads about the DEFENDER'S ground, in one round trip:
 * the row (name, level, smoke), the layout, the traps and the fences.
 */
export async function groundOf(defenderId: string) {
  const [defender, edits, mined, fenceRows] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, defenderId) }),
    loadBurrowEdits(defenderId),
    db.query.traps.findMany({ where: eq(traps.ownerId, defenderId) }),
    db.query.fences.findMany({ where: eq(fences.ownerId, defenderId) }),
  ]);
  return { defender, edits, mined, walled: fencedSpans(fenceRows) };
}
export type Ground = Awaited<ReturnType<typeof groundOf>>;

/** The RAIDER'S side, read together: their row (the tank, and the name and
 *  look the defender's alert shows) and the axes in their bag. */
export async function raiderOf(attackerId: string) {
  const [attacker, axes] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, attackerId) }),
    db.query.inventory.findFirst({
      where: and(eq(inventory.playerId, attackerId), eq(inventory.kind, 'axe')),
      columns: { qty: true },
    }),
  ]);
  return { attacker, axes: axes?.qty ?? 0 };
}
export type Raider = Awaited<ReturnType<typeof raiderOf>>;

export interface LiveRaid {
  /** The run as the raider now stands in it — ahead of its row by whatever
   *  `writeBehind` has not written yet. */
  run: RaidRun;
  /** Null once the defender changed something: read again before a step. */
  ground: Ground | null;
  /** The tank as predicted after each step; set back to the row's figure
   *  whenever a write says otherwise. */
  raider: Raider;
  /** The last step is being settled against the database: nothing else may
   *  move the raid meanwhile. */
  settling?: boolean;
  /**
   * The tank as the ROW last stood, as far as this process knows: handed to
   * each write's charge (`payEnergy`'s `first`), so the charge is one trip
   * instead of a read and a write. A row changed elsewhere since (a refill)
   * fails the charge's check, and the charge reads it then.
   */
  tankRow?: { energy: number; energyUpdatedAt: Date; burrowLevel?: number };
  /** Last time a request touched it, for `sweep`. */
  touchedAt?: number;
}

/** Held raids, by RAIDER (one open raid each). */
const held = new Map<string, LiveRaid>();
/** Rebuilds in flight, so two requests on a cold raid build it once. */
const loading = new Map<string, Promise<LiveRaid | null>>();
/** Each raider's writes, chained in step order, and whose burrow they touch. */
const queues = new Map<string, { tail: Promise<void>; defenderId: string }>();

export function heldRaid(attackerId: string): LiveRaid | undefined {
  const raid = held.get(attackerId);
  if (raid) raid.touchedAt = Date.now();
  return raid;
}

export function holdRaid(raid: LiveRaid): void {
  raid.touchedAt = Date.now();
  held.set(raid.run.attackerId, raid);
}

/**
 * A raid walked away from (the app closed mid-crossing) is let go after
 * IDLE_MS untouched: its row is as open as ever, and the raider who comes
 * back has it rebuilt from there (`loadOnce`). Never one with writes still
 * queued — those land first.
 */
const IDLE_MS = 30 * 60_000;
function sweep(): void {
  const before = Date.now() - IDLE_MS;
  for (const [attackerId, raid] of held) {
    if ((raid.touchedAt ?? 0) < before && !queues.has(attackerId)) held.delete(attackerId);
  }
}
setInterval(sweep, 5 * 60_000).unref?.();

/** The raid is over or moved: let it go here, and on every other server. */
export function dropRaid(attackerId: string): void {
  held.delete(attackerId);
  tellOtherServers({ drop: attackerId });
}

/** The owner of this burrow changed something: raids on it, on any server,
 *  read it again. */
export function groundChanged(ownerId: string): void {
  groundStale(ownerId);
  tellOtherServers({ ground: ownerId });
}

function groundStale(ownerId: string): void {
  for (const raid of held.values()) {
    if (raid.run.defenderId === ownerId) raid.ground = null;
  }
}

// ── Between servers ─────────────────────────────────────────────────────────

const RAID_CHANNEL = 'rr_raid';
/** This process, so it does not act twice on its own word. */
const SELF = randomUUID();

interface RaidNews { s: string; drop?: string; ground?: string }

/** Not awaited, never thrown: the caller's answer is already decided, and a
 *  bus that is down costs a raid elsewhere one stale step. */
function tellOtherServers(news: Omit<RaidNews, 's'>): void {
  try {
    sql.notify(RAID_CHANNEL, JSON.stringify({ s: SELF, ...news })).catch((e: unknown) => {
      console.warn('[raid-live] notify failed', e);
    });
  } catch (e) {
    console.warn('[raid-live] notify failed', e);
  }
}

/** What the other servers say about raids THIS one may hold. The WS server
 *  calls it once at boot. */
export function listenForRaidNews(): Promise<unknown> {
  return sql.listen(RAID_CHANNEL, (wire) => {
    let news: RaidNews;
    try { news = JSON.parse(wire) as RaidNews; } catch { return; }
    if (news.s === SELF) return;
    if (typeof news.drop === 'string') held.delete(news.drop);
    if (typeof news.ground === 'string') groundStale(news.ground);
  });
}

/**
 * The raider's held raid, or the open one rebuilt from its row — after any
 * write still on its way, so the row read is the row as it stands. Null when
 * there is no open raid.
 */
export function loadOnce(attackerId: string, build: () => Promise<LiveRaid | null>): Promise<LiveRaid | null> {
  const hit = held.get(attackerId);
  if (hit) return Promise.resolve(hit);
  const inFlight = loading.get(attackerId);
  if (inFlight) return inFlight;
  const job = (async () => {
    await raidWritten(attackerId);
    const raid = await build();
    if (raid) holdRaid(raid);
    return raid;
  })().finally(() => loading.delete(attackerId));
  loading.set(attackerId, job);
  return job;
}

/**
 * Queue a raid's write behind the ones already queued for this raider. A
 * write that fails drops the held raid: the next request rebuilds it from
 * the row, which is what actually happened.
 */
export function writeBehind(attackerId: string, defenderId: string, work: () => Promise<unknown>): void {
  const before = queues.get(attackerId)?.tail ?? Promise.resolve();
  const tail = before.then(() => traced('raid write behind', work)).then(
    () => undefined,
    (e) => {
      console.error('[raid-live] write behind failed', attackerId, e);
      held.delete(attackerId);
    },
  );
  queues.set(attackerId, { tail, defenderId });
  void tail.then(() => {
    if (queues.get(attackerId)?.tail === tail) queues.delete(attackerId);
  });
}

/**
 * Wait until every write queued for raids BY or ON this player has landed —
 * for the routes that read raid rows from the database (the defender's
 * incoming view, the lightning, a run's door, the profile).
 */
export async function raidWritten(playerId: string): Promise<void> {
  const pending = [...queues].filter(([attacker, q]) => attacker === playerId || q.defenderId === playerId)
    .map(([, q]) => q.tail);
  if (pending.length) await Promise.all(pending);
}
