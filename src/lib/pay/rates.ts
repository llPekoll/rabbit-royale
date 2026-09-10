/**
 * What one token is worth in dollars, at quote time.
 *
 * The shop prices in USD and settles in a token, so this is the number that
 * turns `$0.25` into lamports. It is read ONCE, server-side, when the quote is
 * written — never by the client, and never again at confirm time. A quote is a
 * promise about a price, and re-reading the rate later would let a swing
 * between signing and landing turn a paid purchase into an underpayment.
 *
 * SAFETY RAILS, because a price feed is an input like any other:
 *
 *  - USDC is a dollar. It is a constant here, not a fetch — asking an API what
 *    a dollar is worth is a way to get a wrong answer during an outage.
 *  - Every oracle-priced token has a floor and a ceiling. SKR trades on a thin
 *    market, and a thin market can be pushed for a few hundred dollars; without
 *    a band, whoever pushes it buys the whole shop at a discount. A price
 *    outside its band is treated as NO price, so the quote fails and nothing is
 *    sold — refusing a sale is always cheaper than mispricing one.
 *  - A dead feed degrades to the last good price, then to the baked fallback.
 *    It never degrades to zero, which would make everything free.
 */
import { PAY_TOKENS, PAY_TOKEN_IDS, mintFor, type PayTokenId } from './tokens';

/**
 * Jupiter's price API, keyed by MINT.
 *
 * Jupiter rather than a general market aggregator, for two reasons: it is the
 * price the token actually trades at ON SOLANA, which is the only price that
 * matters for a payment settled here, and it reports the LIQUIDITY behind that
 * price — which is the difference between a number and a trustworthy number.
 *
 * Keyed by mint because a mint is a token's only real name. A symbol is not:
 * anyone can mint something called SKR.
 */
const JUP_PRICE = 'https://lite-api.jup.ag/price/v3';

/**
 * How much on-chain liquidity a price must stand on to be believed, in USD.
 *
 * This is the real defence for a thin market, and it is worth more than a
 * price band: a band says "that number looks wrong", liquidity says "that
 * number could be MOVED". Measured at the time of writing, SOL sat on ~$830M
 * and SKR on ~$750k — so the floor below is far under SKR's normal depth and
 * far above the puddle an attacker could create.
 *
 * Below it, there is no price and nothing is sold.
 */
const MIN_LIQUIDITY_USD = 100_000;

/** Tokens whose price is a constant rather than an oracle read. */
const FIXED_USD: Partial<Record<PayTokenId, number>> = {
  usdc: 1,
};

/**
 * What a price must fall inside to be believed, in USD.
 *
 * These are not forecasts — they are absurdity limits. They should be wide
 * enough that ordinary volatility never trips them and narrow enough that a
 * manipulated or garbled feed does. Widen them deliberately, not because a
 * quote failed once.
 */
const BAND: Partial<Record<PayTokenId, { min: number; max: number }>> = {
  sol: { min: 5, max: 2_000 },
  // SKR traded around $0.02 when this was written, so the band is set wide
  // around that rather than around a round number — the liquidity floor above
  // is what actually guards this rail.
  skr: { min: 0.001, max: 5 },
};

/** Last resort if the feed has never answered on this process. */
const FALLBACK_USD: Record<PayTokenId, number> = {
  usdc: 1,
  sol: 100,
  skr: 0.02,
};

/**
 * The mint a token is PRICED by.
 *
 * Native SOL has no mint to transfer, but it is quoted as wrapped SOL — the
 * same asset, the same price — so pricing and settlement disagree about the
 * mint here on purpose.
 */
const WRAPPED_SOL = 'So11111111111111111111111111111111111111112';

function priceMint(id: PayTokenId): string | null {
  if (id === 'sol') return WRAPPED_SOL;
  return mintFor(id)?.toBase58() ?? null;
}

const CACHE_TTL_MS = 5 * 60_000;
let cache: { prices: Partial<Record<PayTokenId, number>>; at: number } | null = null;
/** The last price that passed its band, per token — the first fallback. */
const lastGood: Partial<Record<PayTokenId, number>> = {};

function believable(id: PayTokenId, price: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const band = BAND[id];
  if (!band) return true;
  return price >= band.min && price <= band.max;
}

/**
 * Current USD price per token. Cached briefly in-process: a quote is not worth
 * a network round trip each time, and a five-minute-old SOL price cannot move
 * a $0.25 purchase enough to matter.
 */
export async function tokenUsdPrices(): Promise<Record<PayTokenId, number>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...FALLBACK_USD, ...lastGood, ...cache.prices };
  }

  const prices: Partial<Record<PayTokenId, number>> = { ...FIXED_USD };

  // Only the oracle-priced rails, and only those this deployment configured:
  // asking for a mint we do not have is a request that can only fail.
  const wanted = PAY_TOKEN_IDS
    .filter((id) => FIXED_USD[id] === undefined)
    .map((id) => ({ id, mint: priceMint(id) }))
    .filter((x): x is { id: PayTokenId; mint: string } => x.mint !== null);

  if (wanted.length === 0) {
    cache = { prices, at: Date.now() };
    return { ...FALLBACK_USD, ...lastGood, ...prices };
  }

  try {
    const url = `${JUP_PRICE}?ids=${wanted.map((w) => w.mint).join(',')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const body = (await res.json()) as Record<
        string, { usdPrice?: number; liquidity?: number } | undefined
      >;
      for (const { id, mint } of wanted) {
        const row = body[mint];
        const p = row?.usdPrice;
        if (p === undefined) continue;

        // Liquidity FIRST: a price on a puddle is the one an attacker makes.
        const liq = row?.liquidity ?? 0;
        if (liq < MIN_LIQUIDITY_USD) {
          console.error(
            `[rates] ${id} priced ${p} on only $${Math.round(liq)} of liquidity — ignored`,
          );
          continue;
        }
        if (!believable(id, p)) {
          // Loud, because this is either a broken feed or someone pushing a
          // thin market — and both are worth seeing in the logs.
          console.error(`[rates] ${id} price ${p} outside its band — ignored`);
          continue;
        }
        prices[id] = p;
        lastGood[id] = p;
      }
    } else {
      console.warn('[rates] price feed answered', res.status);
    }
  } catch (e) {
    console.warn('[rates] price feed unreachable, using last good prices:', e);
  }

  cache = { prices, at: Date.now() };
  return { ...FALLBACK_USD, ...lastGood, ...prices };
}

/**
 * The price for ONE token, or null when there is no trustworthy figure.
 *
 * Null means "do not sell". Callers must treat it as a refusal rather than
 * substituting a guess: a quote written against a made-up rate is a purchase
 * the player can dispute and the treasury cannot defend.
 */
export async function usdPriceFor(id: PayTokenId): Promise<number | null> {
  if (FIXED_USD[id] !== undefined) return FIXED_USD[id]!;
  const prices = await tokenUsdPrices();
  const p = prices[id];
  if (!believable(id, p)) return null;
  return p;
}

/** Drop the cache — for tests, and after a deliberate refresh. */
export function invalidateRatesCache(): void {
  cache = null;
}

/** Exposed for tests: the bands are policy, so they are worth asserting. */
export const RATE_BANDS = BAND;
export const RATE_FALLBACKS = FALLBACK_USD;
export { PAY_TOKENS };
