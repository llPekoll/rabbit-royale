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
  /**
   * Cross with the carrot iris closed over the cut.
   *
   * `atCut` runs at the pitch-black midpoint, alongside the scene swap — that
   * is where a caller puts its OWN change of screen (React chrome, say), so
   * the HUD never appears over the place it does not belong to. Resolves once
   * the shutter is fully open again.
   */
  wipeTo(key: SceneKey, atCut?: () => void): Promise<void>;
  /**
   * The same iris, over a change that stays on ONE scene.
   *
   * Entering a raid, leaving one, opening the trap grid: the scene does not
   * swap, but the SCREEN does — a stranger's board replaces yours, or a picture
   * of a home becomes a grid to make a decision on. Those read as changes of place
   * to the player even though nothing is remounted, so they get the same
   * punctuation. Without a key to `show`, the midpoint is the caller's alone.
   */
  wipeOver(atCut: () => void | Promise<void>): Promise<void>;
}

export interface GameCanvasProps {
  seed: string;
  playerId: string;
  onMoveIntent(tileIndex: number): void;
  /** A minable tile was tapped while placing. `mined` says whether it already
   *  holds a bomb — the tap takes it back up rather than putting one down. */
  onToggleTrap(tile: number, mined: boolean): void;
  /** Both scenes are built and the burrow is showing. */
  onReady(handles: GameHandles): void;
}

export function GameCanvas({ seed, playerId, onMoveIntent, onToggleTrap, onReady }: GameCanvasProps) {
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
  const trapRef = useRef(onToggleTrap);
  const readyRef = useRef(onReady);
  moveRef.current = onMoveIntent;
  trapRef.current = onToggleTrap;
  readyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    void (async () => {
      // `onReady` fires from INSIDE createApp, before it has returned, so it
      // cannot close over `app` — it reads the manager through this box, which
      // the boot fills in as soon as it exists.
      const ref: { scenes: GameApp['scenes'] | null; app: GameApp | null } = {
        scenes: null,
        app: null,
      };

      const app = await createApp(host, {
        island: {
          seed: seedRef.current,
          playerId,
          onMoveIntent: (tile) => moveRef.current(tile),
        },
        burrow: {
          // The player's own id IS their burrow's seed: the ground is grown
          // from it on both sides (see game/burrow/board), so the homestead
          // drawn here is the one the server validates raids against.
          seed: playerId,
          traps: [],
          placing: false,
          onToggle: (tile, mined) => trapRef.current(tile, mined),
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
              wipeTo: (key, atCut) => {
                const wipe = ref.app?.wipe;
                // No shutter yet (an early press during boot) is not a reason
                // to refuse the move — cross bare rather than not at all.
                if (!wipe) { scenes.show(key); atCut?.(); return Promise.resolve(); }
                return wipe.play(() => { scenes.show(key); atCut?.(); });
              },
              wipeOver: (atCut) => {
                const wipe = ref.app?.wipe;
                // Same rule as wipeTo: the change always happens, the flourish
                // is what is optional.
                if (!wipe) return Promise.resolve(atCut()).then(() => {});
                return wipe.play(atCut);
              },
            });
          }
        },
      }, (scenes) => { ref.scenes = scenes; });
      if (disposed) { app.destroy(); return; }
      ref.app = app;
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
