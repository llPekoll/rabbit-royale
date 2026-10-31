/**
 * WHAT THE STORES SELL (web2 only — Google Play now, the App Store next).
 *
 * Gold, and nothing else (2026-10-30): the stores sell sachets of the web2
 * coin (src/lib/game/gold.ts), and the shop sells everything for gold. One
 * store product per thing on sale meant a new product for every item or skin,
 * and no way to sell a 0.10 bloop (Apple's lowest price is $0.29, Stripe takes
 * 0.25 € a payment); a coin bought by the handful has none of that.
 *
 * A store product is an id the store knows and a price the store sets: the
 * player pays Google or Apple, never us, and the server only learns that a
 * purchase happened when it asks the store about a token. So this table is the
 * ONE place an id becomes coins; nothing a client sends names the amount.
 *
 * The SAME id is created in the Play Console (tools/play-products.ts) and in
 * App Store Connect (Play: lowercase, digits, `_` and `.` only, and an id can
 * never be reused once deleted). The price lives there, in each store's
 * tiers — `usdCents` is the tier we picked, kept for the revenue ledger
 * (`purchases.cost`), never shown: the shelf shows the store's own localized
 * price. The bigger sachets carry a bonus (`qty` over `usdCents`).
 *
 * Every sachet is CONSUMABLE: bought again and again, consumed once credited.
 */
export interface StoreProduct {
  kind: 'gold';
  /** Gold credited. */
  qty: number;
  consumable: true;
  usdCents: number;
}

export const STORE_PRODUCTS = {
  gold_100: { kind: 'gold', qty: 100, consumable: true, usdCents: 99 },
  gold_550: { kind: 'gold', qty: 550, consumable: true, usdCents: 499 },
  gold_1200: { kind: 'gold', qty: 1200, consumable: true, usdCents: 999 },
  gold_2500: { kind: 'gold', qty: 2500, consumable: true, usdCents: 1999 },
  gold_6500: { kind: 'gold', qty: 6500, consumable: true, usdCents: 4999 },
} as const satisfies Record<string, StoreProduct>;

export type StoreProductId = keyof typeof STORE_PRODUCTS;

export function isStoreProductId(v: unknown): v is StoreProductId {
  return typeof v === 'string' && Object.hasOwn(STORE_PRODUCTS, v);
}
