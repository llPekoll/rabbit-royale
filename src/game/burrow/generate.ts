/**
 * A burrow's ground, grown from a seed instead of painted once.
 *
 * Until now every burrow was the same 19x19 picture: one hand-drawn ASCII
 * layout calibrated against one painting, identical for every player. That
 * made a raid a memory test — cross one burrow and you have crossed them all,
 * because the rocks, the door and the field were in the same place in each of
 * them. The only thing that ever differed was where the traps were.
 *
 * Here the homestead is cut from the player's own seed, on the same tile
 * terrain the island already uses (`game/island/generate`), so two burrows are
 * two different places and a raider has to actually read the ground.
 *
 * ## What a burrow needs that an island does not
 *
 * An island is allowed to be any shape: the run starts in the middle and the
 * player digs wherever they can reach. A burrow is a CROSSING, and a crossing
 * has requirements an unconstrained island will not meet on its own —
 *
 *   - one entrance, at the edge, where the raider comes in;
 *   - a field, the objective, far enough from that entrance that trap
 *     placement is a judgement rather than a formality (`MIN_CROSSING`);
 *   - every walkable cell connected to the entrance, or the defender's trap
 *     budget is spent on ground nobody can walk.
 *
 * So generation is a LOOP, not a single draw: a candidate terrain is cut from
 * the seed, the landmarks are placed on it, and the result is measured. A
 * candidate that fails is not patched — it is thrown away and the next one is
 * cut from the next seed in the stream. That keeps every burrow honestly
 * generated rather than generated-then-bulldozed, and it keeps the invariants
 * total: if `burrowTerrain` returns, its promises hold.
 *
 * Deliberately free of Pixi, like the island's generator, and deterministic in
 * the seed alone — the server validates raids against this and the browser
 * draws it, and no terrain crosses the wire. Same trick as `terrainBoard.ts`.
 */
import { mulberry32, seedFrom, type Rng } from '@/lib/game/rng';
import { generateTerrain, type Placement } from '@/game/island/terrain';
import { levelAt, type IslandMap } from '@/game/island/generate';
import { blocksCell } from '@/game/island/blocking';

/**
 * The burrow's grid, kept at the size the whole game already speaks.
 *
 * A tile index is `row * cols + col` and always has been: the traps table
 * stores one, the raid run stores one, the wire carries one. Changing the grid
 * would silently re-point every trap already in the database at a different
 * patch of somebody's garden, so the dimensions stay put and only what is ON
 * them is now generated.
 */
export const BURROW_COLS = 19;
export const BURROW_ROWS = 19;

/**
 * How much of the box is land.
 *
 * Much higher than the island's 0.46. An island is a shape in an ocean and its
 * coastline is the point; a burrow is a homestead, and a raider who has to
 * walk round a bay to reach a carrot patch is walking round the developer's
 * noise function. The sea here is a rim, not a feature.
 */
const LAND = 0.86;

/**
 * Two tiers, not three.
 *
 * A shelf gives the ground somewhere to hide a route — a raider on the low
 * ground cannot see over it, and a cliff is a detour that costs steps without
 * being a wall. Three tiers on a board this small turns the homestead into a
 * staircase, and the top shelf ends up too small to hold anything.
 */
const TIERS = 2;
const RISE = 0.34;
const RAGGEDNESS = 0.3;

/**
 * Scenery share.
 *
 * Lower than the island's default. Every blocking tree here is ground the
 * defender cannot mine and the raider cannot cross, and on a 19x19 board the
 * island's rates left a thicket with two lanes through it — which is the
 * funnel this design exists to avoid (see the note on `LAYOUT` in the old
 * burrowConfig: an over-constrained burrow makes traps all-or-nothing).
 */
const INHABITED_SHARE = 0;

/**
 * The shortest crossing a burrow is allowed to have, in steps.
 *
 * Six, the same floor the hand-drawn layout was tuned to and for the same
 * reason: under it there is no route to choose between, so where the defender
 * puts a trap stops being a decision. `test/burrow-raid.test.ts` asserts this
 * against the generated burrows too.
 */
export const MIN_CROSSING = 6;

/** The field's target size, in cells. The objective has to be worth reaching
 *  and big enough to read as a garden rather than as a single tile. */
const FIELD_CELLS = 12;

/** How many terrains to cut before giving up on a seed. */
const MAX_ATTEMPTS = 24;

/** What a cell is, for everything downstream. The same four names the
 *  hand-drawn layout used, so callers did not have to learn new ones. */
export type BurrowCell = 'ground' | 'blocked' | 'entrance' | 'field';

export interface BurrowTerrain {
  /** The terrain tiers, exactly as the island's renderer wants them. */
  map: IslandMap;
  /** Trees, rocks and clutter standing on it. */
  placements: Placement[];
  /** What each tile is, row-major, indexed by tile. */
  cells: BurrowCell[];
  /** Where a raid starts. */
  entrance: number;
  /** The objective: reaching any of these wins the raid. */
  field: number[];
  /** Steps in the shortest unobstructed crossing. */
  crossing: number;
  /** The seed this was grown from. */
  seed: string;
}

const index = (col: number, row: number) => row * BURROW_COLS + col;
const colRow = (tile: number) => ({
  col: tile % BURROW_COLS,
  row: Math.floor(tile / BURROW_COLS),
});

/** The eight steps, as `[dcol, drow]`. */
const STEPS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

/**
 * The tallest step a raider can take between tiers — one shelf.
 *
 * The same rule as the island's `MAX_STEP`, and it has to be the same or the
 * two screens would teach contradictory things about what a cliff means.
 */
const MAX_STEP = 1;

/**
 * Grow the burrow for a seed.
 *
 * Deterministic: the same seed always yields the same homestead, on a server
 * with no canvas and in a browser. Throws only if `MAX_ATTEMPTS` terrains in a
 * row fail to hold the invariants, which the shape parameters above are chosen
 * to make vanishingly unlikely — and which is a bug to fix rather than a case
 * to handle, since a player whose burrow cannot be built cannot be raided.
 */
export function burrowTerrain(seed: string): BurrowTerrain {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = tryBuild(seed, attempt);
    if (built) return built;
  }
  throw new Error(`burrow terrain: no layout for seed "${seed}" in ${MAX_ATTEMPTS} attempts`);
}

/** One candidate: cut the terrain, place the landmarks, measure the crossing. */
function tryBuild(seed: string, attempt: number): BurrowTerrain | null {
  // The attempt number rides in the terrain's seed rather than in a counter
  // outside it, so attempt 3 of one player's burrow is a genuinely different
  // draw and not the same island nudged.
  const terrainSeed = attempt === 0 ? `${seed}:burrow` : `${seed}:burrow:${attempt}`;
  const { map, placements } = generateTerrain({
    seed: terrainSeed,
    width: BURROW_COLS,
    height: BURROW_ROWS,
    tiers: TIERS,
    land: LAND,
    rise: RISE,
    raggedness: RAGGEDNESS,
    inhabitedShare: INHABITED_SHARE,
  });

  // Walkable ground: land, with nothing solid standing on it. Clutter
  // (mushrooms, bones) does not block, exactly as on the island — the answer
  // comes from `blocking.ts` so the two screens cannot disagree about what a
  // bush does.
  const solid = new Set(
    placements.filter((p) => blocksCell(p.kind)).map((p) => `${p.x},${p.y}`),
  );
  const walkable = (col: number, row: number): boolean =>
    levelAt(map, col, row) > 0 && !solid.has(`${col},${row}`);

  // The main body, so a cove cut off by a cliff is not counted as ground the
  // defender should be mining.
  const main = mainBody(map, walkable);
  if (main.size < MIN_BODY) return null;

  const rng = mulberry32(seedFrom(`${terrainSeed}:layout`));
  const entrance = pickEntrance(map, main, rng);
  if (entrance === null) return null;

  const field = pickField(map, main, entrance);
  if (field.length < FIELD_CELLS / 2) return null;

  const cells = paint(main, entrance, field);
  const crossing = shortestPath(cells, map, entrance, new Set(field));
  if (crossing < MIN_CROSSING || crossing === Infinity) return null;

  return {
    map,
    placements: onTheHomestead(placements, main, field, entrance),
    cells,
    entrance,
    field,
    crossing,
    seed,
  };
}

/**
 * Scenery the homestead actually wants standing on it.
 *
 * `generateTerrain` scatters over every land cell, which is right for an
 * island and wrong here in three ways a screenshot shows immediately:
 *
 *   - a cove the raider can never reach is land, but it reads as open water
 *     from across the board, and a scarecrow standing in it looks like a bug;
 *   - the carrot field is a tilled garden, and a pine growing out of the
 *     middle of it is not a garden;
 *   - the entrance is a doorway, and a bush in it is a door that does not open.
 *
 * The reachability test is deliberately NOT "is this cell on the board".
 * A blocking tree takes its own cell off the board by standing there, so that
 * test removes every tree in the burrow — which is exactly what it did, and
 * what the screenshot caught. What matters is whether the tree stands on land
 * the homestead reaches, so the question is asked of its NEIGHBOURS: a tree
 * with board on any side is a tree in the garden, and one marooned on an
 * unreachable shelf is scenery nobody will ever walk up to.
 *
 * Filtered here rather than in the view, because the BOARD has to agree: a
 * tree the renderer skipped but the board still counted would be an invisible
 * wall, which is the worst of both.
 */
function onTheHomestead(
  placements: Placement[],
  main: Set<number>,
  field: number[],
  entrance: number,
): Placement[] {
  const inField = new Set(field);

  const touchesTheHomestead = (col: number, row: number): boolean => {
    if (main.has(index(col, row))) return true;
    for (const [dc, dr] of STEPS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) continue;
      if (main.has(index(nc, nr))) return true;
    }
    return false;
  };

  return placements.filter((p) => {
    const tile = index(p.x, p.y);
    if (inField.has(tile)) return false;
    if (tile === entrance) return false;
    return touchesTheHomestead(p.x, p.y);
  });
}

/**
 * The smallest homestead worth raiding, in walkable cells.
 *
 * A burrow whose main body is a handful of tiles has nowhere to put a trap and
 * nowhere to route around one. Roughly a third of the board.
 */
const MIN_BODY = 110;

/**
 * The largest set of cells that can all reach each other.
 *
 * Same flood fill as the island's `playableCells`, and for the same reason: a
 * shelf nothing can climb to is land the player can see and never use, so it
 * stays scenery rather than becoming board.
 */
function mainBody(map: IslandMap, walkable: (c: number, r: number) => boolean): Set<number> {
  const seen = new Set<number>();
  let best = new Set<number>();

  for (let row = 0; row < BURROW_ROWS; row++) {
    for (let col = 0; col < BURROW_COLS; col++) {
      if (!walkable(col, row) || seen.has(index(col, row))) continue;

      const group = new Set<number>([index(col, row)]);
      const queue: Array<[number, number]> = [[col, row]];
      seen.add(index(col, row));

      while (queue.length) {
        const [c, r] = queue.pop()!;
        for (const [dc, dr] of STEPS) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) continue;
          const i = index(nc, nr);
          if (group.has(i) || !walkable(nc, nr)) continue;
          if (Math.abs(levelAt(map, nc, nr) - levelAt(map, c, r)) > MAX_STEP) continue;
          group.add(i);
          seen.add(i);
          queue.push([nc, nr]);
        }
      }
      if (group.size > best.size) best = group;
    }
  }
  return best;
}

/**
 * Where the raider comes in: a cell of the main body nearest the board's rim.
 *
 * At the edge on purpose — an entrance in the middle of the homestead would
 * put the raider past half the ground the defender is trying to protect before
 * they have taken a step, and there would be nothing to mine in front of it.
 *
 * Which edge is left to the seed, so two burrows are approached from different
 * sides and a raider cannot learn one route and reuse it.
 */
function pickEntrance(map: IslandMap, main: Set<number>, rng: Rng): number | null {
  const rim = [...main].filter((tile) => {
    const { col, row } = colRow(tile);
    // Low ground only. An entrance on a shelf would have the raider start
    // above the field, looking down on the whole crossing.
    if (levelAt(map, col, row) !== 1) return false;
    return edgeDistance(col, row) <= ENTRANCE_BAND;
  });
  if (!rim.length) return null;
  return rim[Math.floor(rng() * rim.length)];
}

/** How near the board's rim an entrance may sit, in cells. */
const ENTRANCE_BAND = 2;

const edgeDistance = (col: number, row: number) =>
  Math.min(col, row, BURROW_COLS - 1 - col, BURROW_ROWS - 1 - row);

/**
 * The carrot field: a patch of open ground FAR from the entrance.
 *
 * Grown outwards from the farthest walkable cell rather than stamped as a
 * rectangle, so the garden follows the shape of the land it is planted in —
 * a rectangle on generated terrain lands half on a cliff.
 *
 * Distance is measured in STEPS, not in pixels: the thing that has to be far
 * away is the walk, and on terraced ground those are very different numbers.
 */
function pickField(map: IslandMap, main: Set<number>, entrance: number): number[] {
  const dist = stepDistances(map, main, entrance);

  let farthest = -1;
  let best = -1;
  for (const [tile, d] of dist) {
    if (d > best) { best = d; farthest = tile; }
  }
  if (farthest < 0) return [];

  // Grow the patch over cells on the SAME shelf: a garden spilling over a
  // cliff edge reads as two gardens, and the crop sprites would float.
  const { col: fc, row: fr } = colRow(farthest);
  const tier = levelAt(map, fc, fr);

  const patch = new Set<number>([farthest]);
  const queue = [farthest];
  while (queue.length && patch.size < FIELD_CELLS) {
    const { col, row } = colRow(queue.shift()!);
    for (const [dc, dr] of STEPS) {
      if (patch.size >= FIELD_CELLS) break;
      const nc = col + dc;
      const nr = row + dr;
      const i = index(nc, nr);
      if (patch.has(i) || !main.has(i)) continue;
      if (levelAt(map, nc, nr) !== tier) continue;
      // Never adjacent to the entrance: the field is what the crossing is
      // FOR, and one that starts next to the door is not a crossing.
      if (i === entrance) continue;
      patch.add(i);
      queue.push(i);
    }
  }
  return [...patch].sort((a, b) => a - b);
}

/** Steps from `start` to every reachable cell of the main body. */
function stepDistances(map: IslandMap, main: Set<number>, start: number): Map<number, number> {
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const tile = queue.shift()!;
    const { col, row } = colRow(tile);
    for (const [dc, dr] of STEPS) {
      const nc = col + dc;
      const nr = row + dr;
      const i = index(nc, nr);
      if (dist.has(i) || !main.has(i)) continue;
      if (Math.abs(levelAt(map, nc, nr) - levelAt(map, col, row)) > MAX_STEP) continue;
      dist.set(i, dist.get(tile)! + 1);
      queue.push(i);
    }
  }
  return dist;
}

/** Every tile's kind, row-major. */
function paint(main: Set<number>, entrance: number, field: number[]): BurrowCell[] {
  const inField = new Set(field);
  const cells: BurrowCell[] = [];
  for (let tile = 0; tile < BURROW_COLS * BURROW_ROWS; tile++) {
    if (tile === entrance) cells.push('entrance');
    else if (inField.has(tile)) cells.push('field');
    else if (main.has(tile)) cells.push('ground');
    else cells.push('blocked');
  }
  return cells;
}

/** Steps in the shortest crossing from the entrance to any field tile. */
function shortestPath(
  cells: BurrowCell[],
  map: IslandMap,
  entrance: number,
  goal: Set<number>,
): number {
  const seen = new Set([entrance]);
  let frontier = [entrance];
  let steps = 0;
  while (frontier.length) {
    steps++;
    const next: number[] = [];
    for (const tile of frontier) {
      const { col, row } = colRow(tile);
      for (const [dc, dr] of STEPS) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) continue;
        const i = index(nc, nr);
        if (seen.has(i) || cells[i] === 'blocked') continue;
        if (Math.abs(levelAt(map, nc, nr) - levelAt(map, col, row)) > MAX_STEP) continue;
        if (goal.has(i)) return steps;
        seen.add(i);
        next.push(i);
      }
    }
    frontier = next;
  }
  return Infinity;
}

export { index as burrowIndex, colRow as burrowColRow, STEPS as BURROW_STEPS, MAX_STEP };
