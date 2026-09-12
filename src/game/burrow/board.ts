/**
 * A burrow's rules, in the language the rest of the game already speaks.
 *
 * The game talks in tile INDICES — the traps table stores one, a raid run
 * stores one, the wire carries one. `generate.ts` talks in terrain and cells
 * because that is what a generator wants. This is the seam, and it is the
 * exact counterpart of `lib/game/terrainBoard.ts` for the island: same shape,
 * same caching, same promise.
 *
 * That promise is the one the whole design rests on: the SERVER decides what
 * is walkable and the client mirrors it, both from the seed alone, with no
 * terrain crossing the wire. A raider's client draws the same rocks the raid
 * endpoint routes around, so a highlighted step is a step the server will
 * accept rather than a guess the server may refuse.
 *
 * ## The seed is the player's id
 *
 * Not a new column. A burrow belongs to exactly one player forever, and their
 * id is already stable, already on both sides of every call that needs the
 * layout, and already never reused. Storing a `burrowSeed` would be a second
 * source of truth for something that cannot change.
 *
 * ## Why every function takes the seed
 *
 * The hand-drawn layout answered `burrowCell(tile)` with no seed because there
 * was only one burrow in the world. There are now as many as there are
 * players, so "is this tile walkable" is only a question once you say WHOSE
 * ground. Every caller had to be handed the defender's id; that is the cost of
 * the feature, paid once, in signatures rather than in bugs.
 */
import {
  burrowTerrain, BURROW_COLS, BURROW_ROWS, BURROW_STEPS, MAX_STEP,
  burrowIndex, burrowColRow, type BurrowCell, type BurrowTerrain,
} from './generate';
import { levelAt } from '@/game/island/generate';
import { cellIsMinable, cellIsWalkable } from './cells';

export {
  BURROW_COLS, BURROW_ROWS, burrowIndex, burrowColRow,
  type BurrowCell, type BurrowTerrain,
};

/**
 * Built once per seed, per process.
 *
 * A burrow is rebuilt on every raid step, every trap placement and every visit
 * to the screen — regenerating a 19x19 terrain each time would be wasted work
 * on both ends. Same reasoning, same shape as the island's cache.
 */
const cache = new Map<string, BurrowTerrain>();

/** The terrain for a seed: the map, what stands on it, and the landmarks. */
export function burrowFor(seed: string): BurrowTerrain {
  let terrain = cache.get(seed);
  if (!terrain) {
    terrain = burrowTerrain(seed);
    cache.set(seed, terrain);
  }
  return terrain;
}

/**
 * What a tile is.
 *
 * Every guard matters: this is called with indices that came off the wire (a
 * client naming the tile it wants to trap or step onto), so a non-integer or
 * an out-of-range value must answer 'blocked' rather than throw.
 */
export function burrowCell(seed: string, tile: number): BurrowCell {
  if (!Number.isInteger(tile) || tile < 0 || tile >= BURROW_COLS * BURROW_ROWS) {
    return 'blocked';
  }
  return burrowFor(seed).cells[tile];
}

/** Can a raider stand here? The field counts — reaching it is the win. */
export const isWalkable = (seed: string, tile: number) => cellIsWalkable(burrowCell(seed, tile));

/** Every tile a raider may occupy. */
export function walkableTiles(seed: string): number[] {
  const { cells } = burrowFor(seed);
  const out: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cellIsWalkable(cells[i])) out.push(i);
  return out;
}

/** Where a raid starts. */
export const entranceTile = (seed: string) => burrowFor(seed).entrance;

/** The objective. Reaching any of these ends the raid in the attacker's favour. */
export const fieldTiles = (seed: string) => burrowFor(seed).field;

/**
 * Where the OWNER may bury a bomb: every cell a rabbit can move onto.
 *
 * The rule itself is in `cells.ts`, next to what makes a cell walkable in the
 * first place — the two answers are now the same sentence, which is the whole
 * reason they live together. This is kept as its own name because a future
 * rule (nothing under the doorstep, say) belongs there without every caller
 * learning about it.
 */
export const isTrappable = (seed: string, tile: number) => cellIsMinable(burrowCell(seed, tile));

/**
 * The 8 steps, minus walls, edges and cliffs.
 *
 * The cliff check is what the hand-drawn layout could not express: on terraced
 * ground two adjacent tiles can both be walkable and still not connected,
 * because one of them is a shelf above the other. A raider climbs one tier and
 * is refused two — the same `MAX_STEP` the island uses, so a player learns the
 * rule once.
 */
export function burrowNeighbors(seed: string, tile: number): number[] {
  if (!isWalkable(seed, tile)) return [];
  const { map, cells } = burrowFor(seed);
  const { col, row } = burrowColRow(tile);
  const here = levelAt(map, col, row);

  const out: number[] = [];
  for (const [dc, dr] of BURROW_STEPS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) continue;
    const i = burrowIndex(nc, nr);
    if (!cellIsWalkable(cells[i])) continue;
    if (Math.abs(levelAt(map, nc, nr) - here) > MAX_STEP) continue;
    out.push(i);
  }
  return out;
}

/**
 * The 8 cells around a tile that EXIST — what a raider can see from here.
 *
 * Deliberately not `burrowNeighbors`. That answers "where may I step", and it
 * drops any neighbour more than `MAX_STEP` above or below: a cliff face beside
 * you is not a legal move, so it is not a neighbour. Reusing it as the reveal
 * rule meant a raider standing under a shelf was shown nothing at all in that
 * direction — the ground the wall stands on was never uncovered, so the wall
 * itself was never drawn, and a burrow read as a void with a rabbit in it.
 *
 * Seeing a cliff gives nothing away: the whole point of a terrace is that you
 * can look at it and not climb it. What stays hidden is what lies BEYOND —
 * that still has to be walked to. So this is sight, `burrowNeighbors` is
 * movement, and the server keeps validating steps against the latter.
 */
export function burrowAround(seed: string, tile: number): number[] {
  if (!Number.isInteger(tile) || tile < 0 || tile >= BURROW_COLS * BURROW_ROWS) return [];
  const { cells } = burrowFor(seed);
  const { col, row } = burrowColRow(tile);

  const out: number[] = [];
  for (const [dc, dr] of BURROW_STEPS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) continue;
    const i = burrowIndex(nc, nr);
    // Off-island stays off-island: the sea is not scenery a raider is owed.
    if (cells[i] === 'blocked') continue;
    out.push(i);
  }
  return out;
}

/** The terrain tier of a tile: 1 is ground level, 2+ a shelf, 0 off-island. */
export function burrowTier(seed: string, tile: number): number {
  if (!Number.isInteger(tile) || tile < 0 || tile >= BURROW_COLS * BURROW_ROWS) return 0;
  const { map } = burrowFor(seed);
  const { col, row } = burrowColRow(tile);
  return levelAt(map, col, row);
}

/** Steps in the shortest unobstructed path from the entrance to the field. */
export const shortestRaidPath = (seed: string) => burrowFor(seed).crossing;
