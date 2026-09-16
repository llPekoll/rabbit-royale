/**
 * The phrases that run through the wordmark's ribbon.
 *
 * THE WORDS ARE IN THE DICTIONARIES now (`t.taglines`), because there are four
 * sets of them. What stays here is the PICKER — the rule that a reroll never
 * lands on the phrase already showing, which two surfaces rely on: the sign-in
 * screen scrolls them in the DOM (components/logo-banner.tsx) and the Pixi
 * ticker draws the same list on a canvas (game/ui/TaglineRibbon.ts).
 *
 * ALL CAPS, IN ENGLISH ONLY. The arcade-kit's basic face has no lowercase, so
 * a lowercase letter renders as a missing glyph — which is why the English
 * list shouts. The other three languages fall back to a face that has both
 * cases (see i18n/locales.ts) and write their phrases normally.
 * `test/pixel-font-glyphs.test.ts` is what catches a stray glyph.
 */

/** A phrase from `list` that is not `current` — so a reroll always changes. */
export function nextTagline(list: readonly string[], current?: string): string {
  const pool = list.filter((t) => t !== current);
  return pool[Math.floor(Math.random() * pool.length)] ?? list[0];
}
