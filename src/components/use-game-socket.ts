'use client';

/**
 * The socket client.
 *
 * Two consumers, deliberately split:
 *  - the SCENE gets tile reveals and rabbit movement, pushed straight in. Those
 *    fire many times a second and each one starts an animation; routing them
 *    through React state would re-render the page per dug tile and fight the
 *    engine's own tweens.
 *  - REACT state holds only what the HUD shows (energy, carrots, the recap),
 *    which changes rarely and belongs in the render tree.
 *
 * Nothing here is a second source of truth. Every tile this hook knows about
 * arrived in a `tile_revealed`; it never guesses what is under an unrevealed
 * one, because it genuinely does not know.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { TileContent } from '@/lib/game/types';
import type { IslandScene } from '@/game/scenes/IslandScene';

export interface ClientRabbit {
  playerId: string;
  name: string;
  tile: number;
  energy: number;
  carrots: number;
  alive: boolean;
  crowned: boolean;
}

/** What the server sends when you land on an island. */
export interface IslandSnapshot {
  seed: string;
  warnStage: number;
  rabbits: ClientRabbit[];
  revealed: Array<{ tile: number; content: TileContent; adjacent: number }>;
}

/**
 * A finished run, once its carrots are actually in Postgres.
 *
 * Not the same moment as `run_over`: that one is the RULE (the tank is empty,
 * the rabbit is out), and it is emitted alongside the write rather than after
 * it. This one is the RECEIPT, and it is the only point at which re-reading the
 * burrow is guaranteed to see the run. It also covers the exits `run_over` does
 * not — walking home with a full sack is the ordinary way to end a run, and it
 * never produced a recap at all.
 */
export interface Banked {
  carrots: number;
}

export interface RunRecap {
  carrots: number;
  tilesDug: number;
  bombsHit: number;
  durationMs: number;
}

/** Resolves the live scene, or null before Pixi has finished booting. */
type SceneGetter = () => IslandScene | null;

export function useGameSocket(
  token: string | null,
  playerId: string | null,
  spectate?: string | null,
) {
  const socketRef = useRef<Socket | null>(null);
  const sceneRef = useRef<SceneGetter>(() => null);
  /** Events that arrived before the scene existed, replayed once it does. */
  const pendingRef = useRef<Array<(s: IslandScene) => void>>([]);

  const [wsUrl, setWsUrl] = useState<string | null>(null);
  /**
   * The last island snapshot, kept so it can be replayed.
   *
   * The scene may be rebuilt AFTER the snapshot arrives — a new island re-cuts
   * the coastline and clears the board — and the tiles and rabbits it carried
   * would otherwise be lost with the old board.
   */
  const snapshotRef = useRef<IslandSnapshot | null>(null);
  const [islandSeed, setIslandSeed] = useState<string | null>(null);
  const [rabbits, setRabbits] = useState<Map<string, ClientRabbit>>(new Map());
  const [warnStage, setWarnStage] = useState(0);
  const [recap, setRecap] = useState<RunRecap | null>(null);
  const [connected, setConnected] = useState(false);
  /**
   * Bumped each time a run's carrots land in the database.
   *
   * A counter rather than the amount, because the amount is not what the
   * consumer needs: it re-reads the burrow for the authoritative total, and two
   * runs that happened to bank the same number must still be two events.
   */
  const [banked, setBanked] = useState(0);

  /** Apply to the scene now, or queue it until the scene exists. */
  const toScene = useCallback((fn: (s: IslandScene) => void) => {
    const scene = sceneRef.current();
    if (scene) fn(scene);
    else pendingRef.current.push(fn);
  }, []);

  const bindScene = useCallback((getter: SceneGetter) => {
    sceneRef.current = getter;
    const scene = getter();
    if (!scene) return;
    // Drain whatever arrived while Pixi was still loading its atlases — without
    // this, the tiles dug during the boot would stay face-down forever.
    const queued = pendingRef.current;
    pendingRef.current = [];
    for (const fn of queued) fn(scene);
  }, []);

  // The WS URL is fetched, not baked: see /api/config for why.
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setWsUrl(c.wsUrl || window.location.origin))
      .catch(() => setWsUrl(window.location.origin));
  }, []);

  useEffect(() => {
    if (!token || !wsUrl) return;
    const socket = io(wsUrl, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit(spectate ? 'spectate' : 'join', spectate ? { playerId: spectate } : undefined);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('island', (snap: IslandSnapshot) => {
      snapshotRef.current = snap;
      setIslandSeed(snap.seed);
      setWarnStage(snap.warnStage);
      setRecap(null);
      setRabbits(new Map(snap.rabbits.map((r) => [r.playerId, r])));
      // A joiner lands mid-run on an island others have been digging, so the
      // snapshot carries what is already uncovered.
      toScene((s) => {
        for (const t of snap.revealed) s.revealTile(t.tile, t.content, t.adjacent);
        snap.rabbits.forEach((r, i) => s.addRabbit(r.playerId, r.name, r.tile, i, r.energy));
      });
    });

    socket.on('tile_revealed', (t: { tile: number; content: TileContent; adjacent: number }) => {
      toScene((s) => s.revealTile(t.tile, t.content, t.adjacent));
    });

    /**
     * Numbers on already-dug ground changed.
     *
     * A mirage landing, or lifting. The client is deliberately NOT told which
     * it is, or that the numbers are false at all: being told you are being
     * lied to defeats the item, and finding out is the whole point. It just
     * redraws the tiles it is given.
     */
    /**
     * A lightning strike landed on this island.
     *
     * Played BEFORE the reveals that follow it: the bolt is the cause and the
     * opened ground is the consequence, and a flash arriving after its own
     * result reads as a delayed effect rather than as a strike.
     */
    socket.on('lightning_struck', (p: { target: number; tiles: number[] }) => {
      toScene((s) => s.playLightning(p.target, p.tiles));
    });

    socket.on('hints_changed', (p: { tiles: Array<{ tile: number; adjacent: number }> }) => {
      toScene((s) => { for (const t of p.tiles) s.setHint(t.tile, t.adjacent); });
    });

    socket.on('rabbit_moved', (r: ClientRabbit) => {
      // One line per move, in the browser console. "My counter did not move"
      // has been unreproducible from the server side — everything there pays
      // correctly — so the question is what actually ARRIVES here, and whether
      // the id it arrives under is the one the HUD looks itself up by.
      if (r.playerId === playerId) {
        console.log('[rr] rabbit_moved: carrots=%d energy=%d tile=%d (me=%s)',
          r.carrots, r.energy, r.tile, playerId);
      }
      setRabbits((prev) => new Map(prev).set(r.playerId, r));
      toScene((s) => s.moveRabbit(r.playerId, r.tile, r.energy));
    });

    socket.on('rabbit_joined', (r: ClientRabbit) => {
      setRabbits((prev) => {
        const next = new Map(prev).set(r.playerId, r);
        toScene((s) => s.addRabbit(r.playerId, r.name, r.tile, next.size - 1, r.energy));
        return next;
      });
    });

    socket.on('rabbit_left', ({ playerId: gone, grace }: { playerId: string; grace: boolean }) => {
      // Someone in the reconnect window is refreshing, not gone. Blinking their
      // rabbit out and straight back in is worse than leaving it standing.
      if (grace) return;
      setRabbits((prev) => {
        const next = new Map(prev);
        next.delete(gone);
        return next;
      });
      toScene((s) => s.removeRabbit(gone));
    });

    socket.on('bomb_hit', (
      { playerId: hit, tile, stunMs }:
      { playerId: string; tile: number; stunMs?: number },
    ) => {
      // The server sends how long the stun still has to run; the deadline is
      // put on OUR clock here, so a skewed client still darkens the ring for
      // the right length of time.
      const until = stunMs === undefined ? undefined : Date.now() + stunMs;
      toScene((s) => s.bombHit(hit, tile, until));
    });

    socket.on('rabbit_died', ({ playerId: dead }: { playerId: string }) => {
      toScene((s) => s.killRabbit(dead));
    });

    socket.on('volcano', ({ stage }: { stage: number }) => setWarnStage(stage));
    socket.on('run_over', (r: RunRecap) => setRecap(r));
    // The carrots are in Postgres NOW, so whatever shows the total may go and
    // read it. See `Banked`: this is deliberately not `run_over`.
    socket.on('banked', (_b: Banked) => setBanked((n) => n + 1));

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token, wsUrl, spectate, toScene]);

  /**
   * Paint the last snapshot onto the board again.
   *
   * Called after the scene has switched island: `setIsland` clears the tiles
   * and rabbits, so what the server already told us has to be re-applied.
   */
  const resync = useCallback(() => {
    const snap = snapshotRef.current;
    const scene = sceneRef.current();
    if (!snap || !scene) return;
    for (const t of snap.revealed) scene.revealTile(t.tile, t.content, t.adjacent);
    snap.rabbits.forEach((r, i) => scene.addRabbit(r.playerId, r.name, r.tile, i, r.energy));
  }, []);

  /** Ask to step onto a tile. The server decides whether it happens. */
  const moveTo = useCallback((tile: number) => {
    socketRef.current?.emit('move', { tile });
  }, []);

  const restart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('restart');
    socket.once('restarting', () => socket.emit('join'));
  }, []);

  /**
   * Give up the seat and BANK the run.
   *
   * Going back to the burrow does not close this socket — the burrow needs it
   * too — so without telling the server, the rabbit just sat on the island
   * holding its carrots until the island was reaped, and they were lost. The
   * server banks on `leave`, so carrying a sack home is worth exactly what
   * running the tank dry is.
   */
  const leave = useCallback(() => {
    socketRef.current?.emit('leave');
  }, []);

  const me = playerId ? rabbits.get(playerId) ?? null : null;
  return {
    islandSeed, rabbits, me, warnStage, recap, banked, connected,
    moveTo, restart, leave, bindScene, resync,
  };
}
