/**
 * THE SHAPE OF A DICTIONARY — the contract every language fills.
 *
 * `en.ts` is the source of truth and the type is DERIVED from it (see
 * `dictionaries.ts`), so this file holds only the pieces that need naming: the
 * content tables whose rows are keyed by an id the game already uses.
 *
 * WHY FUNCTIONS RATHER THAN "{count} left" TEMPLATES. Every interpolated line
 * is a function on the dictionary — `t.next.raid(name, n)` rather than a
 * lookup plus a bag of placeholders. The arguments are then typed, the
 * compiler catches a translation that forgot one, and a language is free to
 * put them in a different order, which is the whole reason a placeholder
 * string exists. It also means plurals are ordinary code in the language that
 * needs them, instead of a plural-rules engine the game would otherwise ship.
 */
import type { LoreId } from '@/config/lore';
import type { ItemKind } from '@/components/use-shop';

/** The translatable half of a lore chapter. The thresholds stay in config. */
export interface LoreText {
  title: string;
  teaser: string;
  body: string[];
}

/** The translatable half of an item. Icon, tint and art stay in the registry. */
export interface ItemText {
  name: string;
  blurb: string;
}

/** Keyed by `LoreId`, so a missing chapter is a compile error. */
export type LoreTable = Record<LoreId, LoreText>;
export type ItemTable = Record<ItemKind, ItemText>;
