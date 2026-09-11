/**
 * The island's terrain and everything standing on it, from the seed alone.
 *
 * The client is a reflection of the server: it never decides anything, it
 * redraws what the server already decided. For that to work, both sides have
 * to arrive at the SAME island without it crossing the wire — the same trick
 * `makeShape` already plays for the coastline, extended to the whole board.
 *
 * So this module is the one place the island's obstacles are born, and it is
 * deliberately free of Pixi: the scatter that used to happen inside
 * `IsoIslandView` (which trees, which bushes, where the flock stands) is
 * decided here instead, from a seeded stream, and the view is handed the
 * answer to draw. That inversion is the whole point. While the scatter lived
 * in the renderer, the server could not know a tree was in the way, and a
 * highlight was a client opinion rather than a rule.
 *
 * Same seed in, same island out, on a server with no canvas and in a browser.
 */
import { mulberry32, seedFrom, type Rng } from '@/lib/game/rng';
import type { OccupantKind } from './board';
import { generateIsland, levelAt, type IslandMap, type IslandOptions } from './generate';

/** How the playable island is shaped. Both sides must pass the same options. */
export interface TerrainOptions extends Omit<IslandOptions, 'seed'> {
  seed: string;
  /** Share of land given to sheep and soldiers. */
  inhabitedShare?: number;
  /** Scatter trees, bushes and props. Off leaves bare terrain. */
  scenery?: boolean;
}

/** One thing standing on the island, before anything knows how to draw it. */
export interface Placement {
  id: string;
  kind: OccupantKind;
  x: number;
  y: number;
  /** Index into the art variant for its kind — which bush, which prop. */
  variant: number;
}

export interface Terrain {
  map: IslandMap;
  placements: Placement[];
}

/** Scatter rates, as a share of eligible cells. */
const TREE_CHANCE = 0.08;
const BUSH_CHANCE = 0.05;
const PROP_CHANCE = 0.11;
const LANDMARK_CHANCE = 0.08;
const DEFAULT_INHABITED_SHARE = 0.025;

/** Sheep come in small flocks; soldiers patrol alone or in pairs. */
const FLOCK = { min: 2, max: 4 };
const PATROL = { min: 1, max: 2 };

/** Nobody stands next to anybody else — a flock on adjacent cells walls off a
 *  corridor and reads as one smeared animal. */
const INHABITANT_SPACING = 1;

/** How many art variants each kind has, for `Placement.variant`. */
export const VARIANT_COUNT = { tree: 4, bush: 4, prop: 15, landmark: 3, rock: 4 } as const;

/**
 * Sheep outweigh soldiers two to one: a soldier never moves, so an island
 * covered in them is a maze rather than a field.
 */
const LIVESTOCK = [
  { kind: 'sheep' as const, weight: 10, group: FLOCK },
  { kind: 'soldier' as const, weight: 6, group: PATROL },
];

/** Build the island and everything on it. Deterministic in `options.seed`. */
export function generateTerrain(options: TerrainOptions): Terrain {
  const map = generateIsland(options);
  const placements: Placement[] = [];
  if (options.scenery === false) {
    return { map, placements: scatterLivestock(map, options, placements) };
  }
  scatterScenery(map, placements);
  return { map, placements: scatterLivestock(map, options, placements) };
}

/** True when all four neighbours stand at the same tier — no edge, no cliff. */
function isInterior(map: IslandMap, x: number, y: number, tier: number): boolean {
  return (
    levelAt(map, x - 1, y) === tier &&
    levelAt(map, x + 1, y) === tier &&
    levelAt(map, x, y - 1) === tier &&
    levelAt(map, x, y + 1) === tier
  );
}

/** True when the cell above is higher, so a cliff face is drawn over this one. */
function underCliff(map: IslandMap, x: number, y: number, tier: number): boolean {
  return levelAt(map, x, y - 1) > tier;
}

/**
 * Trees, bushes and ground clutter.
 *
 * One roll decides all three, so a tree turned down for standing too near an
 * edge falls through to the bush and prop branches rather than leaving a bare
 * cell — coasts come out bushy instead of wooded, which is what a coast looks
 * like. Kept identical to the order the renderer used, so the same seed still
 * grows the same island it did before this moved out of the view.
 */
function scatterScenery(map: IslandMap, out: Placement[]): void {
  const rng = mulberry32(seedFrom(`${map.seed}:deco`));
  const taken = new Set<string>();

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tier = levelAt(map, x, y);
      if (tier === 0) continue;
      if (underCliff(map, x, y, tier)) continue;

      const roll = rng();
      if (roll < TREE_CHANCE && isInterior(map, x, y, tier)) {
        out.push({
          id: `tree-${out.length}`, kind: 'tree', x, y,
          variant: Math.floor(rng() * VARIANT_COUNT.tree),
        });
        taken.add(`${x},${y}`);
      } else if (roll < TREE_CHANCE + BUSH_CHANCE) {
        out.push({
          id: `bush-${out.length}`, kind: 'bush', x, y,
          variant: Math.floor(rng() * VARIANT_COUNT.bush),
        });
        taken.add(`${x},${y}`);
      } else if (roll < TREE_CHANCE + BUSH_CHANCE + PROP_CHANCE) {
        const landmark = rng() < LANDMARK_CHANCE;
        out.push({
          id: `${landmark ? 'landmark' : 'prop'}-${out.length}`,
          kind: landmark ? 'landmark' : 'prop',
          x, y,
          variant: Math.floor(rng() * (landmark ? VARIANT_COUNT.landmark : VARIANT_COUNT.prop)),
        });
        // Loose clutter does not block, so it does not claim the cell.
        if (landmark) taken.add(`${x},${y}`);
      }
    }
  }
}

/**
 * The flock and the patrols, on a budget rather than on independent rolls.
 *
 * Scenery already claims about a fifth of the island; adding livestock as more
 * independent chances is how a map silently fills up until there is nowhere
 * left to move. So they draw from a fixed allowance and STOP when it is gone.
 */
function scatterLivestock(
  map: IslandMap,
  options: TerrainOptions,
  out: Placement[],
): Placement[] {
  const rng = mulberry32(seedFrom(`${map.seed}:life`));
  const blocked = new Set(out.filter((p) => p.kind !== 'prop').map((p) => `${p.x},${p.y}`));
  const inhabited = new Set<string>();

  const candidates: Array<{ x: number; y: number }> = [];
  let landCells = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tier = levelAt(map, x, y);
      if (tier === 0) continue;
      landCells++;
      if (blocked.has(`${x},${y}`)) continue;
      if (underCliff(map, x, y, tier)) continue;
      if (!isInterior(map, x, y, tier)) continue;
      candidates.push({ x, y });
    }
  }

  // Shuffle then take a prefix: scanning in row order piles everyone north.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const budget = Math.floor(landCells * (options.inhabitedShare ?? DEFAULT_INHABITED_SHARE));
  const totalWeight = LIVESTOCK.reduce((sum, e) => sum + e.weight, 0);
  let placed = 0;

  const clearOf = (x: number, y: number): boolean => {
    for (let dy = -INHABITANT_SPACING; dy <= INHABITANT_SPACING; dy++) {
      for (let dx = -INHABITANT_SPACING; dx <= INHABITANT_SPACING; dx++) {
        if (inhabited.has(`${x + dx},${y + dy}`)) return false;
      }
    }
    return !blocked.has(`${x},${y}`);
  };

  for (const spot of candidates) {
    if (placed >= budget) break;
    if (!clearOf(spot.x, spot.y)) continue;

    let roll = rng() * totalWeight;
    const entry = LIVESTOCK.find((e) => (roll -= e.weight) < 0) ?? LIVESTOCK[0];
    const size = entry.group.min + Math.floor(rng() * (entry.group.max - entry.group.min + 1));

    for (let n = 0; n < size && placed < budget; n++) {
      const cell = n === 0 ? spot : nearbyFree(map, spot.x, spot.y, rng, clearOf);
      if (!cell) break;
      out.push({
        id: `${entry.kind}-${out.length}`,
        kind: entry.kind,
        x: cell.x,
        y: cell.y,
        variant: Math.floor(rng() * 3),
      });
      inhabited.add(`${cell.x},${cell.y}`);
      blocked.add(`${cell.x},${cell.y}`);
      placed++;
    }
  }
  return out;
}

const RING = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

/** A free interior cell just outside the anchor, for the rest of a group. */
function nearbyFree(
  map: IslandMap,
  x: number,
  y: number,
  rng: Rng,
  clearOf: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  const ring = [...RING];
  for (let i = ring.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }
  for (const [dx, dy] of ring) {
    const nx = x + dx * (INHABITANT_SPACING + 1);
    const ny = y + dy * (INHABITANT_SPACING + 1);
    const tier = levelAt(map, nx, ny);
    if (tier === 0) continue;
    if (underCliff(map, nx, ny, tier)) continue;
    if (!isInterior(map, nx, ny, tier)) continue;
    if (!clearOf(nx, ny)) continue;
    return { x: nx, y: ny };
  }
  return null;
}
