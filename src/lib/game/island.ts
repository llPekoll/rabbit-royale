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
 */
import { ISLAND, tierFor } from '@config/tuning';
import {
  COLS, ROWS, SPAWN_INDEX, makeShape, isForbidden, neighbors,
  type IslandShape,
} from '@/config/gridConfig';
import { mulberry32, seedFrom, shuffle } from './rng';
import type { Island, Tile } from './types';

export interface GenerateOptions {
  seed: string;
  /** Drives the tier (densities) — the highest lifetime among the players. */
  lifetimeCarrots?: number;
}

export function generateIsland(opts: GenerateOptions): Island {
  const rng = mulberry32(seedFrom(`content:${opts.seed}`));
  const tier = tierFor(opts.lifetimeCarrots ?? 0);
  const shape = makeShape(opts.seed);

  // Land only. A water square is ABSENT from the map rather than present and
  // empty, so nothing can accidentally bury a carrot in the sea.
  const tiles = new Map<number, Tile>();
  for (let i = 0; i < COLS * ROWS; i++) {
    if (isForbidden(i, shape)) continue;
    tiles.set(i, { revealed: false, content: 'empty', adjacent: 0 });
  }

  // The spawn and its immediate ring are carved out of the bomb pool, so a run
  // can never open on a blast.
  const safe = new Set<number>([SPAWN_INDEX, ...neighbors(SPAWN_INDEX, shape)]);

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
  for (const i of take(Math.floor(total * ISLAND.CHEST_DENSITY))) tiles.get(i)!.content = 'chest';

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
  for (const nb of neighbors(index, shape)) {
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

/** Fraction of the island dug — drives the smoke stages and the eruption. */
export const dugFraction = (island: Island) => island.dugCount / island.tiles.size;

/**
 * The island as a CLIENT may see it: only what is already REVEALED. An
 * unrevealed tile is not sent at all — there is no field to read a bomb out of,
 * which is the whole security model of this game.
 */
export function publicView(island: Island) {
  const revealed: Array<{ tile: number; content: string; adjacent: number; dugBy?: string }> = [];
  for (const [index, tile] of island.tiles) {
    if (!tile.revealed) continue;
    revealed.push({ tile: index, content: tile.content, adjacent: tile.adjacent, dugBy: tile.dugBy });
  }
  return {
    seed: island.seed,
    tier: island.tier,
    dugFraction: dugFraction(island),
    revealed,
  };
}

export type PublicIsland = ReturnType<typeof publicView>;
