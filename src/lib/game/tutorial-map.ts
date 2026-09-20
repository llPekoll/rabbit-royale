/**
 * THE TUTORIAL ISLAND, DRAWN BY HAND — a corridor, not a field.
 *
 * Every other island in the game is cut from noise: a coastline, a few
 * plateaus, scenery scattered over whatever land survives. That is right for a
 * board the player explores and wrong for the first thirty seconds of their
 * life in the game, where the island has three things to teach and every extra
 * direction is a way to miss one of them.
 *
 * So this one is a picture. Paul, 2026-09-20: "il faut que tu adapte la taille
 * de l'ile au tutorial, genre que t'as qu'une possibilite de move... au debut
 * t'as qu'une case ou aller tout le reste c'est de l'eau, apres ca deploie un
 * peu."
 *
 * ## How it reads
 *
 *      S        The rabbit lands on S with ONE place to go. The sea does the
 *      o        teaching: there is no wrong turn to take, because there is no
 *     o1        turn — and then the ground opens into a clearing for the
 *     oB        chest, so the run ends somewhere that feels like the game.
 *    ooo
 *   ooCooo      In ISO the grid's columns run diagonally on screen, so a
 *    ooooo      column of cells draws as a slope: the map is read here in grid
 *     ooo       space, and what the player sees is this rotated 45°.
 *
 * ...and in full, as laid out below: a single-file walk to the clue, one step
 * more to stand beside the bomb, and then the ground widens towards the chest
 * so the last stretch feels like the game rather than like a rail.
 *
 * ## Why the shape is the lesson
 *
 * The captions state a deduction out loud ("seven are already dug, so the bomb
 * is the last one"). On a hand-drawn corridor that sentence is not a hope
 * about generated ground — it is a fact about a map in this file, and the
 * numbers around the bomb come out the same for every player, forever.
 *
 * ## The cost, taken on purpose
 *
 * The first island is spoilable: one player can tell another where the bomb
 * is. It is a lesson, not a prize, and it is played once. See
 * `FIRST_ISLAND_GROUND`.
 */
import { COLS, ROWS, toIndex } from '@/config/gridConfig';

/**
 * THE MAP, one character per cell.
 *
 *   `.` sea          `o` ordinary ground
 *   `S` the spawn    `1` the clue the numbers lesson points at
 *   `B` the taught bomb — the one cell the run is held for
 *   `C` the chest, which ends the tutorial
 *
 * Read top-left to bottom-right, and anchored so that `S` lands on the grid's
 * centre (`spawnTile` picks the walkable cell nearest the middle, so the two
 * agree by construction rather than by luck).
 *
 * THE WALK, step by step:
 *  1. `S` has exactly one neighbour — a single-file start, no wrong turn.
 *  2. Three cells later the corridor reaches `1`, the clue. Its count is
 *     forced: every neighbour it has is either sea or open ground, except `B`.
 *  3. One more step puts the rabbit beside `B` with nowhere else to go, which
 *     is where the X is asked for.
 *  4. THE WAY ON PASSES BESIDE THE BOMB, NOT THROUGH IT. A marked bomb is a
 *     wall (`resolveMove` refuses a step onto a flagged tile, on purpose — a
 *     slip of the thumb must not cost a run), so a corridor that ran straight
 *     through `B` sealed itself the moment the lesson was learned: the chest
 *     became unreachable and the tutorial could not be finished. Measured, not
 *     guessed. `B` now hangs off the side of the path.
 *  5. Past it the ground widens — two cells, then three — so the last stretch
 *     to `C` reads like the real game opening up rather than a rail.
 */
const MAP = [
  '................',
  '................',
  '......S.........',
  '......o.........',
  '.....o1.........',
  '.....oB.........',
  '....ooo.........',
  '...ooooo........',
  '...ooCooo.......',
  '....ooooo.......',
  '.....ooo........',
  '................',
  '................',
] as const;

/** Where the map's top-left corner sits on the 32x32 grid. */
const ORIGIN = { col: 11, row: 11 } as const;

/** Every cell the tutorial island holds, as a tile index. */
export const TUTORIAL_LAND: readonly number[] = (() => {
  const out: number[] = [];
  for (let y = 0; y < MAP.length; y++) {
    for (let x = 0; x < MAP[y].length; x++) {
      if (MAP[y][x] === '.') continue;
      const col = ORIGIN.col + x;
      const row = ORIGIN.row + y;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      out.push(toIndex(col, row));
    }
  }
  return out;
})();

/** Find the one cell marked with `ch`, as a tile index. */
function cellFor(ch: string): number {
  for (let y = 0; y < MAP.length; y++) {
    const x = MAP[y].indexOf(ch);
    if (x >= 0) return toIndex(ORIGIN.col + x, ORIGIN.row + y);
  }
  throw new Error(`tutorial map has no '${ch}'`);
}

/** Where the run opens. Also the cell `spawnTile` lands on. */
export const TUTORIAL_SPAWN = cellFor('S');
/** The dug tile that reads its count — what the numbers lesson points at. */
export const TUTORIAL_CLUE = cellFor('1');
/** The taught bomb: the cell the run is held for until it wears an X. */
export const TUTORIAL_BOMB = cellFor('B');
/** The chest that ends the tutorial. */
export const TUTORIAL_CHEST = cellFor('C');

/** Is this cell part of the hand-drawn island? */
export function isTutorialLand(index: number): boolean {
  return TUTORIAL_LAND.includes(index);
}
