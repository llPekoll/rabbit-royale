/**
 * THE FOUR DICTIONARIES, and the type they all answer to.
 *
 * `Dict` is DERIVED from the English file rather than declared by hand. That
 * is the whole safety net: `fr`, `zh` and `pt-BR` are each annotated `: Dict`,
 * so a key that is missing, misspelled, or whose function takes the wrong
 * arguments is a compile error — not a blank label discovered on a phone. It
 * also means adding a string is a single edit in `en.ts`; the other three
 * files then refuse to compile until they have it too, which is exactly the
 * reminder a translation needs.
 *
 * Lists (`taglines`) and content tables (`lore`, `quests`, `items`) are typed
 * the same way, so a language cannot quietly ship five taglines where English
 * has five and a chapter short in the codex.
 */
import { DEFAULT_LOCALE, type Locale } from './locales';
import { en } from './dict/en';
import { fr } from './dict/fr';
import { zh } from './dict/zh';
import { ptBR } from './dict/pt-BR';

export type Dict = typeof en;

export const DICTIONARIES: Record<Locale, Dict> = {
  en,
  fr,
  zh,
  'pt-BR': ptBR,
};

/** The English dictionary, for code that runs before a provider exists. */
export const DEFAULT_DICT = DICTIONARIES[DEFAULT_LOCALE];
