/**
 * How the water looks, in ONE place.
 *
 * The surf and the ducks are built by two scenes — the island
 * (`TerrainBackground`) and the homestead (`BurrowTerrain`) — and tuned in a
 * third, the `Island/Water` stories. Three copies of the same numbers is how
 * the two places drift apart: the island gets a tweak, the burrow keeps the old
 * shade, and the game shows two different seas depending on which screen you
 * are on.
 *
 * These are the values the story's controls settled on. The story keeps its own
 * sliders — that is what it is for — but its DEFAULTS and the game's constants
 * are the same numbers, so what was tuned there is what ships here.
 */

/** The pack's surf, as `createPackWater` takes it. */
export const WATER_LOOK = {
  /** Milliseconds per surf frame. */
  frameMs: 140,
  /** How far neighbouring cells fall out of step, so the coast travels. */
  phase: 1,
  foamAlpha: 1,
  /** The pale green-white of the pack's foam. */
  foamColor: 0xc6f0db,
  /**
   * Slightly under 1: the overhang is baked into the frame, so this tucks the
   * surf a little further under the land rather than making it join up.
   */
  overlap: 0.88,
} as const;

/** The flock, as `createDucks` takes it. */
export const DUCK_LOOK = {
  count: 4,
  /** Cells per second — ducks move in map space, not on screen. */
  speed: 2,
  scale: 1.2,
} as const;
