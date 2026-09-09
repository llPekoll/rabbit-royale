'use client';

/**
 * Mounts the Pixi game and wires it to the socket.
 *
 * The React side owns NOTHING about the game: it creates the app, hands the
 * scene a callback for move intent, and forwards server events in. Pixi draws,
 * the server decides, React is only the glue between them.
 */
import { useEffect, useRef } from 'react';
import { createApp, type GameApp } from '@/game/Application';
import { IslandScene, type IslandSceneData } from '@/game/scenes/IslandScene';

export interface GameCanvasProps {
  seed: string;
  playerId: string;
  onMoveIntent(tileIndex: number): void;
  /** Handed the live scene once it exists, so the socket layer can drive it. */
  onSceneReady(scene: IslandScene): void;
}

export function GameCanvas({ seed, playerId, onMoveIntent, onSceneReady }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Held in a ref so a re-render never re-creates the Pixi app — that would
  // drop the WebGL context and restart the run visually.
  const appRef = useRef<GameApp | null>(null);

  // The callbacks are read through refs rather than captured by the effect.
  // The effect deliberately does NOT re-run when they change (rebuilding the
  // whole board because a prop identity moved is exactly the re-render churn
  // this boundary exists to prevent), so capturing them directly would leave
  // the scene calling a stale handler — the bug that would bite the moment
  // `spectating` flips and moves silently stopped working.
  const moveRef = useRef(onMoveIntent);
  const readyRef = useRef(onSceneReady);
  moveRef.current = onMoveIntent;
  readyRef.current = onSceneReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    void (async () => {
      const app = await createApp(host);
      if (disposed) { app.destroy(); return; }
      appRef.current = app;

      const data: IslandSceneData = {
        seed,
        playerId,
        onMoveIntent: (tile) => moveRef.current(tile),
      };
      await app.scenes.start(IslandScene, data);
      const scene = app.scenes.currentScene as IslandScene | null;
      if (scene) readyRef.current(scene);
    })();

    return () => {
      disposed = true;
      appRef.current?.destroy();
      appRef.current = null;
    };
    // The island's seed is what identifies a board. A new seed is a new island,
    // and rebuilding is exactly the right response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, playerId]);

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0 }} />;
}
