/**
 * The four languages the game speaks, and the one fact that decides how each
 * one is DRAWN.
 *
 * The arcade-kit's face (`@domin8/arcade-kit`, a 1.6KB woff2 generated from an
 * 8x8 ASCII atlas) covers printable ASCII 32-126 and nothing else. That is not
 * a limitation worth fighting: it is the game's look. But it means an "é", an
 * "ã" and every single sinogram render as blanks — the same failure
 * `test/pixel-font-glyphs.test.ts` was written to catch for em dashes, except
 * that here it is half the alphabet rather than one punctuation mark.
 *
 * So the face is a PER-LANGUAGE choice, not a global one. English keeps the
 * kit's bitmap face because it fits inside the atlas. The other three fall
 * back to a pixel-ish system stack, applied through `[lang]` rules in
 * globals.css — see `--font-pixel` there. `pixelFace` is what says which.
 *
 * ADDING A LANGUAGE means adding an entry here, a dictionary file beside
 * `en.ts`, and (if it needs glyphs the kit lacks) a `[lang=…]` rule in
 * globals.css. Nothing else reads this list by hand.
 */

/** Every language tag the game ships. The union is what the dictionaries key on. */
export const LOCALES = ['en', 'fr', 'zh', 'pt-BR'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export interface LocaleMeta {
  /** The tag itself — also what goes on `<html lang>`. */
  code: Locale;
  /** The language's name IN that language. A picker that says "French" to a
   *  French speaker is a picker written for the developer, not the player. */
  label: string;
  /** The flag, for the picker. Emoji: drawn by the system font, never by the
   *  kit's atlas, so it is safe in every language. */
  flag: string;
  /**
   * Can the kit's ASCII bitmap face draw this language?
   *
   * `false` sends the whole interface to the fallback stack for that language,
   * in the DOM (globals.css) and on the Pixi canvas alike (see
   * `game/ui/text.ts`). Only English is true, and that is unlikely to change:
   * accents alone already leave the atlas.
   */
  pixelFace: boolean;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { code: 'en', label: 'English', flag: '🇬🇧', pixelFace: true },
  fr: { code: 'fr', label: 'Français', flag: '🇫🇷', pixelFace: false },
  zh: { code: 'zh', label: '中文', flag: '🇨🇳', pixelFace: false },
  'pt-BR': { code: 'pt-BR', label: 'Português', flag: '🇧🇷', pixelFace: false },
};

/** The picker's order: the list, as meta, in declaration order. */
export const LOCALE_LIST: readonly LocaleMeta[] = LOCALES.map((c) => LOCALE_META[c]);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best language for a browser, from `navigator.languages`.
 *
 * Matches the exact tag first ("pt-BR"), then the bare language ("pt" ->
 * "pt-BR", "zh-Hans" -> "zh"), which is what a browser actually reports. Falls
 * back to English rather than guessing — a player who lands in the wrong
 * language can fix it in one tap on the home screen, and a wrong guess that
 * looks deliberate is worse than the default.
 */
export function matchLocale(preferred: readonly string[]): Locale {
  for (const raw of preferred) {
    const tag = raw.trim();
    if (!tag) continue;
    const exact = LOCALES.find((l) => l.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const base = tag.split('-')[0]!.toLowerCase();
    const loose = LOCALES.find((l) => l.split('-')[0]!.toLowerCase() === base);
    if (loose) return loose;
  }
  return DEFAULT_LOCALE;
}

/**
 * The tag to hand `Intl` and `toLocaleString`.
 *
 * Kept separate from `Locale` because the two lists are allowed to diverge:
 * the game's "zh" is Simplified, which `Intl` wants as "zh-Hans" to pick the
 * right grouping. Today it is a pass-through for three of the four.
 */
export function intlTag(locale: Locale): string {
  return locale === 'zh' ? 'zh-Hans' : locale;
}
