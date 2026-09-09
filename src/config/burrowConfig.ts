/**
 * The burrow's board: the ground a raider has to cross.
 *
 * Deliberately its own grid, not the island's. A burrow is a fixed, hand-shaped
 * place — the art puts the door, the field and the path where they are — so
 * unlike an island it is NOT cut from a seed. Every burrow is the same shape;
 * what differs between two of them is where the owner put their traps, which is
 * the whole point.
 *
 * Same isometric projection as the island (the art shares its angle), just a
 * smaller board and its own origin.
 */
export const BURROW_COLS = 11;
export const BURROW_ROWS = 11;

// Same diamond proportion as the island, a touch larger: this board is smaller,
// so its tiles can afford the room and the traps stay easy to tap.
export const BURROW_TILE_W = 56;
export const BURROW_TILE_H = 30;
export const BURROW_HALF_W = BURROW_TILE_W / 2;
export const BURROW_HALF_H = BURROW_TILE_H / 2;

/** Measured against burrow_generated.jpg at BURROW_ZOOM — move one, re-measure. */
export const BURROW_ORIGIN_X = 480;
export const BURROW_ORIGIN_Y = 150;

/** How far the backdrop is zoomed so the drawn scene fills the frame. */
export const BURROW_ZOOM = 1.0;

export const burrowIndex = (col: number, row: number) => row * BURROW_COLS + col;
export const burrowColRow = (index: number) => ({
  col: index % BURROW_COLS,
  row: Math.floor(index / BURROW_COLS),
});

export function burrowTilePos(index: number): { x: number; y: number } {
  const { col, row } = burrowColRow(index);
  return {
    x: BURROW_ORIGIN_X + (col - row) * BURROW_HALF_W,
    y: BURROW_ORIGIN_Y + (col + row) * BURROW_HALF_H,
  };
}

export const burrowTileDepth = (index: number) => {
  const { col, row } = burrowColRow(index);
  return col + row;
};

/**
 * The layout, drawn to match the art.
 *
 *  `.` walkable ground   `#` blocked (trees, rocks, the mound itself)
 *  `E` the raider's entrance — where the path meets the board
 *  `F` the carrot field — the objective; reaching ANY of these wins the raid
 *
 * Written as a picture rather than as coordinates because that is how it is
 * checked: against the background art, by eye.
 */
const LAYOUT = [
  '####...####',
  '###.....###',
  '##..FFF..##',
  '##..FFF..##',
  '#.........#',
  '#..#...#..#',   // rocks: two chokepoints, so there are ROUTES to choose between
  '#.........#',
  '##.......##',
  '###.....###',
  '####...####',
  '#####E#####',
] as const;

export type BurrowCell = 'ground' | 'blocked' | 'entrance' | 'field';

const CELL: Record<string, BurrowCell> = {
  '.': 'ground',
  '#': 'blocked',
  'E': 'entrance',
  'F': 'field',
};

export function burrowCell(index: number): BurrowCell {
  const { col, row } = burrowColRow(index);
  if (row < 0 || row >= BURROW_ROWS || col < 0 || col >= BURROW_COLS) return 'blocked';
  return CELL[LAYOUT[row][col]] ?? 'blocked';
}

/** Can a raider stand here? The field counts — reaching it is the win. */
export const isWalkable = (index: number) => burrowCell(index) !== 'blocked';

/** Every tile a raider may occupy. */
export function walkableTiles(): number[] {
  const out: number[] = [];
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) if (isWalkable(i)) out.push(i);
  return out;
}

/** Where a raid starts. */
export function entranceTile(): number {
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
    if (burrowCell(i) === 'entrance') return i;
  }
  throw new Error('burrow layout has no entrance');
}

/** The objective. Reaching any of these ends the raid in the attacker's favour. */
export function fieldTiles(): number[] {
  const out: number[] = [];
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
    if (burrowCell(i) === 'field') out.push(i);
  }
  return out;
}

/**
 * Where the OWNER may place a trap: walkable ground only.
 *
 * Not the field (a trap on the objective would make every raid a coin flip on
 * the last step) and not the entrance (a raid that dies before it begins is not
 * a raid). What is left is the crossing, which is the part worth defending.
 */
export const isTrappable = (index: number) => burrowCell(index) === 'ground';

/** The 8 steps, minus walls and edges. */
const STEPS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

export function burrowNeighbors(index: number): number[] {
  const { col, row } = burrowColRow(index);
  const out: number[] = [];
  for (const [dc, dr] of STEPS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= BURROW_COLS || nr < 0 || nr >= BURROW_ROWS) continue;
    const i = burrowIndex(nc, nr);
    if (isWalkable(i)) out.push(i);
  }
  return out;
}

/** Screen point → burrow tile, or null off the board. */
export function burrowScreenToTile(sx: number, sy: number): number | null {
  const dx = sx - BURROW_ORIGIN_X;
  const dy = sy - BURROW_ORIGIN_Y;
  const col = Math.round((dx / BURROW_HALF_W + dy / BURROW_HALF_H) / 2);
  const row = Math.round((dy / BURROW_HALF_H - dx / BURROW_HALF_W) / 2);
  if (col < 0 || col >= BURROW_COLS || row < 0 || row >= BURROW_ROWS) return null;
  return burrowIndex(col, row);
}

/** Steps in the shortest unobstructed path from the entrance to the field. */
export function shortestRaidPath(): number {
  const start = entranceTile();
  const goal = new Set(fieldTiles());
  const seen = new Set([start]);
  let frontier = [start];
  let steps = 0;
  while (frontier.length) {
    steps++;
    const next: number[] = [];
    for (const tile of frontier) {
      for (const n of burrowNeighbors(tile)) {
        if (seen.has(n)) continue;
        if (goal.has(n)) return steps;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return Infinity;
}
