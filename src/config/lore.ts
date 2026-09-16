/**
 * The Cursed Crown — the codex, and the milestones that open it.
 *
 * The GDD's narrative rule is the Hades one: the story advances on LIFETIME
 * carrots, never on season score. That distinction is the whole design. Season
 * score is taken by raids and wiped at the roll-over — hanging the story on it
 * would mean a player who was robbed loses chapters they already read, and a
 * player who resets starts the story again. Lifetime is never stolen and never
 * reset, so a bad run, a raided burrow and a lost season all still move the
 * story forward. You cannot fall out of the story; you can only be slow.
 *
 * The chapters are written to be read in the order the game teaches its rules,
 * not in the order the island's history happened. Chapter 1 lands at zero — a
 * player who has never dug still has something to open, because a locked codex
 * on first sight reads as a bug rather than as a promise.
 *
 * Thresholds are carrots, and they are deliberately steep at the top: the last
 * chapter is meant to be a season's work, not a week's. Tune the curve here —
 * nothing else reads these numbers.
 */

/**
 * Every chapter's key, as a union rather than `string`.
 *
 * It is what the codex quest points at (`codexMark`), and what each language's
 * lore table is keyed by — so a translation that misses a chapter, or invents
 * one, is a compile error rather than a blank scroll on a device. The ids are
 * persisted in quest marks, so they are never renamed.
 */
export type LoreId =
  | 'the-island'
  | 'the-numbers'
  | 'the-burrow'
  | 'the-crown'
  | 'the-eruption'
  | 'the-sacrifice';

/**
 * A chapter's SHAPE — the thresholds, not the words.
 *
 * The prose moved to the dictionaries (i18n/dict/*.ts, keyed by `LoreId`) when
 * the game learned four languages. What stays here is what is the same in
 * every one of them: which chapter it is, where it sits in the order, and what
 * it costs to open. `loreView` in i18n/content.ts puts the two halves back
 * together for whoever is reading.
 */
export interface LoreChapter {
  /** Stable key. Persisted in nothing yet, but the read-marker will use it. */
  id: LoreId;
  /** Roman numeral shown on the scroll's tab. Locale-neutral: I, II, III. */
  numeral: string;
  /** Lifetime carrots needed. Chapter 1 is 0 — always open. */
  unlockAt: number;
}

export const LORE: LoreChapter[] = [
  { id: 'the-island', numeral: 'I', unlockAt: 0 },
  { id: 'the-numbers', numeral: 'II', unlockAt: 500 },
  { id: 'the-burrow', numeral: 'III', unlockAt: 2_000 },
  { id: 'the-crown', numeral: 'IV', unlockAt: 8_000 },
  { id: 'the-eruption', numeral: 'V', unlockAt: 25_000 },
  { id: 'the-sacrifice', numeral: 'VI', unlockAt: 60_000 },
];

/** How many chapters a given lifetime total has opened. */
export function unlockedCount(lifetimeCarrots: number): number {
  return LORE.filter((c) => lifetimeCarrots >= c.unlockAt).length;
}

/**
 * The next chapter still to open, and how far off it is — the panel's "keep
 * digging" line. Null once the codex is complete.
 */
export function nextChapter(lifetimeCarrots: number):
  { chapter: LoreChapter; remaining: number } | null {
  const chapter = LORE.find((c) => lifetimeCarrots < c.unlockAt);
  return chapter ? { chapter, remaining: chapter.unlockAt - lifetimeCarrots } : null;
}
