/**
 * GOLD — THE MONEY OF THE WEB2 WORLD (2026-10-30).
 *
 * One gold coin, Shiro on one face and Kuro on the other, bought in sachets from
 * the store (Google Play, the App Store, Stripe on the web) and spent in the
 * shop on anything money buys: items, packs, skins. Carrots stay what the
 * game pays you for playing; gold is what a player pays the game.
 *
 * Why a coin and not one store product per thing: a store charges per
 * purchase (Stripe 0.25 € fixed, Apple nothing under $0.29), so a 0.10 bloop
 * cannot be sold on its own; a coin is bought by the handful and spent by the
 * unit. One balance, on the server, for every platform.
 *
 * 1 gold = 1 US cent. Prices are the USDC prices of web3 times 100, so the two
 * worlds stay priced alike and the real-money price the EU asks to show beside
 * every coin price (CPC key principles, March 2025) is a division.
 *
 * Web2 only: web3 keeps its USDC / SOL / SKR rails.
 */
import { purchaseUsdc, isShopKind, type ShopKind } from './inventory';
import { isPackKind, packUsdc, type PackKind } from './packs';
import { isSkinKind, skinForKind, type SkinKind } from './skins';

export const GOLD_PER_USD = 100;

/**
 * IN DEBT (2026-11-01): a refund took back gold the player had already spent
 * (lib/pay/store.ts), and the balance is below zero. Until a sachet covers it
 * nothing is bought — in gold OR carrots — and the burrow is not upgraded.
 * A refund of gold never spent leaves the balance at zero or above: no debt,
 * nothing blocked (a mistaken purchase, given back).
 */
export const GOLD_DEBT = 'gold_debt';

export function inGoldDebt(p: { gold: number }): boolean {
  return p.gold < 0;
}

export type GoldKind = ShopKind | PackKind | SkinKind;

export function isGoldKind(v: unknown): v is GoldKind {
  return isShopKind(v) || isPackKind(v) || isSkinKind(v);
}

/** What `qty` of `kind` costs in gold, at the shelf's live prices. */
export function goldPrice(kind: GoldKind, qty = 1): number {
  if (isSkinKind(kind)) return skinForKind(kind).usdCents * qty;
  if (isPackKind(kind)) return Math.round(packUsdc(kind) * GOLD_PER_USD) * qty;
  return Math.round(purchaseUsdc(kind, 1) * GOLD_PER_USD) * qty;
}
