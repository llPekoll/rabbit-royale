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
 *
 * ## The pushing gates are NOT evaluated here, on purpose
 *
 * A step onto another rabbit can be refused for reasons this function cannot
 * see coming: the target is stunned, or the chain behind them is blocked, or
 * the two of you collided head-on within `HEAD_ON_WINDOW_MS` (see `push.ts`).
 * The last one is unknowable in advance by definition — it depends on what the
 * other player does in the same instant.
 *
 * Rather than half-mirror them, the ring stays lit over occupied tiles and the
 * push is attempted. A refused push bounces as `move_rejected`, and the client
 * shows the bonk. Darkening the ring on stun would be MORE honest for that one
 * case but would also flicker as stuns lapse, and it would still not cover the
 * head-on — so the ring means "you may try to step here", which over an
 * occupied tile is exactly what a bumper-car game should promise.
 */
import { ENERGY } from '@config/tuning';
import { terrainNeighbors } from './terrainBoard';

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
  /**
   * Tiles the flock stands on RIGHT NOW, when the caller knows.
   *
   * The seed says where the sheep started, not where they are, so the terrain
   * neighbours cannot leave them out. The server refuses a step onto one
   * (`blocked`), and the ring has to go dark on the same cells or it lies.
   */
  blocked?: ReadonlySet<number>;
}

/**
 * The tiles a step is currently allowed onto — empty when nothing is.
 *
 * `now` is injected so a test does not have to wait out a real stun.
 */
export function reachableTiles(
  state: ReachableState,
  seed: string,
  now: number = Date.now(),
): number[] {
  // Dead or stunned, the server refuses every move; the ring goes fully dark.
  if (!state.alive) return [];
  if (now < state.stunnedUntil) return [];

  // The TERRAIN's neighbours, which is what `resolveMove` checks on the server
  // — so the ring stays a promise that a tap will be accepted. A cliff two
  // tiers up and a tile with a pine on it are both absent from this list, and
  // both are refused server-side for exactly the same reason.
  return terrainNeighbors(seed, state.tile).filter((index) => {
    if (state.blocked?.has(index)) return false;
    // Revealed ground costs nothing, so it stays clickable at zero energy —
    // and at zero energy it is the ONLY thing that is.
    if (state.isRevealed(index)) return true;
    return state.energy >= ENERGY.DIG_COST;
  });
}
