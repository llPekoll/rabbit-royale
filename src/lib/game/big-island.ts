/**
 * THE BIG ISLANDS — an island of its own from level 7 on (BIG_ISLANDS).
 *
 * Below that row every ladder island is cut from the one shared ground
 * (`ISLAND_GROUND`), 32x32. From it, the island's OWN seed cuts its coast:
 * either the generator's free coast with dials drawn from the seed, or a drawn
 * silhouette — and the box is grown until the island is as big as its level
 * says. The box size is therefore a property of the seed: nothing travels on
 * the wire, and the Godot port (`island_map.gd` `grow`) runs the same steps
 * on the same numbers.
 *
 * THE ORDER OF THE DRAWS IS THE CONTRACT, as everywhere a seed is shared:
 * `bigPlan` always takes its six draws, in this order, whatever it ends up
 * using.
 */
import { BIG_ISLANDS, levelRow } from '@config/tuning';
import {
  generateIsland, levelAt, silhouetteField, type IslandMap, type SilhouettePart,
} from '@/game/island/generate';
import { IslandBoard } from '@/game/island/board';
import { blocksCell, wanders } from '@/game/island/blocking';
import type { Placement } from '@/game/island/terrain';
import { mulberry32, seedFrom } from './rng';

export interface BigPlan {
  /** Tiles the island is cut to, at least `MIN_FILL` of it. */
  target: number;
  /** The silhouette's name, or null for the free coast. */
  shape: string | null;
  parts: readonly SilhouettePart[] | null;
  raggedness: number;
  land: number;
  aspect: number;
}

/** What `generateIsland` is called with, once the box is sized. */
export interface BigCut {
  width: number;
  height: number;
  land: number;
  raggedness: number;
  silhouette?: readonly SilhouettePart[];
}

const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;

/**
 * The plan for a ladder seed, or null when its level shares the ground.
 *
 * `level` is the one `seedLevel` read off the seed; passed in so this module
 * does not import first-island.ts, which imports it.
 */
export function bigPlan(seed: string, level: number | undefined): BigPlan | null {
  if (level === undefined) return null;
  const row = levelRow(level);
  if (!row.big) return null;
  const rng = mulberry32(seedFrom(`${seed}:plan`));
  const target = Math.round(lerp(row.big, rng()));
  const shaped = rng() < BIG_ISLANDS.SHAPE_CHANCE;
  const pick = rng();
  const raggedness = lerp(BIG_ISLANDS.RAGGED, rng());
  const land = lerp(BIG_ISLANDS.LAND, rng());
  const aspect = lerp(BIG_ISLANDS.ASPECT, rng());
  const shapes = BIG_ISLANDS.SILHOUETTES;
  const silhouette = shaped ? shapes[Math.min(shapes.length - 1, Math.floor(pick * shapes.length))] : null;
  return {
    target,
    shape: silhouette ? silhouette.name : null,
    parts: silhouette ? (silhouette.parts as readonly SilhouettePart[]) : null,
    raggedness,
    land,
    aspect,
  };
}

/** The box a silhouette's coverage is first measured on. */
const PROBE_SIDE = 48;

const clampSide = (n: number) => Math.min(BIG_ISLANDS.MAX_SIDE, Math.max(BIG_ISLANDS.MIN_SIDE, n));

function landCells(map: IslandMap): number {
  let n = 0;
  for (const t of map.level) if (t > 0) n++;
  return n;
}

/** The share of a silhouette's box its field covers, which is the land it asks for. */
function silhouetteShare(width: number, height: number, parts: readonly SilhouettePart[]): number {
  const field = silhouetteField(width, height, parts);
  let inside = 0;
  for (const v of field) if (v > BIG_ISLANDS.SHAPE_INSIDE) inside++;
  return inside / field.length;
}

function cutFor(plan: BigPlan, width: number, height: number): BigCut {
  if (plan.parts) {
    return {
      width, height,
      land: silhouetteShare(width, height, plan.parts),
      raggedness: BIG_ISLANDS.SHAPE_RAGGED,
      silhouette: plan.parts,
    };
  }
  return { width, height, land: plan.land, raggedness: plan.raggedness };
}

/**
 * Size the box to the plan's tile count.
 *
 * Starts from an estimate, cuts, counts, and re-cuts a box grown by the
 * square root of what is missing (two cells at least) until the island holds
 * `MIN_FILL` of its count, the box hits `MAX_SIDE`, or `MAX_TRIES` runs out.
 * A silhouette's box stays square, so the drawing is not stretched.
 */
export function sizeBigGround(
  seed: string, plan: BigPlan, rise: number,
): BigCut {
  let width: number;
  let height: number;
  if (plan.parts) {
    // From the outline's own coverage, measured on a nominal box: a thin
    // snake asks for a bigger box than a fat star, and starting there spares
    // most of the re-cuts.
    const share = silhouetteShare(PROBE_SIDE, PROBE_SIDE, plan.parts);
    width = clampSide(Math.ceil(Math.sqrt(plan.target / (share * 0.9))));
    height = width;
  } else {
    const area = plan.target / plan.land;
    width = clampSide(Math.round(Math.sqrt(area * plan.aspect)));
    height = clampSide(Math.round(Math.sqrt(area / plan.aspect)));
  }
  let cut = cutFor(plan, width, height);
  for (let tries = 1; tries < BIG_ISLANDS.MAX_TRIES; tries++) {
    // ONE TIER is enough to count: the plateaus are drawn after the coast,
    // from later draws, and never change which cells are land.
    const map = generateIsland({ seed, tiers: 1, rise, ...cut });
    const cells = landCells(map);
    if (cells >= plan.target * BIG_ISLANDS.MIN_FILL) break;
    if (width >= BIG_ISLANDS.MAX_SIDE && height >= BIG_ISLANDS.MAX_SIDE) break;
    const grow = Math.sqrt(plan.target / Math.max(1, cells));
    width = clampSide(Math.max(width + 2, Math.ceil(width * grow)));
    height = plan.parts ? width : clampSide(Math.max(height + 2, Math.ceil(height * grow)));
    cut = cutFor(plan, width, height);
  }
  return cut;
}

const STEPS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

/**
 * NOTHING STANDING MAY CUT THE ISLAND IN TWO.
 *
 * A silhouette has narrow places on purpose — an isthmus, a ford between two
 * islets — and one tree, rock or soldier on a two-cell neck seals off half
 * the island: tiles the player sees and never reaches, chests that cannot be
 * dealt. Measured on the small ground once already (the tutorial's pine on
 * cell 624). So after the scatter, the walkable cells are split into the
 * groups a rabbit can walk between; while there are two or more, every FIXED
 * blocker touching two groups goes, and when none does, every fixed blocker
 * touching a group other than the biggest — which peels a thick wall a layer
 * at a time.
 *
 * Mirrored in godot/scripts/island_ground.gd (`_open_pockets`), same order:
 * placements are visited in the order they were scattered.
 */
export function openPockets(map: IslandMap, placements: Placement[]): Placement[] {
  let kept = placements;
  for (let pass = 0; pass < 64; pass++) {
    const board = new IslandBoard(map, kept);
    const group = new Map<string, number>();
    const sizes: number[] = [];
    for (let y0 = 0; y0 < map.height; y0++) {
      for (let x0 = 0; x0 < map.width; x0++) {
        if (!board.isWalkable(x0, y0) || group.has(`${x0},${y0}`)) continue;
        const id = sizes.length;
        let size = 0;
        const stack: Array<[number, number]> = [[x0, y0]];
        group.set(`${x0},${y0}`, id);
        while (stack.length) {
          const [x, y] = stack.pop()!;
          size++;
          for (const c of board.stepsFrom(x, y)) {
            const k = `${c.x},${c.y}`;
            if (group.has(k)) continue;
            group.set(k, id);
            stack.push([c.x, c.y]);
          }
        }
        sizes.push(size);
      }
    }
    if (sizes.length <= 1) return kept;
    let main = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;

    const touching = (p: Placement): Set<number> => {
      const ids = new Set<number>();
      const here = levelAt(map, p.x, p.y);
      for (const [dx, dy] of STEPS) {
        const id = group.get(`${p.x + dx},${p.y + dy}`);
        if (id === undefined) continue;
        if (Math.abs(levelAt(map, p.x + dx, p.y + dy) - here) > 1) continue;
        ids.add(id);
      }
      return ids;
    };
    const fixed = (p: Placement) => blocksCell(p.kind) && !wanders(p.kind) && board.isOnBoard(p.x, p.y);
    let drop = new Set<Placement>();
    for (const p of kept) if (fixed(p) && touching(p).size >= 2) drop.add(p);
    if (!drop.size) {
      for (const p of kept) {
        if (!fixed(p)) continue;
        for (const id of touching(p)) if (id !== main) { drop.add(p); break; }
      }
    }
    if (!drop.size) return kept;
    kept = kept.filter((p) => !drop.has(p));
  }
  return kept;
}
