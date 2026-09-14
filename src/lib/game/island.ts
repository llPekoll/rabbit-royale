/**
 * Island generation — pure and seed-deterministic.
 *
 * Everything is a function of the seed, so an island rebuilds from its id
 * alone: the server stores a seed, not 200 tiles, and the CLIENT cuts the
 * identical coastline from the same seed without it ever crossing the wire.
 *
 * NOTE: this module holds the buried contents. It runs SERVER-SIDE ONLY —
 * shipping it to the browser would hand every player the bomb map. The client
 * gets a redacted view (`publicView`) and the shape (from gridConfig, which is
 * safe: where the land is was never a secret).
 *
 * That import discipline is NOT what keeps the bombs secret, though, and it is
 * worth being precise about why. Everything this module needs — `mulberry32`,
 * `seedFrom`, `shuffle`, `farmableTiles`, `spawnTile`, `tierFor` — already ships
 * to the browser for other reasons, and the algorithm below is a pure function
 * of its inputs. Anyone holding the inputs can re-run it in a console without
 * ever importing this file. So the secret cannot be the CODE; it has to be an
 * input the client never receives.
 *
 * Hence two seeds. `seed` is public and cuts everything the client must draw
 * (coastline, tiers, placements, spawn). `contentSeed` is private, never
 * appears in `publicView` or in any payload, and is the ONLY thing that decides
 * where a bomb sits. Publishing `seed` is then harmless by construction.
 */
import { CHEST_TIER_WEIGHTS, ISLAND, tierFor } from '@config/tuning';
import {
  COLS, ROWS, SPAWN_INDEX, makeShape, isForbidden, neighbors,
  type IslandShape,
} from '@/config/gridConfig';
import { farmableTiles, spawnTile, terrainNeighbors } from './terrainBoard';
import { mulberry32, pickWeighted, seedFrom, shuffle } from './rng';
import type { Island, Tile } from './types';

export interface GenerateOptions {
  /** PUBLIC. Cuts the land the client draws; travels in every snapshot. */
  seed: string;
  /**
   * PRIVATE. Seeds what is BURIED, and nothing else.
   *
   * Must never be sent to a client, logged next to a player id, or derived from
   * `seed` — the whole point is that holding `seed` tells you nothing about the
   * bombs. The server passes a fresh `randomUUID()`.
   *
   * Optional only so that the pure-generation tests can pin a content layout by
   * seed alone; it falls back to `seed`, which is exactly the old (guessable)
   * behaviour and is why the server must always pass one explicitly.
   */
  contentSeed?: string;
  /** Drives the tier (densities) — the highest lifetime among the players. */
  lifetimeCarrots?: number;
}

export function generateIsland(opts: GenerateOptions): Island {
  const rng = mulberry32(seedFrom(`content:${opts.contentSeed ?? opts.seed}`));
  const tier = tierFor(opts.lifetimeCarrots ?? 0);
  const shape = makeShape(opts.seed);

  // Playable ground only. A tile is absent from the map unless the TERRAIN
  // offers it: not the sea, not the rock a cliff face is drawn over, not a
  // cell with a pine on it, and not a pocket cut off behind a cliff. Anything
  // buried outside that set is a prize the player can see and never reach,
  // which is worse than no prize at all.
  const tiles = new Map<number, Tile>();
  for (const i of farmableTiles(opts.seed)) {
    tiles.set(i, { revealed: false, content: 'empty', adjacent: 0 });
  }

  // The spawn and its immediate ring are carved out of the bomb pool, so a run
  // can never open on a blast. The spawn comes from the terrain too — the
  // centre of a 16x16 can be open water once the coastline is generated.
  const spawn = spawnTile(opts.seed);
  const safe = new Set<number>([spawn, ...terrainNeighbors(opts.seed, spawn)]);

  // Deal contents by shuffling the eligible tiles once and slicing. Simpler
  // than rejection-sampling per item, and it cannot loop forever at the high
  // densities of the late tiers.
  const pool = shuffle(rng, [...tiles.keys()].filter((i) => !safe.has(i)));
  let cursor = 0;
  const take = (n: number) => pool.slice(cursor, (cursor += n));
  const total = tiles.size;

  for (const i of take(Math.floor(total * tier.bombDensity))) tiles.get(i)!.content = 'bomb';

  const carrots = Math.floor(total * tier.carrotDensity);
  const golden = Math.floor(carrots * tier.goldenShare);
  for (const i of take(golden)) tiles.get(i)!.content = 'golden';
  for (const i of take(carrots - golden)) tiles.get(i)!.content = 'carrot';
  // Each chest draws its own tier, which decides both what it may hold and how
  // loudly it announces itself. Drawn from the CONTENT rng like everything else
  // buried here: the tier is shown on the board, but which tile got the crown
  // must not be derivable from the public seed.
  for (const i of take(Math.floor(total * ISLAND.CHEST_DENSITY))) {
    const t = tiles.get(i)!;
    t.content = 'chest';
    t.chestTier = pickWeighted(rng, CHEST_TIER_WEIGHTS).kind;
  }

  const island: Island = {
    id: opts.seed,
    seed: opts.seed,
    tiles,
    tier: tier.name,
    dugCount: 0,
    createdAt: Date.now(),
  };

  recomputeAdjacency(island, shape);
  // You always land somewhere you can read.
  for (const i of safe) revealTile(island, i);
  return island;
}

/** Bombs among a tile's 8 neighbours. */
export function countAdjacent(island: Island, index: number, shape: IslandShape): number {
  let n = 0;
  // Counted over the TERRAIN's neighbours, not the flat silhouette's. A hint
  // that counted tiles which are not on the board would be unsolvable: the
  // player would read a "2" with only one diggable cell beside it. `shape` is
  // kept in the signature because the sabotage path still passes it, and
  // because the two agree on everything except the cells terrain removes.
  for (const nb of terrainNeighbors(island.seed, index)) {
    if (island.tiles.get(nb)?.content === 'bomb') n++;
  }
  return n;
}

/**
 * Recompute every hint. Called at generation and again whenever a saboteur
 * plants a bomb — that is the point of the sabotage mechanic: a revealed "2"
 * silently becomes a "3", and an attentive victim can spot it.
 */
export function recomputeAdjacency(island: Island, shape: IslandShape): void {
  for (const [index, tile] of island.tiles) {
    tile.adjacent = countAdjacent(island, index, shape);
  }
}

/** Reveal a tile, keeping `dugCount` (the eruption clock) honest. */
export function revealTile(island: Island, index: number, by?: string): boolean {
  const tile = island.tiles.get(index);
  if (!tile || tile.revealed) return false;
  tile.revealed = true;
  if (by) tile.dugBy = by;
  island.dugCount++;
  return true;
}

/**
 * Where the island stands: how many SAFE tiles are still in the ground, and
 * how far along that makes it, 0 → 1, where 1 is the eruption.
 *
 * Safe tiles, not all tiles. An island is cleared when every tile that is not
 * a bomb has been dug: by then the bombs left are all known from the numbers,
 * and asking a player to step on them to "finish" would be asking them to lose
 * hearts for nothing. A bomb that IS dug (someone stepped on it) is simply no
 * longer in anyone's way.
 *
 * Walked, not tracked: the board is a few hundred tiles and this runs once
 * per dig, which is nothing next to the socket round-trip it sits behind — and
 * a counter kept alongside `dugCount` would be one more thing to get wrong on
 * every reveal path.
 */
export function islandProgress(island: Island): { safeLeft: number; safeTotal: number; fraction: number } {
  let safeTotal = 0;
  let safeLeft = 0;
  for (const tile of island.tiles.values()) {
    if (tile.content === 'bomb') continue;
    safeTotal++;
    if (!tile.revealed) safeLeft++;
  }
  const fraction = safeTotal === 0 ? 1 : 1 - safeLeft / safeTotal;
  return { safeLeft, safeTotal, fraction };
}

/** Safe tiles still in the ground. Below ERUPTION.JOIN_MIN_TILES_LEFT nobody new joins. */
export const safeTilesLeft = (island: Island) => islandProgress(island).safeLeft;

/** Share of the safe tiles dug — drives the smoke stages and, at 1, the eruption. */
export const dugFraction = (island: Island) => islandProgress(island).fraction;

/**
 * The island as a CLIENT may see it: only what is already REVEALED. An
 * unrevealed tile is not sent at all — there is no field to read a bomb out of,
 * which is the whole security model of this game.
 *
 * CHESTS ARE THE ONE EXCEPTION, and a deliberate one. A chest announces itself
 * from across the island — that is the feature: the player sees a CROWN four
 * tiles out and decides whether the walk is worth it. A chest nobody can see
 * until they have already dug it is not a decision, it is a surprise.
 *
 * What leaks is exactly two things: WHERE a chest is, and WHICH TIER it is.
 * Never what it rolled — the roll happens at the dig, from the private content
 * seed, and the tier only says which TABLE will be drawn from. And never
 * anything about its neighbours: `adjacent` is withheld until the tile is dug
 * like everywhere else, so a chest tells a player nothing about the bombs
 * around it. Walking to a visible chest is as dangerous as walking anywhere.
 */
export function publicView(island: Island) {
  const revealed: Array<{ tile: number; content: string; adjacent: number; dugBy?: string }> = [];
  const chests: Array<{ tile: number; tier: string }> = [];
  for (const [index, tile] of island.tiles) {
    // An undug chest still advertises its position and tier — and nothing else.
    if (!tile.revealed && tile.content === 'chest' && tile.chestTier) {
      chests.push({ tile: index, tier: tile.chestTier });
      continue;
    }
    if (!tile.revealed) continue;
    revealed.push({ tile: index, content: tile.content, adjacent: tile.adjacent, dugBy: tile.dugBy });
  }
  return {
    seed: island.seed,
    tier: island.tier,
    dugFraction: dugFraction(island),
    revealed,
    chests,
  };
}

export type PublicIsland = ReturnType<typeof publicView>;
