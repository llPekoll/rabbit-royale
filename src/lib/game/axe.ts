/**
 * THE RAID AXE (2026-10-12) — what a raider may bring down from where they
 * stand.
 *
 * The answer to a walled burrow: NorminaskyTV's 31 moved trees, his house and
 * four planks left one cell into the potager, and a bomb on it. The gate rule
 * (`fieldReachable`) only promises one way in; the axe makes a wall a cost
 * rather than a lock. One axe per raid (AXE.PER_RAID), one cut per axe,
 * nothing handed out — a raider with no axe meets the wall as before.
 *
 *   • a TREE next to the raider falls: a `felled` stump anyone walks over
 *     until AXE.REGROW_MS (`burrow_cuts`, `fellTrees`);
 *   • a PLANK the raider faces falls: back in its owner's bag.
 *
 * Computed here and SENT (the raid view's `axe`), for the same reason `steps`
 * is: a client that works out its own targets offers a tree the server
 * refuses.
 */
import { burrowColRow, burrowFor, burrowIndex, BURROW_COLS, BURROW_ROWS } from '@/game/burrow/board';
import { BURROW_STEPS, MAX_STEP } from '@/game/burrow/generate';
import { levelAt } from '@/game/island/generate';
import { outerTile, type FenceSeg, type FenceSpan } from '@/game/burrow/fence';

export interface AxeTargets {
  /** Cells of the trees the raider stands next to. */
  trees: number[];
  /** The planks the raider stands right in front of. */
  planks: FenceSeg[];
}

/**
 * What the axe can reach from `from`: a tree on any of the eight cells
 * around (that a rabbit could then climb onto — a tree on a shelf two tiers up
 * would fall for nothing), and a plank whose outer cell is `from` (the face
 * the raider is looking at; a diagonal plank is reached by stepping in front
 * of it).
 */
export function axeTargets(seed: string, walled: readonly FenceSeg[], from: number): AxeTargets {
  const { map, placements } = burrowFor(seed);
  const here = burrowColRow(from);
  const tree = new Set(placements.filter((p) => p.kind === 'tree').map((p) => burrowIndex(p.x, p.y)));
  const trees: number[] = [];
  for (const [dc, dr] of BURROW_STEPS) {
    const c = here.col + dc;
    const r = here.row + dr;
    if (c < 0 || c >= BURROW_COLS || r < 0 || r >= BURROW_ROWS) continue;
    const i = burrowIndex(c, r);
    if (!tree.has(i)) continue;
    if (Math.abs(levelAt(map, c, r) - levelAt(map, here.col, here.row)) > MAX_STEP) continue;
    trees.push(i);
  }
  const planks = walled.filter((s) => outerTile(s as FenceSpan) === from);
  return { trees: trees.sort((a, b) => a - b), planks };
}
