/**
 * The island's terrain, in the language the game already speaks: tile indices.
 *
 * The game talks in `number` — a tile is `row * COLS + col`, the server stores
 * moves as indices, the wire carries indices. The terrain module talks in
 * `(x, y)` because that is what a generator wants. This is the seam between
 * them, and it exists so that making the terrain authoritative did NOT mean
 * rewriting every signature from `tile: number` to `cell: {x, y}`.
 *
 * The rule it enforces is the one the whole redesign rests on: the SERVER
 * decides what is walkable, and the client mirrors it. Both build this from
 * the seed alone — no terrain crosses the wire — so `reachableTiles` on the
 * client and `resolveMove` on the server consult the same obstacles, and the
 * highlight stays a promise that a tap will be accepted rather than a guess.
 *
 * Cached by seed: an island is rebuilt from its id on every reconnect and on
 * every spectator join, and regenerating a few hundred cells each time would
 * be wasted work on both ends.
 */
import { COLS, ROWS, toColRow, toIndex } from '@/config/gridConfig';
import { IslandBoard } from '@/game/island/board';
import { generateTerrain, type Terrain } from '@/game/island/terrain';

/**
 * How the playable island is shaped.
 *
 * The grid is the game's own 16x16 so that a tile index means what it has
 * always meant. What changes is which of those cells are GROUND: the terrain
 * cuts the coastline and raises the plateaus, where `makeShape` only ever cut
 * a flat silhouette.
 */
export const TERRAIN_OPTIONS = {
  width: COLS,
  height: ROWS,
  tiers: 3,
  land: 0.62,
  rise: 0.42,
  raggedness: 0.32,
} as const;

const cache = new Map<string, { terrain: Terrain; board: IslandBoard }>();

/**
 * The board for a seed, built once per process.
 *
 * Occupants are rebuilt with the terrain, so a sheep is where the seed says it
 * is. Wandering is deliberately NOT run here: a board that drifted on its own
 * would drift differently on each machine, and the client would stop being a
 * reflection. If the flock is ever to move during a run, the server has to say
 * so on the wire like it does for every other change.
 */
export function boardFor(seed: string): IslandBoard {
  return cached(seed).board;
}

/** The terrain for a seed — the map plus everything standing on it. */
export function terrainFor(seed: string): Terrain {
  return cached(seed).terrain;
}

function cached(seed: string) {
  let entry = cache.get(seed);
  if (!entry) {
    const terrain = generateTerrain({ seed, ...TERRAIN_OPTIONS });
    entry = { terrain, board: new IslandBoard(terrain.map, terrain.placements) };
    cache.set(seed, entry);
  }
  return entry;
}

/** True when a rabbit may stand on this tile: ground, unblocked, on the board. */
export function isPlayable(seed: string, index: number): boolean {
  const { col, row } = toColRow(index);
  return boardFor(seed).isWalkable(col, row);
}

/** Every tile a rabbit standing on `index` may step onto. */
export function terrainNeighbors(seed: string, index: number): number[] {
  const { col, row } = toColRow(index);
  return boardFor(seed)
    .stepsFrom(col, row)
    .map((c) => toIndex(c.x, c.y));
}

/** Every tile that can hold something to dig up. */
export function farmableTiles(seed: string): number[] {
  return boardFor(seed)
    .farmableCells()
    .map((c) => toIndex(c.x, c.y));
}

/**
 * Where a run starts: the playable tile nearest the middle.
 *
 * Not a constant any more. `SPAWN_INDEX` was the centre of a flat 16x16, which
 * on generated terrain can be open sea, a cliff face, or under a tree — so the
 * spawn is chosen from the board rather than assumed, and both sides choose
 * the same one because both build the same board.
 */
export function spawnTile(seed: string): number {
  const board = boardFor(seed);
  const mid = { col: (COLS - 1) / 2, row: (ROWS - 1) / 2 };
  let best = -1;
  let bestDist = Infinity;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (!board.isWalkable(col, row)) continue;
      const d = Math.abs(col - mid.col) + Math.abs(row - mid.row);
      if (d < bestDist) { bestDist = d; best = toIndex(col, row); }
    }
  }
  return best;
}
