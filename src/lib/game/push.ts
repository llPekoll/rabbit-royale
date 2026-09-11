/**
 * Rabbits shoving rabbits — the bumper-car rules.
 *
 * The full decision surface, every case and the reasoning, is in
 * `docs/bumping.md`. This file is only the arithmetic, kept apart from
 * `resolveMove` so the rules can be asserted without a server, a socket or a
 * clock — the same split the rest of `lib/game` already keeps.
 *
 * The seven rules, in short:
 *
 *   1. a push moves ONE tile, in the direction the pusher walked
 *   2. landing on an undug tile DIGS it, bomb included — the deliberate
 *      exception, and the reason the rest of these rules are careful
 *   3. a stunned rabbit cannot be pushed and blocks pushes: it is terrain
 *   4. head-on, both are refused and nobody moves
 *   5. pushes chain; if the far end is blocked the whole line stays put
 *   6. pushing is free, because stepping onto undug ground already costs a dig
 *   7. the victim is always told who pushed them
 *
 * Nothing here mutates. `planPush` returns what WOULD happen, and the caller
 * commits it — which is what lets the server apply a chain atomically instead
 * of discovering halfway down the line that the far end is a cliff.
 */
import { terrainNeighbors } from './terrainBoard';
import { toColRow, toIndex, COLS, ROWS } from '@/config/gridConfig';
import type { Rabbit } from './types';

/**
 * How close two opposing moves have to be to count as a head-on.
 *
 * The server resolves moves as they arrive rather than on a tick, so a true
 * simultaneous collision never happens: one packet is simply first. Without a
 * window, the player with the better ping silently wins every contested tile —
 * invisible to both, and therefore read as the game cheating. 120ms is a
 * little over one `MIN_MOVE_INTERVAL_MS`, so it catches a genuine mutual rush
 * without swallowing two deliberate moves in sequence.
 */
export const HEAD_ON_WINDOW_MS = 120;

/** One rabbit's displacement, in the order it must be applied. */
export interface PushStep {
  playerId: string;
  from: number;
  to: number;
}

export interface PushPlan {
  /** Everyone who moves, FURTHEST FIRST so no step lands on an occupied tile. */
  steps: PushStep[];
}

/** Why a push could not happen. Mirrors the rule numbers in `docs/bumping.md`. */
export type PushRefusal =
  | 'head-on'        // rule 4: both stepped into each other
  | 'stunned-target' // rule 3: a stunned rabbit is terrain
  | 'chain-blocked'; // rule 5: the far end has nowhere to go

export type PushOutcome =
  | { ok: true; plan: PushPlan }
  | { ok: false; refusal: PushRefusal };

/** Everyone on the island, by the tile they stand on. */
export type Occupancy = ReadonlyMap<number, Rabbit>;

/** Index the rabbits by tile. Dead rabbits are not on the board. */
export function occupancyOf(rabbits: Iterable<Rabbit>): Map<number, Rabbit> {
  const byTile = new Map<number, Rabbit>();
  for (const r of rabbits) if (r.alive) byTile.set(r.tile, r);
  return byTile;
}

/**
 * The tile one step further along the direction `from → through`.
 *
 * Returns null when that would leave the grid. Whether it is legal GROUND is a
 * separate question, asked against the terrain below.
 */
function beyond(from: number, through: number): number | null {
  const a = toColRow(from);
  const b = toColRow(through);
  const col = b.col + (b.col - a.col);
  const row = b.row + (b.row - a.row);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
  return toIndex(col, row);
}

/**
 * Work out what a step by `mover` onto `to` displaces.
 *
 * Call it only for a move that is otherwise legal — adjacent, on the board,
 * affordable. This answers the one question `resolveMove` cannot: who else is
 * standing there, and where does everybody end up.
 *
 * `now` is injected so the head-on window is testable without waiting.
 */
export function planPush(
  seed: string,
  mover: Rabbit,
  to: number,
  occupancy: Occupancy,
  now: number,
): PushOutcome {
  const target = occupancy.get(to);
  if (!target || target.playerId === mover.playerId) return { ok: true, plan: { steps: [] } };

  // Rule 4. A head-on: the target arrived on this tile moments ago, moving
  // TOWARDS us. Without the window the player with the better ping silently
  // wins every contested tile, which is invisible and so reads as the game
  // cheating; with it, a genuine mutual rush bounces and nobody loses ground.
  const fresh = target.lastMoveAt > 0 && now - target.lastMoveAt <= HEAD_ON_WINDOW_MS;
  if (fresh && movedToward(target, mover)) return { ok: false, refusal: 'head-on' };

  // Rule 3. A stunned rabbit is terrain: it cannot be shoved, so the push
  // simply fails rather than displacing someone who cannot react.
  if (now < target.stunnedUntil) return { ok: false, refusal: 'stunned-target' };

  // Rule 5. Walk the line of rabbits, each shoved onto the next tile along.
  const steps: PushStep[] = [];
  let pushedFrom = mover.tile;
  let pushedTile = to;

  for (;;) {
    const occupant = occupancy.get(pushedTile);
    if (!occupant) break;                       // the line ends on empty ground
    if (now < occupant.stunnedUntil) return { ok: false, refusal: 'chain-blocked' };

    const landing = beyond(pushedFrom, pushedTile);
    if (landing === null) return { ok: false, refusal: 'chain-blocked' };
    // The terrain has the final say: sea, cliff, tree and off-board all refuse.
    if (!terrainNeighbors(seed, pushedTile).includes(landing)) {
      return { ok: false, refusal: 'chain-blocked' };
    }

    steps.push({ playerId: occupant.playerId, from: pushedTile, to: landing });
    pushedFrom = pushedTile;
    pushedTile = landing;
  }

  // Furthest first: applied in this order, every rabbit moves onto ground the
  // one ahead of it has already left.
  steps.reverse();
  return { ok: true, plan: { steps } };
}

/**
 * Did `target`'s last step carry it towards `mover` — the head-on case?
 *
 * The distinction that matters is between a mutual rush and a CHASE. Both look
 * alike from a single position: two rabbits, one tile apart, one of them moved
 * recently. What separates them is direction — in a collision the target came
 * closer to where the mover was standing, in a chase it was running away.
 *
 * `cameFrom` is the tile the target left, which the caller keeps on the rabbit
 * precisely so this question can be asked.
 */
function movedToward(target: Rabbit, mover: Rabbit): boolean {
  if (target.cameFrom === undefined) return false;
  const was = toColRow(target.cameFrom);
  const now = toColRow(target.tile);
  const them = toColRow(mover.tile);
  // Chebyshev distance: on an 8-way grid it is the number of steps between two
  // tiles, so "did this step close the gap" is one comparison.
  const before = Math.max(Math.abs(was.col - them.col), Math.abs(was.row - them.row));
  const after = Math.max(Math.abs(now.col - them.col), Math.abs(now.row - them.row));
  return after < before;
}
