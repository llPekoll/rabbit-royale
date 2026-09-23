/**
 * How the first island is NAMED — shared by both sides, and nothing else.
 *
 * The seed is the one thing about an island that reaches the browser, so the
 * fact "this is the tutorial island" rides on it as a prefix. The terrain
 * reads the prefix to cut the island small (`terrainBoard`), the generator
 * reads it to deal the board by hand (`island.ts`), and the client reads it
 * to run its captions. No flag crosses the wire that the seed does not
 * already carry, and no two sides can disagree about which island this is.
 *
 * Kept out of island.ts because that module holds the buried contents and is
 * server-only by convention; this one is safe anywhere.
 */
const FIRST_SEED_PREFIX = 'first:';

/**
 * THE ONE TUTORIAL ISLAND — the same ground for every player who ever starts.
 *
 * The seed still carries the player's id, because each newcomer needs their
 * OWN instance of it (they dig their own holes, solo, and two players must not
 * share a board). But everything the ground is made of — the coastline, the
 * spawn, where the taught bomb and its witness sit, where the chest is — is
 * derived from this constant instead, so the island they land on is identical.
 *
 * WHY FIXED. The first island is a scripted lesson: the captions state a
 * deduction out loud, the board has to prove it, and the run is blocked until
 * the player marks the bomb. Every one of those depends on knowing exactly
 * what the player is looking at. Dealt per player, the tutorial had to be
 * defensive about ground it could not predict — and the one thing worse than a
 * tutorial that is hard to tune is one whose behaviour differs between two
 * players reporting the same bug.
 *
 * The cost is that the first island is spoilable: one player can tell another
 * where the bomb is. It is a deliberate trade and a cheap one — the board is
 * a lesson, not a prize, and it is played once.
 */
export const FIRST_ISLAND_GROUND = 'tutorial-v1';

/**
 * THE ONE ISLAND — the same ground for every player on every level.
 *
 * Same trade as the tutorial, for a different reason: the game is a
 * competition, and two players comparing runs should have walked the same
 * coastline, the same cliffs, the same spawn. Each island is still its own
 * instance (its id is a fresh uuid, its rabbits dig their own holes), and what
 * is BURIED still comes from the private content seed — so knowing the ground
 * by heart tells you where to walk, never where the bombs are.
 *
 * Bump the suffix to re-cut the island for everybody at once.
 */
export const ISLAND_GROUND = 'island-v1';

export function firstIslandSeed(id: string): string {
  return `${FIRST_SEED_PREFIX}${id}`;
}

export function isFirstIsland(seed: string): boolean {
  return seed.startsWith(FIRST_SEED_PREFIX);
}

/**
 * The seed the GROUND is cut from, for any island seed.
 *
 * The first island's ground is the tutorial's; every other island shares
 * `ISLAND_GROUND`.
 * Terrain, shape and layout all go through here, so the two sides cannot
 * disagree: the client rebuilds the coastline from the seed it was handed and
 * lands on the same rule.
 */
export function groundSeed(seed: string): string {
  return isFirstIsland(seed) ? `${FIRST_SEED_PREFIX}${FIRST_ISLAND_GROUND}` : ISLAND_GROUND;
}
