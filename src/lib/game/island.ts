/**
 * Island generation — pure and seed-deterministic.
 *
 * Everything here is a function of the seed, so an island can be rebuilt from
 * `{ seed, width, height, tier }` alone. The server stores the seed, not 400
 * tiles, and a replay of a reported bug needs nothing else.
 *
 * NOTE: this module contains the buried contents. It runs SERVER-SIDE ONLY —
 * shipping it to the browser would hand every player the bomb map. The client
 * gets a redacted view (see `publicView`).
 */
import { ISLAND, tierFor } from '../../../config/tuning';
import { mulberry32, seedFrom, shuffle, type Rng } from './rng';
import { idx, inBounds, type Island, type Tile } from './types';

export interface GenerateOptions {
  seed: string;
  /** Drives the tier (density) — the highest lifetime among the island's players. */
  lifetimeCarrots?: number;
  /** Fixed size, for tests. Omitted in play: size varies to avoid monotony. */
  width?: number;
  height?: number;
}

export function generateIsland(opts: GenerateOptions): Island {
  const rng = mulberry32(seedFrom(opts.seed));
  const tier = tierFor(opts.lifetimeCarrots ?? 0);

  const span = ISLAND.MAX_SIZE - ISLAND.MIN_SIZE;
  const width = opts.width ?? ISLAND.MIN_SIZE + Math.floor(rng() * (span + 1));
  const height = opts.height ?? ISLAND.MIN_SIZE + Math.floor(rng() * (span + 1));
  const total = width * height;

  const tiles: Tile[] = Array.from({ length: total }, () => ({
    revealed: false,
    content: 'empty' as const,
    adjacent: 0,
  }));

  // Spawn is the island's centre; the safe radius around it is carved out of the
  // bomb pool below so a run can never open on a blast.
  const spawn = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const safe = new Set<number>();
  for (let dy = -ISLAND.SAFE_RADIUS; dy <= ISLAND.SAFE_RADIUS; dy++) {
    for (let dx = -ISLAND.SAFE_RADIUS; dx <= ISLAND.SAFE_RADIUS; dx++) {
      const x = spawn.x + dx, y = spawn.y + dy;
      if (inBounds({ width, height }, x, y)) safe.add(idx({ width }, x, y));
    }
  }

  // Deal contents by shuffling the eligible cells once, then slicing. This is
  // simpler than rejection-sampling per item and cannot loop forever at the
  // high densities of the late tiers.
  const pool = shuffle(rng, [...Array(total).keys()].filter((i) => !safe.has(i)));
  let cursor = 0;
  const take = (n: number) => pool.slice(cursor, (cursor += n));

  for (const i of take(Math.floor(total * tier.bombDensity))) tiles[i].content = 'bomb';

  const carrotCount = Math.floor(total * tier.carrotDensity);
  const goldenCount = Math.floor(carrotCount * tier.goldenShare);
  for (const i of take(goldenCount)) tiles[i].content = 'golden';
  for (const i of take(carrotCount - goldenCount)) tiles[i].content = 'carrot';
  for (const i of take(Math.floor(total * ISLAND.CHEST_DENSITY))) tiles[i].content = 'chest';

  const island: Island = {
    id: opts.seed,
    seed: opts.seed,
    width,
    height,
    tiles,
    tier: tier.name,
    dugCount: 0,
    createdAt: Date.now(),
  };

  recomputeAdjacency(island);
  // The spawn ring starts revealed — you always land somewhere you can read.
  for (const i of safe) revealTile(island, i);
  return island;
}

/** Bombs among the 8 neighbours of (x, y). */
export function countAdjacent(island: Island, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!inBounds(island, nx, ny)) continue;
      if (island.tiles[idx(island, nx, ny)].content === 'bomb') n++;
    }
  }
  return n;
}

/**
 * Recompute every hint. Called at generation and again whenever a saboteur
 * plants a bomb — that is the point of the sabotage mechanic: a revealed "2"
 * silently becomes a "3", and an attentive victim can spot it (GDD, Phase 5).
 */
export function recomputeAdjacency(island: Island): void {
  for (let y = 0; y < island.height; y++) {
    for (let x = 0; x < island.width; x++) {
      island.tiles[idx(island, x, y)].adjacent = countAdjacent(island, x, y);
    }
  }
}

/** Reveal by flat index, keeping `dugCount` (the eruption clock) honest. */
export function revealTile(island: Island, i: number, by?: string): boolean {
  const tile = island.tiles[i];
  if (tile.revealed) return false;
  tile.revealed = true;
  if (by) tile.dugBy = by;
  island.dugCount++;
  return true;
}

/** Fraction of the island that has been dug — drives smoke stages and eruption. */
export const dugFraction = (island: Island) =>
  island.dugCount / (island.width * island.height);

/**
 * The island as a CLIENT may see it: unrevealed tiles carry no content and no
 * hint. Never send an `Island` over the wire — send this.
 */
export function publicView(island: Island) {
  return {
    id: island.id,
    width: island.width,
    height: island.height,
    tier: island.tier,
    dugFraction: dugFraction(island),
    tiles: island.tiles.map((t) =>
      t.revealed
        ? { revealed: true as const, content: t.content, adjacent: t.adjacent, dugBy: t.dugBy }
        : { revealed: false as const },
    ),
  };
}

export type PublicIsland = ReturnType<typeof publicView>;

/**
 * Where a blast throws a rabbit: `tiles` steps along `back`, preferring already
 * revealed ground (being thrown into fresh dirt would cost energy you did not
 * choose to spend). Falls back to the furthest legal tile, then to the origin.
 */
export function knockbackTarget(
  island: Island,
  from: { x: number; y: number },
  back: readonly [number, number],
  tiles: number,
): { x: number; y: number } {
  let best = { ...from };
  let bestRevealed = { ...from };
  let sawRevealed = false;
  for (let step = 1; step <= tiles; step++) {
    const x = from.x + back[0] * step;
    const y = from.y + back[1] * step;
    if (!inBounds(island, x, y)) break;
    best = { x, y };
    if (island.tiles[idx(island, x, y)].revealed) {
      bestRevealed = { x, y };
      sawRevealed = true;
    }
  }
  return sawRevealed ? bestRevealed : best;
}
