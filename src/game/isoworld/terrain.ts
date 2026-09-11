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

export type RampKind = 'slope' | 'stairs';

export interface Ramp {
  /** The side the ramp climbs TOWARD — where its high edge meets the tier above. */
  dir: Dir;
  /**
   * What it is built as. A preference, not a promise: the sheet only draws
   * stairs climbing away from the camera, so a flight turned to face it is
   * drawn as a slope instead.
   */
  kind: RampKind;
}

export type PropKind = 'hedge' | 'boulder' | 'post';

export interface Prop {
  kind: PropKind;
  /**
   * Which quarter of the cell it stands in. The sheet's small blocks are cut
   * off-centre, one per side, so this is a position rather than a facing — and
   * like a ramp's direction, it turns with the world.
   */
  dir: Dir;
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
}

const DEFAULTS = { ramps: 0.35, stairs: 0.3 } as const;

/** Chance per eligible cell, stacked: hedges are common, posts are rare. */
const PROP_CHANCE: ReadonlyArray<{ kind: PropKind; chance: number }> = [
  { kind: 'hedge', chance: 0.05 },
  { kind: 'boulder', chance: 0.03 },
  { kind: 'post', chance: 0.015 },
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
  return { ...world, props: planProps(world) };
}

/**
 * Scatter props on the flat middle of each tier.
 *
 * Only where all four neighbours share the cell's tier and nothing around is
 * sea or a ramp: a block standing on a cliff edge overhangs it, one on a beach
 * stands in the surf, and one beside a ramp blocks the way up it.
 */
function planProps(world: IsoWorld): Map<number, Prop> {
  const rng = mulberry32(seedFrom(`${world.seed}:props`));
  const props = new Map<number, Prop>();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const tier = tierAt(world, x, y);
      if (tier === 0) continue;
      // Rolled for every land cell, eligible or not, so reshaping one plateau
      // does not reshuffle the props on all the others.
      const roll = rng();
      const dir = Math.floor(rng() * 4) as Dir;
      if (touchesSea(world, x, y) || rampAt(world, x, y)) continue;
      const flat = DIRS.every((d) => {
        const { dx, dy } = DIR_STEP[d];
        return tierAt(world, x + dx, y + dy) === tier && !rampAt(world, x + dx, y + dy);
      });
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
      if (prop) props.set(to, { ...prop, dir: turnDir(prop.dir) });
    }
  }
  return { width: h, height: w, level, ramps, props, seed: world.seed, tiers: world.tiers };
}
