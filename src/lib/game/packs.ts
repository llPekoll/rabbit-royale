/**
 * The shop's packs: several items for one press (SHOP_PACKS in tuning).
 *
 * A pack is a PURCHASE KIND, like the season pass, not an item: the receipt
 * and the payment row name the pack, and `grantItem` opens it into the bag.
 * It rides both rails — carrots through api/shop, money through api/shop/pay —
 * with the same checks, because the caps are what keep the paid route a
 * convenience.
 */
import { SHOP_PACKS } from '@config/tuning';
import { itemCap } from '@/lib/tuning/tables';
import { tuned } from '@/lib/tuning/live';
import type { Holdings, ShopKind } from './inventory';

export type PackKind = keyof typeof SHOP_PACKS;
export const PACK_KINDS = Object.keys(SHOP_PACKS) as PackKind[];

export function isPackKind(v: unknown): v is PackKind {
  return typeof v === 'string' && (PACK_KINDS as string[]).includes(v);
}

export interface PackLine {
  kind: ShopKind;
  qty: number;
}

/** What is inside one pack. */
export function packItems(kind: PackKind): PackLine[] {
  return SHOP_PACKS[kind].items.map((it) => ({ kind: it.kind, qty: it.qty }));
}

/** Carrots for one pack, through the live surcharge like every shelf price. */
export const packPrice = (kind: PackKind): number => tuned(`SHOP_PACKS.${kind}.price`);

/** Whole USDC for one pack, rounded to the cent the quote is stated in. */
export const packUsdc = (kind: PackKind): number =>
  Math.round(tuned(`SHOP_PACKS.${kind}.usdc`) * 100) / 100;

/** Does every item fit under its own ceiling? */
export function packFits(kind: PackKind, bag: Holdings): boolean {
  return packItems(kind).every((it) => bag[it.kind] + it.qty <= itemCap(it.kind));
}

/**
 * Why a pack cannot be bought, or null when it can — `purchaseBlocker`'s
 * shape. `stock` omitted on the money rail, as there.
 *
 * `bag_full` when ANY item would overflow: a sale is delivered in full, so a
 * pack that half-fits is refused whole rather than sold and clipped.
 */
export function packBlocker(
  kind: PackKind,
  qty: number,
  bag: Holdings,
  stock?: number,
): string | null {
  if (qty !== 1) return 'bad_quantity';
  if (!packFits(kind, bag)) return 'bag_full';
  if (stock !== undefined && stock < packPrice(kind)) return 'insufficient_carrots';
  return null;
}

/** A pack on the shelf: the ShopItem fields plus what is inside. */
export interface ShopPack {
  kind: PackKind;
  side: 'defence' | 'attack';
  price: number;
  usdc: number;
  /** Packs are not held: always 0 of 1, so the shelf's arithmetic holds. */
  held: number;
  cap: number;
  canBuy: boolean;
  hasRoom: boolean;
  items: PackLine[];
}

/** Both packs, priced against a specific player. */
export function packShelf(bag: Holdings, stock: number): ShopPack[] {
  return PACK_KINDS.map((kind) => {
    const hasRoom = packFits(kind, bag);
    return {
      kind,
      side: SHOP_PACKS[kind].side,
      price: packPrice(kind),
      usdc: packUsdc(kind),
      held: 0,
      cap: 1,
      canBuy: hasRoom && stock >= packPrice(kind),
      hasRoom,
      items: packItems(kind),
    };
  });
}
