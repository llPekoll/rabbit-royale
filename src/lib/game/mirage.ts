/**
 * The mirage: making a rival's numbers lie, and letting them catch it.
 *
 * Smoke takes the clue numbers away and the victim knows they are blind. A
 * mirage leaves them on the board and corrupts a few, so the victim trusts a
 * "2" that should read 3 and steps onto a bomb the board said was not there.
 *
 * The design rule that keeps this from being pure cruelty is that a lie is
 * only readable AGAINST the truth around it. Minesweeper numbers overlap: a
 * tile's count constrains its neighbours' counts, so a corrupted hint
 * contradicts the honest ones beside it, and a player who is actually reading
 * the board can find it and re-derive the real number. That is why only
 * `MIRAGE.TILES` are touched and why the drift is +/-1 — corrupt everything,
 * or corrupt wildly, and there is nothing left to check a number against,
 * which is just smoke with extra steps and none of the skill.
 *
 * Pure and seeded, like the rest of `lib/game`: the same mirage produces the
 * same lies on the server and in a bug report. Nothing here touches Pixi, a
 * socket or a clock.
 */
import { MIRAGE } from '@config/tuning';
import { mulberry32, seedFrom } from './rng';
import type { Island } from './types';

/** One corrupted hint: the tile, the truth, and what the victim is shown. */
export interface FalseHint {
  tile: number;
  /** What `countAdjacent` actually says. Kept so the lie can be undone. */
  truth: number;
  /** What the victim sees instead. Always `truth` +/- `MIRAGE.DRIFT`. */
  shown: number;
}

export interface ActiveMirage {
  /** Who threw it. The victim is told — revenge is the point. */
  castBy: string;
  /** Server time the numbers go honest again. */
  expiresAt: number;
  hints: FalseHint[];
  /**
   * Share of tiles dug DURING the mirage that also come out wrong.
   *
   * Without this the item lasts an instant: the victim re-reads the three
   * corrupted tiles, finds the contradiction, and every fresh dig after that
   * is honest. Bending some of the new ground is what keeps ninety seconds of
   * doubt rather than ninety seconds of one puzzle.
   *
   * A SHARE, not all of them — the same rule as the initial three. Most of
   * what the victim digs is true, so the board stays checkable.
   */
  freshRate: number;
}

/**
 * Choose which revealed tiles will lie, and what they will say.
 *
 * Only tiles the victim has ALREADY dug, and only ones carrying a hint: an
 * undug tile has no number to corrupt, and a tile whose true count is 0 shows
 * nothing at all, so faking one would invent a number for ground that reads as
 * empty — which looks like a bug rather than like sabotage.
 *
 * Returns fewer than `MIRAGE.TILES` when the island has not been dug enough to
 * supply them, and an empty list when it has no hints at all. A mirage thrown
 * at a board nobody has read is simply wasted, which is a fair outcome: the
 * item attacks deduction, and there is no deduction happening yet.
 */
export function planMirage(
  island: Island,
  castBy: string,
  now: number,
  seed = `${island.seed}:mirage:${now}`,
): ActiveMirage {
  const rng = mulberry32(seedFrom(seed));

  // Revealed, and carrying a number worth corrupting.
  const candidates: number[] = [];
  for (const [index, tile] of island.tiles) {
    if (MIRAGE.REVEALED_ONLY && !tile.revealed) continue;
    if (tile.adjacent <= 0) continue;
    candidates.push(index);
  }

  // Shuffle and take a prefix: scanning in index order would put every lie in
  // the same corner of the island, where one glance finds all of them.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const hints: FalseHint[] = [];
  for (const tile of candidates.slice(0, MIRAGE.TILES)) {
    const truth = island.tiles.get(tile)!.adjacent;
    hints.push({ tile, truth, shown: driftFrom(truth, rng) });
  }

  return { castBy, expiresAt: now + MIRAGE.DURATION_MS, hints, freshRate: MIRAGE.FRESH_RATE };
}

/**
 * A believable wrong number: `truth` moved by one, never off the ladder.
 *
 * Up or down at random, except at the edges. A 1 never drifts to 0 — a hint of
 * zero is drawn as no hint at all, so the lie would read as "this tile is
 * blank", which is a different claim and an obvious glitch rather than a
 * plausible count.
 */
function driftFrom(truth: number, rng: () => number): number {
  const d = MIRAGE.DRIFT;
  if (truth <= 1) return truth + d;
  if (truth >= 8) return truth - d;
  return rng() < 0.5 ? truth - d : truth + d;
}

/** Is this mirage still holding at `now`? */
export function mirageActive(m: ActiveMirage | null | undefined, now: number): boolean {
  return !!m && now < m.expiresAt;
}

/**
 * The number to SHOW for a tile — the lie while one holds, the truth after.
 *
 * The island's own `adjacent` is never overwritten. A mirage is a lens on the
 * way out, not a change to the board: the server keeps computing honest counts
 * (so a hint recomputed after a sabotage bomb is still right), and only what
 * reaches this victim is bent. That is also what makes expiry free — the truth
 * was never lost, so there is nothing to restore.
 */
export function shownAdjacent(
  m: ActiveMirage | null | undefined,
  tile: number,
  truth: number,
  now: number,
): number {
  if (!mirageActive(m, now)) return truth;

  const planned = m!.hints.find((h) => h.tile === tile);
  if (planned) return planned.shown;

  // Ground dug during the mirage. Bent at `freshRate`, decided per TILE rather
  // than per roll so the same tile always reads the same way — a number that
  // flickered between two values as the client redrew would give the item away
  // instantly, and would read as a bug rather than as sabotage.
  if (truth <= 0) return truth;
  const rng = mulberry32(seedFrom(`${m!.castBy}:${m!.expiresAt}:${tile}`));
  if (rng() >= m!.freshRate) return truth;
  return driftFrom(truth, rng);
}

/**
 * The tiles a mirage is currently lying about.
 *
 * For the client, which has to redraw exactly those numbers when the mirage
 * lands and again when it lifts. Sending the whole board would work and would
 * also hand the victim the answer: a redraw of three tiles is indistinguishable
 * from a redraw of three tiles, but a redraw of the whole board announces which
 * three changed.
 */
export function mirageTiles(m: ActiveMirage | null | undefined): number[] {
  return m ? m.hints.map((h) => h.tile) : [];
}
