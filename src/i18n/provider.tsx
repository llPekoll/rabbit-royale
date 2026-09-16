'use client';

/**
 * The language the game is in, for the whole client.
 *
 * ONE SOURCE, SHARED — the same lesson use-wallet-login.tsx learned the hard
 * way. A plain hook with `useState` would give the home screen's picker its own
 * copy of the choice and the burrow its own; switching to French in the picker
 * would leave every other surface in English until a remount. So the language
 * lives in a context, and `useT` reads it.
 *
 * WHERE THE CHOICE COMES FROM, in order:
 *  1. what the player last picked, in localStorage;
 *  2. failing that, what the browser asks for (`navigator.languages`);
 *  3. failing that, English.
 *
 * WHY THE FIRST PAINT IS ALWAYS THE DEFAULT. Neither localStorage nor
 * `navigator` exists on the server, so reading them during render would make
 * the markup disagree with the server's and React would throw away the tree it
 * just streamed. The stored choice is therefore applied in an effect, after
 * mount. The cost is one frame of English on a French player's first load; the
 * alternative is a hydration mismatch on every load.
 *
 * `<html lang>` IS SET FROM HERE, not in layout.tsx, because the font stack
 * hangs off it: globals.css picks the fallback face with `[lang="zh"]` and
 * friends, since the kit's ASCII atlas cannot draw those languages at all.
 * See i18n/locales.ts.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE, LOCALE_META, isLocale, matchLocale, type Locale,
} from './locales';
import { DICTIONARIES, type Dict } from './dictionaries';

const STORE_KEY = 'rr_lang';

interface LocaleContextValue {
  locale: Locale;
  setLocale(next: Locale): void;
  dict: Dict;
  /**
   * False until the stored choice has been applied. The picker uses it to
   * avoid announcing a language the player has not landed on yet.
   */
  settled: boolean;
}

const Ctx = createContext<LocaleContextValue | null>(null);

/** What to start in, read once on the client. Never called during render. */
function storedLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Private mode, or storage disabled. The browser's own list is still good.
  }
  return matchLocale(window.navigator.languages ?? [window.navigator.language]);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [settled, setSettled] = useState(false);

  // After mount, never during render: see the header.
  useEffect(() => {
    setLocaleState(storedLocale());
    setSettled(true);
  }, []);

  // The document follows the choice. `lang` drives the font stack in
  // globals.css and tells a screen reader which voice to use; without it a
  // Chinese interface is announced in English phonemes.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORE_KEY, next);
    } catch {
      // Not fatal: the choice still holds for this session.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    dict: DICTIONARIES[locale],
    settled,
  }), [locale, setLocale, settled]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The dictionary, plus the language around it.
 *
 * Returns the whole `dict` object rather than a `t('some.key')` lookup on
 * purpose. A key-string API is a runtime contract — a typo is a blank label
 * that only shows up on a device — whereas `t.shop.buy` is checked by the
 * compiler, autocompletes, and makes an unused string findable. Interpolation
 * is a function on the dictionary (`t.next.raid(name, n)`) for the same
 * reason: the arguments are typed.
 *
 * Outside a provider it falls back to English rather than throwing, so a
 * Storybook story can render a component without wrapping it.
 */
export function useT(): Dict {
  return useContext(Ctx)?.dict ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** The choice itself, for the picker and for anything formatting numbers. */
export function useLocale(): LocaleContextValue {
  return useContext(Ctx) ?? {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    dict: DICTIONARIES[DEFAULT_LOCALE],
    settled: true,
  };
}

/** Whether the kit's bitmap face can draw the current language. */
export function usePixelFace(): boolean {
  return LOCALE_META[useLocale().locale].pixelFace;
}
