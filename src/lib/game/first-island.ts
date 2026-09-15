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

export function firstIslandSeed(id: string): string {
  return `${FIRST_SEED_PREFIX}${id}`;
}

export function isFirstIsland(seed: string): boolean {
  return seed.startsWith(FIRST_SEED_PREFIX);
}
