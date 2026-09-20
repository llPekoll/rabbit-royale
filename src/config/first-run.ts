/**
 * What the island says during the first run — one line per beat.
 *
 * The first island is dealt so that these beats happen in this order (see
 * FIRST_RUN in tuning and `firstIslandLayout`); the captions only name what
 * the player has just done. No caption ever precedes its mechanic, and none
 * asks the player to read more than twelve words: this is a strip over a
 * board the player is tapping, not a card they are reading.
 *
 * `when` is the condition, over the mover's own tally (`MyDigs`) and the run's
 * state. The LAST caption whose condition holds is the one shown, so a beat
 * the player skips (they read the "1" and never step on the bomb) simply
 * never speaks — the lesson was learned the other way.
 */
/**
 * One beat of the first run.
 *
 * THE WORDS ARE NOT HERE. A beat's caption is the dictionary's
 * (`t.firstRun[id]`), keyed by this `id`; what stays is the CONDITION, which
 * is the same in every language. See i18n/dict/en.ts.
 */
export interface FirstRunBeat {
  id: FirstRunBeatId;
  when(s: FirstRunState): boolean;
  /** Holds until the next beat rather than fading on a clock. */
  sticky?: boolean;
}

export interface FirstRunState {
  tiles: number;
  bombs: number;
  goldens: number;
  chests: number;
  /** Red Xs this player got RIGHT. Optional: older fixtures predate the X. */
  flags?: number;
  /**
   * Is X mode armed right now?
   *
   * The one part of the state that is not a tally, because the X is the one
   * lesson that is about a MODE rather than about something that happened.
   * `aim` needs it to know the player has pressed the button and is now
   * looking for a tile. Optional: older fixtures predate it.
   */
  armed?: boolean;
  warnStage: number;
}

/** Every beat's key — what the dictionaries are keyed by. */
export type FirstRunBeatId =
  | 'tap' | 'numbers' | 'counts' | 'prove' | 'mark' | 'aim' | 'marked'
  | 'fetch' | 'bomb' | 'golden' | 'chest' | 'clock';

/**
 * THE ARC, in teaching order: a number, then the X, then the chest.
 *
 * Three lessons, each the ground the next stands on. The X is unsayable
 * without the number ("only one tile is left" means nothing if the glyph does
 * not), and the chest is the only one that asks the player to LEAVE the spot
 * they are standing on — a thing to ask once they can read the ground they
 * are crossing. Built and judged as `First run/0 Whole run` in Storybook
 * before it was wired here.
 *
 * WHY THE X GETS THREE BEATS. It is the one mechanic that cannot be learned
 * by accident: nobody arms a mode at random, so it has to be provoked, and a
 * two-step gesture taught in one step is what shipped before (see `mark`
 * alone, and mark-bomb-button.tsx's note on the button being redrawn for the
 * same reason). `prove` names the deduction and points at the BUTTON; `aim`
 * fires once the mode is armed and points at the TILE; `marked` answers the
 * result. One instruction per beat, and each one is about one object.
 */
export const FIRST_RUN_BEATS: readonly FirstRunBeat[] = [
  { id: 'tap', when: () => true, sticky: true },
  // THE NUMBER FIRST, and it HOLDS. The glyph is what every later beat points
  // at, so the run does not move on until the player has dug a second tile —
  // a line that fades after four seconds taught nothing, which is what the
  // shipped `numbers` beat did on its own.
  { id: 'numbers', when: (s) => s.tiles >= 1, sticky: true },
  { id: 'counts', when: (s) => s.tiles >= 2 },
  // The X, in three beats. `prove` states the deduction the board has just
  // made available and names the button; `aim` only fires once the mode is
  // actually armed, which is the handover from the corner of the screen to a
  // cell in the middle of it.
  { id: 'prove', when: (s) => s.tiles >= 3 },
  { id: 'mark', when: (s) => s.tiles >= 3 && !s.armed },
  { id: 'aim', when: (s) => s.armed === true },
  { id: 'marked', when: (s) => (s.flags ?? 0) >= 1 },
  // ...and then the chest, which is where the first island already ends
  // (`run.ts` sets `tutorialDone` on it) and which already has an arrow over
  // it (`fx/ChestPointer`). What was missing was the sentence that sends the
  // player, at the moment the X has just paid.
  { id: 'fetch', when: (s) => (s.flags ?? 0) >= 1 && s.chests < 1 },
  { id: 'bomb', when: (s) => s.bombs >= 1 },
  { id: 'golden', when: (s) => s.goldens >= 1 },
  { id: 'chest', when: (s) => s.chests >= 1 },
  { id: 'clock', when: (s) => s.warnStage >= 1 },
];

/**
 * The beat to show for a state: the LAST one whose condition holds.
 *
 * Order in the list is order of teaching, which is also the order the island
 * makes them happen — so "last that holds" is "the newest thing you did".
 */
export function firstRunBeat(s: FirstRunState): FirstRunBeat | null {
  let found: FirstRunBeat | null = null;
  for (const b of FIRST_RUN_BEATS) if (b.when(s)) found = b;
  return found;
}
