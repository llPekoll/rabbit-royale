/**
 * The two bottles: holding them, pouring them, and what the card says.
 *
 * These boosts used to be applied the instant a chest was opened, which made
 * them the only drops in the game the player decided nothing about — and the
 * good ones landed on a full garden, where `gardenYield` correctly pays a
 * watering nothing. The bag holds them now and the player pours them, so what
 * has to be pinned is the pair of facts that keeps that honest: a bottle is
 * never spent for less than a whole window, and what the screen reports is the
 * garden the server is actually running.
 */
import { describe, expect, it } from 'vitest';
import { GARDEN, GARDEN_BOOST } from '../config/tuning';
import {
  gardenBoostBlocker, gardenBoostView, holdings, shieldBlocker,
  type GardenBoostRow, type Holdings,
} from '../src/lib/game/inventory';
import { burrowView } from '../src/lib/game/burrow';

const now = Date.now();
const inHours = (h: number) => new Date(now + h * 3_600_000);
const ago = (h: number) => new Date(now - h * 3_600_000);

/** A bag holding `water` waterings and `fertiliser` feedings, nothing else. */
const bag = (water = 0, fertiliser = 0): Holdings => ({
  trap: 0, bomb: 0, lightning: 0, shield: 0, energy: 0, smoke: 0, mirage: 0,
  fence: 0, bloop: 0, water, fertiliser,
});

/** The player-row fields the boosts read. */
const player = (over: Partial<GardenBoostRow> = {}) => ({
  trapsOwned: 0,
  trapsClaimedAt: new Date(now),
  energyPacksBought: 0,
  energyPacksSince: new Date(now),
  smokeUntil: null,
  wateredUntil: null,
  fertilisedUntil: null,
  ...over,
});

describe('the bag holds the bottles', () => {
  /**
   * The storage change itself. `holdings` used to OVERWRITE these two with
   * hours-remaining off the player row, so a player carrying three waterings
   * read as "0 water" the moment the last window lapsed — the drops were in
   * the table and invisible everywhere.
   */
  it('reports what the inventory table says, not the clock', () => {
    const rows = [{ kind: 'water', qty: 3 }, { kind: 'fertiliser', qty: 1 }];
    const held = holdings(rows, player(), now);
    expect(held.water).toBe(3);
    expect(held.fertiliser).toBe(1);
  });

  it('still reports them while a window is running — they are different facts', () => {
    const rows = [{ kind: 'water', qty: 2 }];
    const held = holdings(rows, player({ wateredUntil: inHours(2) }), now);
    // Two bottles in the bag AND a window open. Collapsing these into one
    // number is exactly what the old storage did.
    expect(held.water).toBe(2);
    expect(gardenBoostView(held, player({ wateredUntil: inHours(2) }), now).water.activeMs)
      .toBeGreaterThan(0);
  });
});

describe('gardenBoostView — what the slot draws', () => {
  it('reports no window when none is running', () => {
    const v = gardenBoostView(bag(1, 1), player(), now);
    expect(v.water.activeMs).toBeNull();
    expect(v.fertiliser.activeMs).toBeNull();
  });

  it('treats a lapsed window as no window', () => {
    const v = gardenBoostView(bag(), player({ wateredUntil: ago(1) }), now);
    expect(v.water.activeMs).toBeNull();
  });

  it('carries what one bottle is worth, so the slot can say it', () => {
    const v = gardenBoostView(bag(), player(), now);
    expect(v.water.durationMs).toBe(GARDEN_BOOST.WATER.DURATION_MS);
    expect(v.fertiliser.durationMs).toBe(GARDEN_BOOST.FERTILISER.DURATION_MS);
  });
});

describe('gardenBoostBlocker — when a press is refused', () => {
  it('refuses an empty bag', () => {
    expect(gardenBoostBlocker('water', bag(0), player(), now)).toBe('none_held');
  });

  it('allows a pour with nothing running', () => {
    expect(gardenBoostBlocker('water', bag(1), player(), now)).toBeNull();
  });

  /**
   * Pouring onto a LIVE window is the normal case, not an edge one: a second
   * watering extends the first (`extendGardenBoost`), which is the whole
   * reason a player banks them.
   */
  it('allows a pour onto a window already running', () => {
    const row = player({ wateredUntil: inHours(2) });
    expect(gardenBoostBlocker('water', bag(1), row, now)).toBeNull();
  });

  /**
   * THE ONE THAT PROTECTS THE BOTTLE. `extendGardenBoost` clips the new expiry
   * to MAX_BANKED_MS, so pouring onto an almost-full window moves the row by
   * minutes while the count drops by one — the drop is destroyed and nothing
   * says so. Refusing the press is the honest form of the same ceiling.
   */
  it('refuses a pour that would not fit a whole window', () => {
    const banked = GARDEN_BOOST.MAX_BANKED_MS;
    const almostFull = new Date(now + banked - 60_000);
    const row = player({ wateredUntil: almostFull });
    expect(gardenBoostBlocker('water', bag(1), row, now)).toBe('boost_capped');
  });

  it('allows a pour that fits exactly', () => {
    const banked = GARDEN_BOOST.MAX_BANKED_MS;
    const room = new Date(now + banked - GARDEN_BOOST.WATER.DURATION_MS);
    expect(gardenBoostBlocker('water', bag(1), player({ wateredUntil: room }), now)).toBeNull();
  });

  it('checks the two kinds against their own columns', () => {
    // A live watering must not block a feeding, and vice versa.
    const row = player({ wateredUntil: new Date(now + GARDEN_BOOST.MAX_BANKED_MS) });
    expect(gardenBoostBlocker('water', bag(1, 1), row, now)).toBe('boost_capped');
    expect(gardenBoostBlocker('fertiliser', bag(1, 1), row, now)).toBeNull();
  });
});

describe('the card reports the garden the server is running', () => {
  const row = (over = {}) => ({
    stock: 0,
    lifetimeCarrots: 0,
    burrowLevel: 1,
    energy: 30,
    energyUpdatedAt: new Date(now),
    gardenCollectedAt: new Date(now),
    ...over,
  });

  /**
   * THE BUG THIS FIXES. `capHours` was the bare constant, so a fed garden told
   * the player it held twelve hours while `gardenYield` was already paying it
   * eighteen — the screen describing a rule the server had stopped following.
   */
  it('lifts capHours while a feeding runs', () => {
    const plain = burrowView(row(), now);
    const fed = burrowView(row({ fertilisedUntil: inHours(3) }), now);
    expect(plain.capHours).toBe(GARDEN.CAP_HOURS);
    expect(fed.capHours).toBe(GARDEN.CAP_HOURS + GARDEN_BOOST.FERTILISER.EXTRA_CAP_HOURS);
  });

  it('lifts the ceiling it prints with it', () => {
    const fed = burrowView(row({ fertilisedUntil: inHours(3) }), now);
    expect(fed.gardenCeiling).toBe(fed.capHours * fed.yieldPerHour);
    expect(fed.gardenCeiling).toBeGreaterThan(fed.gardenCapacity);
  });

  /**
   * The field is drawn against `gardenCapacity` (`gardenProgress`), and that
   * one must NOT move: a capacity growing and shrinking with a boost would
   * thin the crop out the moment a feeding lapsed — the garden visibly
   * emptying while nothing was harvested.
   */
  it('leaves the BASE capacity alone, so the drawn field does not shrink', () => {
    const plain = burrowView(row(), now);
    const fed = burrowView(row({ fertilisedUntil: inHours(3) }), now);
    expect(fed.gardenCapacity).toBe(plain.gardenCapacity);
  });

  it('reports the bag when given one', () => {
    const v = burrowView(row(), now, bag(2, 1));
    expect(v.boosts.water.held).toBe(2);
    expect(v.boosts.fertiliser.held).toBe(1);
  });

  /**
   * Someone else's burrow — a raid target, a spectated run — is shown without
   * a bag, and what the owner carries is none of the viewer's business.
   */
  it('reports nothing held when no bag is passed', () => {
    const v = burrowView(row(), now);
    expect(v.boosts.water.held).toBe(0);
    expect(v.boosts.fertiliser.held).toBe(0);
  });
});


/**
 * THE SHIELD, which is the one carried item spendable from the burrow.
 *
 * Its window is a FIXED length (`RAID.ITEM_SHIELD_MS`), not a bank that
 * extends — unlike smoke and the garden boosts, which all stack by pushing
 * their expiry out. That difference is the whole reason this blocker exists.
 */
describe('shieldBlocker — when a shield can be raised', () => {
  it('refuses an empty bag', () => {
    expect(shieldBlocker(bag(), null, now)).toBe('none_held');
  });

  it('allows one over an unshielded burrow', () => {
    const b = { ...bag(), shield: 1 };
    expect(shieldBlocker(b, null, now)).toBeNull();
  });

  /**
   * THE ONE THAT PROTECTS THE ITEM. A shield is a fixed window, so raising a
   * second over a standing one overwrites an instant the burrow already owns
   * with one computed from `now` — worth nothing at best, and SHORTER than
   * what it replaced at worst, with an item consumed either way.
   */
  it('refuses one while a shield is already standing', () => {
    const b = { ...bag(), shield: 3 };
    expect(shieldBlocker(b, inHours(2), now)).toBe('already_shielded');
  });

  it('allows one once the old shield has lapsed', () => {
    const b = { ...bag(), shield: 1 };
    expect(shieldBlocker(b, ago(1), now)).toBeNull();
  });
});
