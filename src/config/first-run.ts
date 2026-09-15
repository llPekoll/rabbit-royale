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
export interface FirstRunBeat {
  id: string;
  text: string;
  when(s: FirstRunState): boolean;
  /** Holds until the next beat rather than fading on a clock. */
  sticky?: boolean;
}

export interface FirstRunState {
  tiles: number;
  bombs: number;
  goldens: number;
  chests: number;
  warnStage: number;
}

export const FIRST_RUN_BEATS: readonly FirstRunBeat[] = [
  {
    id: 'tap',
    text: 'Tap a tile beside you to dig it.',
    when: () => true,
    sticky: true,
  },
  {
    id: 'numbers',
    text: 'The number counts the bombs touching that tile.',
    when: (s) => s.tiles >= 1,
  },
  {
    id: 'bomb',
    text: 'One heart gone. The 1 was pointing at it.',
    when: (s) => s.bombs >= 1,
  },
  {
    id: 'golden',
    text: 'Gold gives a heart back.',
    when: (s) => s.goldens >= 1,
  },
  {
    id: 'chest',
    text: 'A chest. Whatever it holds goes home with you.',
    when: (s) => s.chests >= 1,
  },
  {
    id: 'clock',
    text: 'The island is the clock. Dig it out and it sinks.',
    when: (s) => s.warnStage >= 1,
  },
];

/** The recap's extra line, the first time. */
export const FIRST_RUN_RECAP = 'Your carrots are home now. Go and see.';

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
