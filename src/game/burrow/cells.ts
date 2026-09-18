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
   * Every cell a rabbit can move onto, EXCEPT the doorstep. For a while the
   * entrance and the field were both carved out; then both were opened up,
   * because fencing off the two areas a defender most wants to defend, on a
   * board that could not explain why those tiles ignored a tap, was worse
   * than either worst case. The field stays open — a bomb on the objective is
   * a coin flip on the last step, and the last step is the defender's to
   * make hard.
   *
   * The entrance is closed again, and this time with the ground round it,
   * because the worst case turned out to be the ONLY case: with the door
   * minable the winning defence was the same in every burrow, a ring of bombs
   * round the tile the raider arrives on, and the crossing ended before a
   * single clue was read. `TRAPS.DOORSTEP` steps of open ground is what
   * makes it a crossing. The board is expected to SHOW that ground, which is
   * what the carve-out lacked the first time (see `BurrowScene`'s door
   * marker), so a refused tap is a rule the player can see rather than a
   * board that does not answer.
   *
   * The rule a player can learn in one sentence: if a rabbit can walk there
   * you can mine it, except the few steps inside the door.
   */
  minable: boolean;
}

/** The rules, one line per kind. */
export const CELL_RULES: Record<BurrowCell, CellRule> = {
  ground:   { walkable: true,  minable: true },
  entrance: { walkable: true,  minable: false },
  doorstep: { walkable: true,  minable: false },
  field:    { walkable: true,  minable: true },
  // Not a cell at all: a wall, a cliff face, or sea. Nothing stands on it and
  // nothing is buried under it.
  blocked:  { walkable: false, minable: false },
};

/** Can a rabbit stand on a cell of this kind? */
export const cellIsWalkable = (cell: BurrowCell): boolean => CELL_RULES[cell].walkable;

/** Can the owner bury a bomb in a cell of this kind? */
export const cellIsMinable = (cell: BurrowCell): boolean => CELL_RULES[cell].minable;
