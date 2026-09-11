/**
 * Sheep getting out of the way.
 *
 * A sheep BLOCKS its cell (`blocking.ts`), and until now it never moved: the
 * flock was derived from the seed and stood still, identical for everyone
 * without the server having to say a word about it. That is also what made a
 * sheep a permanent wall — one standing in a dead end took the carrots behind
 * it out of the game for the whole run.
 *
 * So they bolt. Not as a push — nobody shoves a sheep — but on their own, when
 * a rabbit gets close. The rules, in short:
 *
 *   1. a sheep flees when a rabbit is within `PANIC_RADIUS`
 *   2. where it goes is RANDOM among the cells it can legally reach, not
 *      "away from the rabbit": a predictable sheep is a sheep you herd into a
 *      corner on purpose, and herding is not the game this is in
 *   3. a calm sheep drifts one cell at a time (the old `wander`)
 *   4. a CORNERED sheep sprints: several cells in one go, and it will climb a
 *      tier to do it. This is the rule that makes a sheep un-blocking, which
 *      is the whole point — see `SPRINT_STEPS`
 *
 * Pure, like `push.ts`: nothing here mutates the board or touches a socket, so
 * the rules can be asserted without a server or a clock. `planFlight` says
 * where a sheep WOULD go and the caller commits it — which is what lets the
 * server move a whole flock atomically instead of discovering halfway through
 * that two of them chose the same cell.
 */
import { toColRow } from '@/config/gridConfig';

/** How near a rabbit has to be before a sheep stops grazing and bolts. */
export const PANIC_RADIUS = 2;

/**
 * How far a cornered sheep runs, in cells.
 *
 * One step is what a calm sheep does, and it is not enough here: a sheep with
 * a rabbit on top of it and one way out would step aside and be cornered again
 * on the very next move, which reads as the sheep taunting the player. Four
 * cells clears the dead end it was caught in.
 *
 * It is also why a sheep can never block: whatever it is standing in, four
 * cells of sprint — climbing if it has to — takes it out of there.
 */
export const SPRINT_STEPS = 4;

/** Chance a calm sheep drifts on a given tick. Grazing, not marching. */
export const GRAZE_CHANCE = 0.25;

/** Where a sheep is, in the only terms this module needs. */
export interface Grazer {
  id: string;
  x: number;
  y: number;
}

/** What the board has to answer for a flight to be planned. */
export interface Ground {
  /** Cells reachable from here in one step, climbing allowed. */
  stepsFrom(x: number, y: number): Array<{ x: number; y: number }>;
  /** True when nothing stands on `(x, y)` — no sheep, no rabbit, no tree. */
  isFree(x: number, y: number): boolean;
  /** The terrain tier of a cell, for the same-shelf preference. */
  tierAt(x: number, y: number): number;
}

/** One sheep's move, as the caller must apply it. */
export interface Flight {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** True when this was a panic sprint rather than a graze. The client plays
   *  it faster and the server can skip the usual drift timer. */
  sprinting: boolean;
}

/** Chebyshev distance — the island steps diagonally, so this is "how many
 *  moves away", not the crow-flight distance. */
export function cellDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Is a rabbit close enough to spook this sheep?
 *
 * Takes tile indices for the rabbits because that is what the server holds;
 * the sheep is already in cell terms.
 */
export function isSpooked(sheep: Grazer, rabbitTiles: readonly number[]): boolean {
  for (const tile of rabbitTiles) {
    const { col, row } = toColRow(tile);
    if (cellDistance(sheep.x, sheep.y, col, row) <= PANIC_RADIUS) return true;
  }
  return false;
}

/**
 * Where one sheep goes this tick, or null if it stays put.
 *
 * `random` is passed in rather than called from here so the server can seed it
 * and replay a tick — the same reason `resolveMove` takes its RNG.
 *
 * The order matters. A spooked sheep tries to sprint; only if it cannot find
 * any legal cell at all does it stand still, and that case is a sheep walled
 * in on every side by other occupants, which the flock spacing already makes
 * rare and which resolves itself as soon as a neighbour moves.
 */
export function planFlight(
  sheep: Grazer,
  ground: Ground,
  spooked: boolean,
  random: () => number,
): Flight | null {
  if (!spooked) {
    // Rule 3: a calm sheep drifts, and only sometimes.
    if (random() > GRAZE_CHANCE) return null;
    const step = pickStep(sheep.x, sheep.y, ground, random, true);
    if (!step) return null;
    return { id: sheep.id, from: { x: sheep.x, y: sheep.y }, to: step, sprinting: false };
  }

  // Rules 2 and 4: bolt somewhere legal, several cells, climbing if the shelf
  // it is on has nothing left to offer.
  let { x, y } = sheep;
  let moved = false;
  /**
   * Cells this sprint has already touched.
   *
   * Without it a bolting sheep doubles back — each step is chosen from the
   * neighbours of where it now stands, and the cell it just came from is
   * always one of them. Four steps of that is a sheep jittering on the spot,
   * which is both useless as an escape and comical to watch. Retracing is
   * banned outright rather than merely discouraged, because the case that
   * matters (one exit, a corridor) is exactly the one where the only other
   * option IS the way back.
   */
  const visited = new Set<string>([`${x},${y}`]);
  for (let i = 0; i < SPRINT_STEPS; i++) {
    // Same shelf while that is possible, any shelf once it is not: the
    // preference keeps ordinary flight readable, and dropping it is what stops
    // a dead end from ever being permanent.
    const step =
      pickStep(x, y, ground, random, true, visited) ??
      pickStep(x, y, ground, random, false, visited);
    if (!step) break;
    x = step.x;
    y = step.y;
    visited.add(`${x},${y}`);
    moved = true;
  }
  if (!moved) return null;
  return { id: sheep.id, from: { x: sheep.x, y: sheep.y }, to: { x, y }, sprinting: true };
}

/**
 * One legal cell out of here, chosen at random.
 *
 * `sameTier` asks for the shelf it is standing on. Returns null when nothing
 * qualifies, which is the caller's signal to relax the constraint (or to give
 * up, for a calm sheep that simply stays where it is).
 */
function pickStep(
  x: number,
  y: number,
  ground: Ground,
  random: () => number,
  sameTier: boolean,
  visited?: ReadonlySet<string>,
): { x: number; y: number } | null {
  const tier = ground.tierAt(x, y);
  const open = ground
    .stepsFrom(x, y)
    .filter(
      (c) =>
        ground.isFree(c.x, c.y) &&
        (!sameTier || ground.tierAt(c.x, c.y) === tier) &&
        !visited?.has(`${c.x},${c.y}`),
    );
  if (!open.length) return null;
  return open[Math.floor(random() * open.length)];
}

/**
 * Every sheep's move for one tick, in commit order.
 *
 * Sequential on purpose, and this is the part that cannot be parallelised: each
 * sheep claims its destination before the next is considered, via `claim`, so
 * two of them can never choose the same cell. `wander()` had the same rule and
 * for the same reason.
 */
export function planFlock(
  sheep: readonly Grazer[],
  ground: Ground,
  rabbitTiles: readonly number[],
  random: () => number,
  claim: (from: { x: number; y: number }, to: { x: number; y: number }) => void,
): Flight[] {
  const flights: Flight[] = [];
  for (const one of sheep) {
    const flight = planFlight(one, ground, isSpooked(one, rabbitTiles), random);
    if (!flight) continue;
    claim(flight.from, flight.to);
    flights.push(flight);
  }
  return flights;
}
