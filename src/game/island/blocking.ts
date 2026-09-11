/**
 * What every thing standing on the island does to the cell under it.
 *
 * This file exists because of a bug that was not really a bug: trees were
 * drawn on cells the board still called free, so the ring offered a tile with
 * a pine tree on it and the rabbit walked behind the trunk. The board knew
 * about the sea, the cliffs and the livestock, and nothing else — because the
 * scenery had been built as SCENERY, at a time when the playing grid was a
 * separate thing laid on top.
 *
 * So blocking is not a property the board guesses from a sprite's name. Every
 * kind of thing declares it here, once, and both halves read the same answer:
 * the view to draw it, the board to refuse the step. A highlight is then not
 * an extra layer that has to be kept in sync with the rules — it IS the rules,
 * rendered. No highlight, no passage.
 *
 * Adding a new kind of scenery means adding a line here. Forgetting to is the
 * failure this design is meant to make impossible: there is nowhere else to
 * put the answer.
 */

/** Every kind of thing that can stand on a cell. */
export type ThingKind =
  | 'tree'
  | 'stump'
  | 'rock'
  | 'bush'
  | 'prop'
  | 'landmark'
  | 'sheep'
  | 'soldier';

export interface ThingRule {
  /** Can a rabbit stand on this cell? */
  blocks: boolean;
  /**
   * Does it move on its own?
   *
   * Only sheep do. A blocked route past a flock can open if you wait, where a
   * soldier's never will — that difference is the whole reason both exist.
   */
  wanders: boolean;
  /**
   * Fade to this alpha while the rabbit is behind it, 1 to never fade.
   *
   * For things tall enough to hide the player. A bush is waist-high scenery a
   * rabbit disappears into, which reads as a bug rather than as cover unless
   * the bush gets out of the way — so it goes see-through instead of being
   * made walkable, and the cell stays honestly blocked.
   */
  fadeTo: number;
}

/**
 * The rules, one line per kind.
 *
 * `prop` is the loose ground clutter — mushrooms, bones, small stones. They
 * are the one kind that does NOT block: they are flat on the ground, a rabbit
 * steps over them, and blocking on each of them would eat the island a
 * mushroom at a time. Everything with a volume blocks.
 */
export const THING_RULES: Record<ThingKind, ThingRule> = {
  tree:     { blocks: true,  wanders: false, fadeTo: 0.45 },
  stump:    { blocks: true,  wanders: false, fadeTo: 1 },
  rock:     { blocks: true,  wanders: false, fadeTo: 1 },
  bush:     { blocks: true,  wanders: false, fadeTo: 0.4 },
  prop:     { blocks: false, wanders: false, fadeTo: 1 },
  landmark: { blocks: true,  wanders: false, fadeTo: 0.5 },
  sheep:    { blocks: true,  wanders: true,  fadeTo: 1 },
  soldier:  { blocks: true,  wanders: false, fadeTo: 1 },
};

/** Does a thing of this kind take its cell out of play? */
export const blocksCell = (kind: ThingKind): boolean => THING_RULES[kind].blocks;

/** Does a thing of this kind move around on its own? */
export const wanders = (kind: ThingKind): boolean => THING_RULES[kind].wanders;

/** What a thing of this kind fades to when the rabbit is behind it. */
export const fadeAlpha = (kind: ThingKind): number => THING_RULES[kind].fadeTo;
