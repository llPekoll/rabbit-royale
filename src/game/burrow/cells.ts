/**
 * What every kind of burrow cell lets you do to it.
 *
 * The island already has this file: `island/blocking.ts`, which exists because
 * a tree was drawn on a cell the board still called free. The burrow had the
 * same shape of bug for the same reason — the answer to "can I mine this one"
 * was written out four times, in four places that had to agree:
 *
 *   board.ts            `isTrappable` — the rule itself, as `cell === 'ground'`
 *   BurrowScene.buildBoard  which taps do anything
 *   BurrowScene.setPlacing  which diamonds light up
 *   api/traps/route.ts  the server's refusal
 *
 * They agreed only because one sentence had been copied four times, and the
 * copies were the reason widening the rule to the entrance and the field was a
 * four-file change with three chances to forget one. A highlight the server
 * then refuses is the worst of the failures that invites: the player is shown
 * a legal move and told no.
 *
 * So the answer lives here, once, per kind, and everyone reads it. Adding a
 * new kind of cell means adding a line to `CELL_RULES` — and there is nowhere
 * else to put it, which is the point.
 */
import type { BurrowCell } from './generate';

export interface CellRule {
  /**
   * Can a rabbit stand here — the owner walking home, a raider crossing?
   *
   * The field counts: reaching it is how a raid is WON, so it has to be
   * standable or the objective could never be touched.
   */
  walkable: boolean;
  /**
   * Can the owner bury a bomb here?
   *
   * Every cell a rabbit can move onto. This used to be ground only, with the
   * entrance and the field carved out — a bomb on the objective was called a
   * coin flip on the last step, a bomb on the entrance a raid that dies before
   * it begins. Both were true as WORST cases and neither was the common one:
   * what the exclusions actually did was fence off the two areas a defender
   * most wants to defend, with no way for the board to explain why those tiles
   * refused the tap. MAX_PLACED is what keeps a burrow from becoming a maze,
   * and it does that job whatever the bombs sit on.
   *
   * The rule a player can now learn in one sentence: if a rabbit can walk
   * there, you can mine it.
   */
  minable: boolean;
}

/** The rules, one line per kind. */
export const CELL_RULES: Record<BurrowCell, CellRule> = {
  ground:   { walkable: true,  minable: true },
  entrance: { walkable: true,  minable: true },
  field:    { walkable: true,  minable: true },
  // Not a cell at all: a wall, a cliff face, or sea. Nothing stands on it and
  // nothing is buried under it.
  blocked:  { walkable: false, minable: false },
};

/** Can a rabbit stand on a cell of this kind? */
export const cellIsWalkable = (cell: BurrowCell): boolean => CELL_RULES[cell].walkable;

/** Can the owner bury a bomb in a cell of this kind? */
export const cellIsMinable = (cell: BurrowCell): boolean => CELL_RULES[cell].minable;
