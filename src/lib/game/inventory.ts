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
import { ENERGY_PACK, GARDEN_BOOST, SHOP, SMOKE, itemCap, itemPrice, itemUsdcPrice } from '@config/tuning';
import { tuned } from '@/lib/tuning/live';
import { availableTraps, type TrapRow } from './traps';

/**
 * Every kind the `item_kind` enum stores.
 *
 * A superset of the shop's shelf now that chests drop garden consumables: see
 * `SHOP_KINDS` for what is actually for sale. The split is deliberate — water
 * and fertiliser are found, never bought, which is what keeps the garden a
 * reward for digging rather than a second thing to spend carrots on.
 */
export const ITEM_KINDS = [
  'trap', 'bomb', 'lightning', 'shield', 'energy', 'smoke', 'mirage', 'water', 'fertiliser',
  'fence', 'bloop',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** The kinds the shop sells — the keys of SHOP.PRICES. */
export const SHOP_KINDS = [
  'trap', 'bomb', 'lightning', 'shield', 'energy', 'smoke', 'bloop', 'fence',
] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

export function isShopKind(v: unknown): v is ShopKind {
  return typeof v === 'string' && (SHOP_KINDS as readonly string[]).includes(v);
}

/**
 * The garden boosts.
 *
 * HELD AS A COUNT, spent by hand. They were TIME on the player row — the smoke
 * screen's storage, chosen for the smoke screen's reason — and a chest applied
 * them the instant it was opened. That made them the only drops in the game
 * the player never decides anything about: the best of them landed on a garden
 * that was already full, where `gardenYield` correctly pays a watering
 * nothing, so the drop the chest promised was quietly worth zero.
 *
 * So the bag holds the bottles and the player pours them. What remains on the
 * row is the WINDOW a poured one opened (`wateredUntil`, `fertilisedUntil`) —
 * that part was always right, and `gardenYield` still reads it unchanged.
 */
export const GARDEN_KINDS = ['water', 'fertiliser'] as const;
export type GardenKind = (typeof GARDEN_KINDS)[number];

export function isGardenKind(v: unknown): v is GardenKind {
  return typeof v === 'string' && (GARDEN_KINDS as readonly string[]).includes(v);
}

/** The kinds that are actually CARRIED. Energy is spent as it is bought. */
export const CARRIED_KINDS = ['trap', 'bomb', 'lightning', 'shield', 'mirage', 'fence', 'bloop'] as const;
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

/** When this burrow's clue numbers stop being hidden. */
export interface SmokeRow {
  smokeUntil: Date | null;
}

/** When each garden boost lapses. Optional — a row may predate them. */
export interface GardenBoostRow {
  wateredUntil?: Date | null;
  fertilisedUntil?: Date | null;
}

/** Are this burrow's numbers hidden right now? */
export function smokeActive(row: SmokeRow, now = Date.now()): boolean {
  return !!row.smokeUntil && row.smokeUntil.getTime() > now;
}

/** Whole days of screen still banked, rounded up — what the shelf displays. */
export function smokeDaysLeft(row: SmokeRow, now = Date.now()): number {
  if (!smokeActive(row, now)) return 0;
  return Math.ceil((row.smokeUntil!.getTime() - now) / SMOKE.DURATION_MS);
}

/**
 * The new expiry after buying `qty` screens.
 *
 * EXTENDS an active screen rather than restarting it: buying two in a row is
 * worth two days, which is what a player assumes, and restarting would quietly
 * burn the second purchase. Capped so a whale cannot buy a blind season.
 */
export function extendSmoke(row: SmokeRow, qty: number, now = Date.now()): Date {
  const from = smokeActive(row, now) ? row.smokeUntil!.getTime() : now;
  return new Date(Math.min(from + qty * SMOKE.DURATION_MS, now + SMOKE.MAX_MS));
}

/** How long one unit of each garden boost runs for. */
const GARDEN_DURATION_MS: Record<GardenKind, number> = {
  water: GARDEN_BOOST.WATER.DURATION_MS,
  fertiliser: GARDEN_BOOST.FERTILISER.DURATION_MS,
};

/**
 * The new expiry after picking up `qty` of a garden boost.
 *
 * Extends a live window rather than restarting it — exactly `extendSmoke`, and
 * for the same player-facing reason: two waterings should be worth two windows,
 * or a chest opened while the last one still runs is a drop thrown away.
 *
 * Capped at `MAX_BANKED_MS` from now, which is what keeps a lucky week from
 * compounding into a permanently buffed garden.
 */
export function extendGardenBoost(
  kind: GardenKind,
  until: Date | null | undefined,
  qty: number,
  now = Date.now(),
): Date {
  const live = !!until && until.getTime() > now;
  const from = live ? until!.getTime() : now;
  const extended = from + qty * GARDEN_DURATION_MS[kind];
  return new Date(Math.min(extended, now + GARDEN_BOOST.MAX_BANKED_MS));
}

/** What a player holds, every kind present even at zero. */
export type Holdings = Record<ItemKind, number>;

/**
 * Why a shield cannot be raised right now, or null when it can.
 *
 * A REASON rather than a boolean, like every other blocker here.
 *
 * The second clause is the one worth stating: a shield is a FIXED window
 * (`RAID.ITEM_SHIELD_MS`), not a bank. Raising a second one over a standing
 * shield would overwrite an instant the burrow already owns with one computed
 * from `now` — at best worth nothing, at worst SHORTER than what it replaced,
 * with a shield consumed either way. So a burrow that is already covered
 * refuses the press rather than eating the item.
 */
export function shieldBlocker(
  bag: Holdings,
  shieldedUntil: Date | null | undefined,
  now = Date.now(),
): string | null {
  if (bag.shield < 1) return 'none_held';
  if (shieldedUntil && shieldedUntil.getTime() > now) return 'already_shielded';
  return null;
}

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
  row: TrapRow & EnergyPackRow & SmokeRow & GardenBoostRow,
  now = Date.now(),
): Holdings {
  const bag = {
    trap: 0, bomb: 0, lightning: 0, shield: 0, energy: 0, smoke: 0, mirage: 0,
    water: 0, fertiliser: 0, fence: 0, bloop: 0,
  } as Holdings;
  for (const r of rows) if (isItemKind(r.kind)) bag[r.kind] = r.qty;
  // Traps, energy and smoke override whatever the table said: none is stored
  // there. Traps live beside their free allowance, energy is applied on
  // purchase, and smoke is an expiry instant rather than a thing carried.
  bag.trap = availableTraps(row, now);
  bag.energy = energyPacksUsed(row, now);
  bag.smoke = smokeDaysLeft(row, now);
  // The garden boosts are NOT overridden: they are real rows now, and the
  // count the loop above read off the table is how many bottles are in the bag.
  // What the row's timestamps hold is the window a poured one opened, which is
  // a different fact and is reported by `gardenBoostView`.
  return bag;
}

/** Whole hours of a boost still to run, rounded up. Zero once it has lapsed. */
export function boostHoursLeft(until: Date | null | undefined, now = Date.now()): number {
  if (!until) return 0;
  const ms = until.getTime() - now;
  return ms > 0 ? Math.ceil(ms / 3_600_000) : 0;
}

/** What the garden screen shows for ONE boost: bottles held, window running. */
export interface GardenBoostState {
  /** Bottles in the bag, waiting to be poured. */
  held: number;
  /** Milliseconds of window still running, or null when none is. */
  activeMs: number | null;
  /** How long one bottle runs for — what a press is worth. */
  durationMs: number;
}

/**
 * Both boosts, as the burrow screen reads them.
 *
 * Two facts per boost, deliberately kept apart: a bottle you HOLD and a window
 * that RUNS are different things, and collapsing them into one number is what
 * the old storage did. The icon needs both — how many presses are left, and
 * whether pressing again would stack onto something already live.
 */
export function gardenBoostView(
  bag: Holdings,
  row: GardenBoostRow,
  now = Date.now(),
): Record<GardenKind, GardenBoostState> {
  const msLeft = (until: Date | null | undefined) => {
    if (!until) return null;
    const left = until.getTime() - now;
    return left > 0 ? left : null;
  };
  return {
    water: {
      held: bag.water,
      activeMs: msLeft(row.wateredUntil),
      durationMs: GARDEN_DURATION_MS.water,
    },
    fertiliser: {
      held: bag.fertiliser,
      activeMs: msLeft(row.fertilisedUntil),
      durationMs: GARDEN_DURATION_MS.fertiliser,
    },
  };
}

/**
 * Why a boost cannot be poured right now, or null when it can.
 *
 * A REASON rather than a boolean, the same choice `upgradeBlocker` and
 * `purchaseBlocker` make, so the API can say WHICH thing is missing.
 *
 * The cap is the one that needs explaining: `extendGardenBoost` already clips
 * the new expiry to `MAX_BANKED_MS`, so pouring onto an almost-full window
 * would silently destroy the bottle — the row would barely move and the count
 * would drop by one. Refusing the press is the honest version of the same
 * ceiling.
 */
export function gardenBoostBlocker(
  kind: GardenKind,
  bag: Holdings,
  row: GardenBoostRow,
  now = Date.now(),
): string | null {
  if (bag[kind] < 1) return 'none_held';
  const until = kind === 'water' ? row.wateredUntil : row.fertilisedUntil;
  const live = !!until && until.getTime() > now;
  const from = live ? until!.getTime() : now;
  // No room for a WHOLE bottle is what makes it a refusal rather than a
  // partial pour: half a window for a whole drop is the loss this prevents.
  if (from + GARDEN_DURATION_MS[kind] > now + GARDEN_BOOST.MAX_BANKED_MS) return 'boost_capped';
  return null;
}

export interface ShopItem {
  kind: ShopKind;
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
  // SHOP_KINDS, not ITEM_KINDS: the bag now also holds the garden boosts, and
  // those are found in chests rather than sold. Listing a kind with no entry
  // in SHOP.PRICES would put an unpriced line on the shelf.
  return SHOP_KINDS.map((kind) => {
    const cap = itemCap(kind);
    const hasRoom = bag[kind] < cap;
    return {
      kind,
      price: livePrice(kind),
      usdc: liveUsdcPrice(kind),
      held: bag[kind],
      cap,
      canBuy: stock >= livePrice(kind) && hasRoom,
      hasRoom,
    };
  });
}

/**
 * What one `kind` costs right now, in carrots and in USDC.
 *
 * These go through the live surcharge rather than straight to the constants,
 * which is what lets a price be corrected on a running server without a deploy
 * — and therefore without the WS restart that would take every live run with
 * it. `tuned` falls back to the shipped number whenever the key is not
 * overridden, so an empty `tuning` table, or a database that is down, prices
 * exactly as the build does (see `src/lib/tuning/live.ts`).
 *
 * `itemPrice` / `itemUsdcPrice` still run first: they are what makes an
 * unknown kind fail here, rather than quietly resolving to a path the registry
 * never declared.
 */
function livePrice(kind: ShopKind): number {
  itemPrice(kind);                      // rejette une kind inconnue
  return tuned(`SHOP.PRICES.${kind}`);
}

function liveUsdcPrice(kind: ShopKind): number {
  itemUsdcPrice(kind);                  // idem
  return tuned(`SHOP.USDC_PRICES.${kind}`);
}

/** Carrots for `qty` of `kind`. Flat — no bulk discount, because a discount on
 *  offence is a discount on hurting people who bought none. */
export const purchaseCost = (kind: ShopKind, qty: number) => livePrice(kind) * qty;

/** Whole USDC for `qty` of `kind`. Rounded to the cent the quote is stated in;
 *  the base-unit conversion happens once, at the payment's edge. */
export const purchaseUsdc = (kind: ShopKind, qty: number) =>
  Math.round(liveUsdcPrice(kind) * qty * 100) / 100;

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
  kind: ShopKind,
  qty: number,
  bag: Holdings,
  stock?: number,
): string | null {
  if (!Number.isInteger(qty) || qty < 1) return 'bad_quantity';
  if (qty > SHOP.MAX_QTY_PER_PURCHASE) return 'too_many_at_once';
  if (bag[kind] + qty > itemCap(kind)) {
    if (kind === 'energy') return 'daily_energy_limit';
    if (kind === 'smoke') return 'smoke_capped';
    return 'inventory_full';
  }
  if (stock !== undefined && stock < purchaseCost(kind, qty)) return 'insufficient_carrots';
  return null;
}
