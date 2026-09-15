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
  /**
   * Which scene the boot ends on. The burrow, unless told otherwise: it is
   * home, and where a returning player lands. A brand-new player is opened
   * on the ISLAND instead — their first run is the tutorial, and a burrow
   * they have nothing to do in yet must not be the first thing they see, not
   * even for the length of a wipe.
   */
  openOn?: SceneKey;
  /** Fired once both scenes are built and `openOn` is on screen. */
  onReady?: () => void;
}
