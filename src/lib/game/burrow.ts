/**
 * Burrow economics: what an upgrade costs, what the garden owes you.
 *
 * Pure functions over a player row, so the same maths answers the API, the UI's
 * "can I afford this?" and the tests. The numbers themselves all live in
 * config/tuning.ts — nothing here invents one.
 */
import { BURROW, ENERGY, OUT_OF_RUN_ENERGY, regenPerHour, upgradeCost } from '../../../config/tuning';
import { capHoursFor, currentEnergy, gardenYield, type RegenRow, type TankRow } from './regen';
import { gardenCapacity, yieldPerHour } from './garden-growth';
import { gardenBoostView, type GardenBoostState, type GardenKind, type Holdings } from './inventory';

export interface BurrowRow extends RegenRow {
  stock: number;
  /** Never reset, never stolen — the counter the codex unlocks on. */
  lifetimeCarrots: number;
  /** Raids bounce off until this instant, or null if never shielded. */
  shieldedUntil?: Date | null;
  /** Runs banked so far. Optional so older fixtures still type; zero means
   *  a player who has never been on an island. */
  runsPlayed?: number;
}

export interface BurrowView {
  level: number;
  maxLevel: number;
  stock: number;
  /**
   * Lifetime carrots — the third counter, and the only one that never moves
   * backwards. It rides on the burrow view because the burrow screen is where
   * it is read: it is what opens the codex's chapters (config/lore.ts), and a
   * story hung on `stock` or `seasonScore` would be un-read by a raid.
   */
  lifetime: number;
  /** Carrots waiting to be collected right now. */
  gardenReady: number;
  /**
   * Energy available for a run, and its ceiling.
   *
   * Shown on the burrow because that is where the decision is made: a player
   * about to press "go farm" needs to know whether there is a run in them, and
   * finding out by landing on an island that ends immediately is the worst
   * possible way to learn it.
   */
  energy: number;
  maxEnergy: number;
  /** How long until one more point of energy. Null when already full. */
  nextEnergyInMs: number | null;
  /** The least the tank must hold to cross — ENERGY.MIN_TO_CROSS. What the
   *  gate and the out-of-energy dialog quote. */
  runCost: number;
  /** What the crossing itself takes out of the tank — ENERGY.CROSSING_COST. */
  crossingCost: number;
  /**
   * How long until there is a run's worth in the bar, or null when there
   * already is. The number beside the "go farm" arrow when it has to say no:
   * "+1 in 4m" is true and useless to a player who needs thirty.
   */
  nextRunInMs: number | null;
  /** Carrots the garden makes per hour at this level. */
  yieldPerHour: number;
  /** Energy the tank refills per hour at this level (`regenPerHour`): the
   *  burrow's second reason to be raised, printed beside the yield. */
  regenPerHour: number;
  /**
   * Hours of production the garden holds before it stops — the reason to
   * come back daily rather than weekly.
   *
   * The LIVE ceiling, fertiliser included, rather than the bare constant. It
   * reported `GARDEN.CAP_HOURS` flat, so a fed garden told the player it held
   * twelve hours while `gardenYield` was already paying it eighteen — the one
   * number on the screen that was a picture of a rule the server had stopped
   * following.
   */
  capHours: number;
  /**
   * Carrots waiting when the garden is completely full.
   *
   * The BASE ceiling, fertiliser excluded, and deliberately so: the picture of
   * the field divides by this (`gardenProgress`), and a capacity that grew and
   * shrank with a boost would make the crop thin out the moment a feeding
   * lapsed — the garden visibly emptying while nothing was harvested. What
   * fertiliser buys is reported by `capHours` and `gardenCeiling` instead.
   */
  gardenCapacity: number;
  /**
   * What the garden holds RIGHT NOW, fertiliser included — the number the card
   * prints beside "holds". Equal to `gardenCapacity` with no feeding running.
   */
  gardenCeiling: number;
  /**
   * The two things you can pour on the garden: bottles held, window running.
   *
   * On the burrow view rather than on the shop's bag because this is where
   * they are SPENT. The shop never sells them (they are chest drops), so the
   * garden card is the only surface either one has.
   */
  boosts: Record<GardenKind, GardenBoostState>;
  /**
   * Milliseconds of shield left, or null when raids can land right now.
   *
   * This replaced a HIT POINTS gauge. HP were never a defence — traps are what
   * a raider actually fights, and the damage number changed neither his loot
   * nor his progress. All the HP ever decided was how soon the next raid could
   * land, so the screen now states THAT directly instead of dressing it as a
   * health bar the burrow does not have.
   */
  shieldMs: number | null;
  /** Cost of the next level, or null at max. */
  upgradeCost: number | null;
  canUpgrade: boolean;
  /** What the next level buys, so the price has something to sit against. A
   *  cost with no stated benefit is a number the player cannot judge. */
  next: { yieldPerHour: number; regenPerHour: number } | null;
  /**
   * Runs banked. Zero is the one value that matters: a player who has never
   * been on an island is sent to one straight from sign-in rather than shown
   * a burrow they have nothing to do in yet (see the first-trip effect in
   * page.tsx). The first island is the tutorial; the burrow is its reward.
   */
  runs: number;
}

/**
 * Milliseconds until the next point of energy, or null at the ceiling.
 *
 * Derived from the same timestamp the energy itself is, so the countdown can
 * never disagree with the number beside it.
 */
export function msToNextEnergy(
  row: TankRow,
  now = Date.now(),
): number | null {
  if (currentEnergy(row, now) >= OUT_OF_RUN_ENERGY.MAX) return null;
  const perPoint = 3_600_000 / regenPerHour(row.burrowLevel ?? 1);
  const elapsed = Math.max(0, now - row.energyUpdatedAt.getTime());
  return perPoint - (elapsed % perPoint);
}

/** Is there a run's worth of energy in the bar right now? */
export function canStartRun(
  row: TankRow,
  now = Date.now(),
): boolean {
  return currentEnergy(row, now) >= ENERGY.MIN_TO_CROSS;
}

/**
 * Milliseconds until the bar holds a run's worth, or null when it already does.
 *
 * The regen is linear from `energyUpdatedAt`, so this is one subtraction on the
 * same clock `currentEnergy` reads — the countdown and the number it counts
 * towards cannot disagree. Ceiling'd to whole points because the bar only ever
 * shows whole points: the wait ends when the next point lands, not a fraction
 * of a second before it would have.
 */
/** How long until the tank holds `need` — null if it already does. */
export function msToHave(
  row: TankRow,
  need: number,
  now = Date.now(),
): number | null {
  if (currentEnergy(row, now) >= need) return null;
  const perPoint = 3_600_000 / regenPerHour(row.burrowLevel ?? 1);
  const short = need - row.energy;
  const readyAt = row.energyUpdatedAt.getTime() + Math.ceil(short) * perPoint;
  return Math.max(0, readyAt - now);
}

/** How long until a crossing is affordable (ENERGY.MIN_TO_CROSS). */
export function msToRun(
  row: TankRow,
  now = Date.now(),
): number | null {
  return msToHave(row, ENERGY.MIN_TO_CROSS, now);
}

/**
 * The bar after paying for a run, or null when it cannot afford one.
 *
 * Pure: the caller writes it back. The regen that accrued since the last
 * stamp is folded in FIRST and then the cost comes off, and the stamp moves to
 * `now` — writing `energy - cost` against the OLD stamp would let the interval
 * since it be paid out a second time on the next read.
 */
/**
 * Take `cost` out of the tank, if it holds at least `need` — null otherwise.
 * `need` is the floor to be let through (a crossing wants the fee plus a few
 * digs), `cost` what is actually taken; with `floor` the charge never refuses
 * and stops at zero, which is how a raid's steps are paid mid-run.
 */
export function chargeEnergy(
  row: TankRow,
  charge: { cost: number; need: number; floor?: boolean },
  now = Date.now(),
): { energy: number; energyUpdatedAt: Date } | null {
  const have = currentEnergy(row, now);
  if (!charge.floor && have < charge.need) return null;
  // A NEGATIVE cost is a refund (a raid's steps given back at the field), and
  // it stops at the ceiling like every other gain: the tank is capped, not
  // the ledger.
  return { energy: Math.min(OUT_OF_RUN_ENERGY.MAX, Math.max(0, have - charge.cost)), energyUpdatedAt: new Date(now) };
}

/** The crossing: the fee, behind the floor that makes it worth paying. */
export function chargeRun(
  row: TankRow,
  now = Date.now(),
): { energy: number; energyUpdatedAt: Date } | null {
  return chargeEnergy(row, { cost: ENERGY.CROSSING_COST, need: ENERGY.MIN_TO_CROSS }, now);
}

/**
 * Milliseconds of shield remaining, or null once raids can land again.
 *
 * Null rather than 0 for "unshielded" so the caller can tell "the shield just
 * ran out" from "there is no shield" without comparing against a clock twice.
 */
export function msOfShield(until: Date | null, now = Date.now()): number | null {
  if (!until) return null;
  const left = until.getTime() - now;
  return left > 0 ? left : null;
}

/**
 * Carrots per hour a garden makes at `level`, and the ceiling it fills to.
 *
 * Both re-exported from `garden-growth` rather than worked out again here. The
 * picture of the field divides by the SAME capacity this view reports, so
 * "holds 576" in the panel and a field drawn full are one fact stated twice —
 * see the note on `gardenCapacity`.
 */
export { yieldPerHour, gardenCapacity };

/**
 * `bag` is optional: the boosts read zero without it.
 *
 * Every caller that shows the burrow to its owner passes one. The ones that do
 * not are looking at SOMEONE ELSE's burrow (a raid target, a spectated run),
 * where what the owner has in their bag is neither known nor any of the
 * viewer's business — so the default is the honest answer for those, not a
 * shortcut for the owner's screen.
 */
export function burrowView(row: BurrowRow, now = Date.now(), bag?: Holdings): BurrowView {
  const atMax = row.burrowLevel >= BURROW.MAX_LEVEL;
  const cost = atMax ? null : upgradeCost(row.burrowLevel);
  const empty = { trap: 0, bomb: 0, lightning: 0, shield: 0, energy: 0, smoke: 0,
    mirage: 0, water: 0, fertiliser: 0 } as Holdings;
  return {
    level: row.burrowLevel,
    maxLevel: BURROW.MAX_LEVEL,
    stock: row.stock,
    lifetime: row.lifetimeCarrots,
    gardenReady: gardenYield(row, now),
    energy: currentEnergy(row, now),
    maxEnergy: OUT_OF_RUN_ENERGY.MAX,
    nextEnergyInMs: msToNextEnergy(row, now),
    runCost: ENERGY.MIN_TO_CROSS,
    crossingCost: ENERGY.CROSSING_COST,
    nextRunInMs: msToRun(row, now),
    yieldPerHour: yieldPerHour(row.burrowLevel),
    regenPerHour: regenPerHour(row.burrowLevel),
    capHours: capHoursFor(row, now),
    gardenCapacity: gardenCapacity(row.burrowLevel),
    gardenCeiling: Math.floor(capHoursFor(row, now) * yieldPerHour(row.burrowLevel)),
    boosts: gardenBoostView(bag ?? empty, row, now),
    shieldMs: msOfShield(row.shieldedUntil ?? null, now),
    upgradeCost: cost,
    canUpgrade: cost !== null && row.stock >= cost,
    next: atMax ? null : { yieldPerHour: yieldPerHour(row.burrowLevel + 1), regenPerHour: regenPerHour(row.burrowLevel + 1) },
    runs: row.runsPlayed ?? 0,
  };
}

/**
 * Why an upgrade cannot happen, or null when it can. Returning the REASON
 * rather than a boolean is what lets the API say "you need 300 more carrots"
 * instead of a bare 400.
 */
export function upgradeBlocker(row: BurrowRow): string | null {
  if (row.burrowLevel >= BURROW.MAX_LEVEL) return 'max_level';
  if (row.stock < upgradeCost(row.burrowLevel)) return 'insufficient_carrots';
  return null;
}
