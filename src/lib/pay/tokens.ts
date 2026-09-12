/**
 * What the shop takes, and what each of those is worth.
 *
 * THE PRICE IS A DOLLAR AMOUNT. Every item is priced in USD (see
 * `purchaseUsdc`), and a token is only the RAIL that dollar travels on. That is
 * what keeps the shop legible when it accepts three of them: the tile still
 * says `$0.25`, and the currency is chosen once, for the whole shop, rather
 * than per item. Six items times three currencies would be eighteen buttons on
 * a phone.
 *
 * THE LIST IS CLOSED, and it is server-side. Accepting "any SPL token" is not a
 * feature, it is a hole: anyone can mint a worthless token, call it USDC, and
 * buy the whole shop with it — the mint address is the only real name a token
 * has. So a payment is only ever accepted in one of the mints below, and the
 * client cannot add to that list.
 *
 * MONEY IS INTEGERS. Base units, never floats — a price that goes through a
 * double is a price that can be off by a lamport, and lamports are what the
 * chain actually compares.
 */
import { PublicKey } from '@solana/web3.js';

export type PayTokenId = 'usdc' | 'sol' | 'skr';

export const PAY_TOKEN_IDS: readonly PayTokenId[] = ['usdc', 'sol', 'skr'] as const;

export interface PayToken {
  id: PayTokenId;
  /** What the player sees on the currency switch. */
  symbol: string;
  /** Base units per whole token. SOL is 9 (lamports), USDC is 6. */
  decimals: number;
  /**
   * Native SOL moves with a system transfer and has no mint; the SPL tokens
   * move with a token transfer and are identified BY their mint. This flag is
   * what picks the instruction and the verification path.
   */
  native: boolean;
  /** Env var holding the mint address. Absent for native SOL. */
  mintEnv?: string;
  /**
   * How many decimals to show. A price is quoted in dollars, but the
   * confirmation says what actually leaves the wallet, and "0.0012 SOL" needs
   * more places than "0.25 USDC".
   */
  displayDecimals: number;
}

export const PAY_TOKENS: Record<PayTokenId, PayToken> = {
  usdc: {
    id: 'usdc', symbol: 'USDC', decimals: 6, native: false,
    mintEnv: 'USDC_MINT', displayDecimals: 2,
  },
  sol: {
    id: 'sol', symbol: 'SOL', decimals: 9, native: true,
    displayDecimals: 4,
  },
  skr: {
    id: 'skr', symbol: 'SKR', decimals: 6, native: false,
    mintEnv: 'SKR_MINT', displayDecimals: 2,
  },
};

export function isPayTokenId(v: unknown): v is PayTokenId {
  return typeof v === 'string' && (PAY_TOKEN_IDS as readonly string[]).includes(v);
}

/**
 * The mint for a token, or null when it is not configured.
 *
 * Absent config DISABLES that rail rather than falling back to a default. A
 * default mint address in source is how a testnet build takes real money, and
 * how a rotated address keeps paying somewhere nobody controls.
 */
export function mintFor(id: PayTokenId): PublicKey | null {
  const token = PAY_TOKENS[id];
  if (token.native) return null;
  const raw = token.mintEnv ? process.env[token.mintEnv] : undefined;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    console.error(`[pay] ${token.mintEnv} is not a valid public key`);
    return null;
  }
}

/** Is this rail usable on this deployment? Native SOL needs no mint. */
export function tokenEnabled(id: PayTokenId): boolean {
  return PAY_TOKENS[id].native || mintFor(id) !== null;
}

/** Every rail this deployment can actually take money on. */
export function enabledTokens(): PayTokenId[] {
  return PAY_TOKEN_IDS.filter(tokenEnabled);
}

/**
 * A USD price, converted to a token's base units at a given USD rate.
 *
 * Rounded UP. The rounding has to favour the treasury by a hair, because the
 * alternative is a payment that verifies at one base unit short and is refused
 * — the player has signed, the money has moved, and they are told it did not
 * count. A rounded-up lamport is invisible; a refused payment is not.
 */
export function baseUnitsFor(usd: number, id: PayTokenId, usdPrice: number): number {
  if (!(usdPrice > 0)) throw new Error(`[pay] no USD price for ${id}`);
  const whole = usd / usdPrice;
  return Math.ceil(whole * 10 ** PAY_TOKENS[id].decimals);
}

/** Base units back to a human number, for the confirmation line. */
export function wholeFor(baseUnits: number, id: PayTokenId): number {
  return baseUnits / 10 ** PAY_TOKENS[id].decimals;
}

/**
 * A dollar price, written in the rail the player chose.
 *
 * The shop prices in USD and this is the only place that turns that into words,
 * so the tile, the confirmation line and any receipt cannot drift apart.
 *
 * `usdPrice` is the rate from the same feed the quote will use. When it is
 * missing or nonsense the answer is the DOLLAR figure, not a guess: a shop that
 * shows `0.0000 SOL` because a feed blinked is worse than one that briefly
 * falls back to the price it actually charges in.
 *
 * SOL is shown to its own precision rather than to two places, because `0.00
 * SOL` is not a price. See `displayDecimals`.
 */
export function priceLabel(usd: number, id: PayTokenId, usdPrice: number | undefined): string {
  const token = PAY_TOKENS[id];
  if (id === 'usdc') return `$${usd.toFixed(2)}`;
  if (!usdPrice || !(usdPrice > 0) || !Number.isFinite(usdPrice)) return `$${usd.toFixed(2)}`;
  const whole = usd / usdPrice;
  // Round UP, the way `baseUnitsFor` does. The tile must never quote less than
  // the wallet will be asked for — a price that grows at the signing step reads
  // as a bait and switch even when it is a rounding artefact.
  const places = token.displayDecimals;
  const shown = Math.ceil(whole * 10 ** places) / 10 ** places;
  return `${shown.toFixed(places)} ${token.symbol}`;
}
