/**
 * The phrases that run through the wordmark's ribbon.
 *
 * They live here rather than beside either renderer because there are two: the
 * sign-in screen scrolls them in the DOM (components/logo-banner.tsx) and the
 * Pixi ticker (game/ui/TaglineRibbon.ts) draws the same list on a canvas. One
 * list, so a phrase added for one surface never quietly misses the other.
 *
 * ALL CAPS is not shouting — the arcade-kit's basic face has no lowercase, so a
 * lowercase letter renders as a missing glyph. `test/pixel-font-glyphs.test.ts`
 * is what catches that.
 */
export const TAGLINES = [
  'EVERY STEP COULD BE YOUR LAST... OR YOUR FORTUNE',
  'CROSS THE ISLAND, CLAIM THE GOLD, OR DIE TRYING',
  'THE BRAVE HOP FURTHER - THE LUCKY HOP HOME',
  'STEP BY STEP, THE ISLAND TAKES OR THE ISLAND GIVES',
  'ONLY THE BOLD SURVIVE - ONLY THE WISE CASH OUT',
] as const;

/** A phrase that is not `current` — so a reroll always visibly changes. */
export function nextTagline(current?: string): string {
  const pool = TAGLINES.filter((t) => t !== current);
  return pool[Math.floor(Math.random() * pool.length)] ?? TAGLINES[0];
}
