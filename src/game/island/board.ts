/**
 * The island AS THE BOARD: which of its tiles can be stood on, and what is in
 * the way.
 *
 * Until now the playable grid was a flat 16x16 laid OVER the terrain, and the
 * terrain was scenery — the two knew nothing about each other, so a cliff was
 * a picture of a wall rather than a wall. Here the terrain is the board: a
 * land tile is a cell you can occupy, the sea is off-board, and the things
 * standing on the island are obstacles with their own rules.
 *
 * ## What blocks, and why it differs
 *
 *   sea        never walkable; it is not a cell at all
 *   cliff      a step between tiers of more than `MAX_STEP` cannot be climbed
 *   soldier    a wall. It never moves, so a route it blocks stays blocked
 *   sheep      blocks its cell, but WANDERS — so a blocked path can open
 *
 * That difference is the whole design. A soldier is terrain you have to route
 * around; a flock is a queue you can wait out. Making them both static would
 * leave the island stable and lifeless, and making them both passable would
 * make the inhabitants scenery again.
 *
 * Deliberately free of Pixi and of the view: this decides what is legal, never
 * what is drawn. That is what lets it be asserted without a canvas — the same
 * split `generate.ts` and `autotile.ts` already keep.
 */
import { mulberry32, seedFrom, type Rng } from '@/lib/game/rng';
import { blocksCell, wanders, type ThingKind } from './blocking';
import { levelAt, type IslandMap } from './generate';

/**
 * The tallest step a rabbit can take between two tiers.
 *
 * 1 lets it walk up one shelf and refuses two, which is what the art already
 * promises: one tier of cliff is a scramble, two is a drop. Raise it and the
 * plateaus stop meaning anything.
 */
export const MAX_STEP = 1;

/**
 * What is standing on a cell.
 *
 * Everything the island puts on the ground is one of these — a tree as much as
 * a sheep. Whether it takes the cell out of play is not decided here but in
 * `blocking.ts`, which is the point: the board never asks "is this a tree", it
 * asks "does this kind block", and a new kind of scenery cannot be added
 * without answering that.
 */
export type OccupantKind = ThingKind;

export interface Occupant {
  id: string;
  kind: OccupantKind;
  x: number;
  y: number;
}

/** The eight steps a rabbit may take, as `[dx, dy]`. */
export const STEPS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

/** A cell's identity, for the occupancy map. */
export const cellKey = (x: number, y: number): string => `${x},${y}`;

/**
 * The playable island: its terrain, and who is standing where.
 *
 * Occupants live in a map keyed by cell rather than in a list, because every
 * question asked of them at play time is "what is on THIS cell" — a list would
 * turn each of those into a scan.
 */
export class IslandBoard {
  private readonly byCell = new Map<string, Occupant>();
  private readonly rng: Rng;
  /**
   * The cells of the island's MAIN body — the largest group that can all
   * reach each other. See `playableCells`.
   */
  private readonly main: Set<string>;

  constructor(
    readonly map: IslandMap,
    occupants: readonly Occupant[] = [],
    seed = `${map.seed}:board`,
  ) {
    this.rng = mulberry32(seedFrom(seed));
    for (const o of occupants) this.byCell.set(cellKey(o.x, o.y), o);
    this.main = playableCells(map);
  }

  /** True when `(x, y)` belongs to the island's main connected body. */
  isOnBoard(x: number, y: number): boolean {
    return this.main.has(cellKey(x, y));
  }

  /** Every occupant, in no particular order. */
  occupants(): Occupant[] {
    return [...this.byCell.values()];
  }

  /** Whoever is standing on `(x, y)`, if anyone. */
  occupantAt(x: number, y: number): Occupant | undefined {
    return this.byCell.get(cellKey(x, y));
  }

  /**
   * True when something standing on `(x, y)` takes it out of play.
   *
   * A mushroom does not; a tree does. The answer comes from `blocking.ts` so
   * that the rule a player feels and the rule the renderer draws are the same
   * sentence in one place.
   */
  isBlocked(x: number, y: number): boolean {
    const o = this.byCell.get(cellKey(x, y));
    return o !== undefined && blocksCell(o.kind);
  }

  /** True when `(x, y)` is land — a cell that exists, occupied or not. */
  isLand(x: number, y: number): boolean {
    return levelAt(this.map, x, y) > 0;
  }

  /**
   * True when the tier above drops a CLIFF FACE onto this cell.
   *
   * The face is drawn in the cell below a shelf's edge, standing on whatever
   * is down there — so that cell is land by the map, but every pixel a player
   * can see of it is rock. Farming it would put a carrot inside a cliff, and
   * walking onto it would put the rabbit behind one. The view already refuses
   * to grow mushrooms here for exactly the same reason; the board has to agree
   * with the picture, or the two disagree about where the island is.
   */
  isUnderCliff(x: number, y: number): boolean {
    const here = levelAt(this.map, x, y);
    return here > 0 && levelAt(this.map, x, y - 1) > here;
  }

  /**
   * True when a rabbit could stand on `(x, y)` — land, and nobody on it.
   *
   * Says nothing about whether it can be REACHED: that depends on where it is
   * stepping from, which is `canStep`.
   */
  isWalkable(x: number, y: number): boolean {
    return this.isOnBoard(x, y) && !this.isBlocked(x, y);
  }

  /**
   * True when `(x, y)` can hold something to dig up.
   *
   * The same cells a rabbit can stand on, minus nothing — a farmable tile has
   * to be reachable to be worth burying anything in. Kept as its own name
   * because the two answers are the same by DESIGN rather than by accident,
   * and a future rule (no carrots on the shore, say) belongs here without
   * touching what is walkable.
   */
  isFarmable(x: number, y: number): boolean {
    return this.isOnBoard(x, y) && !this.isBlocked(x, y);
  }

  /** Every farmable cell of the island, in row-major order. */
  farmableCells(): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (this.isFarmable(x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  /**
   * True when a rabbit standing on `(fx, fy)` may step to `(tx, ty)`.
   *
   * The climb is the interesting half. Both cells are land and the target is
   * free, but a tier difference over `MAX_STEP` is a cliff — and a cliff is
   * the reason the terrain is worth making the board in the first place.
   */
  canStep(fx: number, fy: number, tx: number, ty: number): boolean {
    if (!this.isOnBoard(fx, fy) || !this.isWalkable(tx, ty)) return false;
    const dx = Math.abs(tx - fx);
    const dy = Math.abs(ty - fy);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false;
    return Math.abs(levelAt(this.map, tx, ty) - levelAt(this.map, fx, fy)) <= MAX_STEP;
  }

  /** Every cell reachable from `(x, y)` in one step. */
  stepsFrom(x: number, y: number): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (const [dx, dy] of STEPS) {
      if (this.canStep(x, y, x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    }
    return out;
  }

  /**
   * Move the wandering occupants one tick. Returns those that actually moved.
   *
   * Only sheep wander — a soldier that shuffled would make the wall it forms
   * unreliable in a way a player cannot plan around, which is the opposite of
   * what an obstacle is for. Each sheep moves at most one cell, onto ground it
   * could legally stand on, and only `WANDER_CHANCE` of them try per tick, so
   * a flock drifts rather than marching in step.
   *
   * Movement is committed cell by cell: a sheep claims its destination before
   * the next one is considered, so two sheep can never land on one cell.
   */
  wander(chance = WANDER_CHANCE): Occupant[] {
    const moved: Occupant[] = [];
    for (const o of this.occupants()) {
      if (!wanders(o.kind)) continue;
      if (this.rng() > chance) continue;

      const open = this.stepsFrom(o.x, o.y).filter((c) => this.sameTier(o, c.x, c.y));
      if (!open.length) continue;
      const to = open[Math.floor(this.rng() * open.length)];

      this.byCell.delete(cellKey(o.x, o.y));
      o.x = to.x;
      o.y = to.y;
      this.byCell.set(cellKey(o.x, o.y), o);
      moved.push(o);
    }
    return moved;
  }

  /** Sheep stay on their own shelf: one that wandered off would need a climb. */
  private sameTier(o: Occupant, x: number, y: number): boolean {
    return levelAt(this.map, x, y) === levelAt(this.map, o.x, o.y);
  }
}

/** Share of sheep that try to move on a given tick. */
export const WANDER_CHANCE = 0.25;

/**
 * The island's main body: the largest set of cells that can all reach one
 * another, ignoring who happens to be standing where.
 *
 * Excluding the cells a cliff face is drawn over does not just shrink the
 * island, it can CUT PIECES OFF it — a shelf whose only approach ran along the
 * foot of a cliff leaves a pocket of grass nothing can walk to. Measured over
 * sixty seeds, five islands strand something and the worst loses 5.9% of its
 * cells that way.
 *
 * Those pockets are worse than missing ground: they are visibly part of the
 * island, so a carrot buried in one is a prize the player can see and never
 * collect. The board therefore keeps only the main body, and the pockets stay
 * as scenery — land you look at, like the sea.
 *
 * Computed once per board rather than per query: it is one flood fill over the
 * map, and every `isWalkable` afterwards is a set lookup.
 *
 * Occupants are deliberately NOT considered. A flock that happens to stand in
 * a corridor would otherwise shrink the board as it wandered, and a tile would
 * stop being farmable because a sheep walked past it.
 */
export function playableCells(map: IslandMap): Set<string> {
  const standable = (x: number, y: number) => {
    const here = levelAt(map, x, y);
    return here > 0 && levelAt(map, x, y - 1) <= here;
  };

  const seen = new Set<string>();
  let best = new Set<string>();

  for (let y0 = 0; y0 < map.height; y0++) {
    for (let x0 = 0; x0 < map.width; x0++) {
      if (!standable(x0, y0) || seen.has(cellKey(x0, y0))) continue;

      const group = new Set<string>([cellKey(x0, y0)]);
      const queue: Array<[number, number]> = [[x0, y0]];
      seen.add(cellKey(x0, y0));

      while (queue.length) {
        const [x, y] = queue.pop()!;
        for (const [dx, dy] of STEPS) {
          const nx = x + dx;
          const ny = y + dy;
          const k = cellKey(nx, ny);
          if (group.has(k) || !standable(nx, ny)) continue;
          if (Math.abs(levelAt(map, nx, ny) - levelAt(map, x, y)) > MAX_STEP) continue;
          group.add(k);
          seen.add(k);
          queue.push([nx, ny]);
        }
      }
      if (group.size > best.size) best = group;
    }
  }
  return best;
}
