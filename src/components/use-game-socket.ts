'use client';

/**
 * The socket client. Mirrors the server's event vocabulary exactly.
 *
 * This holds the client's COPY of the island, built from what the server sends.
 * It is not a second source of truth: every tile here arrived in a
 * `tile_revealed`, and the client never guesses what is under an unrevealed
 * tile because it genuinely does not know.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Direction } from '@/lib/game/types';

export interface ClientTile {
  revealed: boolean;
  content?: string;
  adjacent?: number;
  dugBy?: string;
}

export interface ClientRabbit {
  playerId: string;
  name: string;
  x: number;
  y: number;
  energy: number;
  carrots: number;
  alive: boolean;
  crowned: boolean;
}

export interface ClientIsland {
  id: string;
  width: number;
  height: number;
  tier: string;
  tiles: ClientTile[];
}

export interface RunRecap {
  carrots: number;
  tilesDug: number;
  bombsHit: number;
  durationMs: number;
}

export function useGameSocket(token: string | null, playerId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [island, setIsland] = useState<ClientIsland | null>(null);
  const [rabbits, setRabbits] = useState<Map<string, ClientRabbit>>(new Map());
  const [warnStage, setWarnStage] = useState(0);
  const [erupting, setErupting] = useState(false);
  const [recap, setRecap] = useState<RunRecap | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3010', {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join');
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('island', (snap: { island: ClientIsland; warnStage: number; rabbits: ClientRabbit[] }) => {
      setIsland(snap.island);
      setWarnStage(snap.warnStage);
      setErupting(false);
      setRecap(null);
      setRabbits(new Map(snap.rabbits.map((r) => [r.playerId, r])));
    });

    // A dug tile is revealed for everyone on the island — including the tile
    // someone ELSE dug, which is how the shared race stays legible.
    socket.on('tile_revealed', (t: { x: number; y: number; content: string; adjacent: number; dugBy: string }) => {
      setIsland((prev) => {
        if (!prev) return prev;
        const tiles = prev.tiles.slice();
        tiles[t.y * prev.width + t.x] = { revealed: true, content: t.content, adjacent: t.adjacent, dugBy: t.dugBy };
        return { ...prev, tiles };
      });
    });

    const upsert = (r: ClientRabbit) =>
      setRabbits((prev) => new Map(prev).set(r.playerId, r));
    socket.on('rabbit_moved', upsert);
    socket.on('rabbit_joined', upsert);
    socket.on('rabbit_left', ({ playerId: gone, grace }: { playerId: string; grace: boolean }) => {
      // A player in the reconnect grace window is still shown — they are
      // refreshing, not gone, and blinking their rabbit out and back is worse.
      if (grace) return;
      setRabbits((prev) => {
        const next = new Map(prev);
        next.delete(gone);
        return next;
      });
    });

    socket.on('volcano', ({ stage }: { stage: number }) => setWarnStage(stage));
    socket.on('eruption', () => setErupting(true));
    socket.on('run_over', (r: RunRecap) => setRecap(r));

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token]);

  const move = useCallback((dir: Direction) => {
    socketRef.current?.emit('move', { dir });
  }, []);

  /** New run after death — the server drops the old seat and re-drops you in. */
  const restart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('restart');
    socket.once('restarting', () => socket.emit('join'));
  }, []);

  const me = playerId ? rabbits.get(playerId) ?? null : null;
  return { island, rabbits, me, warnStage, erupting, recap, connected, move, restart };
}
