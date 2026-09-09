'use client';

/**
 * The game's single Pixi mount.
 *
 * ONE app, ONE boot, both scenes resident. The burrow and the island used to be
 * two routes, each building its own Pixi application from nothing — so crossing
 * between them re-decoded every texture and dropped the WebGL context, and the
 * game visibly stalled on a move a player makes constantly. Everything is now
 * paid for once, behind the loading screen, and crossing is a swap.
 *
 * React owns nothing here beyond the mount: the scenes are driven through refs,
 * because a re-render of the component holding the WebGL context is exactly
 * what this boundary exists to prevent.
 */
import { useEffect, useRef } from 'react';
import { createApp, type GameApp } from '@/game/Application';
import { BootScene } from '@/game/scenes/BootScene';
import { SCENE, type SceneKey } from '@/game/keys';
import type { IslandScene } from '@/game/scenes/IslandScene';
import type { BurrowScene } from '@/game/scenes/BurrowScene';

export interface GameHandles {
  island: IslandScene;
  burrow: BurrowScene;
  /** Cross between the two. No teardown, no reload. */
  show(key: SceneKey): void;
}

export interface GameCanvasProps {
  seed: string;
  playerId: string;
  onMoveIntent(tileIndex: number): void;
  onPlaceTrap(tile: number): void;
  /** Both scenes are built and the burrow is showing. */
  onReady(handles: GameHandles): void;
}

export function GameCanvas({ seed, playerId, onMoveIntent, onPlaceTrap, onReady }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<GameApp | null>(null);

  // Callbacks are read through refs rather than captured. The mount effect
  // deliberately does not re-run when their identity changes — rebuilding the
  // whole game for that is the churn this boundary prevents — so capturing them
  // would leave the scenes calling stale handlers.
  // The seed at mount time. Later changes go through `setIsland`, never
  // through a remount — see the effect's dependency list.
  const seedRef = useRef(seed);
  const moveRef = useRef(onMoveIntent);
  const trapRef = useRef(onPlaceTrap);
  const readyRef = useRef(onReady);
  moveRef.current = onMoveIntent;
  trapRef.current = onPlaceTrap;
  readyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    void (async () => {
      // `onReady` fires from INSIDE createApp, before it has returned, so it
      // cannot close over `app` — it reads the manager through this box, which
      // the boot fills in as soon as it exists.
      const ref: { scenes: GameApp['scenes'] | null } = { scenes: null };

      const app = await createApp(host, {
        island: {
          seed: seedRef.current,
          playerId,
          onMoveIntent: (tile) => moveRef.current(tile),
        },
        burrow: {
          traps: [],
          placing: false,
          onPlace: (tile) => trapRef.current(tile),
        },
        onReady: () => {
          if (disposed) return;
          const scenes = ref.scenes;
          if (!scenes) return;
          const island = scenes.resident_get(SCENE.island) as IslandScene | null;
          const burrow = scenes.resident_get(SCENE.burrow) as BurrowScene | null;
          if (island && burrow) {
            readyRef.current({
              island,
              burrow,
              show: (key) => { scenes.show(key); },
            });
          }
        },
      }, (scenes) => { ref.scenes = scenes; });
      if (disposed) { app.destroy(); return; }
      appRef.current = app;
    })();

    return () => {
      disposed = true;
      appRef.current?.destroy();
      appRef.current = null;
    };
    // NOTHING but the player forces a rebuild.
    //
    // `seed` was in this list, and it made the app tear itself down mid-boot: it
    // mounts with a placeholder, the server answers with the real island, the
    // prop changes, everything is rebuilt — and the new scene has already
    // missed the `island` event carrying the rabbits. Changing island is now a
    // method on the live scene (see IslandScene.setIsland), not a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0 }} />;
}
