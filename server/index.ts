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

import { ENERGY, ERUPTION, MULTIPLAYER } from '../config/tuning';
import { mulberry32, seedFrom } from '../src/lib/game/rng';
import { dugFraction, publicView } from '../src/lib/game/island';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape } from '../src/config/gridConfig';
import type { Rabbit } from '../src/lib/game/types';
import { verifySession } from '../src/lib/auth/jwt';
import { db } from '../src/lib/db';
import { players, runs, seasons } from '../src/lib/db/schema';
import { MemoryIslandStore, type LiveIsland } from './islands/store';
import { roomFor } from './islands/router';
import { markOffline, markOnline, setScore } from '../src/lib/leaderboard';
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

/** Everything a client needs to draw the island it just joined. */
function snapshot(live: LiveIsland) {
  const view = publicView(live.island);
  return {
    // The SEED, not the map: the client cuts the identical coastline from it.
    // Where the land is was never a secret; what is buried in it is.
    seed: view.seed,
    tier: view.tier,
    revealed: view.revealed,
    warnStage: live.warnStage,
    rabbits: [...live.rabbits.values()].map(publicRabbit),
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
 * The island is spent: sink it, and move everyone who is still alive onto a
 * fresh one. Carrots are already banked (they are credited at pickup), so an
 * eruption costs a player nothing but their position.
 */
async function erupt(live: LiveIsland) {
  if (live.erupting) return;
  live.erupting = true;
  const room = roomFor(live.island.id);
  io.to(room).emit('eruption', { islandId: live.island.id, durationMs: ERUPTION.SEQUENCE_MS });

  setTimeout(guard('erupt', async () => {
    const survivors = [...live.rabbits.values()].filter((r) => r.alive);
    const lifetime = Math.max(0, ...survivors.map((r) => r.carrots));
    const next = newIsland(lifetime);

    for (const rabbit of survivors) {
      const socket = socketOf(rabbit.playerId);
      // Energy and carrots ride along; the run continues, only the ground changed.
      const moved = spawnRabbit(rabbit.playerId, rabbit.name, rabbit.energy);
      moved.carrots = rabbit.carrots;
      next.rabbits.set(rabbit.playerId, moved);
      if (socket) {
        socket.leave(room);
        socket.join(roomFor(next.island.id));
        (socket.data as SocketData).islandId = next.island.id;
        socket.emit('island', snapshot(next));
      }
    }
    io.to(roomFor(next.island.id)).emit('rabbits', [...next.rabbits.values()].map(publicRabbit));
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
 */
async function bankRun(data: SocketData, rabbit: Rabbit) {
  if (!data.playerId || !data.runId) return;
  const carrots = rabbit.carrots;

  await db.update(players).set({
    stock: raw`${players.stock} + ${carrots}`,
    seasonScore: raw`${players.seasonScore} + ${carrots}`,
    lifetimeCarrots: raw`${players.lifetimeCarrots} + ${carrots}`,
    runsPlayed: raw`${players.runsPlayed} + 1`,
    tilesDug: raw`${players.tilesDug} + ${data.tilesDug ?? 0}`,
    lastSeenAt: new Date(),
  }).where(eq(players.id, data.playerId));

  await db.update(runs).set({
    carrots,
    tilesDug: data.tilesDug ?? 0,
    bombsHit: data.bombsHit ?? 0,
    durationMs: Date.now() - (data.runStartedAt ?? Date.now()),
    endedAt: new Date(),
  }).where(eq(runs.id, data.runId));

  // The carrots are banked in Postgres by this point, which is what matters.
  // Mirroring the score into Redis is a CACHE update — `rebuildLeaderboard`
  // restores it from Postgres — so it is not allowed to fail the banking that
  // already succeeded.
  await optional('setScore', async () => {
    const [row] = await db.select({ score: players.seasonScore })
      .from(players).where(eq(players.id, data.playerId!));
    const season = await currentSeason();
    if (row) await setScore(season.id, data.playerId!, row.score);
  });

  data.runId = undefined;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  const data = socket.data as SocketData;

  /**
   * Join a run. Drop-in: no lobby, no matchmaking — you land on the fullest
   * island that has room, or a new one if they are all full.
   */
  socket.on('join', guard('join', async () => {
    if (!data.playerId) return socket.emit('error_msg', { code: 'unauthenticated' });

    const player = await db.query.players.findFirst({ where: eq(players.id, data.playerId) });
    if (!player) return socket.emit('error_msg', { code: 'unknown_player' });
    data.name = player.name;
    data.lifetimeCarrots = player.lifetimeCarrots;

    const live = store.findJoinable() ?? newIsland(player.lifetimeCarrots);

    // A refresh returns to the same rabbit if the grace window has not lapsed.
    const existing = live.rabbits.get(data.playerId);
    const rabbit = existing ?? spawnRabbit(data.playerId, player.name, ENERGY.START);
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
      data.runId = run.id;
      data.runStartedAt = Date.now();
      data.bombsHit = 0;
      data.tilesDug = 0;
    }

    // Presence is a NICE-TO-HAVE. A Redis hiccup must not stop a player joining
    // a run — this used to throw straight out of the handler and take the whole
    // process, and everyone else's live island, with it.
    await optional('markOnline', () => markOnline(data.playerId!));
    socket.emit('island', snapshot(live));
    socket.to(roomFor(live.island.id)).emit('rabbit_joined', publicRabbit(rabbit));
  }));

  /**
   * Watch someone else's run.
   *
   * The front door to sabotage (phase 5): you pick a target on the leaderboard,
   * see what they see, and decide whether to spend a bomb on them. A spectator
   * joins the target's island ROOM — so it receives every reveal and every move
   * live — but is never given a rabbit, which is what makes watching harmless.
   */
  socket.on('spectate', guard('spectate', async (payload: { playerId?: unknown }) => {
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
   * A move intent. The DESTINATION TILE is the only thing the client chooses,
   * and even that is checked (adjacent, on land, off cooldown) — everything the
   * move then produces is decided here.
   *
   * A spectator has no rabbit on the island, so this falls through harmlessly:
   * watching cannot move anyone.
   */
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
    const out = resolveMove(live.island, rabbit, to, live.shape, rng);
    if (!out.ok) return socket.emit('move_rejected', { reason: out.rejection });

    const room = roomFor(live.island.id);

    if (out.dig) {
      data.tilesDug = (data.tilesDug ?? 0) + 1;
      if (out.dig.content === 'bomb') data.bombsHit = (data.bombsHit ?? 0) + 1;
      // A dug tile is revealed FOR EVERYONE — the shared map is the whole point
      // of the shared island. The carrot, however, went to the first digger only.
      io.to(room).emit('tile_revealed', {
        tile: out.dig.tile,
        content: out.dig.content,
        adjacent: out.dig.adjacent,
        dugBy: data.playerId,
        plantedBy: out.dig.plantedBy,
      });
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

    io.to(room).emit('rabbit_moved', publicRabbit(rabbit));
    // The mover alone gets the private detail (their loot, their knockback).
    socket.emit('move_result', out);

    if (out.runOver) {
      io.to(room).emit('rabbit_died', { playerId: data.playerId });
      void bankRun(data, rabbit).catch((e) => console.error('[bankRun]', e));
      socket.emit('run_over', {
        carrots: rabbit.carrots,
        tilesDug: data.tilesDug ?? 0,
        bombsHit: data.bombsHit ?? 0,
        durationMs: Date.now() - (data.runStartedAt ?? Date.now()),
      });
    }

    // Eruption clock. Checked per dig because a dig is the only thing that moves it.
    if (out.dig) {
      const fraction = dugFraction(live.island);
      const stage = warnStageFor(fraction);
      if (stage !== live.warnStage) {
        live.warnStage = stage;
        io.to(room).emit('volcano', { stage, dugFraction: fraction });
      }
      if (fraction >= ERUPTION.THRESHOLD) void erupt(live);
    }
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
  }));

  socket.on('disconnect', guard('disconnect', async () => {
    if (!data.playerId) return;
    // THE crash that took production down. This runs on every closed tab, so a
    // single bad second from Redis was enough to kill the server and end every
    // live run on it. Presence is not worth a run, let alone all of them.
    await optional('markOffline', () => markOffline(data.playerId!));
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
        io.to(roomFor(live.island.id)).emit('rabbit_left', { playerId, grace: false });
      }
    }
  }
  for (const dead of store.reapable(now)) store.delete(dead.island.id);
}), 5000);

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

httpServer.listen(PORT, () => {
  console.log(`[rr-ws] listening on :${PORT}`);
});
