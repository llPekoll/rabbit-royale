/**
 * The bag and the shelf: what a player holds, and what buying costs.
 *
 * Pure functions over rows, in the shape the rest of this codebase uses — the
 * same maths answers the API, the shop's "can I afford this?" and the tests, so
 * the button and the server can never disagree about a price.
 *
 * Two things live outside the `inventory` table on purpose, and this module is
 * where they are folded back in so a client sees one bag rather than the
 * storage split:
 *  - TRAPS sit on the player row, beside the timestamp their free daily
 *    allowance is derived from (lib/game/traps);
 *  - ENERGY is not held at all — a refill is applied on purchase, so what the
 *    shelf reports for it is how many refills the daily cap still allows.
 */
import { ENERGY_PACK, SHOP, itemCap, itemPrice, itemUsdcPrice } from '@config/tuning';
import { availableTraps, type TrapRow } from './traps';

/** The kinds the shop sells. Same set the `item_kind` enum stores. */
export const ITEM_KINDS = ['trap', 'bomb', 'lightning', 'shield', 'energy'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** The kinds that are actually CARRIED. Energy is spent as it is bought. */
export const CARRIED_KINDS = ['trap', 'bomb', 'lightning', 'shield'] as const;
export type CarriedKind = (typeof CARRIED_KINDS)[number];

export function isItemKind(v: unknown): v is ItemKind {
  return typeof v === 'string' && (ITEM_KINDS as readonly string[]).includes(v);
}

/** One row of the `inventory` table. */
export interface InventoryRow {
  kind: string;
  qty: number;
}

/** How many paid energy refills this player has left today, and their row. */
export interface EnergyPackRow {
  energyPacksBought: number;
  energyPacksSince: Date;
}

/** What a player holds, every kind present even at zero. */
export type Holdings = Record<ItemKind, number>;

/**
 * Paid refills already taken in the current rolling window.
 *
 * A ROLLING window, like the trap allowance and for the same reason: a midnight
 * reset punishes whoever plays at the wrong hour and invites a stampede at the
 * boundary. The window opens on the first purchase and closes WINDOW_MS later,
 * after which the count is stale and reads as zero.
 */
export function energyPacksUsed(row: EnergyPackRow, now = Date.now()): number {
  const elapsed = now - row.energyPacksSince.getTime();
  if (elapsed >= ENERGY_PACK.WINDOW_MS) return 0;
  return Math.min(ENERGY_PACK.MAX_PER_DAY, row.energyPacksBought);
}

/** Refills the cap still allows right now. */
export function energyPacksLeft(row: EnergyPackRow, now = Date.now()): number {
  return Math.max(0, ENERGY_PACK.MAX_PER_DAY - energyPacksUsed(row, now));
}

/**
 * The window fields to write when a refill is bought.
 *
 * Restarts the window when the old one has lapsed, so five refills a day cannot
 * be turned into ten by straddling a boundary.
 */
export function spendEnergyPack(row: EnergyPackRow, now = Date.now()): EnergyPackRow {
  const used = energyPacksUsed(row, now);
  return used === 0
    ? { energyPacksBought: 1, energyPacksSince: new Date(now) }
    : { energyPacksBought: used + 1, energyPacksSince: row.energyPacksSince };
}

/**
 * Fold the inventory rows, the trap columns and the energy window into one bag.
 *
 * Every kind is present even at zero, so a client renders "0 bombs" rather than
 * an empty shelf — an item you cannot see is an item you do not know exists,
 * and a large part of the shop's job is teaching that these things exist.
 */
export function holdings(
  rows: InventoryRow[],
  row: TrapRow & EnergyPackRow,
  now = Date.now(),
): Holdings {
  const bag = { trap: 0, bomb: 0, lightning: 0, shield: 0, energy: 0 } as Holdings;
  for (const r of rows) if (isItemKind(r.kind)) bag[r.kind] = r.qty;
  // Traps and energy override whatever the table said: neither is stored there.
  bag.trap = availableTraps(row, now);
  bag.energy = energyPacksUsed(row, now);
  return bag;
}

export interface ShopItem {
  kind: ItemKind;
  /** Price in carrots. Every line has one — see SHOP in tuning. */
  price: number;
  /** Price in whole USDC. Every line has one of these too. */
  usdc: number;
  /** How many the player has right now. For energy: refills taken today. */
  held: number;
  /** Ceiling on holdings of this kind. For energy: refills allowed per day. */
  cap: number;
  /** Affordable in carrots AND under the cap. */
  canBuy: boolean;
  /** Under the cap — the USDC button only needs this, since the wallet, not
   *  the carrot stock, decides whether the money is there. */
  hasRoom: boolean;
}

/**
 * The shelf, priced against a specific player.
 *
 * Returns every kind whether or not it can be afforded: a shop that hides what
 * you cannot buy gives a player nothing to save towards.
 */
export function shopShelf(bag: Holdings, stock: number): ShopItem[] {
  return ITEM_KINDS.map((kind) => {
    const cap = itemCap(kind);
    const hasRoom = bag[kind] < cap;
    return {
      kind,
      price: itemPrice(kind),
      usdc: itemUsdcPrice(kind),
      held: bag[kind],
      cap,
      canBuy: stock >= itemPrice(kind) && hasRoom,
      hasRoom,
    };
  });
}

/** Carrots for `qty` of `kind`. Flat — no bulk discount, because a discount on
 *  offence is a discount on hurting people who bought none. */
export const purchaseCost = (kind: ItemKind, qty: number) => itemPrice(kind) * qty;

/** Whole USDC for `qty` of `kind`. Rounded to the cent the quote is stated in;
 *  the base-unit conversion happens once, at the payment's edge. */
export const purchaseUsdc = (kind: ItemKind, qty: number) =>
  Math.round(itemUsdcPrice(kind) * qty * 100) / 100;

/**
 * Why a purchase cannot happen, or null when it can.
 *
 * A REASON rather than a boolean, so the API can say "you need 120 more
 * carrots" instead of a bare 400 — the same choice `upgradeBlocker` makes.
 *
 * `stock` is optional because the USDC route has no carrot stock to check:
 * omitted, everything but affordability is still enforced. The caps, the
 * quantity limit and the daily energy window apply to money exactly as they
 * apply to carrots — that is what keeps the paid route a convenience rather
 * than a second, better game.
 */
export function purchaseBlocker(
  kind: ItemKind,
  qty: number,
  bag: Holdings,
  stock?: number,
): string | null {
  if (!Number.isInteger(qty) || qty < 1) return 'bad_quantity';
  if (qty > SHOP.MAX_QTY_PER_PURCHASE) return 'too_many_at_once';
  if (bag[kind] + qty > itemCap(kind)) {
    return kind === 'energy' ? 'daily_energy_limit' : 'inventory_full';
  }
  if (stock !== undefined && stock < purchaseCost(kind, qty)) return 'insufficient_carrots';
  return null;
}
