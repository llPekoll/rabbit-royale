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
import { TRAPS } from '@config/tuning';

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
 * Higher than the island's 0.46. An island is a shape in an ocean and its
 * coastline is the point; a burrow is a homestead, and a raider who has to
 * walk round a bay to reach a carrot patch is walking round the developer's
 * noise function. The sea here is a rim, not a feature.
 *
 * Not so high that the homestead fills its box, though: at 0.86 the land ran
 * to the second column on every side and the rim of sea was a hairline, so
 * the whole thing read as a green square rather than as an island. Room for
 * water round it is what makes it a place.
 */
const LAND = 0.72;

/**
 * Two tiers, not three.
 *
 * A shelf gives the ground somewhere to hide a route — a raider on the low
 * ground cannot see over it, and a cliff is a detour that costs steps without
 * being a wall. Three tiers on a board this small turns the homestead into a
 * staircase, and the top shelf ends up too small to hold anything.
 */
const TIERS = 2;
/**
 * A low shelf and a smooth coast.
 *
 * `rise` is the shelf's share of the ground: a fifth is a step in the garden,
 * a third was a second storey with the homestead perched on it. `raggedness`
 * is how much the coast listens to noise rather than to the ellipse; at 0.3
 * the shore was all inlets and spits, and the building ended up on one of
 * them. The homestead is a lawn, not a fjord.
 */
const RISE = 0.2;
const RAGGEDNESS = 0.12;

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

/**
 * What a cell is, for everything downstream. The four names the hand-drawn
 * layout used, so callers did not have to learn new ones — plus `doorstep`,
 * the open ground just inside the entrance, which is walked like ground and
 * refused to a bomb (see `TRAPS.DOORSTEP`, and the rule itself in `cells.ts`).
 */
export type BurrowCell = 'ground' | 'blocked' | 'entrance' | 'field' | 'doorstep';

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
  /**
   * The doorstep: every walkable tile within `TRAPS.DOORSTEP` steps of the
   * entrance, the entrance included. A raider crosses these before the first
   * bomb can be under them; the owner may not mine them.
   */
  doorstep: number[];
  /** Steps in the shortest unobstructed crossing. */
  crossing: number;
  /** The seed this was grown from. */
  seed: string;
  /**
   * The house's anchor tile — the back cell of its 2x2 (`houseFootprint`).
   * SOLID since 2026-09-24: its four cells are `blocked`, a raider walks
   * round it like round a tree. Chosen by the generator (`houseCandidates`),
   * or wherever the owner set it down (`BurrowEdits.house`). Only absent on a
   * terrain built before a house was placed.
   */
  house?: number;
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

  // The main body, so a cove cut off by a cliff is not counted as ground the
  // defender should be mining.
  const first = mainBody(map, walkableWith(map, placements));
  if (first.size < MIN_BODY) return null;

  const rng = mulberry32(seedFrom(`${terrainSeed}:layout`));
  const entrance = pickEntrance(map, first, rng);
  if (entrance === null) return null;

  // The door stands clear — and the ground is measured AGAIN once it does.
  // A tree pulled out from beside the entrance gives its cell back, and a
  // cell the board still called blocked with nothing drawn on it would be an
  // invisible wall (the failure `onTheHomestead` was written against). The
  // body can only grow here, so the entrance is still in it.
  const cleared = clearTheDoor(placements, entrance);
  const main = mainBody(map, walkableWith(map, cleared));

  const field = pickField(map, main, entrance);
  if (field.length < FIELD_CELLS / 2) return null;

  // The garden stands clear too, for the same reason as the door — and the
  // ground is measured a third time, since a bush pulled off the field's
  // rim is a cell given back. The field was grown on `main` and the body
  // only grows, so every field cell is still on it; what CAN change is the
  // crossing, which is why it is measured after and not before.
  const tidied = clearAround(cleared, field, FIELD_CLEARING, FIELD_CLEARING_TREES);
  const homestead = mainBody(map, walkableWith(map, tidied));

  const steps = stepDistances(map, homestead, entrance);
  const crossing = Math.min(...field.map((tile) => steps.get(tile) ?? Infinity));
  if (crossing < MIN_CROSSING || crossing === Infinity) return null;

  const doorstep = pickDoorstep(steps, crossing, new Set(field));
  const cells = paint(homestead, entrance, field, doorstep);
  const bare: BurrowTerrain = {
    map,
    placements: onTheHomestead(tidied, homestead, field, entrance),
    cells,
    entrance,
    field,
    doorstep,
    crossing,
    seed,
  };

  // The house goes down LAST, on the ground as measured without it, and is
  // solid: its four cells leave the board and the crossing is measured a
  // fourth time. The best-scoring square that still leaves the field
  // reachable wins; a seed with none is thrown away like any other failure.
  // The crossing may grow round the house, up to `MAX_CROSSING` (or what it
  // already was, on the rare seed dealt longer).
  for (const house of houseCandidates(bare)) {
    const settled = settle(map, tidied, entrance, field, houseFootprint(house)!, Math.max(MAX_CROSSING, crossing));
    if (typeof settled === 'string') continue;
    return { ...bare, ...settled, house };
  }
  return null;
}

/** Ground the house keeps between itself and the water, in cells. */
const HOUSE_INLAND = 2;

/**
 * Where the house may stand, best first: four cells of open, flat ground
 * beside the field, inland, away from the door.
 *
 * The score is the one the cosmetic house had (`buildings.ts` until
 * 2026-09-24), so a burrow whose house still fits keeps it where its owner
 * has always seen it. Two rings of sea first, then one; ties go to the lower
 * tile, as the old strict `>` did.
 */
function houseCandidates(terrain: BurrowTerrain): number[] {
  const { map, cells, field, entrance, placements } = terrain;
  const door = colRow(entrance);
  const fieldCells = field.map(colRow);
  const standing = new Set(placements.map((p) => index(p.x, p.y)));
  const roomy = (tile: number) => {
    const square = houseFootprint(tile);
    if (!square) return false;
    const tier = levelAt(map, square[0] % BURROW_COLS, Math.floor(square[0] / BURROW_COLS));
    return square.every((t) => cells[t] === 'ground' && !standing.has(t)
      && levelAt(map, t % BURROW_COLS, Math.floor(t / BURROW_COLS)) === tier);
  };

  const out: number[] = [];
  for (const inland of [HOUSE_INLAND, HOUSE_INLAND - 1]) {
    const pass: Array<{ tile: number; score: number }> = [];
    for (let tile = 0; tile < BURROW_COLS * BURROW_ROWS; tile++) {
      if (!roomy(tile)) continue;
      const { col, row } = colRow(tile);
      const toSea = seaDistance(map, col, row);
      // Counted once: the second ring only adds what the first refused.
      if (toSea < inland || (inland < HOUSE_INLAND && toSea >= HOUSE_INLAND)) continue;
      const toField = Math.min(
        ...fieldCells.map((f) => Math.max(Math.abs(f.col - col), Math.abs(f.row - row))),
      );
      if (toField < 1 || toField > 2) continue;
      const toDoor = Math.max(Math.abs(door.col - col), Math.abs(door.row - row));
      pass.push({ tile, score: -toField * 8 + Math.min(toSea, 3) * 2 + toDoor * 0.5 });
    }
    pass.sort((a, b) => b.score - a.score || a.tile - b.tile);
    for (const c of pass) out.push(c.tile);
  }
  return out;
}

/**
 * The ground measured with the house standing on it: which cells are the
 * homestead, the crossing, the doorstep — or why the field cannot be reached.
 * Shared by the generator and `editBurrow`, so a house the owner moves obeys
 * the rule the generator placed it by.
 */
function settle(
  map: IslandMap,
  placements: Placement[],
  entrance: number,
  field: number[],
  house: number[],
  maxCrossing: number,
): Pick<BurrowTerrain, 'cells' | 'doorstep' | 'crossing'>
  | 'field_unreachable' | 'crossing_too_short' | 'crossing_too_long' {
  const homestead = mainBody(map, walkableWith(map, placements, new Set(house)));
  if (!homestead.has(entrance) || field.some((t) => !homestead.has(t))) return 'field_unreachable';
  const steps = stepDistances(map, homestead, entrance);
  const crossing = Math.min(...field.map((t) => steps.get(t) ?? Infinity));
  if (crossing === Infinity) return 'field_unreachable';
  if (crossing < MIN_CROSSING) return 'crossing_too_short';
  if (crossing > maxCrossing) return 'crossing_too_long';
  const doorstep = pickDoorstep(steps, crossing, new Set(field));
  return { cells: paint(homestead, entrance, field, doorstep), doorstep, crossing };
}

/**
 * The doorstep: the open ground a raider is owed before the first bomb.
 *
 * `TRAPS.DOORSTEP` steps in from the entrance, measured along the same
 * walk the raid measures everything by (`stepsFrom` — cliffs are detours
 * here too, so a doorstep on terraced ground follows the ramp rather than
 * cutting across the shelf).
 *
 * Capped two short of the crossing, so the ring of cells round the field is
 * always the defender's to mine whatever the constant says: those cells are
 * the last decision a raider makes, and the one a defence is built around.
 * The field itself is never doorstep — it is where the raid ENDS, and the
 * rule about where it starts has no business there.
 */
function pickDoorstep(
  steps: Map<number, number>,
  crossing: number,
  field: Set<number>,
): number[] {
  const reach = Math.min(TRAPS.DOORSTEP, crossing - 2);
  const out: number[] = [];
  for (const [tile, d] of steps) {
    if (d <= reach && !field.has(tile)) out.push(tile);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Walkable ground: land, with nothing solid standing on it. Clutter
 * (mushrooms, bones) does not block, exactly as on the island — the answer
 * comes from `blocking.ts` so the two screens cannot disagree about what a
 * bush does.
 */
function walkableWith(map: IslandMap, placements: Placement[], house: Set<number> = new Set()) {
  const solid = new Set(
    placements.filter((p) => blocksCell(p.kind)).map((p) => `${p.x},${p.y}`),
  );
  return (col: number, row: number): boolean =>
    levelAt(map, col, row) > 0 && !solid.has(`${col},${row}`) && !house.has(index(col, row));
}

/**
 * Nothing stands in front of the door.
 *
 * The entrance is where a raid starts and where the defender's marker hangs,
 * and on a third of the seeds it was under a pine: the tree stood a cell or
 * two in FRONT of it (further down the screen), and a pine's canopy reaches
 * several cells up the picture, so the door, the rabbit arriving on it and
 * the chevron above were all behind foliage. `onTheHomestead` only ever
 * cleared the entrance cell itself, which is the one cell a tree cannot hide
 * it from.
 *
 * So: nothing at all within `DOOR_CLEARING` of the door — the doorstep reads
 * as a lawn, which is what it is — and no TREE within `DOOR_CLEARING_TREES`,
 * because a tree is the only thing tall enough to cover a cell from that far.
 * Chebyshev distance, in cells: this is about what the picture covers, not
 * about where a rabbit can walk.
 */
const clearTheDoor = (placements: Placement[], entrance: number): Placement[] =>
  clearAround(placements, [entrance], DOOR_CLEARING, DOOR_CLEARING_TREES);

/** Cells round the door kept bare of everything, and of trees. */
const DOOR_CLEARING = 2;
const DOOR_CLEARING_TREES = 3;

/**
 * Nothing stands over the garden either.
 *
 * The field is the objective, and it is painted as one — turned soil, the
 * crop, a red veil during the raid, a gold arrow above. All of it is on the
 * ground, and a pine a cell or two in front of the patch put half of it
 * behind foliage: the raider crossing towards the win could not see where
 * the win was, and the defender placing bombs round it could not see the
 * cells they were choosing between. `onTheHomestead` clears the field's own
 * cells, which is the one place a tree cannot cover the field FROM.
 *
 * Tighter than the door's clearing: the ring round the field is the last
 * decision of the raid and the one a defence is built around, and a bush on
 * it is a route closed — that is ground worth keeping in play. So nothing
 * touching the field, and no tree close enough to reach over it.
 */
const FIELD_CLEARING = 1;
const FIELD_CLEARING_TREES = 3;

/**
 * Placements with a clearing round some cells: nothing within `bare` of any
 * of them, and no tree within `trees`. Chebyshev distance, in cells.
 */
function clearAround(
  placements: Placement[],
  cells: number[],
  bare: number,
  trees: number,
): Placement[] {
  const around = cells.map(colRow);
  return placements.filter((p) => {
    let d = Infinity;
    for (const { col, row } of around) {
      d = Math.min(d, Math.max(Math.abs(p.x - col), Math.abs(p.y - row)));
    }
    if (d <= bare) return false;
    return !(p.kind === 'tree' && d <= trees);
  });
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

  // The farthest cell from the door is, by construction, on the far SHORE —
  // and a garden grown from the shore has its building on the shore too, half
  // its footprint over the water. So the walk is measured, but the patch is
  // seeded from the farthest cell that keeps `FIELD_INLAND` cells of ground
  // between it and the sea, falling back a ring at a time if the island is too
  // thin to have one. The crossing is still checked after; a seed that cannot
  // afford both is thrown away, not squeezed.
  let farthest = -1;
  for (let inland = FIELD_INLAND; inland >= 0 && farthest < 0; inland--) {
    let best = -1;
    for (const [tile, d] of dist) {
      const { col, row } = colRow(tile);
      if (seaDistance(map, col, row) < inland) continue;
      if (d > best) { best = d; farthest = tile; }
    }
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

/** How many cells of ground the field wants between it and the water. */
const FIELD_INLAND = 3;

/**
 * Chebyshev distance from a cell to the nearest open sea, capped at `cap`.
 *
 * Rings rather than a flood fill, because every caller wants a small number
 * and stops caring past it. Off the board counts as sea, as it does for the
 * autotiler.
 */
export function seaDistance(map: IslandMap, col: number, row: number, cap = 4): number {
  for (let d = 0; d < cap; d++) {
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
        if (levelAt(map, col + dc, row + dr) === 0) return d;
      }
    }
  }
  return cap;
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
      // Off the board is off the board: `index` would fold column -1 onto the
      // end of the row above. Never bites today (the sea rim keeps every
      // walkable cell off the rim, measured over 400 seeds), and this is now
      // the crossing's own ruler as well as the field's, so it is not left to
      // luck.
      if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) continue;
      const i = index(nc, nr);
      if (dist.has(i) || !main.has(i)) continue;
      if (Math.abs(levelAt(map, nc, nr) - levelAt(map, col, row)) > MAX_STEP) continue;
      dist.set(i, dist.get(tile)! + 1);
      queue.push(i);
    }
  }
  return dist;
}

/**
 * Every tile's kind, row-major.
 *
 * The entrance keeps its own name rather than being one more doorstep cell:
 * the scene hangs the door marker on it, and the raid starts there. It is
 * refused to a bomb all the same — see `cells.ts`.
 */
function paint(
  main: Set<number>,
  entrance: number,
  field: number[],
  doorstep: number[],
): BurrowCell[] {
  const inField = new Set(field);
  const onDoorstep = new Set(doorstep);
  const cells: BurrowCell[] = [];
  for (let tile = 0; tile < BURROW_COLS * BURROW_ROWS; tile++) {
    if (tile === entrance) cells.push('entrance');
    else if (inField.has(tile)) cells.push('field');
    else if (onDoorstep.has(tile)) cells.push('doorstep');
    else if (main.has(tile)) cells.push('ground');
    else cells.push('blocked');
  }
  return cells;
}

export { index as burrowIndex, colRow as burrowColRow, STEPS as BURROW_STEPS, MAX_STEP };

/**
 * The longest crossing a rearranged burrow may have.
 *
 * The generator deals 8..13 steps, and `RAID_RUN.WALK_FLOOR` lets a raider in
 * with exactly enough walk for the longest of them. A tree maze past that
 * would be a burrow nobody can reach the field of — not a defence, a wall.
 */
export const MAX_CROSSING = 13;

/**
 * What the OWNER changed on top of the generated burrow. Stored as a final
 * state rather than as a list of gestures, so it is judged whole: the order in
 * which the player dragged things around is not the server's business.
 *
 * - `field`: the potager translated as one block, by `[dcol, drow]`.
 * - `house`: the house's anchor tile (`houseFootprint`). SOLID since
 *   2026-09-24: its four cells are off the board, like a tree's one.
 * - `moves`: `[from, to]` for each thing standing on the homestead that was
 *   picked up. `from` is where the GENERATOR put it, so a thing moved twice
 *   is still one entry.
 *
 * GROUND CLUTTER GIVES WAY (`givesWay`, 2026-09-23): a bush or a prop the
 * owner has NOT moved is not in the way of anything — a tree, a rock, the
 * house or the field set down on its cell simply covers it, and it is gone
 * from the rearranged burrow. It comes back if what covered it moves off,
 * since edits are a final state over the generated burrow. Half the cells the
 * editor refused were a mushroom or a tuft a few pixels wide, which read as a
 * refusal for no reason (Paul: « pourquoi y a-t-il plein de dalles sombres »).
 * Clutter never blocks a raider (`blocksCell`), so the ground, the crossing
 * and the doorstep are the same with or without it.
 */
export interface BurrowEdits {
  field?: [number, number];
  house?: number;
  moves?: [number, number][];
}

/** Why an edit is refused — the client names the same reasons. */
export type BurrowEditRefusal =
  | 'bad_edits'
  | 'field_off_ground'
  | 'field_split'
  | 'thing_off_ground'
  | 'cells_overlap'
  | 'field_unreachable'
  | 'crossing_too_short'
  | 'crossing_too_long'
  | 'house_off_ground';

/**
 * The house stands on FOUR cells: its tile and the three in front of it
 * (`+col`, `+row`, both) — the art is painted on a 2x2 footprint
 * (tools/paint_burrows_iso.py), flat, so the four share one tier. `null`
 * when the square runs off the board. All four are solid: a raider goes
 * round the house, and no bomb lies under it.
 */
export function houseFootprint(tile: number): number[] | null {
  const { col, row } = colRow(tile);
  if (col < 0 || row < 0 || col + 1 >= BURROW_COLS || row + 1 >= BURROW_ROWS) return null;
  return [index(col, row), index(col + 1, row), index(col, row + 1), index(col + 1, row + 1)];
}

/** Ground clutter: walked through by raiders, covered by anything set on it. */
export const givesWay = (kind: string): boolean => kind === 'bush' || kind === 'prop';

/** Is there anything to apply? An empty edit is the generated burrow. */
export function hasEdits(e: BurrowEdits | null | undefined): e is BurrowEdits {
  if (!e) return false;
  return (!!e.field && (e.field[0] !== 0 || e.field[1] !== 0))
    || e.house !== undefined
    || (e.moves?.length ?? 0) > 0;
}

/**
 * The generated burrow with the owner's edits on it, or why not.
 *
 * Rebuilt from the same pieces `tryBuild` uses — the relief never moves, the
 * entrance never moves, and the ground is measured again once the things on
 * it have: which cells are the homestead, the crossing, the doorstep. The same
 * promises hold as for a generated burrow (the field is reachable, the walk to
 * it is at least `MIN_CROSSING`), plus a ceiling (`MAX_CROSSING`).
 *
 * Mirrored in godot/scripts/burrow_layout.gd `edited`; the order of every
 * check is the contract, so both sides name the same refusal.
 */
export function editBurrow(
  base: BurrowTerrain,
  edits: BurrowEdits,
): BurrowTerrain | BurrowEditRefusal {
  const { map, entrance } = base;
  const n = BURROW_COLS * BURROW_ROWS;
  const onBoard = (t: unknown): t is number => Number.isInteger(t) && (t as number) >= 0 && (t as number) < n;
  const land = (t: number) => {
    const { col, row } = colRow(t);
    return levelAt(map, col, row) > 0;
  };

  // The field, as one block on one shelf.
  const [dc, dr] = edits.field ?? [0, 0];
  if (!Number.isInteger(dc) || !Number.isInteger(dr)) return 'bad_edits';
  const field: number[] = [];
  let tier = -1;
  for (const t of base.field) {
    const { col, row } = colRow(t);
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) return 'field_off_ground';
    const lv = levelAt(map, nc, nr);
    if (lv <= 0) return 'field_off_ground';
    if (tier < 0) tier = lv;
    else if (lv !== tier) return 'field_split';
    field.push(index(nc, nr));
  }
  field.sort((a, b) => a - b);
  const inField = new Set(field);
  if (inField.has(entrance)) return 'cells_overlap';

  // The house, where the owner set it or where it stood: four cells of land
  // on one shelf, clear of the field and the door. Solid, so it is checked
  // before the things — one set down on it overlaps, as on a tree.
  if (edits.house !== undefined && !onBoard(edits.house)) return 'bad_edits';
  const house = edits.house ?? base.house;
  const square = house === undefined ? null : houseFootprint(house);
  if (house !== undefined) {
    const level = (t: number) => { const { col, row } = colRow(t); return levelAt(map, col, row); };
    if (!square || square.some((t) => !land(t) || level(t) !== level(square[0]))) return 'house_off_ground';
    if (square.some((t) => inField.has(t) || t === entrance)) return 'cells_overlap';
  }
  const underHouse = new Set(square ?? []);

  // The things, each at its final cell.
  const moved = new Map<number, number>();
  for (const pair of edits.moves ?? []) {
    if (!Array.isArray(pair) || !onBoard(pair[0]) || !onBoard(pair[1])) return 'bad_edits';
    if (moved.has(pair[0])) return 'bad_edits';
    moved.set(pair[0], pair[1]);
  }
  // Two passes: everything that holds its cell first (the solid things, and
  // any clutter the owner picked up), then the clutter left where it grew,
  // which gives way to whatever now covers it. The generator's order is kept
  // in the result.
  const taken = new Set<number>();
  const at = new Map<Placement, number>();
  const known = new Set<number>();
  const stays = (p: Placement, from: number) => givesWay(p.kind) && !moved.has(from);
  for (const p of base.placements) {
    const from = index(p.x, p.y);
    known.add(from);
    if (stays(p, from)) continue;
    const to = moved.get(from) ?? from;
    if (to !== from && !land(to)) return 'thing_off_ground';
    if (taken.has(to) || inField.has(to) || to === entrance || underHouse.has(to)) return 'cells_overlap';
    taken.add(to);
    at.set(p, to);
  }
  for (const from of moved.keys()) if (!known.has(from)) return 'bad_edits';
  // The house covers clutter like the rest.
  for (const p of base.placements) {
    const from = index(p.x, p.y);
    if (!stays(p, from)) continue;
    if (taken.has(from) || inField.has(from) || from === entrance || underHouse.has(from)) continue;
    taken.add(from);
    at.set(p, from);
  }
  const placements: Placement[] = [];
  for (const p of base.placements) {
    const to = at.get(p);
    if (to === undefined) continue;
    const { col, row } = colRow(to);
    placements.push(to === index(p.x, p.y) ? p : { ...p, x: col, y: row });
  }

  // The ground, measured again — round the house.
  const settled = settle(map, placements, entrance, field, square ?? [], MAX_CROSSING);
  if (typeof settled === 'string') return settled;
  const { cells, doorstep, crossing } = settled;

  return { map, placements, cells, entrance, field, doorstep, crossing, seed: base.seed, house };
}
