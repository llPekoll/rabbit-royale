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
  /**
   * Every cell the sheep sets foot on, in order, EXCLUDING where it started.
   *
   * A graze is one entry and reads the same either way, but a sprint is up to
   * `SPRINT_STEPS` cells chosen one neighbour at a time — and those cells are
   * not a straight line. Reporting only `to` was what made a bolting sheep
   * teleport: the client had the two endpoints and nothing in between, so the
   * best it could do was cut the corner, straight through whatever the sheep
   * had actually run around.
   *
   * The last entry always equals `to`; `to` is kept because most callers (the
   * board, the blocking set) only ever want where it ended up.
   */
  path: Array<{ x: number; y: number }>;
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
    return {
      id: sheep.id,
      from: { x: sheep.x, y: sheep.y },
      to: step,
      path: [step],
      sprinting: false,
    };
  }

  // Rules 2 and 4: pick somewhere FAR and go straight there.
  //
  // This used to be four random steps in a row, and it read as a sheep
  // panicking on the spot rather than fleeing: with the way back banned but
  // every other neighbour equally likely, a four-step walk curls around itself
  // and lands, on open ground, 1 cell from where it started 17% of the time
  // and the full 4 only 11%. Choosing the destination first and walking the
  // shortest route to it is what makes a bolt look like a bolt — same distance
  // budget, but spent going somewhere.
  const route = sprintRoute(sheep.x, sheep.y, ground, random);
  if (!route.length) return null;
  const last = route[route.length - 1];
  return {
    id: sheep.id,
    from: { x: sheep.x, y: sheep.y },
    to: { x: last.x, y: last.y },
    path: route,
    sprinting: true,
  };
}

/**
 * The route a bolting sheep takes: as far as `SPRINT_STEPS` allows, in one
 * direction.
 *
 * A breadth-first sweep out to the sprint budget, then a destination drawn
 * from the FURTHEST ring that has anything in it — falling back through the
 * nearer rings only when the far ones are walled off. Because the sweep is
 * breadth-first the recorded parent chain is a shortest route, so the sheep
 * walks the straightest line the terrain allows instead of meandering there.
 *
 * The same-shelf preference from the old step-by-step version is kept, and
 * kept in the same shape: cells on the sheep's own tier are preferred as
 * destinations, and a climb is accepted only when staying level offers nothing
 * further away. That is the rule that stops a dead end from ever being
 * permanent, which is the whole reason sheep move at all.
 */
function sprintRoute(
  startX: number,
  startY: number,
  ground: Ground,
  random: () => number,
): Array<{ x: number; y: number }> {
  const startTier = ground.tierAt(startX, startY);
  const startKey = `${startX},${startY}`;
  /** Cell -> the cell it was first reached from. Shortest routes, by BFS. */
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  /** Cells at each distance from the start, 1..SPRINT_STEPS. */
  const rings: Array<Array<{ x: number; y: number; key: string }>> = [];

  let frontier = [{ x: startX, y: startY, key: startKey }];
  for (let depth = 0; depth < SPRINT_STEPS && frontier.length; depth++) {
    const next: Array<{ x: number; y: number; key: string }> = [];
    for (const cell of frontier) {
      for (const step of ground.stepsFrom(cell.x, cell.y)) {
        const key = `${step.x},${step.y}`;
        if (cameFrom.has(key) || !ground.isFree(step.x, step.y)) continue;
        cameFrom.set(key, cell.key);
        next.push({ x: step.x, y: step.y, key });
      }
    }
    if (next.length) rings.push(next);
    frontier = next;
  }

  // Furthest ring first, and within a ring the sheep's own shelf first.
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    const level = ring.filter((c) => ground.tierAt(c.x, c.y) === startTier);
    const pick = level.length ? level : ring;
    const dest = pick[Math.floor(random() * pick.length)];
    return traceRoute(dest.key, cameFrom);
  }
  return [];
}

/** Walk the BFS parent chain back to the start, and hand it back forwards. */
function traceRoute(
  destKey: string,
  cameFrom: ReadonlyMap<string, string | null>,
): Array<{ x: number; y: number }> {
  const route: Array<{ x: number; y: number }> = [];
  let key: string | null | undefined = destKey;
  while (key) {
    const parent = cameFrom.get(key);
    // The start itself has a null parent and is deliberately left out: `path`
    // is the cells the sheep CROSSES, not where it stood.
    if (parent === null) break;
    const [x, y] = key.split(',').map(Number);
    route.unshift({ x, y });
    key = parent;
  }
  return route;
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
