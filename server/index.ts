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

import { ENERGY, ERUPTION, MIRAGE, MULTIPLAYER } from '../config/tuning';
import { mulberry32, seedFrom } from '../src/lib/game/rng';
import { dugFraction, publicView } from '../src/lib/game/island';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { mirageActive, planMirage, shownAdjacent } from '../src/lib/game/mirage';
import { strike } from '../src/lib/game/lightning';
import { makeShape, toColRow, toIndex } from '../src/config/gridConfig';
import { planFlock, type Ground } from '../src/lib/game/flee';
import { boardFor, terrainFor } from '../src/lib/game/terrainBoard';
import type { Rabbit } from '../src/lib/game/types';
import { verifySession } from '../src/lib/auth/jwt';
import { db } from '../src/lib/db';
import { inventory, players, runs, seasons } from '../src/lib/db/schema';
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

    // Anyone NOT moving on is finished here: the island they were on is about
    // to be deleted, and with it their rabbit. Bank before that happens, or a
    // run that ended on a bomb moments before the eruption is thrown away.
    for (const rabbit of live.rabbits.values()) {
      if (rabbit.alive) continue;
      void bankRun(rabbit).catch((e) => console.error('[bankRun:erupt]', e));
    }

    for (const rabbit of survivors) {
      const socket = socketOf(rabbit.playerId);
      // Energy and carrots ride along; the run continues, only the ground changed.
      const moved = spawnRabbit(rabbit.playerId, rabbit.name, rabbit.energy, next.island.seed);
      moved.carrots = rabbit.carrots;
      // ...and so does the run's paperwork. Without it the moved rabbit has no
      // run id, so whatever it digs on the new island can never be banked.
      moved.run = rabbit.run;
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

  await db.update(players).set({
    stock: raw`${players.stock} + ${carrots}`,
    seasonScore: raw`${players.seasonScore} + ${carrots}`,
    lifetimeCarrots: raw`${players.lifetimeCarrots} + ${carrots}`,
    runsPlayed: raw`${players.runsPlayed} + 1`,
    tilesDug: raw`${players.tilesDug} + ${run.tilesDug}`,
    lastSeenAt: new Date(),
  }).where(eq(players.id, playerId));

  await db.update(runs).set({
    carrots,
    tilesDug: run.tilesDug,
    bombsHit: run.bombsHit,
    durationMs: Date.now() - run.startedAt,
    endedAt: new Date(),
  }).where(eq(runs.id, runId));

  // Announced only now, after the row is written: the client answers this by
  // re-reading the burrow, and a notice that outran its own UPDATE would have it
  // read the old total and cache the very staleness this exists to clear.
  // The socket may be gone (a closed tab, a sweep banking for an absent player)
  // — the carrots are safe either way, and the next burrow load will show them.
  socketOf(playerId)?.emit('banked', { carrots });

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

    // A seat still held on some island is the one to return to — otherwise a
    // reconnecting player is dropped onto the fullest island instead and ends
    // up with TWO rabbits: the new one here, and the old seat ticking away
    // until the grace sweep banks it.
    const live = store.seatOf(data.playerId) ?? store.findJoinable() ?? newIsland(player.lifetimeCarrots);

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
      rabbit.run = { id: run.id, startedAt: Date.now(), tilesDug: 0, bombsHit: 0 };
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
      }
      io.to(room).emit('rabbit_pushed', {
        playerId: shove.playerId,
        from: shove.from,
        to: shove.to,
        // Rule 7: the victim always knows who did it — revenge is the point.
        pushedBy: shove.pushedBy,
        energy: shove.energy,
        runOver: shove.runOver,
      });
      const victim = live.rabbits.get(shove.playerId);
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
    io.to(room).emit('rabbit_moved', publicRabbit(rabbit));
    // The mover alone gets the private detail (their loot, their knockback).
    socket.emit('move_result', out);

    if (out.runOver) {
      io.to(room).emit('rabbit_died', { playerId: data.playerId });
      void bankRun(rabbit).catch((e) => console.error('[bankRun]', e));
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
    if (!live || !rabbit) return;

    await bankRun(rabbit).catch((e) => console.error('[bankRun:leave]', e));

    live.rabbits.delete(data.playerId);
    live.disconnectedAt.delete(data.playerId);
    socket.leave(roomFor(live.island.id));
    io.to(roomFor(live.island.id)).emit('rabbit_left', { playerId: data.playerId, grace: false });
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
