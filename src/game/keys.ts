/**
 * The two places the game is played, and what the boot needs to build them.
 *
 * Named rather than passed as strings at each call site: the scene keys are
 * shared between the boot, the swap and the React glue, and a typo in any of
 * them fails silently (show() simply finds nothing and the screen stays put).
 */
import type { BurrowSceneData } from './scenes/BurrowScene';
import type { IslandSceneData } from './scenes/IslandScene';

export const SCENE = {
  burrow: 'burrow',
  island: 'island',
} as const;

export type SceneKey = (typeof SCENE)[keyof typeof SCENE];

export interface BootData {
  burrow?: BurrowSceneData;
  island?: IslandSceneData;
  /** Fired once both scenes are built and the burrow is on screen. */
  onReady?: () => void;
}
