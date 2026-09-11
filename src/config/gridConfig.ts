/**
 * The isometric grid.
 *
 * Ported from the original Rabbit Royale, ENLARGED: the casino version was a
 * fixed 8×8 with 44 playable tiles, which is a solo board — four rabbits racing
 * on it are never more than two steps apart and the whole island is dug out in
 * under a minute. The grid is now 16×16 and the island's shape is CUT FROM A
 * SEED rather than hardcoded, so no two islands read the same.
 *
 * What is deliberately kept from the original: tile proportions (the art is
 * drawn for a 70×38 diamond), 8-way movement, and the screen-direction
 * movement mapping — all of it is what makes the existing sprites and feel
 * work.
 */
import { mulberry32, seedFrom } from '@/lib/game/rng';

export const COLS = 16;
export const ROWS = 16;

/**
 * Tile size. The original used 70×38 on an 8×8 board; a 16×16 board at that
 * size spans 1120px, well past the 960px design canvas. 44×24 keeps the SAME
 * 70:38 diamond proportion the art is drawn for (so the bunny sprites and tile
 * diamonds still sit right) while the whole island fits the frame.
 *
 * Kept even so the diamond's half-width is a whole pixel — a fractional half
 * puts tiles off the pixel grid and the nearest-neighbour art shimmers.
 */
export const ISO_TILE_W = 44;
export const ISO_TILE_H = 24;
export const HALF_W = ISO_TILE_W / 2; // 22
export const HALF_H = ISO_TILE_H / 2; // 12

/**
 * Origin = screen position of tile (0,0), the top vertex of the diamond grid.
 *
 * NOT the centre of the design canvas: the board has to land on the island's
 * flat playable ground, and the art puts the volcano top-right and a forest
 * top-left. Measured against the backdrop at ISLAND_ZOOM — move one and this
 * needs re-measuring, which the Storybook `islandZoom` control is for.
 */
export const ISO_ORIGIN_X = 515;
export const ISO_ORIGIN_Y = 150;

/**
 * How far one terrain tier lifts a tile, in board pixels.
 *
 * Here with HALF_W and HALF_H because it is a board dimension, not a rendering
 * choice: the ground, the playable tiles and the click resolver all have to
 * agree on it, and they all read it from here.
 */
export const TIER_LIFT = 18;

/**
 * How large a rabbit is drawn, as a multiple of its 32px sprite.
 *
 * Deliberately NOT derived from the tile size. The original tied the two
 * together, which was fine while a tile was 70px, but this board's tiles are
 * 44px and a rabbit scaled to match becomes an unreadable smudge — a character
 * has to stay legible even as the board grows. So the rabbit slightly
 * OVERFLOWS its tile, which is also how it reads as standing on the island
 * rather than being embedded in it.
 */
export const RABBIT_SCALE = 2.4;

// Center of the isometric diamond (useful for overlays)
export const GRID_CENTER_X = ISO_ORIGIN_X;
export const GRID_CENTER_Y = ISO_ORIGIN_Y + ((COLS + ROWS - 2) / 2) * HALF_H;

/** Convert grid col/row to tile index. */
export function toIndex(col: number, row: number): number {
  return row * COLS + col;
}

/** Convert tile index to col/row. */
export function toColRow(index: number): { col: number; row: number } {
  return { col: index % COLS, row: Math.floor(index / COLS) };
}

/** Get isometric screen position for a tile index. */
export function tilePos(index: number): { x: number; y: number } {
  const { col, row } = toColRow(index);
  return {
    x: ISO_ORIGIN_X + (col - row) * HALF_W,
    y: ISO_ORIGIN_Y + (col + row) * HALF_H,
  };
}

/** Depth value for isometric sorting (higher = closer to camera). */
export function tileDepth(index: number): number {
  const { col, row } = toColRow(index);
  return col + row;
}

/** Manhattan distance between two tile indices. */
export function manhattanDist(a: number, b: number): number {
  const ac = toColRow(a);
  const bc = toColRow(b);
  return Math.abs(ac.col - bc.col) + Math.abs(ac.row - bc.row);
}

// ── Island shape ─────────────────────────────────────────────────────────────

/**
 * The island's outline, as a set of "col,row" strings that are NOT land.
 *
 * The original cut this by hand, which pinned every run to one silhouette. It
 * is now cut from a seed: a radial noise field around the centre, thresholded,
 * so each island has its own bays and headlands while staying a single
 * connected mass roughly filling the grid.
 */
export type IslandShape = ReadonlySet<string>;

/** The spawn's col/row — the island's centre, always land (see makeShape). */
const SPAWN_COL_ROW = { col: Math.round((COLS - 1) / 2), row: Math.round((ROWS - 1) / 2) };

/** The 8 legal steps as [dCol, dRow]. Declared here because the shape cutter
 *  needs them to check connectivity, before any movement code runs. */
const NEIGHBOR_STEPS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

/** Fraction of the grid's half-diagonal the island reaches, before noise. */
const BASE_RADIUS = 0.86;
/** How hard the coastline wobbles. Higher = more bays and peninsulas. */
const COAST_NOISE = 0.30;

/**
 * Cut an island shape from `seed`. Deterministic: the same seed always gives
 * the same coastline, so a server and a client generate identical land without
 * sending the mask over the wire.
 */
export function makeShape(seed: string): IslandShape {
  const rng = mulberry32(seedFrom(`shape:${seed}`));

  // A handful of random phases turn the sum of sines below into a coastline
  // that never repeats, without needing a real noise library.
  const waves = Array.from({ length: 4 }, (_, i) => ({
    freq: 1.4 + i * 1.7,
    phase: rng() * Math.PI * 2,
    amp: COAST_NOISE / (i + 1),
  }));

  const cx = (COLS - 1) / 2;
  const cy = (ROWS - 1) / 2;
  const maxR = Math.hypot(cx, cy);

  const forbidden = new Set<string>();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.hypot(dx, dy) / maxR;
      const angle = Math.atan2(dy, dx);
      // Wobble the radius by angle: the coast juts in and out around the ring.
      let radius = BASE_RADIUS;
      for (const w of waves) radius += Math.sin(angle * w.freq + w.phase) * w.amp;
      if (dist > radius) forbidden.add(`${col},${row}`);
    }
  }

  // The centre is the spawn and must always be land, whatever the noise did.
  forbidden.delete(`${Math.round(cx)},${Math.round(cy)}`);

  // Drown anything the spawn cannot walk to. The noise occasionally carves a
  // sandbar off the coast; leaving it in would put carrots and chests on land
  // no player can reach, which reads as the generator being broken. Cheaper to
  // guarantee the invariant here than to have every consumer defend against it.
  return dropUnreachable(forbidden);
}

/** Flood-fill from the spawn and mark everything it cannot reach as water. */
function dropUnreachable(forbidden: Set<string>): Set<string> {
  const isLand = (col: number, row: number) =>
    col >= 0 && row >= 0 && col < COLS && row < ROWS && !forbidden.has(`${col},${row}`);

  const start = SPAWN_COL_ROW;
  const seen = new Set<string>([`${start.col},${start.row}`]);
  const queue = [start];
  while (queue.length) {
    const { col, row } = queue.pop()!;
    for (const [dc, dr] of NEIGHBOR_STEPS) {
      const nc = col + dc;
      const nr = row + dr;
      const key = `${nc},${nr}`;
      if (!isLand(nc, nr) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ col: nc, row: nr });
    }
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const key = `${col},${row}`;
      if (!forbidden.has(key) && !seen.has(key)) forbidden.add(key);
    }
  }
  return forbidden;
}

/** The default shape, for callers with no island in hand (stories, tools). */
export const DEFAULT_SHAPE = makeShape('default');

/** Is a tile off the island, for a given shape? */
export function isForbidden(index: number, shape: IslandShape = DEFAULT_SHAPE): boolean {
  const { col, row } = toColRow(index);
  return shape.has(`${col},${row}`);
}

/** How many tiles are actually land. */
export function playableTiles(shape: IslandShape = DEFAULT_SHAPE): number {
  return COLS * ROWS - shape.size;
}

/** The spawn tile — the island's centre, always land (see makeShape). */
export const SPAWN_INDEX = toIndex(SPAWN_COL_ROW.col, SPAWN_COL_ROW.row);

// ── Movement ─────────────────────────────────────────────────────────────────

/** Reject a candidate whose on-screen heading is more than ~72° off the key
 *  pressed — better to ignore the press than to hop sideways. */
const DIRECTION_TOLERANCE = 0.3;

/**
 * Pick the neighbouring tile that lies in the SCREEN direction `(dx, dy)`
 * (y grows downward, so up is `dy < 0`). Returns null when nothing playable
 * lies that way.
 *
 * This is what makes keyboard control work on an isometric board: the player
 * presses a direction they SEE, not a grid axis. Because moves are 8-way, the
 * mapping is exact rather than approximate — a DIAGONAL grid step is a
 * STRAIGHT screen move (`col-1,row-1` renders at `(0, -2·HALF_H)`, dead up)
 * and the grid's own cardinals are the screen diagonals. So all 8 moves are
 * addressable: 4 from single keys, 4 from two-key chords.
 *
 * Scoring by dot product against each step's real screen vector (rather than a
 * hardcoded key→tile table) means this stays correct if the tile proportions
 * ever change, and it degrades gracefully at the island's edge: when the exact
 * match is off-island, the closest remaining heading wins.
 */
export function tileInScreenDirection(
  from: number,
  dx: number,
  dy: number,
  shape: IslandShape = DEFAULT_SHAPE,
  /**
   * The tiles that actually exist, when the caller knows better than `shape`.
   *
   * On generated terrain the flat silhouette is no longer the authority: it
   * still calls a cell land that the terrain has turned into cliff rock, and
   * it knows nothing about the trees standing on it. A caller that passes this
   * gets the same answer the server would give; one that does not keeps the
   * old behaviour.
   */
  allowed?: ReadonlySet<number>,
): number | null {
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;

  const { col, row } = toColRow(from);
  let best: number | null = null;
  let bestDot = DIRECTION_TOLERANCE;

  for (const [dc, dr] of NEIGHBOR_STEPS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    const idx = toIndex(nc, nr);
    if (allowed ? !allowed.has(idx) : isForbidden(idx, shape)) continue;

    // Where this step lands on screen, relative to the current tile.
    const sx = (dc - dr) * HALF_W;
    const sy = (dc + dr) * HALF_H;
    const sl = Math.hypot(sx, sy);
    const dot = (sx / sl) * ux + (sy / sl) * uy;
    if (dot > bestDot) {
      bestDot = dot;
      best = idx;
    }
  }
  return best;
}

/** The playable neighbours of a tile — the 8 steps, minus water and edges. */
export function neighbors(index: number, shape: IslandShape = DEFAULT_SHAPE): number[] {
  const { col, row } = toColRow(index);
  const out: number[] = [];
  for (const [dc, dr] of NEIGHBOR_STEPS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    const idx = toIndex(nc, nr);
    if (!isForbidden(idx, shape)) out.push(idx);
  }
  return out;
}

/** Convert screen coordinates to nearest tile index, or null if out of bounds. */
export function screenToTile(
  sx: number,
  sy: number,
  shape: IslandShape = DEFAULT_SHAPE,
): number | null {
  const dx = sx - ISO_ORIGIN_X;
  const dy = sy - ISO_ORIGIN_Y;
  const col = Math.round((dx / HALF_W + dy / HALF_H) / 2);
  const row = Math.round((dy / HALF_H - dx / HALF_W) / 2);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  const idx = toIndex(col, row);
  if (isForbidden(idx, shape)) return null;
  return idx;
}
