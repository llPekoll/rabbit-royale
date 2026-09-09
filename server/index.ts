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
import type { Direction, Rabbit } from '../src/lib/game/types';
import { verifySession } from '../src/lib/auth/jwt';
import { db } from '../src/lib/db';
import { players, runs, seasons } from '../src/lib/db/schema';
import { MemoryIslandStore, type LiveIsland } from './islands/store';
import { roomFor } from './islands/router';
import { markOffline, markOnline, setScore } from './redis';

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
}

const httpServer = http.createServer((req, res) => {
  // Health + a cheap operational window into what the box is actually doing.
  if (req.url === '/health') {
    const islands = [...store.all()];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      islands: islands.length,
      rabbits: islands.reduce((n, i) => n + i.rabbits.size, 0),
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
  const auth = socket.handshake.auth as { token?: string };
  if (auth?.token) {
    const claims = await verifySession(auth.token);
    if (claims?.sub) {
      const data = socket.data as SocketData;
      data.playerId = claims.sub;
      data.name = claims.name || 'Rabbit';
    }
  }
  next();
});

// ── Island helpers ───────────────────────────────────────────────────────────

function newIsland(lifetimeCarrots: number): LiveIsland {
  return store.create(randomUUID(), lifetimeCarrots);
}

/** Everything a client needs to draw the island it just joined. */
function snapshot(live: LiveIsland) {
  return {
    island: publicView(live.island),
    warnStage: live.warnStage,
    rabbits: [...live.rabbits.values()].map(publicRabbit),
  };
}

/** A rabbit as OTHERS may see it. Deliberately the same shape for everyone —
 *  there is nothing secret about a rabbit, only about the ground. */
const publicRabbit = (r: Rabbit) => ({
  playerId: r.playerId,
  name: r.name,
  x: r.x,
  y: r.y,
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

  setTimeout(async () => {
    const survivors = [...live.rabbits.values()].filter((r) => r.alive);
    const lifetime = Math.max(0, ...survivors.map((r) => r.carrots));
    const next = newIsland(lifetime);

    for (const rabbit of survivors) {
      const socket = socketOf(rabbit.playerId);
      // Energy and carrots ride along; the run continues, only the ground changed.
      const moved = spawnRabbit(next.island, rabbit.playerId, rabbit.name, rabbit.energy);
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
  }, ERUPTION.SEQUENCE_MS);
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

  // Mirror the new score into the leaderboard's sorted set.
  const [row] = await db.select({ score: players.seasonScore })
    .from(players).where(eq(players.id, data.playerId));
  const season = await currentSeason();
  if (row) await setScore(season.id, data.playerId, row.score);

  data.runId = undefined;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  const data = socket.data as SocketData;

  /**
   * Join a run. Drop-in: no lobby, no matchmaking — you land on the fullest
   * island that has room, or a new one if they are all full.
   */
  socket.on('join', async () => {
    if (!data.playerId) return socket.emit('error_msg', { code: 'unauthenticated' });

    const player = await db.query.players.findFirst({ where: eq(players.id, data.playerId) });
    if (!player) return socket.emit('error_msg', { code: 'unknown_player' });
    data.name = player.name;
    data.lifetimeCarrots = player.lifetimeCarrots;

    const live = store.findJoinable() ?? newIsland(player.lifetimeCarrots);

    // A refresh returns to the same rabbit if the grace window has not lapsed.
    const existing = live.rabbits.get(data.playerId);
    const rabbit = existing ?? spawnRabbit(live.island, data.playerId, player.name, ENERGY.START);
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

    await markOnline(data.playerId);
    socket.emit('island', snapshot(live));
    socket.to(roomFor(live.island.id)).emit('rabbit_joined', publicRabbit(rabbit));
  });

  /**
   * A move intent. The direction is the ONLY thing the client gets to choose;
   * everything the move produces is decided here.
   */
  socket.on('move', (payload: { dir?: unknown }) => {
    if (!data.playerId || !data.islandId) return;
    const dir = payload?.dir;
    if (dir !== 'up' && dir !== 'down' && dir !== 'left' && dir !== 'right') return;

    const live = store.get(data.islandId);
    if (!live || live.erupting) return;
    const rabbit = live.rabbits.get(data.playerId);
    if (!rabbit) return;

    // The dig RNG is seeded per (island, tile, player) so a chest's contents are
    // fixed the moment the island exists — replayable, and not re-rollable by a
    // client that disconnects on a bad drop.
    const rng = mulberry32(seedFrom(`${live.island.seed}:${rabbit.x},${rabbit.y}:${dir}`));
    const out = resolveMove(live.island, rabbit, dir as Direction, rng);
    if (!out.ok) return socket.emit('move_rejected', { reason: out.rejection });

    const room = roomFor(live.island.id);

    if (out.dig) {
      data.tilesDug = (data.tilesDug ?? 0) + 1;
      if (out.dig.content === 'bomb') data.bombsHit = (data.bombsHit ?? 0) + 1;
      // A dug tile is revealed FOR EVERYONE — the shared map is the whole point
      // of the shared island. The carrot, however, went to the first digger only.
      io.to(room).emit('tile_revealed', {
        x: out.dig.x, y: out.dig.y,
        content: out.dig.content, adjacent: out.dig.adjacent,
        dugBy: data.playerId,
        plantedBy: out.dig.plantedBy,
      });
    }

    io.to(room).emit('rabbit_moved', publicRabbit(rabbit));
    // The mover alone gets the private detail (their loot, their knockback).
    socket.emit('move_result', out);

    if (out.runOver) {
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
  });

  /** Start a fresh run after dying, without a reconnect. */
  socket.on('restart', async () => {
    if (!data.playerId || !data.islandId) return;
    const live = store.get(data.islandId);
    const old = live?.rabbits.get(data.playerId);
    if (old?.alive) return; // A live run is not restartable — finish or leave.
    live?.rabbits.delete(data.playerId);
    socket.leave(roomFor(data.islandId));
    data.islandId = undefined;
    socket.emit('restarting');
  });

  socket.on('disconnect', async () => {
    if (!data.playerId) return;
    await markOffline(data.playerId);
    const live = data.islandId ? store.get(data.islandId) : undefined;
    if (!live) return;

    // The seat is HELD, not freed: a browser refresh must not end a run
    // (BUILD-PLAN phase 3). A sweep frees it once the grace window lapses.
    live.disconnectedAt.set(data.playerId, Date.now());
    io.to(roomFor(live.island.id)).emit('rabbit_left', { playerId: data.playerId, grace: true });
  });
});

// ── Sweeps ───────────────────────────────────────────────────────────────────
// Two janitors, both cheap and both idempotent: expired reconnect grace, and
// islands nobody is on. Neither is on the hot path.
setInterval(() => {
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
}, 5000);

httpServer.listen(PORT, () => {
  console.log(`[rr-ws] listening on :${PORT}`);
});
