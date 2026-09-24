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
import type { IslandShape } from '@/config/gridConfig';
import { IslandBoard } from '@/game/island/board';
import { generateTerrain, type Terrain } from '@/game/island/terrain';
import { surfaceLift } from '@/game/island/relief';
import { FIRST_RUN, levelRow } from '@config/tuning';
import { groundSeed, isFirstIsland, seedLevel } from './first-island';
import { TUTORIAL_LAND, TUTORIAL_SPAWN } from './tutorial-map';

/**
 * Cut the hand-drawn corridor out of a generated island.
 *
 * Sea everywhere the map does not mark land, every surviving cell flattened to
 * tier 1, and any scenery left standing in the water removed. Flat on purpose:
 * a cliff across a one-cell corridor is a wall, and the first island has
 * nothing to say about climbing.
 */
function carveTutorial(terrain: Terrain): void {
  const keep = new Set(TUTORIAL_LAND);
  const { map } = terrain;
  const level = map.level as unknown as Int8Array;
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const i = row * map.width + col;
      level[i] = keep.has(toIndex(col, row)) ? 1 : 0;
    }
  }
  /**
   * NOTHING STANDS ON THE CORRIDOR — not one tree.
   *
   * `farmableTiles` drops any cell with a tree or a rock on it, and on a
   * one-cell-wide corridor that does not thin the scenery, it CUTS THE ISLAND
   * IN HALF: measured, a single pine on cell 624 left the chest and its whole
   * clearing unreachable, 11 tiles the player could see and never walk to.
   *
   * On a generated island scenery is texture because there is always a way
   * round it. Here there is no way round anything, so the corridor is cleared
   * outright and the decoration lives in the sea and on the wider clearing at
   * the end — which is also where it can be seen without being in the way.
   */
  terrain.placements = [];
}

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
  /**
   * EVERY first island is cut from the SAME ground (`groundSeed`).
   *
   * The seed still names the player, because each newcomer digs their own
   * instance — but the coastline, the spawn and the cliffs all come from one
   * constant, so the tutorial is the same lesson for everybody. This is the
   * single chokepoint every terrain reader goes through, client and server
   * alike, which is why the substitution belongs here rather than at each
   * call site: one of them left out would be two sides disagreeing about
   * where the land is.
   */
  const key = groundSeed(seed);
  // The first island is cut SMALL — a board to clear in one sitting, so
  // the eruption can teach that the island is the clock. A ladder island is
  // cut to its level's size (RABBIT_LEVELS `land`): same noise, more of it
  // above water as the rabbit climbs. Read off the seed rather than passed
  // in, because the client rebuilds this from the seed alone and has to cut
  // the same coastline (see first-island.ts).
  const level = seedLevel(seed);
  const land = isFirstIsland(key) ? FIRST_RUN.LAND
    : level !== undefined ? levelRow(level).land : TERRAIN_OPTIONS.land;
  const entryKey = `${key}@${land}`;
  let entry = cache.get(entryKey);
  if (!entry) {
    const terrain = generateTerrain({ seed: key, ...TERRAIN_OPTIONS, land });
    /**
     * THE TUTORIAL IS A CORRIDOR, cut by hand over the generated ground.
     *
     * Everything outside `TUTORIAL_LAND` is pushed back to sea, which is what
     * gives the first island its one-way-to-go shape: the sea does the
     * guidance, so there is no wrong turn to take because there is no turn.
     * See `tutorial-map.ts` for the picture.
     *
     * Carved here rather than in the generator because the generator's job is
     * noise, and this island is the one place the game wants a drawing. The
     * scenery is scattered first and then filtered, so what is left still
     * stands where the terrain put it — a tree that fell in the sea simply
     * goes away.
     */
    if (isFirstIsland(key)) carveTutorial(terrain);
    entry = { terrain, board: new IslandBoard(terrain.map, terrain.placements) };
    cache.set(entryKey, entry);
  }
  return entry;
}

/**
 * Forget a seed's terrain. SERVER ONLY — call it when an island is torn down.
 *
 * The cache above is unbounded, which is right for a client (it holds the one
 * island the player is on) and wrong for a long-lived server process: an
 * island lives minutes, and every one ever created left a terrain and an
 * `IslandBoard` behind for good. That is a slow leak measured in uptime rather
 * than in players — the box survives a busy afternoon and dies after a fortnight.
 *
 * Deliberately NOT called from anywhere on the client: there the entry is
 * still in use for as long as the seed is on screen, and dropping it mid-run
 * would regenerate the board under the renderer.
 */
export function forgetTerrain(seed: string): void {
  cache.delete(seed);
}

/**
 * How far up the screen a tile sits, for the tier it stands on.
 *
 * Zero at sea level, one `TIER_LIFT` per plateau. Subtracted from a tile's y,
 * so a cell on the second shelf is drawn on the shelf rather than under it.
 */
export function tierLift(seed: string, index: number): number {
  const { col, row } = toColRow(index);
  const { map } = cached(seed).terrain;
  // Plus the ramp: tiers join by slopes (`IsoIslandView`'s `slopes`), so a
  // cell beside a plateau rises part-way toward it, and whatever stands in
  // its middle stands at the mean of its corners.
  return (levelTierAt(seed, col, row) + surfaceLift(map, col, row)) * TIER_LIFT;
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
 * No coastline at all — the mask `terrainTileAt` hands `screenToTile`.
 *
 * `IslandShape` is the set of FORBIDDEN cells, so an empty one forbids
 * nothing and the inversion answers pure geometry. Built once and shared:
 * it is read on every pointer press.
 */
const NO_SHAPE: IslandShape = new Set<string>();

/**
 * Which tile a point on screen names, terraces included.
 *
 * `screenToTile` inverts a FLAT projection, so on raised ground it answers
 * with the cell in front of the one the player is looking at — tap a plateau
 * and the move goes to the grass below it. Corrected by trying the tiers from
 * the top down: the first one whose lifted diamond contains the point wins,
 * which is also what the eye picks, since a higher tile is drawn over a lower.
 *
 * The shape mask is left OFF on purpose (`NO_SHAPE`).
 *
 * `screenToTile` masks against `DEFAULT_SHAPE` when it is given no shape —
 * the coastline of `makeShape('default')`, which is one arbitrary island and
 * not the one being played. Every cell that is land on THIS seed but sea on
 * that default one came back null, and the null returned before the very next
 * lines could consult the real board: those taps died in the resolver with no
 * tile named and nothing to answer them. Whole stretches of coast simply did
 * not respond, which is what a player sees as dead ground.
 *
 * So the inversion is asked for pure geometry — which diamond holds this
 * point — and WHICH ISLAND is answered below by `boardFor(seed)`, the same
 * board the server resolves a move against. One authority, consulted once.
 */
export function terrainTileAt(seed: string, sx: number, sy: number): number | null {
  const { map } = cached(seed).terrain;
  let tallest = 0;
  for (const tier of map.level) if (tier > tallest) tallest = tier;

  for (let tier = tallest; tier >= 1; tier--) {
    const index = screenToTile(sx, sy + tier * TIER_LIFT, NO_SHAPE);
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
  // The tutorial's spawn is drawn on its map, not searched for: the corridor
  // has a mouth, and "nearest the grid centre" lands somewhere in the middle
  // of it instead. See `tutorial-map.ts`.
  if (isFirstIsland(seed)) return TUTORIAL_SPAWN;
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
