/**
 * The shop's arithmetic and its refusals.
 *
 * Asserts BEHAVIOUR, not literals — the prices in tuning.ts are meant to be
 * hammered during playtests, and a suite that pins them would turn every
 * retune red for no reason. What is pinned instead are the rules that must
 * survive any retune: every line has both prices, caps apply to money exactly
 * as they apply to carrots, and the energy window is rolling.
 */
import { describe, expect, it } from 'vitest';
import { ENERGY_PACK, SHOP, SMOKE, itemCap, itemPrice, itemUsdcPrice, usdcBaseUnits } from '../config/tuning';
import {
  CARRIED_KINDS, ITEM_KINDS, energyPacksLeft, energyPacksUsed, holdings,
  isItemKind, purchaseBlocker, purchaseCost, purchaseUsdc, shopShelf,
  spendEnergyPack, smokeActive, smokeDaysLeft, extendSmoke, type Holdings,
} from '../src/lib/game/inventory';

const now = Date.now();
const ago = (ms: number) => new Date(now - ms);
/** A player row with nothing bought and no allowance drawn. */
const fresh = {
  trapsOwned: 0,
  trapsClaimedAt: new Date(now),
  energyPacksBought: 0,
  energyPacksSince: new Date(now),
  smokeUntil: null,
};
const bag = (over: Partial<Holdings> = {}): Holdings =>
  ({ trap: 0, bomb: 0, lightning: 0, shield: 0, energy: 0, smoke: 0, mirage: 0, ...over });

describe('the price list', () => {
  // THE economy rule, as a test. "Everything is buyable in carrots OR money"
  // and "no exclusive power for money, ever" both fail the moment a line
  // exists in one currency only.
  it('prices every item in both currencies', () => {
    for (const kind of ITEM_KINDS) {
      expect(itemPrice(kind), `${kind} has no carrot price`).toBeGreaterThan(0);
      expect(itemUsdcPrice(kind), `${kind} has no USDC price`).toBeGreaterThan(0);
    }
  });

  it('sells nothing the bag cannot name', () => {
    for (const kind of ITEM_KINDS) expect(isItemKind(kind)).toBe(true);
    expect(isItemKind('crown')).toBe(false);
    expect(isItemKind(undefined)).toBe(false);
  });

  it('converts USDC to whole base units', () => {
    // The verifier compares this to an on-chain integer, so a float that
    // survives the conversion would never match.
    for (const kind of ITEM_KINDS) {
      const units = usdcBaseUnits(itemUsdcPrice(kind));
      expect(Number.isInteger(units)).toBe(true);
    }
  });

  it('charges per unit, with no bulk discount', () => {
    expect(purchaseCost('bomb', 3)).toBe(itemPrice('bomb') * 3);
    expect(purchaseUsdc('bomb', 3)).toBeCloseTo(itemUsdcPrice('bomb') * 3, 2);
  });
});

describe('the shelf', () => {
  it('shows items the player cannot afford', () => {
    // A shop that hides what you cannot buy gives nothing to save towards.
    const shelf = shopShelf(bag(), 0);
    expect(shelf).toHaveLength(ITEM_KINDS.length);
    expect(shelf.every((i) => i.canBuy)).toBe(false);
  });

  it('opens a line once it is affordable and there is room', () => {
    const rich = shopShelf(bag(), 1_000_000).find((i) => i.kind === 'bomb')!;
    expect(rich.canBuy).toBe(true);
    expect(rich.hasRoom).toBe(true);
  });

  it('closes a line at the cap however rich the player is', () => {
    const full = shopShelf(bag({ bomb: itemCap('bomb') }), 1_000_000)
      .find((i) => i.kind === 'bomb')!;
    expect(full.canBuy).toBe(false);
    // The USDC button reads `hasRoom`, so the cap has to close that too — this
    // is the assertion that keeps money from buying past a limit grind cannot.
    expect(full.hasRoom).toBe(false);
  });
});

describe('purchaseBlocker', () => {
  it('refuses nonsense quantities', () => {
    expect(purchaseBlocker('bomb', 0, bag(), 1e6)).toBe('bad_quantity');
    expect(purchaseBlocker('bomb', -1, bag(), 1e6)).toBe('bad_quantity');
    expect(purchaseBlocker('bomb', 1.5, bag(), 1e6)).toBe('bad_quantity');
    expect(purchaseBlocker('bomb', SHOP.MAX_QTY_PER_PURCHASE + 1, bag(), 1e6))
      .toBe('too_many_at_once');
  });

  it('refuses a purchase that would breach the cap', () => {
    const nearlyFull = bag({ bomb: itemCap('bomb') - 1 });
    expect(purchaseBlocker('bomb', 1, nearlyFull, 1e6)).toBeNull();
    expect(purchaseBlocker('bomb', 2, nearlyFull, 1e6)).toBe('inventory_full');
  });

  it('applies every limit but affordability to the money route', () => {
    // `stock` omitted = paying with USDC. Caps and quantities still bind, which
    // is what keeps the paid route a convenience rather than a better game.
    expect(purchaseBlocker('bomb', 1, bag({ bomb: itemCap('bomb') }))).toBe('inventory_full');
    expect(purchaseBlocker('bomb', SHOP.MAX_QTY_PER_PURCHASE + 1, bag()))
      .toBe('too_many_at_once');
    // …but a player with no carrots at all is not refused.
    expect(purchaseBlocker('bomb', 1, bag())).toBeNull();
  });

  it('names the energy limit as its own refusal', () => {
    // "Your bag is full" is wrong for a thing nobody carries — the player needs
    // to know it is a daily limit, not a storage one.
    const spent = bag({ energy: ENERGY_PACK.MAX_PER_DAY });
    expect(purchaseBlocker('energy', 1, spent, 1e6)).toBe('daily_energy_limit');
  });
});

describe('the paid energy window', () => {
  it('starts empty', () => {
    expect(energyPacksUsed(fresh, now)).toBe(0);
    expect(energyPacksLeft(fresh, now)).toBe(ENERGY_PACK.MAX_PER_DAY);
  });

  it('counts refills inside the window', () => {
    const row = spendEnergyPack(fresh, now);
    expect(energyPacksUsed(row, now)).toBe(1);
    expect(energyPacksLeft(row, now)).toBe(ENERGY_PACK.MAX_PER_DAY - 1);
  });

  it('keeps the window open across several refills', () => {
    let row = spendEnergyPack(fresh, now);
    const opened = row.energyPacksSince;
    row = spendEnergyPack(row, now + 1000);
    // The window must NOT restart on each purchase, or five a day becomes
    // unlimited by simply buying them one at a time.
    expect(row.energyPacksSince).toEqual(opened);
    expect(energyPacksUsed(row, now + 1000)).toBe(2);
  });

  it('forgets a lapsed window', () => {
    const row = { energyPacksBought: ENERGY_PACK.MAX_PER_DAY, energyPacksSince: ago(ENERGY_PACK.WINDOW_MS + 1) };
    expect(energyPacksUsed(row, now)).toBe(0);
    expect(purchaseBlocker('energy', 1, bag({ energy: 0 }), 1e6)).toBeNull();
  });

  it('restarts the window when the old one has lapsed', () => {
    const stale = { energyPacksBought: 4, energyPacksSince: ago(ENERGY_PACK.WINDOW_MS + 1) };
    const row = spendEnergyPack(stale, now);
    // Straddling a boundary must not carry the old count forward, or the cap
    // could be doubled by timing purchases either side of it.
    expect(row.energyPacksBought).toBe(1);
    expect(row.energyPacksSince.getTime()).toBe(now);
  });
});

describe('holdings', () => {
  it('names every kind, even at zero', () => {
    // An item you cannot see is an item you do not know exists.
    const held = holdings([], fresh, now);
    for (const kind of ITEM_KINDS) expect(held).toHaveProperty(kind);
  });

  it('reads carried items out of the inventory rows', () => {
    const held = holdings([{ kind: 'bomb', qty: 4 }], fresh, now);
    expect(held.bomb).toBe(4);
  });

  it('ignores an inventory row for a kind that is not carried', () => {
    // Energy is applied on purchase, never stored — a row claiming otherwise
    // (bad data, an old migration) must not become a stockpile.
    const held = holdings([{ kind: 'energy', qty: 99 }], fresh, now);
    expect(held.energy).toBe(0);
    expect(CARRIED_KINDS).not.toContain('energy');
  });

  it('takes traps from the player row, not the inventory table', () => {
    const held = holdings(
      [{ kind: 'trap', qty: 99 }],
      { ...fresh, trapsOwned: 2 },
      now,
    );
    expect(held.trap).toBe(2);
  });

  it('counts the free trap allowance as held', () => {
    const aDayLater = { ...fresh, trapsClaimedAt: ago(24 * 60 * 60 * 1000) };
    expect(holdings([], aDayLater, now).trap).toBeGreaterThan(0);
  });
});

describe('receipts', () => {
  // The one that would silently misreport: `cost` is stored in the smallest
  // unit of whichever currency the row names, so a USDC purchase is base units
  // and a carrot purchase is whole carrots. Reading one as the other turns a
  // 40-cent bomb into a 400 000-carrot bomb on the profile screen.
  it('stores a USDC price in base units, not dollars', () => {
    const dollars = itemUsdcPrice('bomb');
    const stored = usdcBaseUnits(dollars);
    expect(stored).toBe(Math.round(dollars * 1e6));
    // …and comes back to the same dollars, which is what the profile renders.
    expect(stored / 1e6).toBeCloseTo(dollars, 6);
  });

  it('stores a carrot price as whole carrots', () => {
    expect(Number.isInteger(purchaseCost('trap', 3))).toBe(true);
    expect(purchaseCost('trap', 3)).toBe(itemPrice('trap') * 3);
  });
});

describe('the smoke screen', () => {
  const smokeRow = (until: Date | null) => ({ smokeUntil: until });

  it('is inactive by default', () => {
    expect(smokeActive(smokeRow(null), now)).toBe(false);
    expect(smokeDaysLeft(smokeRow(null), now)).toBe(0);
  });

  it('is inactive once it has lapsed', () => {
    expect(smokeActive(smokeRow(new Date(now - 1)), now)).toBe(false);
  });

  it('EXTENDS an active screen rather than restarting it', () => {
    // Buying two in a row is worth two days, which is what a player assumes.
    // Restarting would quietly burn the second purchase.
    const oneDay = smokeRow(new Date(now + SMOKE.DURATION_MS));
    const after = extendSmoke(oneDay, 1, now);
    expect(after.getTime()).toBe(now + 2 * SMOKE.DURATION_MS);
  });

  it('starts from NOW when nothing is active', () => {
    expect(extendSmoke(smokeRow(null), 1, now).getTime()).toBe(now + SMOKE.DURATION_MS);
    // A lapsed screen must not be extended from its old expiry, or a player who
    // returns after a week gets a screen that is already over.
    expect(extendSmoke(smokeRow(new Date(now - 999_999)), 1, now).getTime())
      .toBe(now + SMOKE.DURATION_MS);
  });

  it('caps banked screen time, so nobody buys a blind season', () => {
    const hoarded = extendSmoke(smokeRow(null), 99, now);
    expect(hoarded.getTime()).toBe(now + SMOKE.MAX_MS);
  });

  it('refuses a purchase past the cap, and says which limit it hit', () => {
    const capped = bag({ smoke: itemCap('smoke') });
    expect(purchaseBlocker('smoke', 1, capped, 1e6)).toBe('smoke_capped');
  });
});
