/**
 * THE STAGE — scenario setup for a LOCAL rr-ws, never in production.
 *
 *   RR_STAGE=1 WS_PORT=3012 bun run server/index.ts
 *   bun run tools/scenarios/late-game.ts
 *
 * A scenario needs a rabbit standing next to a bomb, or on the shore. The
 * content seed is secret (see `generateIsland`), so a client can neither find
 * a bomb nor walk to a precise tile without playing a whole run first. This
 * hook arranges the board and nothing else: it moves rabbits, buries or clears
 * a tile, sets a bar. The PLAY that follows goes through the ordinary handlers
 * (`move`, `lightning`, `plant`, `spectate`), which is what is under test.
 *
 * Registered only when RR_STAGE=1; without it the event does not exist.
 */
import type { Socket } from 'socket.io';
import { recomputeAdjacency } from '../src/lib/game/island';
import { spawnTile } from '../src/lib/game/terrainBoard';
import type { MemoryIslandStore } from './islands/store';

export const STAGE_ON = process.env.RR_STAGE === '1';

type Op =
  | { op: 'where'; islandId: string }
  | { op: 'place'; islandId: string; playerId: string; tile: number }
  | { op: 'energy'; islandId: string; playerId: string; energy: number }
  | { op: 'open'; islandId: string; tile: number }
  | { op: 'bury'; islandId: string; tile: number }
  | { op: 'nosheep'; islandId: string }
  | { op: 'follow'; watcherId: string; playerId: string }
  | { op: 'caption'; watcherId: string; text: string };

export function installStage(
  socket: Socket,
  store: MemoryIslandStore,
  socketOf: (playerId: string) => Socket | undefined,
): void {
  if (!STAGE_ON) return;
  // LES LOGS DU BANC : ce que chaque socket demande, et ce qu'on lui refuse.
  const who = () => String((socket.data as { name?: string; playerId?: string }).name
    ?? (socket.data as { playerId?: string }).playerId ?? socket.id).slice(0, 24);
  const LOUD_IN = new Set(['join', 'leave', 'spectate', 'lightning', 'bloop', 'mirage', 'watch_presence', 'restart']);
  const LOUD_OUT = new Set(['error_msg', 'move_rejected', 'lightning_rejected', 'plant_rejected', 'flag_rejected',
    'bloop_rejected', 'rabbit_inked', 'leave_rejected', 'lightning_struck', 'rabbit_struck', 'rabbit_pushed', 'run_over', 'presence_all', 'presence']);
  socket.onAny((ev: string, payload: unknown) => {
    if (LOUD_IN.has(ev)) console.log(`[sock <] ${who()} ${ev} ${JSON.stringify(payload ?? null).slice(0, 160)}`);
  });
  socket.onAnyOutgoing((ev: string, payload: unknown) => {
    if (ev === 'island') {
      const snap = payload as { seed?: string; rabbits?: Array<{ name?: string }> };
      console.log(`[sock >] ${who()} island ${String(snap?.seed).slice(0, 16)} rabbits=${(snap?.rabbits ?? []).map((r) => r.name).join(',')}`);
      return;
    }
    if (LOUD_OUT.has(ev)) console.log(`[sock >] ${who()} ${ev} ${JSON.stringify(payload ?? null).slice(0, 160)}`);
  });
  socket.on('disconnect', (why) => console.log(`[sock x] ${who()} ${why}`));
  // The watcher clicked its banner: the runner (listening on its director
  // socket) plays the next beat. Local only, so a broadcast is fine.
  socket.on('__next', () => { socket.nsp.emit('__next'); });
  socket.on('__stage', (req: Op, ack?: (res: unknown) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    // A Godot client watching the scenario: told whom to spectate next. It
    // then asks `spectate` itself, like the season board's « watch » does.
    // The case being played, written on the watcher's screen.
    if (req?.op === 'caption') {
      const watcher = socketOf(req.watcherId);
      if (!watcher) return reply({ error: 'watcher-offline' });
      watcher.emit('__caption', { text: req.text });
      return reply({ ok: true });
    }
    if (req?.op === 'follow') {
      const watcher = socketOf(req.watcherId);
      if (!watcher) return reply({ error: 'watcher-offline' });
      watcher.emit('__follow', { playerId: req.playerId });
      return reply({ ok: true });
    }
    const live = store.get((req as { islandId: string }).islandId);
    if (!live) return reply({ error: 'no-island' });
    const { island } = live;

    switch (req.op) {
      case 'where': {
        const bombs: number[] = [];
        const chests: number[] = [];
        for (const [i, t] of island.tiles) {
          if (t.revealed) continue;
          if (t.content === 'bomb') bombs.push(i);
          if (t.content === 'chest') chests.push(i);
        }
        return reply({
          seed: island.seed,
          level: live.level,
          solo: live.solo,
          spawn: spawnTile(island.seed),
          tiles: [...island.tiles.keys()],
          revealed: [...island.tiles].filter(([, t]) => t.revealed).map(([i]) => i),
          hinted: [...island.tiles].filter(([, t]) => t.hinted && !t.revealed).map(([i]) => i),
          bombs,
          chests,
          sheep: [...live.sheep.values()],
          rabbits: [...live.rabbits.values()].map((r) => ({
            playerId: r.playerId, tile: r.tile, energy: r.energy, level: r.level, alive: r.alive,
          })),
        });
      }
      case 'place': {
        const r = live.rabbits.get(req.playerId);
        if (!r) return reply({ error: 'no-rabbit' });
        r.tile = req.tile;
        r.cameFrom = undefined;
        r.lastMoveAt = 0;
        r.stunnedUntil = 0;
        return reply({ ok: true });
      }
      case 'energy': {
        const r = live.rabbits.get(req.playerId);
        if (!r) return reply({ error: 'no-rabbit' });
        r.energy = req.energy;
        return reply({ ok: true });
      }
      case 'open': {
        const t = island.tiles.get(req.tile);
        if (!t) return reply({ error: 'off-island' });
        const wasBomb = t.content === 'bomb';
        if (t.content === 'bomb' || t.content === 'chest') t.content = 'empty';
        t.revealed = true;
        if (wasBomb) recomputeAdjacency(island, live.shape);
        return reply({ ok: true, adjacent: t.adjacent });
      }
      case 'bury': {
        const t = island.tiles.get(req.tile);
        if (!t) return reply({ error: 'off-island' });
        t.content = 'bomb';
        t.revealed = false;
        t.hinted = false;
        delete t.plantedBy;
        recomputeAdjacency(island, live.shape);
        return reply({ ok: true });
      }
      case 'nosheep': {
        live.sheep.clear();
        return reply({ ok: true });
      }
    }
  });
}
