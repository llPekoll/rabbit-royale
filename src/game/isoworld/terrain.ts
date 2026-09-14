/**
 * The island as a block world: the same tier map, plus the ramps between tiers
 * and the few things standing on it.
 *
 * `generateIsland` gives every cell a tier and nothing else, which top-down is
 * the whole story — a plateau is a coloured region with a cliff on its south
 * edge. Drawn as stacked blocks it is not: a plateau with sheer walls on every
 * side is a fortress, and nothing reads as walkable land until something climbs
 * it. So this module adds the one thing the block sheet has and the top-down
 * pack did not — slopes — and decides where they go.
 *
 * Pure, like `generate.ts`: no textures, no Pixi. A ramp is a direction on a
 * cell, and the renderer picks the sprite. Props are decided here too rather
 * than rolled by the view, so turning the world turns them with it instead of
 * re-scattering a different island every quarter turn.
 */
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { levelAt, type IslandMap } from '@/game/island/generate';

/**
 * Compass directions on the GRID, clockwise: north is -y, east is +x.
 *
 * Clockwise order is what makes rotation a single `+ 1`: a quarter turn sends
 * every direction to the next one in this list.
 */
export const DIR = { N: 0, E: 1, S: 2, W: 3 } as const;
export type Dir = (typeof DIR)[keyof typeof DIR];
const DIRS: readonly Dir[] = [0, 1, 2, 3];

export const DIR_STEP: Readonly<Record<Dir, { dx: number; dy: number }>> = {
  0: { dx: 0, dy: -1 },
  1: { dx: 1, dy: 0 },
  2: { dx: 0, dy: 1 },
  3: { dx: -1, dy: 0 },
};

/**
 * `slope` and `stairs` climb toward one side. The two corner kinds exist for
 * the sheets that have them (see `planCornerRamps`): `inner` climbs toward two
 * adjacent sides at once — the cell sits in the crook of the tier above — and
 * `outer` rises to a single corner point, where the cell touches the tier
 * above only diagonally.
 */
export type RampKind = 'slope' | 'stairs' | 'inner' | 'outer';

export interface Ramp {
  /**
   * For a slope or stairs, the side the ramp climbs TOWARD — where its high
   * edge meets the tier above. For a corner kind, the first of its two sides
   * clockwise: `dir` and `dir + 1`, so NW is W (3, then N), NE is N (0, then
   * E), SE is E, SW is S. One encoding, so a quarter turn is `+ 1` for every
   * kind.
   */
  dir: Dir;
  /**
   * What it is built as. A preference, not a promise: the sheet only draws
   * stairs climbing away from the camera, so a flight turned to face it is
   * drawn as a slope instead.
   */
  kind: RampKind;
}

/**
 * A ramp's corner heights, NE SE SW NW (corner `c` sits between sides `c`
 * and `c + 1`): 1 where its surface stands at the tier above.
 */
export function rampCorners(ramp: Ramp): readonly [0 | 1, 0 | 1, 0 | 1, 0 | 1] {
  const h: [0 | 1, 0 | 1, 0 | 1, 0 | 1] = [0, 0, 0, 0];
  if (ramp.kind === 'outer') {
    h[ramp.dir] = 1;
  } else if (ramp.kind === 'inner') {
    for (const c of DIRS) if (c !== (ramp.dir + 2) % 4) h[c] = 1;
  } else {
    // A side's two corners: side d runs from corner d - 1 to corner d.
    h[(ramp.dir + 3) % 4] = 1;
    h[ramp.dir] = 1;
  }
  return h;
}

/** The sides of a cell along which a ramp's surface stands at the tier above. */
export function rampHighSides(ramp: Ramp): readonly Dir[] {
  if (ramp.kind === 'outer') return [];
  if (ramp.kind === 'inner') return [ramp.dir, ((ramp.dir + 1) % 4) as Dir];
  return [ramp.dir];
}

export type PropKind = 'hedge' | 'boulder' | 'post' | 'patch' | 'decor';

export interface Prop {
  kind: PropKind;
  /**
   * Which quarter of the cell it stands in. The sheet's small blocks are cut
   * off-centre, one per side, so this is a position rather than a facing — and
   * like a ramp's direction, it turns with the world.
   */
  dir: Dir;
  /** For `decor`: which piece, and the side of the square of cells its base covers. */
  decor?: string;
  cells?: number;
  /** For `decor`: it stands on a patch of darker grass, drawn under it. */
  onPatch?: boolean;
}

/** Whether a prop is, or stands on, a patch of darker grass. */
export const isPatch = (prop: Prop | undefined): boolean => prop?.kind === 'patch' || prop?.onPatch === true;

/** A decoration the planner may plant: its name, footprint and relative frequency. */
export interface DecorChoice {
  name: string;
  cells: number;
  weight: number;
  /** It has no base of its own — a stem, a tuft — so it may grow on a patch. */
  bare?: boolean;
}

export interface IsoWorld {
  readonly width: number;
  readonly height: number;
  /** Terrain tier per cell, row-major, exactly as `IslandMap.level`. */
  readonly level: Int8Array;
  /** Ramps by cell index. A ramp cell stands at its own tier and climbs one. */
  readonly ramps: ReadonlyMap<number, Ramp>;
  /** Props by cell index, standing on the cell's surface. */
  readonly props: ReadonlyMap<number, Prop>;
  readonly seed: string;
  readonly tiers: number;
}

export interface IsoWorldOptions {
  /** Share of the places a ramp COULD go that get one, 0..1. */
  ramps?: number;
  /** Share of those ramps built as stairs rather than slopes, 0..1. */
  stairs?: number;
  /**
   * Build the land so that EVERY step between tiers is a slope, corners
   * included, and the only cliff is the coast: the relief is regularised
   * first (see `regularize`), then every cell is given the ramp its corners
   * call for (see `planCornerRamps`). `ramps` and `stairs` are ignored. Needs
   * a sheet with the corner pieces.
   */
  corners?: boolean;
  /**
   * Decorations to scatter, with their footprints. Planted on flat ground
   * instead of the block props; the cell holding the prop is the footprint's
   * north-west corner, and the rest of the square is kept clear.
   */
  decor?: readonly DecorChoice[];
  /** Share of the flat cells that get a decoration, 0..1. */
  decorDensity?: number;
  /** The lowest tier decorations grow on: above the beach, on the smooth sheet. */
  decorMinTier?: number;
}

const DEFAULTS = { ramps: 0.35, stairs: 0.3, decorDensity: 0.22 } as const;

/** Chance per eligible cell, stacked: hedges are common, posts are rare. */
const PROP_CHANCE: ReadonlyArray<{ kind: PropKind; chance: number }> = [
  { kind: 'hedge', chance: 0.05 },
  { kind: 'boulder', chance: 0.03 },
  { kind: 'post', chance: 0.015 },
  // Patches of darker grass: only the smooth sheet draws them, and they are
  // the one prop it does draw.
  { kind: 'patch', chance: 0.09 },
];

/** Tier at `(x, y)`; out of bounds is open sea. */
export function tierAt(world: IsoWorld, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return 0;
  return world.level[y * world.width + x];
}

export function rampAt(world: IsoWorld, x: number, y: number): Ramp | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined;
  return world.ramps.get(y * world.width + x);
}

export function propAt(world: IsoWorld, x: number, y: number): Prop | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined;
  return world.props.get(y * world.width + x);
}

/** True when any of the eight cells around `(x, y)` is open sea. */
export function touchesSea(world: IsoWorld, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && tierAt(world, x + dx, y + dy) === 0) return true;
    }
  }
  return false;
}

/**
 * Put ramps and props on an island.
 *
 * A cell can take a ramp when it stands at tier `t`, EXACTLY one of its four
 * neighbours stands at `t + 1`, and the cell on the far side is plain ground at
 * `t`. The first rule is what a slope physically is (the sheet's slope rises one
 * block over one cell). The second keeps ramps out of inside corners, where a
 * second wall would stand beside the slope's open side and the ramp would read
 * as a notch cut into the cliff. The third is the foot of the ramp: a slope
 * whose lower end meets a drop or another ramp leads nowhere.
 *
 * The foot cell is reserved as it is used, so two ramps never meet back to
 * back on a shared foot.
 */
export function planIsoWorld(map: IslandMap, options: IsoWorldOptions = {}): IsoWorld {
  if (options.corners) {
    const level = regularize(map.level, map.width, map.height);
    const world: IsoWorld = {
      width: map.width,
      height: map.height,
      level,
      ramps: planCornerRamps(level, map.width, map.height),
      props: new Map(),
      seed: map.seed,
      tiers: map.tiers,
    };
    return { ...world, props: planProps(world, options) };
  }

  const share = options.ramps ?? DEFAULTS.ramps;
  const stairsShare = options.stairs ?? DEFAULTS.stairs;
  // Its own stream, so ramps never shift anything else rolled from this seed.
  const rng = mulberry32(seedFrom(`${map.seed}:ramps`));
  const ramps = new Map<number, Ramp>();
  const reserved = new Set<number>();
  const { width, height } = map;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tier = levelAt(map, x, y);
      if (tier === 0) continue;
      const i = y * width + x;
      if (reserved.has(i)) continue;

      let up: Dir | null = null;
      let higher = 0;
      for (const d of DIRS) {
        const { dx, dy } = DIR_STEP[d];
        const n = levelAt(map, x + dx, y + dy);
        if (n > tier) higher++;
        if (n === tier + 1) up = d;
      }
      if (higher !== 1 || up === null) continue;

      const { dx, dy } = DIR_STEP[up];
      const fx = x - dx;
      const fy = y - dy;
      if (levelAt(map, fx, fy) !== tier) continue;
      const foot = fy * width + fx;
      if (ramps.has(foot)) continue;

      // Rolled only for real candidates, so the dial's meaning does not depend
      // on how much of the island is flat.
      if (rng() >= share) continue;
      ramps.set(i, { dir: up, kind: rng() < stairsShare ? 'stairs' : 'slope' });
      reserved.add(foot);
    }
  }

  const world: IsoWorld = {
    width,
    height,
    level: map.level,
    ramps,
    props: new Map(),
    seed: map.seed,
    tiers: map.tiers,
  };
  return { ...world, props: planProps(world, options) };
}

/**
 * The height of a cell's corner `c`, in blocks above the cell: 1 when any of
 * the three other cells meeting at that corner stands on the tier above, else
 * 0. Corners are numbered like the sides they sit between: corner `c` is
 * between sides `c` and `c + 1`, so NE (between N and E) is 0, SE 1, SW 2,
 * NW 3.
 *
 * This is the whole geometry of a slope world: a cell's surface is the sheet
 * stretched over its four corner heights, and two cells always agree along
 * their shared edge because they share its two corners. Cells two or more
 * tiers up are not counted — `regularize` has already removed them.
 */
function cornerHeight(at: (x: number, y: number) => number, x: number, y: number, c: Dir): 0 | 1 {
  const tier = at(x, y);
  const a = DIR_STEP[c];
  const b = DIR_STEP[((c + 1) % 4) as Dir];
  return at(x + a.dx, y + a.dy) > tier || at(x + b.dx, y + b.dy) > tier || at(x + a.dx + b.dx, y + a.dy + b.dy) > tier
    ? 1
    : 0;
}

/**
 * The ramp a cell's corners call for, or `null` for flat ground, or
 * `undefined` when no piece fits: two opposite corners raised (a saddle) or
 * all four (a pit).
 */
function rampFor(at: (x: number, y: number) => number, x: number, y: number): Ramp | null | undefined {
  const h = DIRS.map((c) => cornerHeight(at, x, y, c));
  const raised = h.filter(Boolean).length;
  if (raised === 0) return null;
  if (raised === 1) return { kind: 'outer', dir: h.indexOf(1) as Dir };
  if (raised === 3) return { kind: 'inner', dir: ((h.indexOf(0) + 2) % 4) as Dir };
  if (raised === 2) {
    // Two adjacent corners share a side: corner c and c + 1 sit on side c + 1.
    for (const c of DIRS) if (h[c] && h[(c + 1) % 4]) return { kind: 'slope', dir: ((c + 1) % 4) as Dir };
  }
  return undefined;
}

const lookup = (level: Int8Array, w: number, h: number) => (x: number, y: number) =>
  x < 0 || y < 0 || x >= w || y >= h ? 0 : level[y * w + x];

/**
 * Reshape the relief until every step between land tiers can be a slope.
 *
 * Three things a slope world cannot draw, and the fix for each, applied
 * until nothing changes:
 *
 *   - first and once, every land cell within two cells of the sea is made
 *     tier 1: the beach. One ring of flat sand keeps every slope off the
 *     coast, where its side would show as a wedge hanging over the water;
 *     the second lets the slope up from the beach stand on it;
 *   - a cell with a LAND 8-neighbour two or more tiers below it — lowered to
 *     one above the lowest, so every inland step is exactly one tier;
 *   - a cell whose corners no piece fits (`rampFor` undefined), or with three
 *     or four higher sides — raised to the tier above when none of its
 *     8-neighbours is below it, so that no new two-tier step appears;
 *     otherwise the higher cells around it are lowered instead;
 *   - a one-cell spur or peak — a cell at tier 2 or more with three sides
 *     lower — lowered, because slopes on three sides read as a bump, not as
 *     land.
 *
 * Every rule lowers except the raise, and the raise never creates work for
 * the lowering rules, so this converges; the cap is a guard, not a plan.
 */
export function regularize(source: Int8Array, w: number, h: number): Int8Array {
  const level = Int8Array.from(source);
  const at = lookup(level, w, h);
  const set = (x: number, y: number, v: number) => {
    level[y * w + x] = v;
  };

  const nearSea = (x: number, y: number, reach: number) => {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) if (at(x + dx, y + dy) === 0) return true;
    }
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (at(x, y) > 1 && nearSea(x, y, 2)) set(x, y, 1);
  }

  for (let pass = 0; pass < 200; pass++) {
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = at(x, y);
        if (t === 0) continue;

        let lowest = t;
        let lowestLand = t;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const n = at(x + dx, y + dy);
            lowest = Math.min(lowest, n);
            if (n > 0) lowestLand = Math.min(lowestLand, n);
          }
        }
        if (lowestLand <= t - 2) {
          set(x, y, lowestLand + 1);
          changed = true;
          continue;
        }

        let higherSides = 0;
        let lowerSides = 0;
        for (const d of DIRS) {
          const n = at(x + DIR_STEP[d].dx, y + DIR_STEP[d].dy);
          if (n > t) higherSides++;
          if (n < t) lowerSides++;
        }

        if (higherSides >= 3 || rampFor(at, x, y) === undefined) {
          if (lowest >= t) {
            set(x, y, t + 1);
          } else {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if ((dx || dy) && at(x + dx, y + dy) > t) set(x + dx, y + dy, t);
              }
            }
          }
          changed = true;
          continue;
        }

        if (t >= 2 && lowerSides >= 3) {
          set(x, y, t - 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return level;
}

/**
 * A ramp on every land cell whose corners call for one — see `rampFor`. On
 * regularised relief every cell gets a piece or is flat, so nothing between
 * two land tiers is ever a wall.
 */
export function planCornerRamps(level: Int8Array, w: number, h: number): Map<number, Ramp> {
  const at = lookup(level, w, h);
  const ramps = new Map<number, Ramp>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) === 0) continue;
      const ramp = rampFor(at, x, y);
      if (ramp) ramps.set(y * w + x, ramp);
    }
  }
  return ramps;
}

/**
 * Scatter props on the flat middle of each tier.
 *
 * Only where all four neighbours share the cell's tier and nothing around is
 * sea or a ramp: a block standing on a cliff edge overhangs it, one on a beach
 * stands in the surf, and one beside a ramp blocks the way up it.
 */
function planProps(world: IsoWorld, options: IsoWorldOptions = {}): Map<number, Prop> {
  const rng = mulberry32(seedFrom(`${world.seed}:props`));
  const props = new Map<number, Prop>();
  const decor = options.decor;
  const density = options.decorDensity ?? DEFAULTS.decorDensity;
  const totalWeight = decor?.reduce((sum, d) => sum + d.weight, 0) ?? 0;
  const bare = decor?.filter((d) => d.bare && d.cells === 1) ?? [];
  const bareWeight = bare.reduce((sum, d) => sum + d.weight, 0);
  const taken = new Set<number>();
  // Cells with something growing on them: decor clusters around them, as
  // the reference's plants crowd together on their patches.
  const grown = new Set<number>();
  const nearGrowth = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && grown.has((y + dy) * world.width + (x + dx))) return true;
    }
    return false;
  };
  const pickWeighted = <T extends { weight: number }>(list: readonly T[], total: number, r: number): T => {
    let acc = 0;
    for (const d of list) {
      acc += d.weight / total;
      if (r < acc) return d;
    }
    return list[list.length - 1];
  };

  /** Flat ground at the cell's tier, all four neighbours included, off the coast and off any ramp. */
  const flatAt = (x: number, y: number, tier: number) =>
    tierAt(world, x, y) === tier &&
    !rampAt(world, x, y) &&
    !touchesSea(world, x, y) &&
    DIRS.every((d) => {
      const { dx, dy } = DIR_STEP[d];
      return tierAt(world, x + dx, y + dy) === tier && !rampAt(world, x + dx, y + dy);
    });
  /** Level ground at the cell's tier: no ramp on it. A decoration may stand at a plateau's edge. */
  const levelAt = (x: number, y: number, tier: number) =>
    tierAt(world, x, y) === tier && !rampAt(world, x, y) && !touchesSea(world, x, y);

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const tier = tierAt(world, x, y);
      if (tier === 0) continue;
      // Rolled for every land cell, eligible or not, so reshaping one plateau
      // does not reshuffle the props on all the others.
      const roll = rng();
      const dir = Math.floor(rng() * 4) as Dir;
      const pick = rng();
      const onPatchRoll = rng();
      const flat = flatAt(x, y, tier);

      if (decor && totalWeight > 0) {
        if (taken.has(y * world.width + x) || tier < (options.decorMinTier ?? 1)) continue;
        if (!levelAt(x, y, tier)) continue;
        // Growth clusters: next to something already growing, the odds
        // climb; in open ground they drop. Patches keep their own share of
        // the roll, the rest of the budget is decor.
        const crowd = nearGrowth(x, y) ? 2.2 : 0.6;
        const patchChance = (PROP_CHANCE.find((p) => p.kind === 'patch')?.chance ?? 0) * crowd;
        if (roll < patchChance) {
          if (!flat) continue;
          grown.add(y * world.width + x);
          // Half the patches carry a stem or a tuft, as the reference's do.
          if (bareWeight > 0 && onPatchRoll < 0.5) {
            const piece = pickWeighted(bare, bareWeight, pick);
            props.set(y * world.width + x, { kind: 'decor', dir, decor: piece.name, cells: 1, onPatch: true });
          } else {
            props.set(y * world.width + x, { kind: 'patch', dir });
          }
          continue;
        }
        if (roll >= patchChance + density * crowd) continue;
        const choice = pickWeighted(decor, totalWeight, pick);
        // The footprint: a square of flat cells at this tier, none taken.
        let fits = true;
        for (let fy = 0; fy < choice.cells && fits; fy++) {
          for (let fx = 0; fx < choice.cells; fx++) {
            const i = (y + fy) * world.width + (x + fx);
            if (!levelAt(x + fx, y + fy, tier) || taken.has(i) || props.has(i)) {
              fits = false;
              break;
            }
          }
        }
        if (!fits) continue;
        for (let fy = 0; fy < choice.cells; fy++) {
          for (let fx = 0; fx < choice.cells; fx++) {
            taken.add((y + fy) * world.width + (x + fx));
            grown.add((y + fy) * world.width + (x + fx));
          }
        }
        props.set(y * world.width + x, { kind: 'decor', dir, decor: choice.name, cells: choice.cells });
        continue;
      }

      if (!flat) continue;
      let acc = 0;
      for (const { kind, chance } of PROP_CHANCE) {
        acc += chance;
        if (roll < acc) {
          props.set(y * world.width + x, { kind, dir });
          break;
        }
      }
    }
  }
  return props;
}

/**
 * Turn the world a quarter clockwise, `quarters` times.
 *
 * An isometric camera only ever sees two sides of anything, so turning the
 * WORLD under it is how the hidden two get looked at. Done on the data rather
 * than on the picture: the renderer then has exactly one camera to be right
 * about, and a ramp's direction turns with its cell.
 */
export function rotateIsoWorld(world: IsoWorld, quarters: number): IsoWorld {
  let out = world;
  const turns = ((quarters % 4) + 4) % 4;
  for (let t = 0; t < turns; t++) out = quarterTurn(out);
  return out;
}

const turnDir = (dir: Dir): Dir => ((dir + 1) % 4) as Dir;

/** (x, y) -> (H - 1 - y, x): north becomes east, and every ramp follows. */
function quarterTurn(world: IsoWorld): IsoWorld {
  const { width: w, height: h } = world;
  const level = new Int8Array(w * h);
  const ramps = new Map<number, Ramp>();
  const props = new Map<number, Prop>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = y * w + x;
      const to = x * h + (h - 1 - y);
      level[to] = world.level[from];
      const ramp = world.ramps.get(from);
      if (ramp) ramps.set(to, { ...ramp, dir: turnDir(ramp.dir) });
      const prop = world.props.get(from);
      if (prop) {
        // A footprint's north-west corner turns into its north-east one: the
        // square's new corner is `cells - 1` further along the new x.
        const c = prop.cells ?? 1;
        const turned = x * h + (h - 1 - y) - (c - 1);
        props.set(turned, { ...prop, dir: turnDir(prop.dir) });
      }
    }
  }
  return { width: h, height: w, level, ramps, props, seed: world.seed, tiers: world.tiers };
}
