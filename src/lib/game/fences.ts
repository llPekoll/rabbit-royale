/**
 * The fence rules: where a plank may go, and why one never can.
 *
 * Much smaller than `traps.ts`, and the difference is the point. A trap has an
 * economy — a rolling free allowance, a rearm clock, a refund that must not be
 * loopable — because traps are consumed by being used. A plank is not: a
 * raider who is refused a step does not break it. So the only questions here
 * are "do you hold one" and "is this span allowed", answered against the bag
 * and the geometry rather than against a clock.
 *
 * The geometry lives in `game/burrow/fence` because the BOARD needs it too —
 * the owner is shown the spans they can close before they close them, and the
 * drawing and the refusal must come from one walk of the field's edge.
 */
import { FENCES } from '@config/tuning';
import {
  fieldReachable, isFenceSide, isSpan, segKey, type FenceSeg, type FenceSide,
} from '@/game/burrow/fence';

export type { FenceSeg, FenceSide };

/** Rows of the `fences` table for one burrow, as the planks they name. */
export function fencedSpans(rows: readonly { tile: number; side: string }[]): FenceSeg[] {
  // Filtered through the canonical list rather than cast: a row written by an
  // older build, or by hand, must not become a plank the geometry cannot place.
  const out: FenceSeg[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!isFenceSide(r.side) || !Number.isInteger(r.tile)) continue;
    const key = segKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tile: r.tile, side: r.side });
  }
  return out;
}

/**
 * Why a plank cannot go up on (tile, side), or null when it can.
 *
 * A REASON, not a boolean — the same choice `placementBlocker` makes, for the
 * same reason: "that is not an edge" and "that is your last way in" are
 * different facts, and the second is a rule the player has to learn rather
 * than a mistake they made.
 */
export function fencePlacementBlocker(
  seed: string,
  held: number,
  standing: readonly FenceSeg[],
  tile: number,
  side: string,
): string | null {
  if (!isFenceSide(side) || !Number.isInteger(tile)) return 'bad_span';
  // Not an exposed edge of this field: there is nothing there to wall, and
  // taking a plank for it would take it for nothing.
  if (!isSpan(seed, tile, side)) return 'span_not_exposed';
  const seg = { tile, side };
  if (standing.some((s) => segKey(s) === segKey(seg))) return 'span_already_fenced';
  if (held < 1) return 'no_fences';
  // THE GATE RULE, asked as reachability — see `fieldReachable`.
  if (!fieldReachable(seed, [...standing, seg])) return 'would_seal_burrow';
  return null;
}

/** Why a plank cannot come down, or null when it can. */
export function fenceRemovalBlocker(
  standing: readonly FenceSeg[],
  held: number,
  tile: number,
  side: string,
): string | null {
  if (!isFenceSide(side) || !Number.isInteger(tile)) return 'bad_span';
  if (!standing.some((s) => s.tile === tile && s.side === side)) return 'span_not_fenced';
  // Room to put it back in the bag: silently destroying a plank they paid for
  // is the outcome this refuses.
  if (held >= FENCES.MAX_HELD) return 'inventory_full';
  return null;
}
