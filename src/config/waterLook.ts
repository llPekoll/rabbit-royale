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
   * Above 1: how much of the surf shows in the WATER rather than under the land.
   *
   * The overhang is baked into the frame, so this is a dial and not the thing
   * that makes the coastline join up. The story's 0.88 tucks it further under
   * the land, which on a phone-sized board left the coast as a thin seam you
   * had to look for. 1.2 pushes the same band back out past the shore so it
   * reads at a glance.
   */
  overlap: 1.2,
} as const;

/** The flock, as `createDucks` takes it. */
export const DUCK_LOOK = {
  count: 4,
  /** Cells per second — ducks move in map space, not on screen. */
  speed: 2,
  /**
   * 0.8 of a 32px frame: a duck about the size of a sheep's body, not of a
   * whole cell. At 1.2 it was the biggest animal on the island.
   */
  scale: 0.8,
} as const;

/**
 * The depth under the island, as `createSeaGradient` takes it.
 *
 * Tuned in `Island/Sea gradient` against the real island, the real surf and
 * the game's own sea colour, then written here so the story's defaults and
 * the game's constants are the same numbers.
 *
 * Note the direction: `sea` is the DARK one. The water is pale where the
 * island sits and deepens outward to the open sea, which is the reading a
 * painter would give it — the shelf under the coast catching light, the deep
 * water beyond it not. The earlier draft had these the other way round.
 *
 * `sea` is therefore what the viewport is cleared to (`BG_COLOR`), because the
 * gradient reaches its far colour at the edges and anything past the plane has
 * to agree with it or the frame shows a rim in the old blue.
 */
export const SEA_GRADIENT_LOOK = {
  mode: 'radial',
  /** The open sea, far from land — and the canvas clear colour. */
  sea: 0x0d5f8c,
  /** The shallow water the island stands in. */
  deep: 0x1eaac4,
  center: [0.5, 0.55],
  radius: 0.5,
  /**
   * A true ellipse ratio, measured in pixels.
   *
   * Not the board's 44/24: the pool is wider than the lattice because it is
   * standing in for depth falling away, not for the island's own footprint.
   */
  aspect: 3.25,
  softness: 0.56,
  strength: 1,
  /** Tilted onto the island's diagonal, which is what puts it in perspective
   *  rather than square to the screen. Degrees; the shader takes radians. */
  angleDeg: 175,
  /** Enough steps to read as a ramp, few enough to stay pixel art. */
  steps: 40,
} as const;
