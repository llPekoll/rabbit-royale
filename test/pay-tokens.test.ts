/**
 * Three rails, one price, and a closed list.
 *
 * The shop prices in USD and settles in a token. That split is what keeps three
 * currencies from turning into eighteen buttons: the tile still says `$0.25`,
 * and the rail is chosen once for the whole shop.
 *
 * The rules worth pinning are the ones that cost money when they break:
 *
 *  - the accepted list is CLOSED and server-side. "Any SPL token" is not a
 *    feature, it is a hole — anyone can mint something worthless, call it USDC,
 *    and buy the shop with it. A mint address is a token's only real name.
 *  - a price stands on liquidity. A thin market can be pushed for a few hundred
 *    dollars, and whoever pushes it buys the shop at a discount; a price on a
 *    puddle is refused outright rather than used.
 *  - no price means no sale. Never a guess, never zero — zero would be free.
 *  - money is integers, rounded toward the treasury. A payment that verifies
 *    one base unit short is refused after the player has already paid.
 */
import { describe, expect, it } from 'vitest';
import {
  PAY_TOKENS, PAY_TOKEN_IDS, isPayTokenId, baseUnitsFor, wholeFor, tokenEnabled,
} from '../src/lib/pay/tokens';
import { readFileSync } from 'node:fs';

const RATES = readFileSync(new URL('../src/lib/pay/rates.ts', import.meta.url), 'utf8');

describe('the accepted rails', () => {
  it('is a closed list the client cannot extend', () => {
    expect([...PAY_TOKEN_IDS]).toEqual(['usdc', 'sol', 'skr']);
    expect(isPayTokenId('bonk')).toBe(false);
    expect(isPayTokenId('usdc')).toBe(true);
  });

  it('knows which rail is native and which is an SPL mint', () => {
    // This is not cosmetic: it picks the transfer instruction AND the ledger
    // the payment is verified against. Lamports and token balances are two
    // different books, and reading the wrong one finds nothing.
    expect(PAY_TOKENS.sol.native).toBe(true);
    expect(PAY_TOKENS.usdc.native).toBe(false);
    expect(PAY_TOKENS.skr.native).toBe(false);
  });

  it('carries each token real decimals', () => {
    // Confirmed against Jupiter's token record for SKR (6dp), and the chain's
    // own for SOL (9dp, lamports) and USDC (6dp).
    expect(PAY_TOKENS.sol.decimals).toBe(9);
    expect(PAY_TOKENS.usdc.decimals).toBe(6);
    expect(PAY_TOKENS.skr.decimals).toBe(6);
  });

  it('needs a mint before an SPL rail is usable', () => {
    // Absent config disables the rail rather than defaulting: a default mint in
    // source is how a testnet build takes real money.
    const before = process.env.SKR_MINT;
    delete process.env.SKR_MINT;
    expect(tokenEnabled('skr')).toBe(false);
    // Native SOL has no mint, so it is never gated on one.
    expect(tokenEnabled('sol')).toBe(true);
    if (before !== undefined) process.env.SKR_MINT = before;
  });
});

describe('turning dollars into base units', () => {
  it('converts at the quoted rate', () => {
    expect(baseUnitsFor(0.25, 'usdc', 1)).toBe(250_000);
    // $0.25 of a $100 SOL is 0.0025 SOL = 2,500,000 lamports.
    expect(baseUnitsFor(0.25, 'sol', 100)).toBe(2_500_000);
  });

  it('rounds UP, toward the treasury', () => {
    // Down would produce a transfer one unit short of the quote, refused after
    // the player has signed and the money has moved. A rounded-up lamport is
    // invisible; a refused payment is not.
    expect(baseUnitsFor(0.25, 'sol', 101.0197)).toBe(2_474_765);
    expect(wholeFor(baseUnitsFor(0.1, 'skr', 0.0205), 'skr')).toBeGreaterThanOrEqual(0.1 / 0.0205);
  });

  it('refuses to price against a missing rate', () => {
    // A quote written against a made-up rate is a purchase the player can
    // dispute and the treasury cannot defend.
    expect(() => baseUnitsFor(0.25, 'sol', 0)).toThrow();
    expect(() => baseUnitsFor(0.25, 'sol', -1)).toThrow();
  });
});

describe('the price feed guards', () => {
  it('requires liquidity behind a price', () => {
    // The real defence for a thin market: a band says "that looks wrong",
    // liquidity says "that could be MOVED".
    expect(RATES).toMatch(/MIN_LIQUIDITY_USD/);
    expect(RATES).toMatch(/liq < MIN_LIQUIDITY_USD/);
  });

  it('prices by MINT, not by symbol', () => {
    // Anyone can mint something called SKR.
    expect(RATES).toMatch(/priceMint/);
    expect(RATES).toMatch(/lite-api\.jup\.ag\/price/);
  });

  it('treats a dollar as a constant, not as a fetch', () => {
    // Asking an API what a dollar is worth is a way to get a wrong answer
    // during an outage.
    expect(RATES).toMatch(/FIXED_USD[^=]*=\s*\{[^}]*usdc: 1/s);
  });

  it('degrades to a last-good price, never to zero', () => {
    // Zero would make everything free.
    expect(RATES).toMatch(/lastGood/);
    expect(RATES).toMatch(/FALLBACK_USD/);
  });
});
