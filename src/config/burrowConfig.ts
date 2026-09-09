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
export const BURROW_COLS = 15;
export const BURROW_ROWS = 15;

// Same diamond proportion as the island, a touch larger: this board is smaller,
// so its tiles can afford the room and the traps stay easy to tap.
export const BURROW_TILE_W = 34;
export const BURROW_TILE_H = 19;
export const BURROW_HALF_W = BURROW_TILE_W / 2;
export const BURROW_HALF_H = BURROW_TILE_H / 2;

/**
 * Measured against burrow_generated.jpg, by eye: the field's tiles have to land
 * on the fenced patch and the entrance on the stone path. Move the art or the
 * layout and this needs re-measuring — the Storybook story is what that is done
 * against.
 */
export const BURROW_ORIGIN_X = 455;
export const BURROW_ORIGIN_Y = 235;

/**
 * How far the backdrop is zoomed.
 *
 * The art draws a small homestead in a large field of grass. At 1× the played
 * ground occupied about a third of the frame and the board had to shrink to
 * tiles too small to tap, so the scene is enlarged until the homestead fills
 * it and the grass is cropped away.
 */
export const BURROW_ZOOM = 1.45;

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
/**
 * The layout.
 *
 * WIDE on purpose. An earlier cut funnelled every route through one narrow
 * approach, and the balance came out as a cliff — 100% of raids got through,
 * then 0% the moment the funnel was mined, with no gradient in between. Traps
 * were all-or-nothing rather than a cost.
 *
 * A raider needs REAL alternatives for placement to be a judgement call: a long
 * open flank, a short mined one. So the ground is broad, with scattered rocks
 * that shape routes instead of a wall that dictates one.
 */
const LAYOUT = [
  '###############',
  '#.............#',
  '#.FFF.........#',
  '#.FFF.........#',
  '#.FFF....#....#',
  '#........#....#',   // rocks SHAPE the routes; they never reduce them to one
  '#.............#',
  '#....#........#',
  '#....#....#...#',
  '#.........#...#',
  '#.............#',
  '#..#..........#',
  '#..#..........#',
  '#............E#',   // the path enters lower-right, as the art draws it
  '###############',
] as const;

export type BurrowCell = 'ground' | 'blocked' | 'entrance' | 'field';

const CELL: Record<string, BurrowCell> = {
  '.': 'ground',
  '#': 'blocked',
  'E': 'entrance',
  'F': 'field',
};

export function burrowCell(index: number): BurrowCell {
  // Every guard here matters: this is called with indices that came off the
  // wire (a client naming the tile it wants to trap or step onto), so a
  // non-integer or out-of-range value must return 'blocked' rather than throw.
  // JS's % keeps the sign, so a negative index yields a negative column.
  if (!Number.isInteger(index)) return 'blocked';
  const { col, row } = burrowColRow(index);
  if (row < 0 || row >= BURROW_ROWS || col < 0 || col >= BURROW_COLS) return 'blocked';
  return CELL[LAYOUT[row]?.[col] ?? '#'] ?? 'blocked';
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
