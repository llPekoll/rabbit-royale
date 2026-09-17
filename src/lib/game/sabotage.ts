/**
 * Planting a bomb on a live island — the quiet sabotage.
 *
 * The loud one is the strike (`lightning.ts`): it lands where it is aimed and
 * happens at once. A planted bomb is an AMBUSH: it sits under an undug tile
 * and pays off only if somebody digs there, when it goes off like any bomb
 * the island dealt — a heart, a knockback, and the victim is told who put it
 * there (`Tile.plantedBy`, read by the dig in `run.ts`).
 *
 * The shop sold this item and the dig honoured it, and nothing in between
 * ever planted one. This is the in-between.
 *
 * The rule that shapes everything here is the GDD's: the board must never
 * UN-DEDUCE itself. A bomb appearing next to numbers already read would make
 * those numbers lies — so a plant RECOUNTS every neighbour and reports which
 * shown numbers changed, and the server redraws them for everyone. A number
 * ticking up in the corner of the eye is a tell, and a fair one: the ground
 * still says the truth, it has simply changed. And a plant is refused on any
 * tile the board has already vouched for as safe — dug, or opened by a
 * cascade (`hinted`) — and on a chest, whose beam is a public promise
 * (CHEST_TIER_PROMISE).
 *
 * Pure and mutating, like `strike`. Nothing here touches a socket or a clock.
 */
import type { IslandShape } from '@/config/gridConfig';
import { SABOTAGE } from '@config/tuning';
import { boardNeighbors, countAdjacent } from './island';
import type { Island } from './types';

export type PlantRefusal =
  | 'off-island'
  | 'revealed'
  | 'hinted'
  | 'chest'
  | 'too-many';

/** A shown number the plant changed — the client redraws it. */
export interface ChangedHint {
  tile: number;
  adjacent: number;
}

export interface PlantResult {
  tile: number;
  /** Numbers on screen that are different now, for `hints_changed`. */
  changed: ChangedHint[];
}

/** Bombs `by` has live (unrevealed) on this island. */
export function plantedBy(island: Island, by: string): number {
  let n = 0;
  for (const t of island.tiles.values()) {
    if (t.plantedBy === by && !t.revealed) n++;
  }
  return n;
}

/**
 * Why a plant on `index` would be refused, or null if it may go ahead.
 *
 * Asked BEFORE the item is spent, so a refusal costs nothing — unlike the
 * strike, which spends first because its one refusal (off the island) is a
 * client bug rather than a play.
 */
export function plantBlocker(island: Island, by: string, index: number): PlantRefusal | null {
  const tile = island.tiles.get(index);
  if (!tile) return 'off-island';
  if (tile.revealed) return 'revealed';
  if (tile.hinted) return 'hinted';
  if (tile.content === 'chest') return 'chest';
  if (plantedBy(island, by) >= SABOTAGE.MAX_PLANTED_PER_ISLAND) return 'too-many';
  return null;
}

/**
 * Plant. MUTATES the island: the tile becomes a bomb, and every neighbour's
 * count is redone.
 *
 * A tile that ALREADY held a bomb is planted over silently — marked as the
 * saboteur's, no number changes, and the answer is the same as for any other
 * tile. Refusing it would hand the planter a free probe: "that one is a bomb",
 * learned for the price of a refused request.
 *
 * Callers check `plantBlocker` first; this trusts the tile exists.
 */
export function plantBomb(island: Island, shape: IslandShape, by: string, index: number): PlantResult {
  const tile = island.tiles.get(index);
  if (!tile) return { tile: index, changed: [] };

  const wasBomb = tile.content === 'bomb';
  tile.content = 'bomb';
  tile.plantedBy = by;
  if (wasBomb) return { tile: index, changed: [] };

  const changed: ChangedHint[] = [];
  for (const nb of boardNeighbors(island, index)) {
    const t = island.tiles.get(nb);
    if (!t) continue;
    const before = t.adjacent;
    t.adjacent = countAdjacent(island, nb, shape);
    // Only numbers somebody can SEE are worth sending: a dug tile's, or one a
    // cascade opened on undug ground. A hidden count changing is nobody's news.
    if (t.adjacent !== before && (t.revealed || t.hinted)) {
      changed.push({ tile: nb, adjacent: t.adjacent });
    }
  }
  // The bomb's own count is meaningless to a player (a bomb shows no number)
  // but is kept true for the generator's bookkeeping.
  tile.adjacent = countAdjacent(island, index, shape);
  return { tile: index, changed };
}
