/**
 * Rabbit Royale WS server — AUTHORITATIVE.
 *
 * The client sends intentions ("I want to move left") and receives state. It
 * never asserts a position, an energy value, a carrot count or where a bomb is:
 * this is a competitive game whose leaderboard will eventually be worth
 * something, so a cheating client must be able to lie to itself and nothing
 * else (BUILD-PLAN rule #4).
 *
 * Identity comes from the handshake JWT, verified here, and is stored on the
 * socket. A move payload naming a player id is ignored — there is no field for
 * one.
 *
 * Scale: islands live in an `IslandStore` and every broadcast is scoped to an
 * island room. One process today; see server/islands/router.ts for how this
 * becomes N.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { and, eq, isNull, sql as raw } from 'drizzle-orm';

import { ENERGY, ERUPTION, LIGHTNING, MIRAGE, MULTIPLAYER, OUT_OF_RUN_ENERGY } from '../config/tuning';
import { servirApi } from './api-router';
import { mulberry32, seedFrom } from '../src/lib/game/rng';
import { cascadeAround, chestProgress, publicView } from '../src/lib/game/island';
import { firstIslandSeed, isFirstIsland } from '../src/lib/game/first-island';
import { flagTile, resolveMove, spawnRabbit, teachingHold } from '../src/lib/game/run';
import { mirageActive, planMirage, shownAdjacent } from '../src/lib/game/mirage';
import { strike, struckRabbits } from '../src/lib/game/lightning';
import { plantBlocker, plantBomb } from '../src/lib/game/sabotage';
import { makeShape, toColRow, toIndex } from '../src/config/gridConfig';
import { GRAZE_CHANCE, isSpooked, planFlock, type Ground } from '../src/lib/game/flee';
import { boardFor, terrainFor } from '../src/lib/game/terrainBoard';
import type { Rabbit } from '../src/lib/game/types';
import { payCrossing } from '../src/lib/game/pay-crossing';
import { currentEnergy } from '../src/lib/game/regen';
import { grantItem } from '../src/lib/game/grant';
import { refreshTuning } from '../src/lib/tuning/live';
import type { ItemKind } from '../src/lib/game/inventory';
import { verifySession } from '../src/lib/auth/jwt';
import { db, sql } from '../src/lib/db';
import { decodePush, PLAYER_PUSH_CHANNEL } from '../src/lib/game/raid-events';
import { inventory, players, runs, seasons } from '../src/lib/db/schema';
import { MemoryIslandStore, type LiveIsland } from './islands/store';
import { roomFor } from './islands/router';
import {
  markConnected, markDisconnected, markOffline, markOnline, setScore,
} from '../src/lib/leaderboard';
import { purgeOrphanGuests } from '../src/lib/auth/abandon';
import { guard, installProcessGuards, optional } from './resilience';

const PORT = Number(process.env.WS_PORT ?? 3010);
const store = new MemoryIslandStore();

/** Per-socket bookkeeping that is NOT game state (game state lives on the island). */
interface SocketData {
  playerId?: string;
  name?: string;
  islandId?: string;
  /** Run row id, so the recap can be written when the run ends. */
  runId?: string;
  runStartedAt?: number;
  bombsHit?: number;
  tilesDug?: number;
  lifetimeCarrots?: number;
  /** Set when this socket is WATCHING someone: it receives the island's events
   *  but owns no rabbit, so every gameplay handler falls through. */
  spectating?: string;
  /**
   * A `join` is being answered on this socket right now.
   *
   * One ask has to buy one seat. The client sends `join` once, but socket.io
   * BUFFERS an emit made before the socket is connected and flushes it on
   * `connect` — the very moment the client's own `connect` handler asks
   * again. Two joins then ran side by side: neither found the other's seat,
   * a first-timer was dealt two tutorial islands and shown both at once, and
   * anyone else paid for two runs. The second ask is dropped while the first
   * is still seating — see `oneAtATime`.
   */
  joining?: boolean;
}

/**
 * Health, and what the box is actually doing.
 *
 * Deliberately does NOT check Postgres or Redis. A health endpoint decides
 * whether to RESTART this process, and restarting it cannot fix a database that
 * is down — it would only destroy every live run in memory and then fail again,
 * which is precisely the restart loop this file now exists to avoid.
 *
 * So the question this answers is narrow and honest: is the event loop running
 * and is the socket server up? Dependency failures are visible in the counters
 * below and in the logs, where a human can act on them.
 */
const httpServer = http.createServer((req, res) => {
  /**
   * Les routes /api/* du jeu, servies ici a cote du WebSocket : une seule
   * origine pour l'app native. Asynchrone, donc on rend la main tout de
   * suite — `servirApi` repond lui-meme quand il prend la requete.
   * Voir server/api-router.ts.
   */
  if ((req.url ?? '').startsWith('/api/')) {
    void servirApi(req, res).then((pris) => {
      if (!pris) res.writeHead(404).end();
    });
    return;
  }

  if (req.url === '/health') {
    const islands = [...store.all()];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      islands: islands.length,
      rabbits: islands.reduce((n, i) => n + i.rabbits.size, 0),
      sockets: io.engine?.clientsCount ?? 0,
      uptimeSec: Math.round(process.uptime()),
    }));
    return;
  }
  res.writeHead(404).end();
});

const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ── Auth ─────────────────────────────────────────────────────────────────────
// A socket without a valid token connects as a SPECTATOR: it may watch (phase 5
// needs spectating anyway) but every gameplay handler below refuses it.
io.use(async (socket, next) => {
  // A bad token must not throw out of here. `verifySession` swallows its own
  // failures today, but this middleware runs on EVERY connection, so it is
  // wrapped rather than trusted: an unauthenticated socket is a spectator,
  // which is a defined state, whereas a rejection here is a dead process.
  try {
    const auth = socket.handshake.auth as { token?: string };
    if (auth?.token) {
      const claims = await verifySession(auth.token);
      if (claims?.sub) {
        const data = socket.data as SocketData;
        data.playerId = claims.sub;
        data.name = claims.name || 'Rabbit';
      }
    }
  } catch (e) {
    console.error('[rr-ws] handshake auth failed:', e);
  }
  next();
});

// ── Island helpers ───────────────────────────────────────────────────────────

function newIsland(lifetimeCarrots: number): LiveIsland {
  return store.create(randomUUID(), lifetimeCarrots);
}

/**
 * The first island a player ever sees — theirs alone, dealt by hand.
 *
 * The seed carries the `first:` prefix, which is what the terrain and the
 * generator read to cut it small and lay it out (see FIRST_RUN in tuning and
 * `firstIslandLayout` in island.ts). The prefix travels to the client like
 * any seed, so the coastline it draws is the same one; what is buried stays
 * behind the content seed as always.
 */
function newFirstIsland(playerId: string): LiveIsland {
  // Named after the PLAYER, not dealt at random. The client cuts a placeholder
  // from `firstIslandSeed(player.id)` while it waits for this answer (see
  // page.tsx), and with the same name on both sides the placeholder IS the
  // island: nothing is re-cut under the player on the first screen of the
  // game, and two asks for a first island can only ever name one.
  const seed = firstIslandSeed(playerId);
  // A first island left behind by a run that never banked (the server
  // survived, the player did not come back) is torn down rather than reused
  // with its holes already dug. Solo, so nobody else can be standing on it.
  if (store.get(seed)) store.delete(seed);
  return store.create(seed, 0, { solo: true });
}

/**
 * Answer one ask at a time on a socket — see `SocketData.joining`.
 *
 * The duplicate is DROPPED, not queued: it is the same ask, and the seat it
 * wants is the one the first is in the middle of taking. Queued, it would run
 * after the first and find a held seat with no drop behind it, which is the
 * walk-home-and-back shape — the run would be banked, re-paid and restarted.
 */
function oneAtATime<A extends unknown[]>(
  data: SocketData,
  handler: (...args: A) => Promise<unknown>,
): (...args: A) => Promise<unknown> {
  return async (...args: A) => {
    if (data.joining) {
      console.warn('[rr-ws] join dropped: one is already being answered', data.playerId);
      return;
    }
    data.joining = true;
    try {
      return await handler(...args);
    } finally {
      data.joining = false;
    }
  };
}

/** Everything a client needs to draw the island it just joined. */
function snapshot(live: LiveIsland) {
  const view = publicView(live.island);
  return {
    // The SEED, not the map: the client cuts the identical coastline from it.
    // Where the land is was never a secret; what is buried in it is.
    seed: view.seed,
    tier: view.tier,
    revealed: view.revealed,
    // Chests are announced before they are dug — see `publicView`. Already
    // read by the client's snapshot type; it was simply never sent here.
    chests: view.chests,
    // Numbers the cascade has opened on undug ground — see `cascadeHints`.
    hinted: view.hinted,
    // Red Xs that were RIGHT — see FLAG in tuning. A wrong one leaves no mark.
    flagged: view.flagged,
    /** The tutorial island. The client runs its captions off this alone. */
    first: isFirstIsland(view.seed),
    /**
     * THE TAUGHT BOMB, while the first island is still holding the player
     * there — the cell the client makes beat (`IslandScene.teachBomb`).
     *
     * Sending a bomb's position to a browser is normally the one thing this
     * payload must never do. It is safe here and only here: the tutorial board
     * is the same for everybody (`FIRST_ISLAND_GROUND`), so its layout is
     * public by construction, and this particular bomb is one the player is
     * being ASKED to identify — the numbers on screen already prove where it
     * is. `teachingHold` returns null the moment it is marked, so the field
     * disappears with the lesson and never appears on any other island.
     */
    taughtBomb: teachingHold(live.island) ?? undefined,
    warnStage: live.warnStage,
    // How much of the island is already dug, 0 → 1. A joiner lands mid-run on
    // ground others have been working: without this the strip would open at
    // 0% on an island that is half gone, and only correct itself on the next
    // dig anybody made.
    dugFraction: live.dugFraction,
    // The goal line, in plain counts: a joiner has to read "3/10 chests" the
    // moment they land, not on the next dig anybody makes.
    chestsTaken: live.chestsTaken,
    chestsTotal: live.chestsTotal,
    rabbits: [...live.rabbits.values()].map(publicRabbit),
    // Where the flock stands NOW, not where the seed first put it. A player
    // joining a run in progress has to see the sheep everyone else sees —
    // they block cells, so an out-of-date flock is an out-of-date set of legal
    // moves.
    sheep: [...live.sheep].map(([id, at]) => ({ id, x: at.x, y: at.y })),
  };
}

/** A rabbit as OTHERS may see it. Deliberately the same shape for everyone —
 *  there is nothing secret about a rabbit, only about the ground. */
const publicRabbit = (r: Rabbit) => ({
  playerId: r.playerId,
  name: r.name,
  tile: r.tile,
  energy: r.energy,
  carrots: r.carrots,
  alive: r.alive,
  crowned: r.crowned,
  // What is left of a stun, as a REMAINING duration (see `bomb_hit` for why
  // never a deadline). A snapshot taken mid-stun used to say nothing, and a
  // client reconnecting right after a blast lit its ring at once.
  stunMs: Math.max(0, r.stunnedUntil - Date.now()),
});

/**
 * The volcano's smoke stage for the current dug fraction. Broadcast only on a
 * CHANGE — a per-move broadcast of an unchanged stage is pure noise on the wire.
 */
function warnStageFor(fraction: number): number {
  let stage = 0;
  for (const t of ERUPTION.WARN_STAGES) if (fraction >= t) stage++;
  return stage;
}

/**
 * The island is cleared: every run on it is over, and everyone goes home.
 *
 * This used to move the survivors onto a fresh island with their energy and
 * carrots, which made a run endless for anyone who could avoid the bombs —
 * digging is free, so nothing but a bomb ever drained the bar. Now the island
 * IS the level: when its last CHEST is dug (`chestProgress`) the runs are
 * banked, each player gets their recap, and the island is deleted.
 *
 * The chests, and no longer every safe tile. The old rule was a finish line
 * nobody could see — three hundred tiles of digging, ending whenever the last
 * one happened to go. The chests are visible from across the board and sit on
 * the rim (`rimTiles`), so the island states its own goal: collect these, and
 * it blows. What is left to collect is what a run is worth, which is also why
 * a late joiner gets a short one — and why, below ERUPTION.JOIN_MIN_TILES_LEFT,
 * nobody new is sent.
 *
 * The recap is built from the SOCKET's tallies, the same way a death is, so
 * the two endings print the same numbers for the same run. A rabbit whose run
 * already ended on a bomb is banked (idempotently) but not told again — it
 * already has its recap on screen.
 */
async function erupt(live: LiveIsland) {
  if (live.erupting) return;
  live.erupting = true;
  const room = roomFor(live.island.id);
  io.to(room).emit('eruption', { islandId: live.island.id, durationMs: ERUPTION.SEQUENCE_MS });

  setTimeout(guard('erupt', async () => {
    for (const rabbit of live.rabbits.values()) {
      const wasAlive = rabbit.alive;
      rabbit.alive = false;
      // Bank before the island goes, alive or not: a run that ended on a bomb
      // moments before the eruption must not be thrown away with the rabbit.
      await bankRun(rabbit).catch((e) => console.error('[bankRun:erupt]', e));
      if (!wasAlive) continue;
      const socket = socketOf(rabbit.playerId);
      const sd = socket?.data as SocketData | undefined;
      if (!socket || !sd || sd.islandId !== live.island.id) continue;
      socket.emit('run_over', {
        carrots: rabbit.carrots,
        tilesDug: sd.tilesDug ?? 0,
        bombsHit: sd.bombsHit ?? 0,
        durationMs: Date.now() - (sd.runStartedAt ?? Date.now()),
        cleared: true,
      });
      // Not `sd.islandId = undefined`: the recap's "Again" goes through
      // `restart`, which needs the id to leave the room and say `restarting`.
      // A deleted island is a fine thing for it to find nothing under.
    }
    store.delete(live.island.id);
  }), ERUPTION.SEQUENCE_MS);
}

/** The socket currently holding a player's seat, if any. */
function socketOf(playerId: string): Socket | undefined {
  for (const s of io.sockets.sockets.values()) {
    if ((s.data as SocketData).playerId === playerId) return s;
  }
  return undefined;
}

// ── The push bus ─────────────────────────────────────────────────────────────

/**
 * Relay what the HTTP side tells a player — see `lib/game/raid-events`.
 *
 * One `LISTEN` on a dedicated connection, held for the life of the process
 * (postgres.js re-establishes it after a drop). A raid is decided over HTTP
 * in the web process; this is how its every change reaches the socket of a
 * defender who is at home, and how a raider hears the lightning that ended
 * their run between two of their own steps. Nothing is asked twice: a player
 * with no socket here is simply not told, and reads the row later.
 *
 * OPTIONAL, like presence: a database that will not take the LISTEN must not
 * stop the process from seating anyone. The bus being down costs the live
 * picture and nothing else.
 */
function listenForPushes(): void {
  sql.listen(PLAYER_PUSH_CHANNEL, (wire) => {
    const push = decodePush(wire);
    if (!push) return;
    socketOf(push.to)?.emit(push.event, push.payload);
  }).then(
    () => console.log('[rr-ws] push bus listening on', PLAYER_PUSH_CHANNEL),
    (e) => console.error('[rr-ws] push bus unavailable (live raids off):', e),
  );
}
listenForPushes();

// ── Persistence ──────────────────────────────────────────────────────────────

/** The open season, created on first need so a fresh database just works. */
async function currentSeason() {
  const open = await db.query.seasons.findFirst({ where: isNull(seasons.endedAt) });
  if (open) return open;
  const { SEASON } = await import('../config/tuning');
  const [created] = await db
    .insert(seasons)
    .values({ endsAt: new Date(Date.now() + SEASON.DURATION_MS) })
    .returning();
  return created;
}

/**
 * Bank a finished run.
 *
 * ONE carrot event feeds all three counters (GDD): the spendable stock, the
 * season score, and the untouchable lifetime total. They are written in a single
 * statement so they can never drift apart.
 *
 * CALLED FROM EVERY EXIT, not just from running out of energy. A run used to
 * bank only on `runOver`, so a player who walked back to the burrow with a full
 * sack — or closed the tab — had their carrots deleted with the rabbit when the
 * reconnect grace lapsed. Digging and then leaving is the ordinary way to play;
 * it must not be the way to lose a run.
 *
 * Idempotent, which is what makes that safe: it clears `data.runId` on the way
 * out and returns early without it, so the same run cannot be banked twice
 * however many exits fire.
 *
 * TELLS THE PLAYER, too. The burrow's carrot counter is drawn from `/api/burrow`,
 * so a run that landed in Postgres but was never announced left the HUD showing
 * the total from BEFORE the run — the carrots were banked, and the player could
 * not see it. `banked` fires here rather than at each exit for the same reason
 * the write does: there are five ways a run can end, and only one of them should
 * have to know what banking means.
 */
async function bankRun(rabbit: Rabbit) {
  const run = rabbit.run;
  // No run id means it is already banked. That check is the whole reason this
  // is safe to call from several exits at once (a dig that ends the run AND
  // the sweep that later frees the seat).
  if (!run?.id) return;
  const runId = run.id;
  run.id = undefined;

  const carrots = rabbit.carrots;
  const playerId = rabbit.playerId;

  /**
   * A RUN THAT DUG NOTHING IS REFUNDED, and does not count as a run.
   *
   * The crossing charges ENERGY.RUN_COST at the door (`payForRun`) because
   * that is the only moment the burrow row is in hand — but what the player
   * buys there is a BOARD, and a board they never broke ground on was never
   * dealt to them. Walking out to look and walking home used to cost a third
   * of the bank: "j'ai fait un game dig, j'ai pas bougé, j'ai perdu 20".
   *
   * `moved` and not `tilesDug` is the test, and not `carrots` either. Walking
   * revealed ground is free and a rabbit spawns beside ground that is already
   * open, so a run can be played properly and dig nothing — keying on tiles
   * refunded those ("j'ai fait un pas, ca a pas consome les 20"). Keying on
   * carrots would be worse still: an unlucky board that paid nothing is a run
   * that HAPPENED and stays paid for. Only a rabbit that never took a step
   * was merely looking.
   *
   * `runsPlayed` moves with the charge, for one reason beyond bookkeeping: it
   * is what sends a first-timer to their authored island (see `join`). A
   * refunded look-around must not burn that first island, or a newcomer who
   * glances at the game and comes back has silently lost the tutorial.
   *
   * The refund FOLDS IN THE REGEN AND RE-STAMPS, the same shape as
   * `chargeRun` and for the same reason: `players.energy` is a value read
   * against `energyUpdatedAt`, never a running total. Adding to the column
   * while leaving the stamp where the charge put it would let the interval
   * since be paid out a second time on the next read — the run would hand
   * back more than it took. Folded and clamped at the ceiling, "cross, wait,
   * leave" is worth exactly nothing, which is what it should be worth.
   */
  const refunded = !run.moved;
  let refund: { energy: number; energyUpdatedAt: Date } | undefined;
  if (refunded) {
    const row = await db.query.players.findFirst({
      where: eq(players.id, playerId),
      columns: { energy: true, energyUpdatedAt: true },
    });
    if (row) {
      const now = new Date();
      refund = {
        energy: Math.min(OUT_OF_RUN_ENERGY.MAX, currentEnergy(row, now.getTime()) + ENERGY.RUN_COST),
        energyUpdatedAt: now,
      };
    }
  }

  await db.update(players).set({
    stock: raw`${players.stock} + ${carrots}`,
    seasonScore: raw`${players.seasonScore} + ${carrots}`,
    lifetimeCarrots: raw`${players.lifetimeCarrots} + ${carrots}`,
    runsPlayed: raw`${players.runsPlayed} + ${refunded ? 0 : 1}`,
    ...(refund ?? {}),
    tilesDug: raw`${players.tilesDug} + ${run.tilesDug}`,
    chestsOpened: raw`${players.chestsOpened} + ${run.chests ?? 0}`,
    lastSeenAt: new Date(),
  }).where(eq(players.id, playerId));

  await db.update(runs).set({
    carrots,
    tilesDug: run.tilesDug,
    bombsHit: run.bombsHit,
    durationMs: Date.now() - run.startedAt,
    endedAt: new Date(),
  }).where(eq(runs.id, runId));

  // Chest items land in the SAME banking step as the carrots, and after the
  // run row is closed. Granting them at the dig would have let a player farm
  // chests without ever finishing a run; granting them here means a run either
  // banks entirely or not at all.
  //
  // Each grant is its own statement rather than one transaction with the
  // carrots above, and that is a deliberate trade: `grantItem` reads the player
  // row for the timed kinds, so folding it in would hold a row lock across the
  // whole bag. A chest item that fails to land is a bug worth a loud log, not a
  // reason to roll back carrots the player has already been told about.
  for (const [kind, qty] of Object.entries(run.loot)) {
    if (!qty) continue;
    try {
      await grantItem(db, playerId, kind as ItemKind, qty);
    } catch (e) {
      console.error('[bankRun] chest grant failed', playerId, kind, qty, e);
    }
  }
  if (run.nfts.length) {
    // No mint yet — the drop is RECORDED so the run that produced it is on file
    // when minting arrives (BUILD-PLAN phase 114). Losing the log would make an
    // NFT owed to a player unprovable, which is worse than not minting today.
    console.log('[chest-nft]', playerId, 'run', runId, 'tiles', run.nfts.join(','));
  }

  // Announced only now, after the row is written: the client answers this by
  // re-reading the burrow, and a notice that outran its own UPDATE would have it
  // read the old total and cache the very staleness this exists to clear.
  // The socket may be gone (a closed tab, a sweep banking for an absent player)
  // — the carrots are safe either way, and the next burrow load will show them.
  socketOf(playerId)?.emit('banked', { carrots, loot: run.loot, nfts: run.nfts.length });

  // The carrots are banked in Postgres by this point, which is what matters.
  // Mirroring the score into Redis is a CACHE update — `rebuildLeaderboard`
  // restores it from Postgres — so it is not allowed to fail the banking that
  // already succeeded.
  await optional('setScore', async () => {
    const [row] = await db.select({ score: players.seasonScore })
      .from(players).where(eq(players.id, playerId));
    const season = await currentSeason();
    if (row) await setScore(season.id, playerId, row.score);
  });
}

/**
 * Take a run's worth of energy out of the burrow's bar, or say why not.
 *
 * THE ONE PLACE the out-of-run bar is spent for a RUN. It used to be spent
 * nowhere: every join opened a tank at ENERGY.START and never looked at
 * `players.energy`, so the bar on the burrow sat at its ceiling for everyone,
 * a bought refill filled a bar that was already full, and runs were unlimited
 * — see ENERGY.RUN_COST.
 *
 * The debit itself lives in `payCrossing` (src/lib/game/pay-crossing.ts)
 * since a raid's first step came to cost the same crossing: one optimistic
 * conditional write, shared by both doors, rather than two copies of a bar
 * that would drift.
 */
async function payForRun(
  playerId: string,
  first: { energy: number; energyUpdatedAt: Date },
) {
  return payCrossing(playerId, first);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  const data = socket.data as SocketData;

  // AT THE KEYBOARD, wherever they are standing — the handshake has already
  // named them by here, and this lasts until the socket closes. It is what
  // lets the raid list tell a burrow whose owner is away from one whose owner
  // is home and watching; `markOnline` below is the narrower "on an island".
  // Spectators have no playerId and are nobody's target, so they are skipped.
  if (data.playerId) {
    void optional('markConnected', () => markConnected(data.playerId!));
  }

  /**
   * A RUN LEFT BEHIND BY A RELOAD is announced on arrival.
   *
   * The seat survives the socket (`disconnectedAt`, and the grace sweep) so
   * that a refresh does not end a run — but the client after a refresh opens
   * on the burrow and never asks for a seat, so the promise was only kept if
   * DIG was pressed inside the grace window. Told here, the page crosses back
   * by itself and the `join` finds `existing`: same rabbit, same run, nothing
   * paid. Only a LIVE rabbit is worth going back to; a dead one's run is over
   * and the join would bank it and charge a new one.
   */
  if (data.playerId) {
    const held = store.seatOf(data.playerId);
    const rabbit = held?.rabbits.get(data.playerId);
    if (held && rabbit?.alive && held.disconnectedAt.has(data.playerId)) {
      socket.emit('seat_held', { seed: held.island.seed });
    }
  }

  /**
   * Join a run. Drop-in: no lobby, no matchmaking — you land on the fullest
   * island that has room, or a new one if they are all full.
   */
  socket.on('join', guard('join', oneAtATime(data, async () => {
    if (!data.playerId) return socket.emit('error_msg', { code: 'unauthenticated' });

    const player = await db.query.players.findFirst({ where: eq(players.id, data.playerId) });
    if (!player) return socket.emit('error_msg', { code: 'unknown_player' });
    data.name = player.name;
    data.lifetimeCarrots = player.lifetimeCarrots;

    // A seat still held on some island is the one to return to — otherwise a
    // reconnecting player is dropped onto the fullest island instead and ends
    // up with TWO rabbits: the new one here, and the old seat ticking away
    // until the grace sweep banks it.
    //
    // A player with NO RUNS behind them is the exception to drop-in: they get
    // the first island (theirs alone, authored — see `newFirstIsland`) rather
    // than the fullest one. `runsPlayed` is bumped when a run banks, so a
    // first-timer who refreshes mid-run still finds their seat above, and one
    // who walks home and comes straight back gets the real ladder.
    const live = store.seatOf(data.playerId)
      ?? (player.runsPlayed === 0 ? newFirstIsland(player.id) : undefined)
      ?? store.findJoinable()
      ?? newIsland(player.lifetimeCarrots);

    /**
     * A refresh returns to the same rabbit; walking back in starts a new run.
     *
     * The distinction is `disconnectedAt`: it is written only when the SOCKET
     * drops, so a seat still held without it means the player never left the
     * connection — they crossed to their burrow and came back, which is a new
     * run and has to begin at the spawn. Reusing the rabbit there put them back
     * wherever they had wandered to, and a DEAD one made the island
     * unplayable — every move answered `'dead'`, the ring went dark, and
     * nothing on screen said why.
     */
    const held = live.rabbits.get(data.playerId);
    const existing = held && held.alive && live.disconnectedAt.has(data.playerId) ? held : undefined;
    if (held && !existing) {
      // Whatever it was carrying is owed to them before the rabbit goes.
      await bankRun(held).catch((e) => console.error('[bankRun:rejoin]', e));
      live.rabbits.delete(data.playerId);
      live.disconnectedAt.delete(data.playerId);
      io.to(roomFor(live.island.id)).emit('rabbit_left', { playerId: data.playerId, grace: false });
    }
    // A NEW run is paid for out of the burrow's bar before a seat is taken. A
    // reconnect (`existing`) is the same run continuing and pays nothing.
    // Refused, the socket joins no room and owns no rabbit: the client goes
    // back to the burrow, which shows the wait and sells the refill. The
    // island is deliberately not where a player learns they cannot afford it.
    /**
     * What this crossing took out of the burrow's bar, and what is left.
     *
     * Sent with the snapshot rather than left for the client to fetch: the
     * charge is the ONE thing about the burrow that happens while the player
     * is looking at the island, and it used to happen in silence — the bar
     * dropped by a run's worth and nothing on screen said so until they got
     * home. Undefined on a reconnect, which is the same run and paid nothing.
     */
    let bank: { energy: number; cost: number; max: number } | undefined;
    if (!existing) {
      const paid = await payForRun(data.playerId, player);
      if (!paid.ok) {
        return socket.emit('error_msg', {
          code: 'no_energy',
          energy: paid.energy,
          need: ENERGY.RUN_COST,
          nextRunInMs: paid.nextRunInMs,
        });
      }
      bank = { energy: paid.energy, cost: ENERGY.RUN_COST, max: OUT_OF_RUN_ENERGY.MAX };
    }

    const rabbit = existing ?? spawnRabbit(data.playerId, player.name, ENERGY.START, live.island.seed);
    live.rabbits.set(data.playerId, rabbit);
    live.disconnectedAt.delete(data.playerId);
    live.emptySince = null;

    data.islandId = live.island.id;
    socket.join(roomFor(live.island.id));

    if (!existing) {
      const [run] = await db.insert(runs).values({
        playerId: data.playerId,
        islandSeed: live.island.seed,
        islandTier: live.island.tier,
      }).returning({ id: runs.id });
      // ON THE RABBIT, not on the socket: the seat outlives the connection, and
      // the sweep that frees it is the exit with no socket to read.
      rabbit.run = { id: run.id, startedAt: Date.now(), tilesDug: 0, bombsHit: 0, loot: {}, nfts: [] };
      data.runId = run.id;
      data.runStartedAt = Date.now();
      data.bombsHit = 0;
      data.tilesDug = 0;
    }

    // Presence is a NICE-TO-HAVE. A Redis hiccup must not stop a player joining
    // a run — this used to throw straight out of the handler and take the whole
    // process, and everyone else's live island, with it.
    await optional('markOnline', () => markOnline(data.playerId!));
    socket.emit('island', { ...snapshot(live), bank });
    socket.to(roomFor(live.island.id)).emit('rabbit_joined', publicRabbit(rabbit));
  })));

  /**
   * Watch someone else's run.
   *
   * The front door to sabotage (phase 5): you pick a target on the leaderboard,
   * see what they see, and decide whether to spend a bomb on them. A spectator
   * joins the target's island ROOM — so it receives every reveal and every move
   * live — but is never given a rabbit, which is what makes watching harmless.
   */
  socket.on('spectate', guard('spectate', async (payload: { playerId?: unknown }) => {
    // Authenticated, like every other handler. Watching is not a harmless
    // read: the snapshot below carries the island's seed and the room carries
    // every reveal live, so an anonymous socket could follow any named player's
    // run — and player ids are public, they ride on `publicRabbit` and on the
    // leaderboard. A spectator still owns no rabbit; it just has to be someone.
    if (!data.playerId) return socket.emit('error_msg', { code: 'unauthenticated' });
    const target = payload?.playerId;
    if (typeof target !== 'string') return;

    // Find whichever island the target is currently on.
    let found: LiveIsland | undefined;
    for (const live of store.all()) {
      if (live.rabbits.has(target)) { found = live; break; }
    }
    if (!found) return socket.emit('error_msg', { code: 'not_playing' });

    // Leave whatever was being watched before — a viewer belongs to one island.
    if (data.islandId) socket.leave(roomFor(data.islandId));
    data.islandId = found.island.id;
    data.spectating = target;
    socket.join(roomFor(found.island.id));
    socket.emit('island', snapshot(found));
  }));

  /**
   * Call a lightning strike down on a tile of this island.
   *
   * The loud sabotage. A planted bomb is an ambush that waits to be stepped
   * on; a strike lands where it is aimed and opens the ground around it at
   * once, setting off whatever was buried there.
   *
   * It does NOT re-cover dug tiles, whatever the shop's old copy promised —
   * the GDD rejects that by name ("breaks minesweeper logic"), and a board
   * that can un-deduce itself makes reading it pointless.
   *
   * The item is spent BEFORE the strike lands: a failed strike that still cost
   * the carrot is a bug report, one that landed unpaid is an exploit.
   */
  socket.on('lightning', guard('lightning', async (payload: { tile?: unknown }) => {
    if (!data.playerId || !data.islandId || data.spectating) return;
    const target = payload?.tile;
    if (typeof target !== 'number' || !Number.isInteger(target)) return;

    const live = store.get(data.islandId);
    if (!live || live.erupting) return;
    // Aimed at ground that exists. A strike into the sea is a client bug, not
    // a play, so it is refused rather than silently doing nothing.
    if (!live.island.tiles.has(target)) {
      return socket.emit('lightning_rejected', { reason: 'off-island' });
    }

    const spent = await db
      .update(inventory)
      .set({ qty: raw`${inventory.qty} - 1` })
      .where(and(
        eq(inventory.playerId, data.playerId),
        eq(inventory.kind, 'lightning'),
        raw`${inventory.qty} > 0`,
      ))
      .returning({ qty: inventory.qty });
    if (spent.length === 0) return socket.emit('lightning_rejected', { reason: 'none-held' });

    const out = strike(live.island, data.playerId, target);

    const room = roomFor(live.island.id);
    // The bolt itself, so every client can play it — including spectators, who
    // are watching precisely for this.
    io.to(room).emit('lightning_struck', {
      target,
      castBy: data.playerId,
      tiles: out.struck.map((s) => s.tile),
      bombs: out.bombs,
    });

    // Then the ground it opened, as ordinary reveals: a dug tile is dug
    // regardless of what dug it, and the hint recount already happened.
    const now = Date.now();
    for (const s of out.struck) {
      const reveal = {
        tile: s.tile,
        content: s.content,
        adjacent: s.adjacent,
        dugBy: data.playerId,
      };
      if (live.mirages.size === 0) {
        io.to(room).emit('tile_revealed', reveal);
      } else {
        for (const seated of live.rabbits.keys()) {
          const bent = shownAdjacent(live.mirages.get(seated), s.tile, s.adjacent, now);
          socketOf(seated)?.emit('tile_revealed', { ...reveal, adjacent: bent });
        }
      }
    }
    // A strike that opened a zero opens the ground around it, like a dig.
    // Bounded around the point of impact, like a dig is around the rabbit.
    const hinted = cascadeAround(live.island, target);
    // `from` is where the opening STARTED — the point of impact here. The
    // client plays the zone as a ripple spreading out of it, so without it the
    // swell has no centre and falls back to opening flat.
    if (hinted.length) io.to(room).emit('hints_revealed', { tiles: hinted, from: target });

    /* AND WHOEVER WAS STANDING THERE.
     *
     * The strike used to open ground only. It is aimed at a RIVAL now: every
     * other rabbit inside its square is electrocuted — a heart, the same as a
     * bomb (LIGHTNING.SHOCK_LOSS), and held for the current's duration. The
     * roster decides who was in the way (`struckRabbits`), never the tiles:
     * a rabbit is struck for where it stands, dug ground or not.
     *
     * Told AFTER the reveals, so a client plays the bolts, then the ground
     * opening, then the rabbit going down in it — the order the eye expects.
     * A victim whose last heart this took is ended the way a shove ends a
     * run (see `rabbit_pushed`): the room sees the slump, the victim alone
     * gets the recap, and the run is banked by whichever exit fires first.
     */
    const nowMs = Date.now();
    for (const victim of struckRabbits(live.island.seed, target, live.rabbits.values(), data.playerId)) {
      victim.energy = Math.max(0, victim.energy - LIGHTNING.SHOCK_LOSS);
      victim.stunnedUntil = nowMs + LIGHTNING.SHOCK_STUN_MS;
      const runOver = victim.energy <= 0;
      if (runOver) victim.alive = false;
      io.to(room).emit('rabbit_struck', {
        playerId: victim.playerId,
        // Rule 7 of the shoves applies here too: the victim always knows who
        // did it — revenge is the point.
        by: data.playerId,
        tile: victim.tile,
        energy: victim.energy,
        // A REMAINING duration, not the server's deadline: the two clocks are
        // unrelated (see `bomb_hit`).
        stunMs: LIGHTNING.SHOCK_STUN_MS,
        runOver,
      });
      if (!runOver) continue;
      io.to(room).emit('rabbit_died', { playerId: victim.playerId });
      void bankRun(victim).catch((e) => console.error('[bankRun:struck]', e));
      socketOf(victim.playerId)?.emit('run_over', {
        carrots: victim.carrots,
        tilesDug: victim.run?.tilesDug ?? 0,
        bombsHit: victim.run?.bombsHit ?? 0,
        durationMs: nowMs - (victim.run?.startedAt ?? nowMs),
      });
    }
  }));

  /**
   * Bury a bomb under an undug tile of this island.
   *
   * The quiet sabotage — see `lib/game/sabotage` for the rule, and for why a
   * plant recounts the numbers around it: the board must never un-deduce
   * itself, so whatever shown number the bomb changed is redrawn for everyone
   * at once. That redraw is the only trace a plant leaves; the tile itself
   * looks like any other until somebody digs it.
   *
   * REFUSED BEFORE IT IS PAID FOR, unlike the strike: every refusal here is a
   * legitimate play the player could not have known was illegal (the cap, a
   * chest they aimed at), and charging for it would teach them to stop trying.
   * The one thing never refused is a tile that already holds a bomb — that
   * refusal would be a free probe.
   */
  socket.on('plant', guard('plant', async (payload: { tile?: unknown }) => {
    if (!data.playerId || !data.islandId || data.spectating) return;
    const target = payload?.tile;
    if (typeof target !== 'number' || !Number.isInteger(target)) return;

    const live = store.get(data.islandId);
    if (!live || live.erupting) return;
    // Only somebody actually digging this island may mine it.
    if (!live.rabbits.get(data.playerId)?.alive) return;

    const blocker = plantBlocker(live.island, data.playerId, target);
    if (blocker) return socket.emit('plant_rejected', { reason: blocker });

    // Spend it — conditional on the row still holding one, so two sockets
    // racing the same last bomb cannot both plant.
    const spent = await db
      .update(inventory)
      .set({ qty: raw`${inventory.qty} - 1` })
      .where(and(
        eq(inventory.playerId, data.playerId),
        eq(inventory.kind, 'bomb'),
        raw`${inventory.qty} > 0`,
      ))
      .returning({ qty: inventory.qty });
    if (spent.length === 0) return socket.emit('plant_rejected', { reason: 'none-held' });

    const out = plantBomb(live.island, live.shape, data.playerId, target);

    // The planter alone is told where it went — it is their ambush.
    socket.emit('bomb_planted', { tile: out.tile });

    // Everyone gets the numbers the bomb changed — except a victim under a
    // mirage, whose bent copy is bent again, exactly as a dig's reveal is.
    if (out.changed.length === 0) return;
    const room = roomFor(live.island.id);
    if (live.mirages.size === 0) {
      io.to(room).emit('hints_changed', { tiles: out.changed });
      return;
    }
    const now = Date.now();
    for (const seated of live.rabbits.keys()) {
      socketOf(seated)?.emit('hints_changed', {
        tiles: out.changed.map((c) => ({
          tile: c.tile,
          adjacent: shownAdjacent(live.mirages.get(seated), c.tile, c.adjacent, now),
        })),
      });
    }
  }));

  /**
   * Throw a mirage at a rival on this island.
   *
   * The sabotage that attacks DEDUCTION rather than position: a few of the
   * victim's already-revealed numbers start lying by one, for ninety seconds.
   * See `docs/` and `src/lib/game/mirage.ts` for why only a few, and why the
   * drift is small — a lie has to stay findable or the victim stops reading
   * the board instead of checking it.
   *
   * The item is spent BEFORE the mirage lands: a failed throw that still cost
   * the carrot is a bug report, but a mirage that landed without being paid for
   * is an exploit, and only one of those is recoverable.
   */
  socket.on('mirage', guard('mirage', async (payload: { victim?: unknown }) => {
    if (!data.playerId || !data.islandId || data.spectating) return;
    const victimId = payload?.victim;
    if (typeof victimId !== 'string' || victimId === data.playerId) return;

    const live = store.get(data.islandId);
    if (!live || live.erupting) return;
    const victim = live.rabbits.get(victimId);
    // Only someone actually playing this island can be confused by it.
    if (!victim || !victim.alive) return;
    // One at a time per victim: stacking mirages would compound past the point
    // where the lie is still checkable against honest neighbours.
    if (mirageActive(live.mirages.get(victimId), Date.now())) {
      return socket.emit('mirage_rejected', { reason: 'already-mirrored' });
    }

    // Spend it. Conditional on the row still having one, so two sockets racing
    // the same last mirage cannot both win.
    const spent = await db
      .update(inventory)
      .set({ qty: raw`${inventory.qty} - 1` })
      .where(and(
        eq(inventory.playerId, data.playerId),
        eq(inventory.kind, 'mirage'),
        raw`${inventory.qty} > 0`,
      ))
      .returning({ qty: inventory.qty });
    if (spent.length === 0) return socket.emit('mirage_rejected', { reason: 'none-held' });

    const now = Date.now();
    const m = planMirage(live.island, data.playerId, now);
    if (m.hints.length === 0) {
      // Nothing on the victim's board to corrupt yet. The item is already gone
      // — thrown at someone who has not read anything is simply a wasted throw,
      // and refunding it would let an attacker probe for free.
      return socket.emit('mirage_rejected', { reason: 'nothing-to-bend' });
    }
    live.mirages.set(victimId, m);

    // Only the victim is told, and only which tiles to redraw — never that the
    // numbers are false. Being told you are being lied to defeats the item;
    // FINDING OUT is the whole point.
    const victimSocket = socketOf(victimId);
    victimSocket?.emit('hints_changed', {
      tiles: m.hints.map((h) => ({ tile: h.tile, adjacent: h.shown })),
    });
    socket.emit('mirage_thrown', { victim: victimId, tiles: m.hints.length });

    // And when it lifts, the truth comes back the same way.
    setTimeout(() => {
      const held = live.mirages.get(victimId);
      if (held !== m) return;               // superseded or the island is gone
      live.mirages.delete(victimId);
      socketOf(victimId)?.emit('hints_changed', {
        tiles: m.hints.map((h) => ({ tile: h.tile, adjacent: h.truth })),
      });
    }, MIRAGE.DURATION_MS).unref?.();
  }));

  /**
   * A move intent. The DESTINATION TILE is the only thing the client chooses,
   * and even that is checked (adjacent, on land, off cooldown) — everything the
   * move then produces is decided here.
   *
   * A spectator has no rabbit on the island, so this falls through harmlessly:
   * watching cannot move anyone.
   */
  /**
   * A red X — "there is a bomb under that one". See FLAG in tuning.
   *
   * Answered at once and by the server alone: the client sends a tile and
   * learns whether it was right, exactly as it does for a dig. A RIGHT X goes
   * to the whole island (`bomb_flagged`) — it was checked, so it is a fact
   * about the board, and the move onto it is refused for everyone. A WRONG one
   * leaves no X at all: the room only sees the number it uncovered.
   */
  socket.on('flag', guard('flag', (payload: { tile?: unknown }) => {
    if (!data.playerId || !data.islandId || data.spectating) return;
    const at = payload?.tile;
    if (typeof at !== 'number' || !Number.isInteger(at)) return;

    const live = store.get(data.islandId);
    if (!live || live.erupting) return;
    const rabbit = live.rabbits.get(data.playerId);
    if (!rabbit) return;

    const out = flagTile(live.island, rabbit, at);
    if (!out.ok || !out.flag) return socket.emit('flag_rejected', { reason: out.rejection });

    const room = roomFor(live.island.id);
    if (out.flag.correct) io.to(room).emit('bomb_flagged', { tile: at, by: data.playerId });
    if (out.flag.hinted?.length) io.to(room).emit('hints_revealed', { tiles: out.flag.hinted, from: at });
    console.log('[flag]', data.playerId, 'tile', at, out.flag.correct ? 'right' : 'wrong',
      'energy', rabbit.energy, 'streak', out.flag.streak);
    // Same tile, new energy and carrots: the roster and the ring both read it.
    io.to(room).emit('rabbit_energy', { playerId: data.playerId, energy: rabbit.energy, carrots: rabbit.carrots });
    // The private half, like `move_result`: what it paid is the marker's business.
    socket.emit('flag_result', out.flag);

    if (out.runOver) {
      io.to(room).emit('rabbit_died', { playerId: data.playerId });
      void bankRun(rabbit).catch((e) => console.error('[bankRun:flag]', e));
      socket.emit('run_over', {
        carrots: rabbit.carrots,
        tilesDug: data.tilesDug ?? 0,
        bombsHit: data.bombsHit ?? 0,
        durationMs: Date.now() - (data.runStartedAt ?? Date.now()),
      });
    }
  }));

  socket.on('move', guard('move', (payload: { tile?: unknown }) => {
    if (!data.playerId || !data.islandId || data.spectating) return;
    const to = payload?.tile;
    if (typeof to !== 'number' || !Number.isInteger(to)) return;

    const live = store.get(data.islandId);
    if (!live || live.erupting) return;
    const rabbit = live.rabbits.get(data.playerId);
    if (!rabbit) return;

    // The dig RNG is seeded per (island, tile) so a chest's contents are fixed
    // the moment the island exists — replayable, and not re-rollable by a
    // client that disconnects on a bad drop.
    const rng = mulberry32(seedFrom(`${live.island.seed}:${to}`));
    // The other rabbits ride along so a step can SHOVE them — the bumper-car
    // rules in `docs/bumping.md`. Passing the roster is what turns pushing on;
    // `resolveMove` without it behaves exactly as it did before.
    const others = [...live.rabbits.values()].filter((r) => r.playerId !== rabbit.playerId);
    // Where the flock stands right now. The seed says where it started, and a
    // sheep blocks its cell — without this the server would wave a rabbit onto
    // a tile it has just told everyone a sheep is standing on.
    const sheepTiles = new Set([...live.sheep.values()].map((at) => toIndex(at.x, at.y)));
    const out = resolveMove(live.island, rabbit, to, live.shape, rng, Date.now(), others, sheepTiles);
    if (!out.ok) return socket.emit('move_rejected', { reason: out.rejection });

    // THE RUN HAS BEGUN — any accepted step, dug or merely walked.
    //
    // Not `out.dig`: walking revealed ground is free, and a rabbit spawns
    // beside ground that is already open, so a real run can dig nothing at
    // all. `tilesDug` alone therefore refunded runs that had genuinely been
    // played — "j'ai fait un pas, ca a pas consome les 20". What separates a
    // run from a look is whether the player ever moved.
    if (rabbit.run) rabbit.run.moved = true;

    const room = roomFor(live.island.id);

    // Everyone this move shoved. Broadcast BEFORE the mover's own event so the
    // client can animate the shove and the step in the order they happened.
    //
    // Rule 2 means a push can reveal a tile and set off a bomb under someone
    // who never dug: those land as ordinary `tile_revealed` events, because a
    // dug tile is dug regardless of whose foot did it.
    for (const shove of out.pushed ?? []) {
      if (shove.dig) {
        io.to(room).emit('tile_revealed', {
          tile: shove.dig.tile,
          content: shove.dig.content,
          adjacent: shove.dig.adjacent,
          dugBy: shove.playerId,
        });
        if (shove.dig.hinted?.length) io.to(room).emit('hints_revealed', { tiles: shove.dig.hinted, from: shove.dig.tile });
      }
      const victim = live.rabbits.get(shove.playerId);
      io.to(room).emit('rabbit_pushed', {
        playerId: shove.playerId,
        from: shove.from,
        to: shove.to,
        // Rule 7: the victim always knows who did it — revenge is the point.
        pushedBy: shove.pushedBy,
        energy: shove.energy,
        runOver: shove.runOver,
        // A landing on a bomb stuns (rule 2: a shove digs). Sent as what is
        // LEFT of it, like `bomb_hit`, so the victim's ring goes dark for
        // exactly as long as their moves will be refused.
        stunMs: victim ? Math.max(0, victim.stunnedUntil - Date.now()) : 0,
      });
      if (victim && shove.runOver) {
        void bankRun(victim).catch((e) => console.error('[bankRun:pushed]', e));
      }
    }

    if (out.dig) {
      data.tilesDug = (data.tilesDug ?? 0) + 1;
      if (out.dig.content === 'bomb') data.bombsHit = (data.bombsHit ?? 0) + 1;
      // The rabbit's own tally is the one that gets banked — `socket.data` is
      // gone by the time the sweep ends an abandoned run.
      if (rabbit.run) {
        rabbit.run.tilesDug += 1;
        if (out.dig.content === 'bomb') rabbit.run.bombsHit += 1;
      }
      // A dug tile is revealed FOR EVERYONE — the shared map is the whole point
      // of the shared island. The carrot, however, went to the first digger only.
      // Everyone gets the truth — except a victim under a mirage, who gets
      // their own bent copy. Sent per socket rather than to the room, because
      // the whole point is that one player's board disagrees with everybody
      // else's and nobody is told which.
      const reveal = {
        tile: out.dig.tile,
        content: out.dig.content,
        adjacent: out.dig.adjacent,
        dugBy: data.playerId,
        plantedBy: out.dig.plantedBy,
      };
      const now = Date.now();
      if (live.mirages.size === 0) {
        io.to(room).emit('tile_revealed', reveal);
      } else {
        for (const seated of live.rabbits.keys()) {
          const bent = shownAdjacent(live.mirages.get(seated), reveal.tile, reveal.adjacent, now);
          socketOf(seated)?.emit('tile_revealed', { ...reveal, adjacent: bent });
        }
      }
      // The cascade: numbers opened on undug ground around a zero. To the
      // whole room, like the reveal — what the ground says is a shared fact,
      // and the tiles themselves are still there for anyone to dig.
      if (out.dig.hinted?.length) io.to(room).emit('hints_revealed', { tiles: out.dig.hinted, from: to });
      // The blast is its own event: the client plays a damage animation and a
      // knockback, which a plain move would not distinguish from a walk.
      if (out.dig.knockback) {
        // The stun rides along so the client can keep the ring dark for its
        // duration. Sent as a REMAINING DURATION, not as the server's absolute
        // deadline: the two clocks are unrelated, and a client running a minute
        // fast would read an absolute stamp as long expired.
        io.to(room).emit('bomb_hit', {
          playerId: data.playerId,
          tile: out.dig.knockback.tile,
          stunMs: Math.max(0, out.dig.knockback.stunnedUntil - Date.now()),
        });
      }
    }

    // One line per dig, so "my counter did not move" is answerable from the
    // server's own log instead of by reasoning about the client. Only digs:
    // a line per step would bury it.
    if (out.dig) {
      console.log('[dig]', data.playerId, 'tile', to, out.dig.content,
        'carrots', rabbit.carrots, `(+${out.dig.carrotDelta})`);
    }
    // A plain walk can carry the cascade on — see `MoveOutcome.hinted`.
    if (out.hinted?.length) io.to(room).emit('hints_revealed', { tiles: out.hinted, from: to });
    io.to(room).emit('rabbit_moved', publicRabbit(rabbit));
    // The mover alone gets the private detail (their loot, their knockback).
    socket.emit('move_result', out);

    if (out.runOver) {
      // NOT on a tutorial win. `rabbit_died` slumps the rabbit and drains the
      // map to grey — the picture of running out of energy, which is exactly
      // what did NOT happen here: the player is standing on the chest they
      // came for. The cleared-island ending (`erupt`) takes the same care.
      if (!out.tutorialDone) io.to(room).emit('rabbit_died', { playerId: data.playerId });
      void bankRun(rabbit).catch((e) => console.error('[bankRun]', e));
      socket.emit('run_over', {
        carrots: rabbit.carrots,
        tilesDug: data.tilesDug ?? 0,
        bombsHit: data.bombsHit ?? 0,
        durationMs: Date.now() - (data.runStartedAt ?? Date.now()),
        // The tutorial was finished, not survived — the recap reads it to say
        // so, and it is the same "you got to the end" shape as a cleared island.
        ...(out.tutorialDone ? { tutorialDone: true } : {}),
      });
    }

    // Eruption clock. Checked per dig because a dig is the only thing that moves it.
    if (out.dig) {
      const chests = chestProgress(live.island);
      const fraction = chests.fraction;
      const stage = warnStageFor(fraction);
      // The fraction goes out on EVERY dig, the stage only when it changes.
      // They used to travel together, which meant the HUD's percentage would
      // have moved three times in a run — the smoke stages are the only thing
      // that cared about a change. A player digging a shared island needs to
      // see the ground go while their rivals dig it, not in three jumps.
      live.dugFraction = fraction;
      live.chestsTaken = chests.total - chests.left;
      live.chestsTotal = chests.total;
      if (stage !== live.warnStage) live.warnStage = stage;
      io.to(room).emit('volcano', {
        stage,
        dugFraction: fraction,
        chestsTaken: live.chestsTaken,
        chestsTotal: chests.total,
      });
      // 1 means every chest on the island is out of the ground — the island's
      // win condition, and whoever took the last one ended it for the room.
      // See `chestProgress`.
      if (fraction >= 1) void erupt(live);
    }
  }));

  /**
   * Walk away from a run, on purpose.
   *
   * THE common exit, and the one that had no handler at all: going back to the
   * burrow does not close the socket (the client keeps it for the leaderboard
   * and the burrow's own traffic), so the seat was simply held until the
   * island was reaped — and the carrots went with it. A player who dug a full
   * sack and walked home lost the lot, which is what "the carrots are not
   * really added" was.
   *
   * Banking here is what makes leaving a legitimate way to end a run: the GDD
   * says a run can only ever ADD to the burrow, so carrying them home has to
   * be worth exactly as much as running the tank dry.
   */
  socket.on('leave', guard('leave', async () => {
    if (!data.playerId || !data.islandId) return;
    const live = store.get(data.islandId);
    const rabbit = live?.rabbits.get(data.playerId);
    // No island under the id is the ordinary case after an eruption: the run
    // was banked and the island deleted, and the seat here is all that is
    // left to give up. Returning early kept the socket "on" a dead island.
    if (live && rabbit) {
      await bankRun(rabbit).catch((e) => console.error('[bankRun:leave]', e));
      live.rabbits.delete(data.playerId);
      live.disconnectedAt.delete(data.playerId);
      io.to(roomFor(live.island.id)).emit('rabbit_left', { playerId: data.playerId, grace: false });
    }
    socket.leave(roomFor(data.islandId));
    data.islandId = undefined;
    data.runId = undefined;

    // Off the island, so no longer "digging". This was missing, and it is not
    // cosmetic: the board offers a WATCH button on whoever this set names, so a
    // player who walked back to their burrow stayed advertised as a live run
    // until they closed the tab — and clicking them landed on `not_playing`.
    // The set is cleared here, on the way out, rather than only on disconnect.
    await optional('markOffline', () => markOffline(data.playerId!));
  }));

  /** Start a fresh run after dying, without a reconnect. */
  socket.on('restart', guard('restart', async () => {
    if (!data.playerId || !data.islandId) return;
    const live = store.get(data.islandId);
    const old = live?.rabbits.get(data.playerId);
    if (old?.alive) return; // A live run is not restartable — finish or leave.
    live?.rabbits.delete(data.playerId);
    socket.leave(roomFor(data.islandId));
    data.islandId = undefined;
    socket.emit('restarting');
    // Between two islands: there is no run to watch for the moment it takes to
    // join the next one. `join` marks them online again.
    await optional('markOffline', () => markOffline(data.playerId!));
  }));

  socket.on('disconnect', guard('disconnect', async () => {
    if (!data.playerId) return;
    // THE crash that took production down. This runs on every closed tab, so a
    // single bad second from Redis was enough to kill the server and end every
    // live run on it. Presence is not worth a run, let alone all of them.
    await optional('markOffline', () => markOffline(data.playerId!));
    // Out of BOTH sets: the socket is gone, so they are neither digging nor at
    // the keyboard. Left behind, a closed tab would haunt the raid list as a
    // defender who is home and watching — the one row a raider avoids, and the
    // safest burrow in the game would be an abandoned one.
    await optional('markDisconnected', () => markDisconnected(data.playerId!));
    // A spectator holds no seat, so there is nothing to keep warm for them.
    if (data.spectating) return;
    const live = data.islandId ? store.get(data.islandId) : undefined;
    if (!live) return;

    // The seat is HELD, not freed: a browser refresh must not end a run
    // (BUILD-PLAN phase 3). A sweep frees it once the grace window lapses.
    live.disconnectedAt.set(data.playerId, Date.now());
    io.to(roomFor(live.island.id)).emit('rabbit_left', { playerId: data.playerId, grace: true });
  }));
});

// ── The flock ────────────────────────────────────────────────────────────────

/**
 * How often the sheep get a turn.
 *
 * Slow on purpose. A sheep is scenery that gets out of the way, not a second
 * kind of player: ticking it at the rabbits' rate would fill the socket with
 * livestock traffic and make a quiet island look frantic. At this rate a
 * grazing flock drifts about once every two seconds, and a spooked one bolts
 * on the first tick after the rabbit closes in — which is the only timing that
 * has to feel immediate.
 */
const FLOCK_TICK_MS = 500;

/**
 * What `flee.ts` needs to know about the ground, answered from live state.
 *
 * `isFree` is the interesting one: it has to consult the CURRENT flock, not
 * just the seed's obstacles, or two sheep would walk through each other. The
 * rabbits count too — a sheep that stepped onto an occupied tile would put two
 * things on one cell, and the board's own rules say a rabbit's tile is taken.
 */
function groundFor(live: LiveIsland): { ground: Ground; occupied: Set<string> } {
  const seed = live.island.seed;
  const board = boardFor(seed);
  const { map } = terrainFor(seed);
  const occupied = new Set<string>();
  for (const at of live.sheep.values()) occupied.add(`${at.x},${at.y}`);
  for (const rabbit of live.rabbits.values()) {
    const { col, row } = toColRow(rabbit.tile);
    occupied.add(`${col},${row}`);
  }
  return {
    ground: {
      stepsFrom: (x, y) => board.stepsFrom(x, y),
      // Reads the set LIVE, so a cell claimed earlier in this same tick is
      // already taken by the time the next sheep is planned.
      isFree: (x, y) => board.isWalkable(x, y) && !occupied.has(`${x},${y}`),
      tierAt: (x, y) => map.level[y * map.width + x] ?? 0,
    },
    occupied,
  };
}

/**
 * Is any sheep on this island SPOOKED — a rabbit within panic range?
 *
 * Asked before `groundFor`, and that order is the point. Building the ground
 * means a `Set` of every occupant plus three closures, per island, twice a
 * second — and on a calm island it is all allocated to plan a drift that
 * usually does not happen. This pass is arithmetic over a handful of sheep and
 * no allocation at all.
 *
 * Deliberately NOT the full answer to "will anything move": a calm flock still
 * grazes on a `GRAZE_CHANCE` roll, and that roll belongs to `planFlight`. Rolling
 * it here would consume draws from a stream the planner then reads differently,
 * which is how an optimisation quietly changes the game. So the graze path pays
 * for its ground exactly as before, and what this skips is the case that
 * dominates at scale anyway: an island whose rabbits are nowhere near the flock.
 */
function anySheepSpooked(live: LiveIsland): boolean {
  if (live.sheep.size === 0) return false;
  const rabbitTiles = [...live.rabbits.values()].filter((r) => r.alive).map((r) => r.tile);
  if (rabbitTiles.length === 0) return false;
  for (const [id, at] of live.sheep) {
    if (isSpooked({ id, x: at.x, y: at.y }, rabbitTiles)) return true;
  }
  return false;
}

/**
 * Move every island's flock one tick and tell the room what changed.
 *
 * Only islands with somebody on them: a flock nobody is watching does not need
 * to drift, and skipping empty islands keeps this loop proportional to players
 * rather than to islands ever created.
 *
 * Nothing is emitted when nothing moved, which is the common case — a calm
 * flock only grazes a quarter of the time, and most ticks pass in silence.
 */
setInterval(guard('flock', () => {
  for (const live of store.all()) {
    if (live.erupting || live.rabbits.size === 0) continue;
    // Skip the islands where nothing can happen, BEFORE paying for the ground.
    //
    // Two ways a tick matters: something is spooked (tested exactly), or a calm
    // sheep grazes. The second is a per-sheep coin flip inside `planFlight`, so
    // the odds that at least one of n sheep grazes are `1 - (1 - p)^n` — rolled
    // once here purely as a gate. The planner still flips per sheep afterwards,
    // which is what decides WHICH sheep drifts; this only decides whether the
    // island is worth looking at. A flock drifts marginally less often as a
    // result (both rolls must pass), and at 500ms that is invisible — what it
    // buys is that a quiet island costs arithmetic instead of a Set per tick.
    if (!anySheepSpooked(live) && Math.random() >= 1 - (1 - GRAZE_CHANCE) ** live.sheep.size) continue;

    const { ground, occupied } = groundFor(live);
    const rabbitTiles = [...live.rabbits.values()].filter((r) => r.alive).map((r) => r.tile);
    const flock = [...live.sheep].map(([id, at]) => ({ id, x: at.x, y: at.y }));

    const flights = planFlock(
      flock,
      ground,
      rabbitTiles,
      Math.random,
      // Committed as each one is planned, so the next sheep sees the cell as
      // taken — `planFlock` relies on this to stop two of them choosing it.
      // The vacated cell is released in the same breath, or a flock would
      // gradually wall itself in behind the ghosts of where it used to stand.
      (from, to) => {
        occupied.delete(`${from.x},${from.y}`);
        occupied.add(`${to.x},${to.y}`);
      },
    );
    if (!flights.length) continue;

    for (const flight of flights) live.sheep.set(flight.id, flight.to);
    io.to(roomFor(live.island.id)).emit('sheep_moved', {
      sheep: flights.map((f) => ({
        id: f.id,
        tile: toIndex(f.to.x, f.to.y),
        // Every cell it crossed, not just where it ended up. A sprint bends
        // around whatever it ran past, so the endpoints alone leave the client
        // no honest way to animate it — see `Flight.path`.
        path: f.path.map((c) => toIndex(c.x, c.y)),
        sprinting: f.sprinting,
      })),
    });
  }
}), FLOCK_TICK_MS);

// ── Sweeps ───────────────────────────────────────────────────────────────────
// Two janitors, both cheap and both idempotent: expired reconnect grace, and
// islands nobody is on. Neither is on the hot path.
setInterval(guard('sweep', () => {
  const now = Date.now();
  for (const live of store.all()) {
    for (const [playerId, at] of live.disconnectedAt) {
      if (now - at < MULTIPLAYER.RECONNECT_GRACE_MS) continue;
      const rabbit = live.rabbits.get(playerId);
      live.rabbits.delete(playerId);
      live.disconnectedAt.delete(playerId);
      if (rabbit) {
        // The seat is being given up for good, so the run ENDS here — bank it.
        // This sweep used to delete the rabbit and its carrots together, which
        // is how a player who walked home or closed the tab lost everything
        // they had dug. There is no socket left to read at this point, which is
        // exactly why the run's paperwork rides on the rabbit.
        void bankRun(rabbit).catch((e) => console.error('[bankRun:sweep]', e));
        io.to(roomFor(live.island.id)).emit('rabbit_left', { playerId, grace: false });
      }
    }
  }
  for (const dead of store.reapable(now)) store.delete(dead.island.id);
}), 5000);

/**
 * The third janitor: guest burrows nobody can open any more.
 *
 * A guest's cookie is their only key. Once it has lapsed (or was never used
 * past the first look — see `isOrphanGuest`), the row is a ghost: ranked on
 * the season board, listed as a raid target, and reachable by nobody. Swept
 * here rather than from a web route because this process is the one that is
 * always up, and once at boot so a deploy clears the backlog without waiting
 * a night. `guard` because a failed sweep is a log line, never a dead server.
 */
const GUEST_SWEEP_MS = 6 * 60 * 60 * 1000;
const sweepGuests = guard('sweep-guests', async () => {
  const gone = await purgeOrphanGuests();
  if (gone.length) console.log(`[rr-ws] purged ${gone.length} orphan guest burrow(s)`);
});
setTimeout(sweepGuests, 15_000);
setInterval(sweepGuests, GUEST_SWEEP_MS);

/**
 * The last line of defence.
 *
 * Installed BEFORE listening, so a failure during startup is logged rather than
 * silently exited. See server/resilience.ts for why an unhandled rejection is
 * downgraded to a log line here rather than being allowed to end the process:
 * this box holds every live run in memory, and killing it over one bad event
 * throws away everyone else's game.
 */
installProcessGuards({
  close: () => new Promise<void>((resolve) => {
    // Tell clients to stop trying before the door shuts, so a deploy reads as a
    // reconnect rather than as an error.
    io.close(() => httpServer.close(() => resolve()));
  }),
});

/**
 * Les surcharges de réglage, chargées au démarrage puis rafraîchies.
 *
 * Ce processus tient les îles en mémoire et ne redémarre qu'au prix de toutes
 * les parties en cours — c'est précisément pour ça que les prix et l'économie
 * sont surchargeables en base. Encore faut-il les relire : sans ce timer, le
 * serveur garderait l'instantané du démarrage jusqu'au prochain déploiement,
 * ce qui est exactement ce que la table sert à éviter.
 *
 * `unref` pour que le timer n'empêche jamais le processus de se terminer.
 */
void refreshTuning();
setInterval(() => { void refreshTuning(); }, 30_000).unref();

/**
 * Le port occupe doit le DIRE.
 *
 * `next dev` tourne sur 3010 et WS_PORT a longtemps valu 3010 par defaut :
 * `bun ws` mourait alors sur un `uncaughtException: Error at serve` qui ne
 * nommait ni le port ni la cause. Le jeu paraissait installe — le site
 * repondait, la page s'affichait — mais aucune ile n'arrivait jamais et
 * personne ne pouvait jouer, sans qu'une seule ligne ne dise pourquoi.
 *
 * Un serveur qui ne peut pas ecouter n'est pas une exception anonyme : c'est
 * une erreur de configuration, et elle se repare en dix secondes quand on la
 * lit. D'ou le message, et la sortie en code 1 plutot qu'un processus zombie.
 */
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[rr-ws] le port ${PORT} est deja pris.\n` +
      `        WS_PORT=${PORT} dans .env, mais quelque chose ecoute deja la — ` +
      `souvent 'next dev' (3010) ou un 'bun ws' encore vivant.\n` +
      `        Choisis un autre WS_PORT (3011 en local), et fais pointer ` +
      `NEXT_PUBLIC_WS_URL sur le meme port.`,
    );
  } else {
    console.error('[rr-ws] impossible de demarrer:', err);
  }
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`[rr-ws] listening on :${PORT}`);
});
