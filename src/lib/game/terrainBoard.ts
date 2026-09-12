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
import { COLS, ROWS, TIER_LIFT, screenToTile, tilePos, toColRow, toIndex } from '@/config/gridConfig';
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

/** Re-exported for the callers that always found it here; it lives in
 *  `gridConfig` now, next to the other board pixels — see the note there. */
export { TIER_LIFT };

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

/**
 * How far up the screen a tile sits, for the tier it stands on.
 *
 * Zero at sea level, one `TIER_LIFT` per plateau. Subtracted from a tile's y,
 * so a cell on the second shelf is drawn on the shelf rather than under it.
 */
export function tierLift(seed: string, index: number): number {
  const { col, row } = toColRow(index);
  return levelTierAt(seed, col, row) * TIER_LIFT;
}

/** The terrain tier of a tile: 0 is sea, 1 sea-level ground, 2+ a plateau. */
export function levelTierAt(seed: string, col: number, row: number): number {
  const { map } = cached(seed).terrain;
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) return 0;
  return map.level[row * map.width + col];
}

/**
 * Where a tile's centre sits on screen, terrace included.
 *
 * The one function anything standing ON the board should use — tiles, rabbits,
 * the movement ring. `tilePos` alone answers for a flat 16x16 and leaves
 * everything at sea level, which on generated terrain means sprites sunk into
 * the plateaus they are supposed to be standing on.
 */
export function tileScreenPos(seed: string, index: number): { x: number; y: number } {
  const flat = tilePos(index);
  return { x: flat.x, y: flat.y - tierLift(seed, index) };
}

/**
 * Which tile a point on screen names, terraces included.
 *
 * `screenToTile` inverts a FLAT projection, so on raised ground it answers
 * with the cell in front of the one the player is looking at — tap a plateau
 * and the move goes to the grass below it. Corrected by trying the tiers from
 * the top down: the first one whose lifted diamond contains the point wins,
 * which is also what the eye picks, since a higher tile is drawn over a lower.
 */
export function terrainTileAt(seed: string, sx: number, sy: number): number | null {
  const { map } = cached(seed).terrain;
  let tallest = 0;
  for (const tier of map.level) if (tier > tallest) tallest = tier;

  for (let tier = tallest; tier >= 1; tier--) {
    const index = screenToTile(sx, sy + tier * TIER_LIFT);
    if (index === null) continue;
    const { col, row } = toColRow(index);
    if (levelTierAt(seed, col, row) !== tier) continue;
    if (!boardFor(seed).isOnBoard(col, row)) continue;
    return index;
  }
  return null;
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
      // Not under a sheep either: the board lets the flock's cells through
      // (they are farmable), but a run cannot open with a rabbit on a sheep.
      if (!board.isWalkable(col, row) || board.occupantAt(col, row)) continue;
      const d = Math.abs(col - mid.col) + Math.abs(row - mid.row);
      if (d < bestDist) { bestDist = d; best = toIndex(col, row); }
    }
  }
  return best;
}
