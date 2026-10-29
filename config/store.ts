/**
 * WHAT THE STORES SELL (web2 only — Google Play now, the App Store next).
 *
 * A store product is an id the store knows and a price the store sets: the
 * player pays Google or Apple, never us, and the server only learns that a
 * purchase happened when it asks the store about a token. So this table is the
 * ONE place an id becomes a game kind; nothing a client sends names the kind.
 *
 * The SAME id is created by hand in the Play Console and in App Store Connect
 * (Play: lowercase, digits, `_` and `.` only, and an id can never be reused
 * once deleted). The price lives there, in each store's tiers — `usdCents` is
 * the tier we picked, kept for the revenue ledger (`purchases.cost`), never
 * shown: the shelf shows the store's own localized price. Packs sit on the
 * price point nearest their USDC price (packUsdc, 2026-10-28: 1.76, 1.20,
 * 2.38, 7.92), skins on theirs (skins.ts usdCents).
 *
 * `consumable`: a pack can be bought again and again, so the client CONSUMES
 * it once we credited it. A skin is owned for good: acknowledged, never
 * consumed, and the store itself refuses a second purchase.
 *
 * Not here on purpose: the season pass (web3 only, see the web2/web3 plan) and
 * single items — a pack is what money buys in web2, single items stay carrots.
 * Skin ids say the web2 name (Violet, Eclipse), not the web3 one: reviewers
 * read them.
 */
export interface StoreProduct {
  kind:
    | 'shiro_stash' | 'kuro_tantrum' | 'refill_3' | 'refill_10'
    | 'skin_carrot' | 'skin_solana' | 'skin_solflare' | 'skin_pink_october' | 'skin_kappa';
  qty: 1;
  consumable: boolean;
  usdCents: number;
}

export const STORE_PRODUCTS = {
  pack_shiro_stash: { kind: 'shiro_stash', qty: 1, consumable: true, usdCents: 179 },
  pack_kuro_tantrum: { kind: 'kuro_tantrum', qty: 1, consumable: true, usdCents: 119 },
  pack_refill_3: { kind: 'refill_3', qty: 1, consumable: true, usdCents: 239 },
  pack_refill_10: { kind: 'refill_10', qty: 1, consumable: true, usdCents: 799 },
  skin_kappa: { kind: 'skin_kappa', qty: 1, consumable: false, usdCents: 199 },
  skin_pink_october: { kind: 'skin_pink_october', qty: 1, consumable: false, usdCents: 99 },
  skin_eclipse: { kind: 'skin_solflare', qty: 1, consumable: false, usdCents: 99 },
  skin_carrot: { kind: 'skin_carrot', qty: 1, consumable: false, usdCents: 99 },
  skin_violet: { kind: 'skin_solana', qty: 1, consumable: false, usdCents: 99 },
} as const satisfies Record<string, StoreProduct>;

export type StoreProductId = keyof typeof STORE_PRODUCTS;

export function isStoreProductId(v: unknown): v is StoreProductId {
  return typeof v === 'string' && Object.hasOwn(STORE_PRODUCTS, v);
}
