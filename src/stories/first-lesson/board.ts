/**
 * THE TAUGHT BOARD — the pocket of ground both first-run lessons stand on.
 *
 * Shared by `FirstNumbers.stories` (what a number MEANS) and
 * `FirstFlag.stories` (what the red X DOES), because the two lessons are two
 * phases of one tutorial and must be judged on the same ground. A second copy
 * of this shape would let one story drift into teaching something the other
 * never set up.
 *
 * ## The shape is the lesson
 *
 * Written out by hand rather than generated. A generator that happened to
 * produce an ambiguous corner would make a story quietly lie: the player would
 * be told "only one tile is left" on a board where two were.
 *
 *      . . . . .
 *      . o o o .
 *      . o 1 B .        B = the bomb, the only undug neighbour of the 1
 *      . o R o .        R = the rabbit, standing beside the 1
 *      . . . . .
 *
 * The clue reads "1": exactly one bomb touches it. Seven of its eight
 * neighbours are already dug, so the eighth IS the bomb — no minesweeper
 * knowledge required, only the ability to see that one cell is left over.
 */
import { toIndex } from '@/config/gridConfig';

/** The pocket's middle cell, in grid coordinates. */
const CENTRE = { col: 16, row: 16 };

/** A cell, as an offset from CENTRE. */
export const at = (dc: number, dr: number) => toIndex(CENTRE.col + dc, CENTRE.row + dr);

/**
 * Every cell the board holds, as offsets from CENTRE.
 *
 * The nine of the lesson, plus a little room around them: once the X is placed
 * the ring needs somewhere to point, and a board with no slack reads as a
 * diorama rather than as a piece of an island.
 */
export const GROUND: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
  [-2, 0], [2, 0], [0, 2], [0, -2], [-2, 1], [2, 1], [-1, 2], [1, 2],
  // The path to the chest: a short walk south-west, away from the bomb the X
  // lesson is about. The two prizes must not share a cell or a direction, or
  // "go and get it" reads as "go back to the thing you just marked".
  [-2, 2], [-3, 2], [-3, 3], [-2, 3],
];

/** Where the rabbit starts: beside the clue, not on it. */
export const RABBIT = at(0, 1);

/** The dug tile that reads "1" — what the numbers lesson is about. */
export const CLUE = at(0, 0);

/** The bomb: the clue's one undug neighbour — what the X lesson is about. */
export const BOMB = at(1, 0);

/**
 * The eight cells the clue's number counts over — ITS neighbours, not the
 * rabbit's.
 *
 * Lit while the number is being explained, so "one bomb hides in the 8 tiles
 * around it" has a visible "it". This is the set a hint counts over in the
 * real game too (`boardNeighbors`), which is why it includes the diagonals.
 */
export const CLUE_RING: readonly number[] = [
  at(-1, -1), at(0, -1), at(1, -1),
  at(-1, 0), at(1, 0),
  at(-1, 1), at(0, 1), at(1, 1),
];

/**
 * The tiles that start DUG, so the clue's count is forced.
 *
 * Everything the clue touches except the bomb, plus the clue itself. A player
 * who counts sees eight neighbours, seven of them open and one of them not.
 */
export const DUG: readonly number[] = [
  at(-1, -1), at(0, -1), at(1, -1),
  at(-1, 0),
  at(-1, 1), at(0, 1), at(1, 1),
  CLUE,
];

/**
 * THE CHEST — phase 3's destination.
 *
 * Three steps from the rabbit and on the far side from the bomb, which is the
 * shape the real first island deals (`firstIslandLayout`: the chest is never a
 * neighbour of the taught bomb, "the two lessons are not the same one", and it
 * sits at most FIRST_RUN.CHEST_MAX_DISTANCE steps out so it is a walk rather
 * than a gift).
 */
export const CHEST = at(-3, 3);

/**
 * How far in the camera sits for a lesson.
 *
 * The run's own camera opens nearer than the whole board, and these moments
 * are the most zoomed the game ever needs to be: the player is reading ONE
 * number and one marked cell. At 1 the pocket is a thumbnail on a painting —
 * measured, not guessed: the seventeen tiles came out a few pixels tall
 * against the full island art.
 */
export const BOARD_ZOOM = 2.6;

/** The story canvas both lessons are framed in. */
export const STAGE = { width: 960, height: 540 } as const;
