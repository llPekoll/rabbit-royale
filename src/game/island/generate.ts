/**
 * The island itself: a grid of terrain TIERS, grown from a seed.
 *
 * Tier 0 is open sea, tier 1 is ground at sea level, and every tier above that
 * is a plateau standing on the one below — the stepped shelves in the Tiny
 * Swords key art. Nothing here knows about textures or Pixi; it produces a
 * small integer per cell and stops, so the same map can be generated on the
 * server, replayed from a bug report, or asserted against in a unit test.
 *
 * Shape comes from two ingredients multiplied together: smooth value noise for
 * the ragged coastline, and an elliptical falloff so the land lands in the
 * middle of the box instead of running off its edges. Plateaus reuse the same
 * recipe on the tier below, ERODED first, which is what keeps a cliff from ever
 * being born flush against the shore — a plateau needs a row of lower ground
 * beneath its southern edge for its cliff face to stand on.
 */
import { mulberry32, seedFrom, type Rng } from '@/lib/game/rng';

export interface IslandMap {
  readonly width: number;
  readonly height: number;
  /** Terrain tier per cell, row-major. 0 = sea, 1 = sea-level ground, 2+ = plateau. */
  readonly level: Int8Array;
  readonly seed: string;
  /** Highest tier actually present, which can be lower than the tiers asked for. */
  readonly tiers: number;
}

export interface IslandOptions {
  seed: string;
  /** Grid size in cells. The default is a touch wider than tall, like the key art. */
  width?: number;
  height?: number;
  /** How many terrain tiers to attempt, sea excluded. 1 = a flat island. */
  tiers?: number;
  /**
   * Share of the box the island aims to cover, 0..1. An aim, not a promise —
   * tidying the coastline afterwards always costs a few cells.
   */
  land?: number;
  /** Share of each tier that rises into the next one, 0..1. */
  rise?: number;
  /**
   * How round the island is. 0 leans entirely on the elliptical falloff and
   * makes a blob; 1 leans entirely on noise and scatters. The middle is a
   * coastline with bays.
   */
  raggedness?: number;
}

const DEFAULTS = { width: 34, height: 24, tiers: 3, land: 0.46, rise: 0.55, raggedness: 0.4 } as const;

/**
 * How far the elliptical falloff reaches, as a share of the box.
 *
 * Under 1 on purpose: land is only ever cut from inside this ellipse, so the
 * grid keeps a margin of open sea. That margin is not decoration — a shore cell
 * on the border has nowhere to put its foam, and a plateau on the border loses
 * the row of ground its cliff face stands on.
 */
const FALLOFF_REACH = 0.92;

/** Tier at `(x, y)`; out of bounds is open sea, which is what the autotiler wants. */
export function levelAt(map: IslandMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return map.level[y * map.width + x];
}

/** `(x, y) => boolean` over every cell standing at `tier` or above. */
export function atOrAbove(map: IslandMap, tier: number) {
  return (x: number, y: number) => levelAt(map, x, y) >= tier;
}

/** Smoothstep, so the interpolated noise has no visible lattice creases. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Value noise in [0, 1]: random values on a coarse lattice, smoothly
 * interpolated. Cheap, seeded, and plenty for a coastline — Perlin would buy
 * nothing here that a player could see.
 */
function noiseField(rng: Rng, width: number, height: number, cell: number): Float32Array {
  const cols = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;
  const lattice = new Float32Array(cols * rows);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const ty = smooth(gy - y0);
    for (let x = 0; x < width; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const tx = smooth(gx - x0);
      const a = lattice[y0 * cols + x0];
      const b = lattice[y0 * cols + x0 + 1];
      const c = lattice[(y0 + 1) * cols + x0];
      const d = lattice[(y0 + 1) * cols + x0 + 1];
      const top = a + (b - a) * tx;
      const bottom = c + (d - c) * tx;
      out[y * width + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/** 1 at the centre of the box, 0 at the rim of the inscribed ellipse. */
function falloffField(width: number, height: number, reach: number): Float32Array {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = (width / 2) * reach;
  const ry = (height / 2) * reach;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      out[y * width + x] = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
    }
  }
  return out;
}

type Mask = Uint8Array;

const idx = (w: number, x: number, y: number) => y * w + x;

function inside(w: number, h: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function orthoCount(mask: Mask, w: number, h: number, x: number, y: number): number {
  let n = 0;
  if (inside(w, h, x, y - 1) && mask[idx(w, x, y - 1)]) n++;
  if (inside(w, h, x + 1, y) && mask[idx(w, x + 1, y)]) n++;
  if (inside(w, h, x, y + 1) && mask[idx(w, x, y + 1)]) n++;
  if (inside(w, h, x - 1, y) && mask[idx(w, x - 1, y)]) n++;
  return n;
}

/**
 * Smooth a mask the way a cellular automaton does: drop cells clinging on by
 * one neighbour, fill pockets surrounded on three sides. Without this the noise
 * leaves single-cell spits and one-cell lakes, and both look like bugs once the
 * tileset draws a full rounded rim around them.
 */
function despeckle(mask: Mask, w: number, h: number, passes = 2): Mask {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(w, x, y);
        const n = orthoCount(cur, w, h, x, y);
        next[i] = cur[i] ? (n >= 2 ? 1 : 0) : n >= 3 ? 1 : 0;
      }
    }
    cur = next;
  }
  return cur;
}

/** Shrink a mask by one cell in every direction. The border counts as outside. */
function erode(mask: Mask, w: number, h: number): Mask {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[idx(w, x, y)]) continue;
      if (
        inside(w, h, x - 1, y) && mask[idx(w, x - 1, y)] &&
        inside(w, h, x + 1, y) && mask[idx(w, x + 1, y)] &&
        inside(w, h, x, y - 1) && mask[idx(w, x, y - 1)] &&
        inside(w, h, x, y + 1) && mask[idx(w, x, y + 1)]
      ) {
        out[idx(w, x, y)] = 1;
      }
    }
  }
  return out;
}

/**
 * Keep only the biggest connected blob.
 *
 * An archipelago is a fine thing, but not by accident: the noise happily leaves
 * two-cell islets in the corners, and each one costs a full rounded rim and a
 * ring of foam for no gameplay at all.
 */
function largestComponent(mask: Mask, w: number, h: number): Mask {
  const seen = new Int32Array(mask.length).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(start);
    seen[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      const push = (nx: number, ny: number) => {
        if (!inside(w, h, nx, ny)) return;
        const ni = idx(w, nx, ny);
        if (mask[ni] && seen[ni] < 0) {
          seen[ni] = id;
          stack.push(ni);
        }
      };
      push(x, y - 1);
      push(x + 1, y);
      push(x, y + 1);
      push(x - 1, y);
    }
    sizes.push(size);
  }
  if (!sizes.length) return mask;
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (seen[i] === best) out[i] = 1;
  return out;
}

/** A plateau needs a body, not a ledge: below this many cells it is dropped. */
const MIN_PLATEAU_CELLS = 10;

/** Nothing may be built in this margin, so every shore has room for its foam. */
function clearBorder(mask: Mask, w: number, h: number): void {
  for (let x = 0; x < w; x++) {
    mask[idx(w, x, 0)] = 0;
    mask[idx(w, x, h - 1)] = 0;
  }
  for (let y = 0; y < h; y++) {
    mask[idx(w, 0, y)] = 0;
    mask[idx(w, w - 1, y)] = 0;
  }
}

/**
 * The value that lets `share` of the eligible cells through.
 *
 * Thresholding by RANK rather than by a fixed cutoff is what turns "how much of
 * this should be land" into an honest dial. A hardcoded cutoff answers a
 * different question every time the noise or the falloff changes, and tuning it
 * means tuning a number that means nothing on its own.
 */
function quantileThreshold(field: Float32Array, eligible: Mask, share: number): number {
  const values: number[] = [];
  for (let i = 0; i < field.length; i++) if (eligible[i]) values.push(field[i]);
  if (!values.length) return Infinity;
  values.sort((a, b) => a - b);
  const rank = Math.floor((1 - Math.min(1, Math.max(0, share))) * values.length);
  return values[Math.min(rank, values.length - 1)];
}

/**
 * Grow an island.
 *
 * The same seed always produces the same map, on the server and in the browser,
 * so a map only ever has to travel as its seed.
 */
export function generateIsland(options: IslandOptions): IslandMap {
  const width = options.width ?? DEFAULTS.width;
  const height = options.height ?? DEFAULTS.height;
  const wantTiers = Math.max(1, options.tiers ?? DEFAULTS.tiers);
  const landShare = options.land ?? DEFAULTS.land;
  const riseShare = options.rise ?? DEFAULTS.rise;
  const ragged = options.raggedness ?? DEFAULTS.raggedness;

  const rng = mulberry32(seedFrom(options.seed));
  const falloff = falloffField(width, height, FALLOFF_REACH);

  // The coastline: noise coarse enough to read as bays rather than as static,
  // pulled toward the middle of the box by the falloff.
  const coast = noiseField(rng, width, height, 5);
  const shore = new Float32Array(width * height);
  for (let i = 0; i < shore.length; i++) {
    shore[i] = coast[i] * ragged + falloff[i] * (1 - ragged);
  }

  const everywhere = new Uint8Array(width * height).fill(1);
  clearBorder(everywhere, width, height);
  const sea = quantileThreshold(shore, everywhere, landShare);

  let land: Mask = new Uint8Array(width * height);
  for (let i = 0; i < land.length; i++) land[i] = everywhere[i] && shore[i] > sea ? 1 : 0;
  land = despeckle(land, width, height);
  clearBorder(land, width, height);
  land = largestComponent(land, width, height);

  const level = new Int8Array(width * height);
  for (let i = 0; i < land.length; i++) level[i] = land[i];

  let below = land;
  let highest = 1;
  for (let tier = 2; tier <= wantTiers; tier++) {
    // Eroding first is what guarantees the row of lower ground the cliff face
    // needs to stand on, on every side of the shelf. One cell is exactly what a
    // face occupies, so one erosion is exactly what it takes — eroding twice
    // (the obvious over-caution) starves the third tier of anywhere to stand.
    const room = erode(below, width, height);
    if (!room.some(Boolean)) break;

    // Coarser noise than the coastline uses: a shelf wants long straight runs
    // for its cliff to sit on, and fine noise chops those into stubs.
    const field = noiseField(rng, width, height, 7);
    const threshold = quantileThreshold(field, room, riseShare);
    let shelf: Mask = new Uint8Array(width * height);
    for (let i = 0; i < shelf.length; i++) {
      shelf[i] = room[i] && field[i] > threshold ? 1 : 0;
    }
    shelf = despeckle(shelf, width, height);
    // Despeckling can fill outward past the eroded room; clamp it back.
    for (let i = 0; i < shelf.length; i++) if (!room[i]) shelf[i] = 0;
    shelf = largestComponent(shelf, width, height);

    let cells = 0;
    for (let i = 0; i < shelf.length; i++) cells += shelf[i];
    if (cells < MIN_PLATEAU_CELLS) break;

    for (let i = 0; i < shelf.length; i++) if (shelf[i]) level[i] = tier;
    highest = tier;
    below = shelf;
  }

  return { width, height, level, seed: options.seed, tiers: highest };
}

/** Cells at `tier` or above whose southern neighbour is lower: where cliffs go. */
export function southEdges(map: IslandMap, tier: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (levelAt(map, x, y) >= tier && levelAt(map, x, y + 1) < tier) out.push({ x, y });
    }
  }
  return out;
}
