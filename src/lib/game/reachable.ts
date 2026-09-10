/**
 * Which neighbouring tiles a rabbit may actually step onto.
 *
 * Split out of the scene so the rule is testable and, more importantly, so it
 * stays a MIRROR of `resolveMove` rather than a second opinion. The scene
 * lights exactly this set: the ring is a promise that a tap will be accepted,
 * and a ring that lights tiles the server refuses is worse than no ring — it
 * teaches the player the affordance lies, and after that they stop reading it.
 *
 * Kept to the gates the client can honestly evaluate. `too-fast` is deliberately
 * not among them: it is an anti-speedhack floor no human hand reaches, so
 * darkening the ring for it would only ever misfire on a legitimate player.
 */
import { ENERGY } from '@config/tuning';
import { neighbors, type IslandShape } from '@/config/gridConfig';

export interface ReachableState {
  /** Where the rabbit stands. */
  tile: number;
  /** Its energy, as last reported by the server. */
  energy: number;
  /** Is it still in the run? */
  alive: boolean;
  /** Stun deadline, on the CLIENT's clock (0 when not stunned). */
  stunnedUntil: number;
  /** Has this tile already been dug? Walking revealed ground is free. */
  isRevealed(index: number): boolean;
}

/**
 * The tiles a step is currently allowed onto — empty when nothing is.
 *
 * `now` is injected so a test does not have to wait out a real stun.
 */
export function reachableTiles(
  state: ReachableState,
  shape: IslandShape,
  now: number = Date.now(),
): number[] {
  // Dead or stunned, the server refuses every move; the ring goes fully dark.
  if (!state.alive) return [];
  if (now < state.stunnedUntil) return [];

  return neighbors(state.tile, shape).filter((index) => {
    // Revealed ground costs nothing, so it stays clickable at zero energy —
    // and at zero energy it is the ONLY thing that is.
    if (state.isRevealed(index)) return true;
    return state.energy >= ENERGY.DIG_COST;
  });
}
