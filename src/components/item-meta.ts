/**
 * WHAT EACH ITEM LOOKS LIKE, AND WHAT ITS COUNT MEANS.
 *
 * One registry, because two surfaces read it: the shop, which sells these
 * things, and the burrow's kit row, which shows what you are carrying. It used
 * to live inside `shop-card.tsx` as a private const — correct while the shop
 * was the only place an item had a face, and wrong the moment a second surface
 * needed the same one. A copy would have drifted on the first retint.
 *
 * THE NAMES ARE NOT HERE. An item's name and its blurb are the two things
 * about it that change with the language, so they live in the dictionaries
 * (`t.items[kind]`), keyed by the same `ItemKind` this table is — which is
 * what makes a missing translation a compile error.
 *
 * ICONS ARE PICKED FOR COVERAGE, NOT FOR TASTE. The interface renders in a
 * monospace stack, and an emoji it has no glyph for comes out as a blank box —
 * a hole and a shopping trolley both did, which is invisible in review and
 * obvious in a screenshot. That note is carried over from the shop verbatim
 * because it is still the rule.
 *
 * `tint` is the item's own colour, and each says what the thing DOES: the trap
 * is buried earth, the bomb is fuse-red, lightning is storm-yellow, the shield
 * is cold steel, energy is carrot. A shelf where every card was the same grey
 * is the version this replaces.
 */
import type { ItemKind } from './use-shop';
import type { Dict } from '@/i18n/dictionaries';

/**
 * How an item's count should be READ, which differs by what is being counted.
 *
 * Three kinds, and the split is not cosmetic — it is the difference between a
 * number that means "in your pocket" and one that means "time left on a thing
 * already running":
 *
 *  - `carried` — a thing you hold. "3/20", and the cap is real.
 *  - `daily`   — refills the day still allows. Energy is never HELD; it is
 *                applied the moment it is bought, so what the shelf reports is
 *                how many more the cap permits.
 *  - `time`    — not a thing at all. Smoke is an expiry instant, reported as
 *                whole days of cover left.
 */
export type CountKind = 'carried' | 'daily' | 'time';

/**
 * WHAT AN ITEM LOOKS LIKE. Its NAME and its blurb are in the dictionaries
 * (`t.items[kind]`), keyed by the same `ItemKind` — they are the only two
 * things about an item that change with the language. Everything here is the
 * same in all four.
 */
export interface ItemMeta {
  icon: string;
  tint: string;
  counts: CountKind;
  /**
   * Pixel art for this kind, where the game has some.
   *
   * Only a few do, and that is deliberate rather than an oversight to fill in:
   * these files are the CHEST's art (`chest-prize.tsx` flies the identical
   * ones off the board), so a kind has a sprite exactly when a chest can drop
   * it. Everything else falls back to the emoji above, which is why `icon` is
   * required and this is not.
   */
  art?: string;
  /** The sprite's width over its height, so it is never stretched. */
  aspect?: number;
}

export const ITEM_META: Record<ItemKind, ItemMeta> = {
  trap: {
    icon: '🪤',
    tint: '#8a5a2b',
    counts: 'carried',
  },
  bomb: {
    icon: '💣',
    tint: '#c1442e',
    counts: 'carried',
    /* NO `art`, deliberately — the emoji stands in.
       `chest-prize.tsx` gives the bomb `bolt.webp`, the same file it gives
       lightning, which is survivable in a reveal that names the drop in type
       underneath it. In a row of six silhouettes with no labels it is not: the
       two slots came out as one identical yellow bolt twice, and a row whose
       whole job is "what am I carrying" cannot answer it with a picture that
       means two things. Until the bomb has art of its own the emoji is the
       honest option, because it is at least distinct. */
  },
  lightning: {
    icon: '⚡',
    tint: '#e0a020',
    counts: 'carried',
    art: '/assets/ui/icons/bolt.webp',
    aspect: 29 / 24,
  },
  shield: {
    icon: '🛡️',
    tint: '#4a7fa5',
    counts: 'carried',
    art: '/assets/ui/icons/shield.webp',
    aspect: 1,
  },
  energy: {
    icon: '🥕',
    tint: '#e07a2f',
    counts: 'daily',
    /* The bolt belongs to LIGHTNING in the kit row, so energy does not take it
       either — and energy has the whole energy card to itself anyway. */
  },
  smoke: {
    icon: '🌫️',
    tint: '#6b7a8f',
    counts: 'time',
  },
  mirage: {
    icon: '🌀',
    tint: '#9a6bd6',
    counts: 'carried',
  },
};

/**
 * The count line for one item: "3/20", "2 today", "1d left".
 *
 * Shared so the shop's tile and the burrow's kit slot say the same thing about
 * the same holdings — they were two independent ternaries over `kind`, which is
 * exactly the shape that drifts. The words are the dictionary's; which of the
 * three readings applies is still `counts`.
 */
export function heldLabel(t: Dict, kind: ItemKind, held: number, cap: number): string {
  const meta = ITEM_META[kind];
  if (meta.counts === 'daily') return t.shop.heldToday(cap - held);
  if (meta.counts === 'time') return held > 0 ? t.shop.heldDaysLeft(held) : t.shop.heldOff;
  return t.shop.heldOf(held, cap);
}
