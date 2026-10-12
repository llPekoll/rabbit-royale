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
 *     until AXE.REGROW_MS (`burrow_cuts`, `fellTrees`) — a LANDMARK too,
 *     `toppled` (2026-10-12: nothing the owner can move is uncuttable);
 *     every plank TOUCHING its cell falls with it (`planksTouching`);
 *   • a PLANK the raider faces falls: back in its owner's bag.
 *
 * Computed here and SENT (the raid view's `axe`), for the same reason `steps`
 * is: a client that works out its own targets offers a tree the server
 * refuses.
 */
import { burrowColRow, burrowFor, burrowIndex, BURROW_COLS, BURROW_ROWS } from '@/game/burrow/board';
import { BURROW_STEPS, CUTTABLE, MAX_STEP } from '@/game/burrow/generate';
import { levelAt } from '@/game/island/generate';
import { outerTile, type FenceSeg, type FenceSpan } from '@/game/burrow/fence';

export interface AxeTargets {
  /** Cells of the trees (and landmarks) the raider stands next to. */
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
  const tree = new Set(placements.filter((p) => CUTTABLE.has(p.kind)).map((p) => burrowIndex(p.x, p.y)));
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

const SIDE_STEP: Record<string, [number, number]> = { NE: [0, -1], SE: [1, 0], SW: [0, 1], NW: [-1, 0] };

/**
 * THE PLANKS A FALLING TREE TAKES WITH IT (2026-10-12): every plank whose
 * segment meets the felled cell's square, its corners included. Planks set
 * behind a row of trees made the second way in cost a tree AND a plank —
 * two raids, and the owner sets the plank back between them; measured on the
 * worst walls found, this brings every one of them back to a single cut. The
 * corners count because a diagonal step past a plank's end is barred by it
 * (`fenceBlocks`).
 */
export function planksTouching(walled: readonly FenceSeg[], cell: number): FenceSeg[] {
  const u = burrowColRow(cell);
  return walled.filter((s) => {
    const a = burrowColRow(s.tile);
    const [dc, dr] = SIDE_STEP[s.side] ?? [0, 0];
    // The plank's edge, in corner coordinates: a cell spans [col, col+1].
    const x0 = dc === 0 ? a.col : a.col + (dc > 0 ? 1 : 0);
    const x1 = dc === 0 ? a.col + 1 : x0;
    const y0 = dr === 0 ? a.row : a.row + (dr > 0 ? 1 : 0);
    const y1 = dr === 0 ? a.row + 1 : y0;
    return x1 >= u.col && x0 <= u.col + 1 && y1 >= u.row && y0 <= u.row + 1;
  });
}
