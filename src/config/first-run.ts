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
  warnStage: number;
}

/** Every beat's key — what the dictionaries are keyed by. */
export type FirstRunBeatId = 'tap' | 'numbers' | 'mark' | 'marked' | 'bomb' | 'golden' | 'chest' | 'clock';

export const FIRST_RUN_BEATS: readonly FirstRunBeat[] = [
  { id: 'tap', when: () => true, sticky: true },
  { id: 'numbers', when: (s) => s.tiles >= 1 },
  // The red X, taught on the second dig: by then a number is on screen and
  // the taught bomb is one tile from it. Digging costs energy now, so this is
  // not an extra — it is how the run goes on. `marked` answers the first
  // right one, because a bar that moved by eight is easy to miss.
  { id: 'mark', when: (s) => s.tiles >= 2 },
  { id: 'marked', when: (s) => (s.flags ?? 0) >= 1 },
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
