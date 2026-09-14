/**
 * An `IsoWorld` drawn as stacked blocks from one of the isometric block sheets.
 *
 * Unlike `IsoIslandView`, which shears top-down tiles into diamonds, this art
 * is already isometric, so nothing is transformed: every sprite is one sheet
 * cell placed on the lattice, unscaled and pixel-exact.
 *
 * ## A cell is a column
 *
 * A land cell at tier `t` is `t` blocks stacked from the sea floor, then
 * whatever stands on top — turf, a ramp, a prop, a rim. Water, where the sheet
 * has any, is a single opaque surface, so it covers the foot of any land block
 * behind it and the coast gets a waterline for free; the smooth sheet has none
 * and its islands float on the page.
 *
 * ## Draw order
 *
 * Painter's along the diagonal `x + y`, bottom-up within a cell, and the
 * sprites are CREATED in that order, so the container never sorts. Cells on
 * one diagonal sit side by side on screen and never overlap, and on a height
 * field of whole blocks nothing on a later diagonal can be behind anything on
 * an earlier one. Ramps and props fit inside their cell's block, so they obey
 * the same rule.
 *
 * Blocks nobody can see are skipped: a block is hidden when the cells east and
 * south of it both stand at least as high, since those two are its only faces
 * the camera sees, and the block above covers its top.
 *
 * ## Outlines
 *
 * The smooth sheet's cube is bare, and the ink goes on afterwards, where the
 * silhouette actually is. Along a cell's edge, a rim is laid at the cell's
 * own height when the neighbour stands at a different one: on the far (N, W)
 * edges either way — above a lower neighbour it is the top of the drop, below
 * a higher one it is the foot of that neighbour's wall — and on the near (S,
 * E) edges only above a lower neighbour, since below a higher one the edge is
 * behind that neighbour's top. A ramp's high edge joins the tier above and
 * gets no line. A vertical corner is laid per block where a visible wall
 * ends: the front corner where both near faces show, the left where the south
 * face shows and no wall continues it westward, the right likewise for the
 * east face and north. Sea cells lay rims too, so the island's foot is drawn.
 */
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { SHEET_CELL } from './decor';
import type { IsoTileset, Material, MaterialTiles } from './sheet';
import {
  DIR,
  DIR_STEP,
  isPatch,
  propAt,
  rampAt,
  rampCorners,
  rampHighSides,
  tierAt,
  touchesSea,
  type Dir,
  type IsoWorld,
  type Prop,
  type Ramp,
} from './terrain';

const DIRS: readonly Dir[] = [DIR.N, DIR.E, DIR.S, DIR.W];

/** The outline colour of the smooth sheet, for the one line the sheet cannot carry. */
const INK = 0x3a6c3e;

/** Where the water stands above the floor, in blocks — the sheet's `WATER_HEIGHT`. */
const WATER_LEVEL = 0.5;
/** Foam: line width at 128px cells, opacity, how far a ripple drifts (cells), and its cycle (s). */
const FOAM_WIDTH = 3.6;
const FOAM_ALPHA = 0.92;
const FOAM_REACH = 0.3;
const FOAM_PERIOD = 3.2;

/** A hop: from cell to cell, `t` of the way there, then a rest. */
interface Hopper {
  sprite: Sprite;
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  wait: number;
  rng: () => number;
}

const HOP_TIME = 0.32;
const HOP_REST = 0.45;
const HOP_HEIGHT = 0.45;

interface WaterlineSegment {
  a: readonly [number, number];
  b: readonly [number, number];
  /** Toward the water, in lattice units. */
  out: readonly [number, number];
}

type Vertex = readonly [number, number, number];

/**
 * A ramp's two surface triangles, as the sheet generator cuts them: one
 * plane for a straight slope, otherwise the cut runs between the two
 * corners beside the odd one out.
 */
function rampTriangles(ramp: Ramp): [Vertex, Vertex, Vertex][] {
  const h = rampCorners(ramp);
  const at = (c: Dir): Vertex => [CORNER_UV[c][0], CORNER_UV[c][1], h[c]];
  const raised = h.filter(Boolean).length;
  // NW 3, NE 0, SE 1, SW 2 around the cell.
  if (raised === 2) return [[at(3), at(0), at(1)], [at(3), at(1), at(2)]];
  const odd = h.indexOf(raised === 1 ? 1 : 0) as Dir;
  const a = ((odd + 1) % 4) as Dir;
  const b = ((odd + 3) % 4) as Dir;
  const opposite = ((odd + 2) % 4) as Dir;
  return [[at(a), at(opposite), at(b)], [at(odd), at(a), at(b)]];
}

/** Where a triangle's edges cross `z = level`: two points, or null when it does not. */
function crossings(tri: [Vertex, Vertex, Vertex], level: number): [[number, number], [number, number]] | null {
  const pts: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = tri[i];
    const b = tri[(i + 1) % 3];
    if (a[2] < level !== b[2] < level) {
      const t = (level - a[2]) / (b[2] - a[2]);
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return pts.length === 2 ? [pts[0], pts[1]] : null;
}

/** The plane `z = k + p u + q v` through three vertices. */
function planeOf([P0, P1, P2]: [Vertex, Vertex, Vertex]): [number, number, number] {
  const du1 = P1[0] - P0[0];
  const dv1 = P1[1] - P0[1];
  const dz1 = P1[2] - P0[2];
  const du2 = P2[0] - P0[0];
  const dv2 = P2[1] - P0[1];
  const dz2 = P2[2] - P0[2];
  const det = du1 * dv2 - du2 * dv1;
  const p = (dz1 * dv2 - dz2 * dv1) / det;
  const q = (du1 * dz2 - du2 * dz1) / det;
  return [P0[2] - p * P0[0] - q * P0[1], p, q];
}

/**
 * Along a wall whose top edge runs from height `h0` to `h1` over [0, 1]:
 * the stretch where that edge is above `level`, or null.
 */
function wallSpan(h0: number, h1: number, level: number): [number, number] | null {
  if (h0 <= level && h1 <= level) return null;
  if (h0 > level && h1 > level) return [0, 1];
  const t = (level - h0) / (h1 - h0);
  return h0 > level ? [0, t] : [t, 1];
}

/**
 * A white line from `a` to `b`, drawn by hand: a gentle wave along it and a
 * gap somewhere, so no two are alike. `r` in [0, 1) picks where the gap is.
 */
function wavyLine(a: [number, number], b: [number, number], width: number, alpha: number, r: number): Graphics {
  const g = new Graphics();
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = width * 0.6;
  const gapAt = 0.3 + r * 0.4;
  const gap = 0.12;
  const steps = 16;
  let drawing = false;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inGap = t > gapAt - gap / 2 && t < gapAt + gap / 2;
    const w = Math.sin(t * Math.PI * 3 + r * 6) * amp;
    const x = a[0] + dx * t + nx * w;
    const y = a[1] + dy * t + ny * w;
    if (inGap) {
      drawing = false;
      continue;
    }
    if (!drawing) {
      g.moveTo(x, y);
      drawing = true;
    } else {
      g.lineTo(x, y);
    }
  }
  g.stroke({ color: 0xffffff, width, cap: 'round', join: 'round' });
  g.alpha = alpha;
  return g;
}

/** Lattice (u, v) of corner c: NE, SE, SW, NW. */
const CORNER_UV: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

/**
 * The plane `z = k + p·u + q·v` of a ramp's surface next to one of its sides,
 * in the cell's own lattice. The surface is two triangles, cut between the
 * two corners beside the odd one out (see the sheet generator), so the plane
 * beside an edge is that of the triangle holding the edge.
 */
export function planeBeside(ramp: Ramp, side: Dir): [number, number, number] {
  const h = rampCorners(ramp);
  const raised = h.filter(Boolean).length;
  const i = ((side + 3) % 4) as Dir;
  const j = side;
  let tri: [Dir, Dir, Dir];
  if (raised === 2) {
    // One plane through any three corners.
    tri = [0, 1, 2];
  } else {
    const odd = h.indexOf(raised === 1 ? 1 : 0) as Dir;
    const a = ((odd + 1) % 4) as Dir;
    const b = ((odd + 3) % 4) as Dir;
    const opposite = ((odd + 2) % 4) as Dir;
    tri = i === odd || j === odd ? [odd, a, b] : [a, opposite, b];
  }
  const [P0, P1, P2] = tri.map((c) => [CORNER_UV[c][0], CORNER_UV[c][1], h[c]] as const);
  // Solve z = k + p u + q v through the three points.
  const du1 = P1[0] - P0[0];
  const dv1 = P1[1] - P0[1];
  const dz1 = P1[2] - P0[2];
  const du2 = P2[0] - P0[0];
  const dv2 = P2[1] - P0[1];
  const dz2 = P2[2] - P0[2];
  const det = du1 * dv2 - du2 * dv1;
  const p = (dz1 * dv2 - dz2 * dv1) / det;
  const q = (du1 * dz2 - du2 * dz1) / det;
  const k = P0[2] - p * P0[0] - q * P0[1];
  return [k, p, q];
}

/**
 * Whether the surfaces of `ramp` and its neighbour across `side` (both at the
 * same tier) bend along their shared edge: their planes differ once the
 * neighbour's is expressed in this cell's lattice.
 */
export function foldsAt(ramp: Ramp, neighbour: Ramp, side: Dir): boolean {
  const [k1, p1, q1] = planeBeside(ramp, side);
  const [k2, p2, q2] = planeBeside(neighbour, ((side + 2) % 4) as Dir);
  // The neighbour's lattice is ours shifted one cell along `side`.
  const { dx, dy } = DIR_STEP[side];
  const k2Here = k2 - p2 * dx - q2 * dy;
  return Math.abs(p1 - p2) > 1e-6 || Math.abs(q1 - q2) > 1e-6 || Math.abs(k1 - k2Here) > 1e-6;
}

/**
 * How the land is built. `tiered` is the default and means what the sheet
 * says it means: on the pixel sheet, grass turf over a dirt top block, stone
 * below it, and bare dirt for the beach ring where the land meets the sea; on
 * the smooth sheet, every tier one material through, coloured by its height —
 * sand, then grass, then moss. A material name builds every block from it.
 */
export type IsoGround = 'tiered' | Material;

export interface IsoWorldViewOptions {
  world: IsoWorld;
  tileset: IsoTileset;
  ground?: IsoGround;
  /** Draw the props the world planned. On by default. */
  deco?: boolean;
}

export class IsoWorldView {
  /** Add this to a stage. Its origin is the top-left of the island's box. */
  readonly view = new Container();

  /** Projected size in pixels, for fitting the camera. */
  readonly width: number;
  readonly height: number;

  /** Where cell (0, 0)'s top corner sits inside `view`, at sea-floor height. */
  readonly originX: number;
  readonly originY: number;

  /** Sprites actually drawn, after hidden blocks were skipped. */
  sprites = 0;

  /**
   * The box the LAND occupies inside `view`, sea excluded.
   *
   * What a camera should fit. The grid carries a margin of open sea on every
   * side, and the sea is one flat colour that runs on past the grid anyway, so
   * fitting the whole grid spends a third of the screen on water.
   */
  readonly landBounds = { x: 0, y: 0, width: 0, height: 0 };
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  private readonly layer = new Container();

  /**
   * Decorations by the diagonal of their footprint's last cell. A piece
   * stands at the centre of its footprint, where the footprint's diamond is
   * widest, so its foliage stays inside it at the base and only spreads over
   * the cells behind higher up. Drawn once that diagonal is complete, it
   * stands on every cell it covers and behind anything further forward.
   */
  private readonly decorAfter = new Map<number, { x: number; y: number; prop: Prop }[]>();

  /**
   * The foam's moving lines, one per shore segment: each drifts from the
   * waterline out over the water and fades, on its own phase. See `tick`.
   */
  private readonly ripples: { line: Graphics; dx: number; dy: number; phase: number }[] = [];

  /**
   * How many children the layer held once each cell was built, by cell
   * index: where something standing on that cell goes to be drawn in
   * painter's order — after the cell, before everything in front of it.
   */
  private readonly cellEnd = new Map<number, number>();

  private hopper: Hopper | null = null;
  private lastTick = 0;

  constructor(private readonly options: IsoWorldViewOptions) {
    const { world, tileset } = options;
    const { width: w, height: h } = world;
    const { cell, block } = tileset;

    // Cell (0, 0) is the top corner of the diamond, `h` half-cells right of
    // its left corner. Above it: the tallest column plus a prop standing on it.
    this.originX = h * (block.w / 2);
    this.originY = cell - block.h + (world.tiers + 1) * block.z;
    this.width = (w + h) * (block.w / 2);
    this.height = this.originY + (w + h) * (block.h / 2);

    this.layer.position.set(this.originX, this.originY);
    this.view.addChild(this.layer);

    if (options.deco ?? true) {
      for (const [i, prop] of world.props) {
        if (prop.kind !== 'decor') continue;
        const c = prop.cells ?? 1;
        const x = i % w;
        const y = (i / w) | 0;
        const after = x + y + 2 * (c - 1);
        const list = this.decorAfter.get(after) ?? [];
        list.push({ x, y, prop });
        this.decorAfter.set(after, list);
      }
    }

    const { floor } = tileset.spec;
    for (let s = 0; s <= w + h - 2; s++) {
      for (let x = Math.max(0, s - h + 1); x <= Math.min(s, w - 1); x++) {
        this.buildCell(x, s - x);
        this.cellEnd.set((s - x) * w + x, this.layer.children.length);
      }
      for (const { x, y, prop } of this.decorAfter.get(s) ?? []) {
        const tier = tierAt(world, x, y);
        if (tier > floor) this.plant(x, y, prop, tier * block.z);
      }
    }

    if (this.minX <= this.maxX) {
      Object.assign(this.landBounds, {
        x: this.minX + this.originX,
        y: this.minY + this.originY,
        width: this.maxX - this.minX,
        height: this.maxY - this.minY,
      });
    } else {
      // No land at all: fall back to the whole grid.
      Object.assign(this.landBounds, { x: 0, y: 0, width: this.width, height: this.height });
    }
  }

  destroy(): void {
    // The textures are slices of one shared sheet and outlive this view.
    this.view.destroy({ children: true });
  }

  /**
   * Animate the foam. `seconds` is any monotonic clock; each ripple runs a
   * `FOAM_PERIOD` cycle — out from the shore by `FOAM_REACH` cells while it
   * fades — offset by its own phase so the coast never pulses in step.
   */
  tick(seconds: number): void {
    for (const r of this.ripples) {
      const t = (seconds / FOAM_PERIOD + r.phase) % 1;
      r.line.position.set(r.dx * t, r.dy * t);
      r.line.alpha = FOAM_ALPHA * (1 - t) * Math.min(1, t * 6);
    }
    const dt = this.lastTick ? Math.min(0.1, seconds - this.lastTick) : 0;
    this.lastTick = seconds;
    if (this.hopper) this.hop(this.hopper, dt);
  }

  /**
   * Put a rabbit on the island, hopping from cell to cell over the grass.
   * A test of the world as a place to move in: it lands on cell centres,
   * follows the ramps' surfaces, and is drawn among the tiles at its depth.
   */
  addHopper(texture: Texture): void {
    const { world, tileset } = this.options;
    const start = this.hopperCells().find(() => true);
    if (start === undefined) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.96);
    sprite.scale.set(tileset.cell / SHEET_CELL);
    this.layer.addChild(sprite);
    this.sprites++;
    const x = start % world.width;
    const y = (start / world.width) | 0;
    this.hopper = {
      sprite,
      from: { x, y },
      to: { x, y },
      t: 1,
      wait: HOP_REST,
      rng: mulberry32(seedFrom(`${world.seed}:hopper`)),
    };
    this.placeHopper(this.hopper);
  }

  /** The cells a hopper may land on: grass and moss, off the ramps' feet, with nothing planted. */
  private hopperCells(): number[] {
    const { world, tileset } = this.options;
    const out: number[] = [];
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (this.canLand(x, y)) out.push(y * world.width + x);
      }
    }
    return out;
  }

  private canLand(x: number, y: number): boolean {
    const { world, tileset } = this.options;
    if (tierAt(world, x, y) <= tileset.spec.floor) return false;
    const prop = propAt(world, x, y);
    if (prop?.kind === 'decor') return false;
    // The other cells of a big piece's footprint: north-west of them lies its origin.
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const p = propAt(world, x - dx, y - dy);
        if (p?.kind === 'decor' && (p.cells ?? 1) > 1) return false;
      }
    }
    return true;
  }

  private hop(h: Hopper, dt: number): void {
    const { world } = this.options;
    if (h.t >= 1) {
      h.wait -= dt;
      if (h.wait > 0) return;
      // Pick a neighbour to hop to: never straight back unless cornered.
      const options: { x: number; y: number }[] = [];
      for (const d of DIRS) {
        const nx = h.to.x + DIR_STEP[d].dx;
        const ny = h.to.y + DIR_STEP[d].dy;
        if (this.canLand(nx, ny)) options.push({ x: nx, y: ny });
      }
      const forward = options.filter((o) => o.x !== h.from.x || o.y !== h.from.y);
      const pool = forward.length ? forward : options;
      if (!pool.length) {
        h.wait = HOP_REST;
        return;
      }
      h.from = h.to;
      h.to = pool[Math.floor(h.rng() * pool.length)];
      h.t = 0;
      h.wait = HOP_REST * (0.6 + h.rng() * 0.8);
      // Face the way it goes: right on screen when x grows or y shrinks.
      const sx = (h.to.x - h.from.x) - (h.to.y - h.from.y);
      if (sx) h.sprite.scale.x = Math.abs(h.sprite.scale.x) * (sx > 0 ? 1 : -1);
      void world;
    }
    h.t = Math.min(1, h.t + dt / HOP_TIME);
    this.placeHopper(h);
  }

  private placeHopper(h: Hopper): void {
    const { world, tileset } = this.options;
    const { block } = tileset;
    const t = h.t;
    // Ground height at each cell's centre, in blocks, and the arc between.
    const z0 = this.surfaceZ(h.from.x, h.from.y);
    const z1 = this.surfaceZ(h.to.x, h.to.y);
    const z = z0 + (z1 - z0) * t + HOP_HEIGHT * 4 * t * (1 - t);
    const cx = h.from.x + (h.to.x - h.from.x) * t + 0.5;
    const cy = h.from.y + (h.to.y - h.from.y) * t + 0.5;
    h.sprite.position.set((cx - cy) * (block.w / 2), (cx + cy) * (block.h / 2) - z * block.z);
    // Its depth: the cell furthest forward of the two it is between.
    const cell = h.from.x + h.from.y > h.to.x + h.to.y ? h.from : h.to;
    const at = this.cellEnd.get(cell.y * world.width + cell.x);
    if (at !== undefined) {
      const current = this.layer.getChildIndex(h.sprite);
      const target = Math.min(this.layer.children.length - 1, current < at ? at - 1 : at);
      if (current !== target) this.layer.setChildIndex(h.sprite, target);
    }
  }

  /** The height of the ground at a cell's centre, in blocks above the sea floor. */
  private surfaceZ(x: number, y: number): number {
    const { world } = this.options;
    const tier = tierAt(world, x, y);
    const ramp = rampAt(world, x, y);
    if (!ramp) return tier;
    // The centre lies on both of the ramp's triangles' shared edge or inside
    // one of them; the two planes agree there to within the cut, so either
    // is close enough — take the mean of the two.
    const [a, b] = rampTriangles(ramp).map(planeOf);
    const za = a[0] + a[1] * 0.5 + a[2] * 0.5;
    const zb = b[0] + b[1] * 0.5 + b[2] * 0.5;
    return tier + (za + zb) / 2;
  }

  private buildCell(x: number, y: number): void {
    const { world, tileset } = this.options;
    const { block, spec } = tileset;
    const ground = this.options.ground ?? 'tiered';
    const tier = tierAt(world, x, y);

    if (tier === 0) {
      // The water: on the pixel sheet a surface on the sea bed; on the
      // smooth one a translucent sheet half a block over the floor's plane.
      if (tileset.water) this.place(tileset.water, x, y, spec.floodedFloor ? spec.floor * block.z : 0, false);
      // The sea draws the island's foot: its rims, at floor height, along
      // every edge where land stands — unless the floor is flooded, where
      // that edge lies under the water and the sand's paler tone marks it.
      if (!spec.floodedFloor) this.outline(x, y, 0);
      return;
    }

    const layered = ground === 'tiered' && spec.layered;
    const beach = layered && tier === 1 && touchesSea(world, x, y);
    const east = tierAt(world, x + 1, y);
    const south = tierAt(world, x, y + 1);
    const surface = tier * block.z;
    // Blocks from the floor up. On the floor tier itself there is no block:
    // the cell is a flat tile with nothing under it.
    for (let k = spec.floor; k < tier; k++) {
      const top = k === tier - 1;
      if (!top && east > k && south > k) continue;
      this.place(this.blockMaterial(ground, tier, top).cube, x, y, k * block.z);
    }
    if (tier <= spec.floor) this.place(this.surfaceMaterial(ground, tier).flat, x, y, surface);

    // The turf is thin, so it is laid its own thickness down: its top lands
    // exactly on the surface and its sides cover the top of the dirt block.
    if (layered && !beach) this.place(tileset.materials.grass.turf, x, y, surface - tileset.turfZ);

    const surfaceSet = this.surfaceMaterial(ground, tier);
    const ramp = rampAt(world, x, y);
    if (ramp) {
      // Layered: stairs are cut stone, slopes are the hillside. A flight turned
      // to face the camera has no stairs sprite and becomes a slope — and then
      // it is hillside too, not a grey wedge of stone.
      const rampSet = surfaceSet;
      const stairsSet = layered ? tileset.materials.stone : rampSet;
      const piece =
        ramp.kind === 'stairs'
          ? stairsSet.stairs[ramp.dir]
          : ramp.kind === 'inner'
            ? rampSet.inner?.[ramp.dir]
            : ramp.kind === 'outer'
              ? rampSet.outer?.[ramp.dir]
              : undefined;
      this.place(piece ?? rampSet.slope[ramp.dir], x, y, surface);
    }

    // The floor is flooded: the water sheet over the cell — cut at the
    // waterline on a ramp, whose upper half is then drawn again over it,
    // since on a ramp facing the camera it stands in front of the water.
    // Then the foam, where that waterline is.
    if (spec.floodedFloor && tier === spec.floor && tileset.water && tileset.waterOver && tileset.emerged) {
      if (ramp) {
        const kind = ramp.kind === 'inner' || ramp.kind === 'outer' ? ramp.kind : 'slope';
        this.place(tileset.waterOver[kind][ramp.dir], x, y, surface, false);
        this.place(tileset.emerged[kind][ramp.dir], x, y, surface, false);
        this.foam(x, y, ramp, surface);
      } else {
        this.place(tileset.water, x, y, surface, false);
      }
    }
    this.outline(x, y, tier, ramp);

    const prop = (this.options.deco ?? true) ? propAt(world, x, y) : undefined;
    if (prop) {
      // A sheet without a piece for a prop draws none of that kind.
      const texture =
        prop.kind === 'post'
          ? tileset.post
          : isPatch(prop)
            ? tier > spec.floor
              ? surfaceSet.patch
              : undefined
            : prop.kind === 'decor'
              ? undefined
              : tileset.materials[prop.kind === 'hedge' ? spec.hedge : spec.boulder].block?.[prop.dir];
      if (texture) this.place(texture, x, y, surface);
    }

    this.lace(x, y, tier, ramp);
  }

  /**
   * A decoration whose footprint's north-west cell is `(x, y)`, standing on
   * ground at `elevation`. Its anchor pixel goes on the centre of the
   * footprint, and one scale factor fits every piece: the sheet draws a
   * one-cell base `SHEET_CELL` pixels wide.
   */
  private plant(x: number, y: number, prop: Prop, elevation: number): void {
    const { tileset } = this.options;
    const piece = prop.decor ? tileset.decor?.byName.get(prop.decor) : undefined;
    if (!piece) return;
    const { cell, block } = tileset;
    const c = prop.cells ?? 1;
    const scale = cell / SHEET_CELL;
    const sprite = new Sprite(piece.texture);
    sprite.scale.set(scale);
    // The centre of the footprint's diamond, at the surface.
    const bx = (x - y) * (block.w / 2);
    const by = (x + y + c - 1) * (block.h / 2) + block.h / 2 - elevation;
    sprite.position.set(bx - piece.anchor[0] * scale, by - piece.anchor[1] * scale);
    this.layer.addChild(sprite);
    this.sprites++;
  }

  /**
   * The ink on a cell standing at `tier`: rims along its top edges and
   * corners down its walls, by the rules in the class notes. Nothing on the
   * pixel sheet, which has no outline pieces.
   */
  private outline(x: number, y: number, tier: number, ramp?: Ramp): void {
    const { world, tileset } = this.options;
    const { block, corners, spec } = tileset;
    const rim = this.surfaceMaterial(this.options.ground ?? 'tiered', Math.max(tier, 1)).rim;
    if (!rim || !corners) return;

    const around = DIRS.map((d) => {
      const { dx, dy } = DIR_STEP[d];
      const nx = x + dx;
      const ny = y + dy;
      const n = tierAt(world, nx, ny);
      const climb = rampAt(world, nx, ny);
      // A ramp on the neighbour whose high edge is this edge: the surface
      // simply continues, so no line at this height.
      const joins = climb !== undefined && n === tier - 1 && rampHighSides(climb).includes(((d + 2) % 4) as Dir);
      return { tier: n, joins };
    });

    // The sea has no surface of its own; its rims sit on the floor.
    const surface = Math.max(tier, spec.floor) * block.z;
    if (!ramp) {
      for (const d of DIRS) {
        const { tier: n, joins } = around[d];
        if (joins || n === tier) continue;
        // A flooded floor's edge against the sea lies under the water.
        if (spec.floodedFloor && tier === spec.floor && n === 0) continue;
        const far = d === DIR.N || d === DIR.W;
        if (far || n < tier) this.place(rim[d], x, y, surface);
      }
    } else if (spec.floodedFloor && tier === spec.floor) {
      // A flooded floor ramp's edges against the sea are all under water.
    } else {
      // A ramp's edges against the sea, where nothing else draws the island's
      // outline. Near edges: the rim at the ramp's foot — the base of its
      // wall or wedge, or its flat edge. Far edges: the surface's own edge
      // against the sky — a rim at the foot where it lies flat, a rim one
      // block up where it stands at the tier above, and a drawn line where
      // it slopes, since no sheet piece runs diagonally.
      const h = rampCorners(ramp);
      for (const d of DIRS) {
        if (around[d].tier !== 0) continue;
        const far = d === DIR.N || d === DIR.W;
        const a = h[(d + 3) % 4];
        const b = h[d];
        if (!far || (a === 0 && b === 0)) this.place(rim[d], x, y, surface);
        else if (a === 1 && b === 1) this.place(rim[d], x, y, surface + block.z);
        else this.line(x, y, d, a, b, surface);
      }
    }

    const east = around[DIR.E].tier;
    const south = around[DIR.S].tier;
    const west = around[DIR.W].tier;
    const north = around[DIR.N].tier;
    // A ramp's own block has its edges drawn in the sprite; only the blocks under it get corners.
    const top = ramp ? tier - 1 : tier;
    for (let k = spec.floor; k < top; k++) {
      const z = k * block.z;
      if (east <= k && south <= k) this.place(corners.front, x, y, z);
      if (south <= k && west <= k) this.place(corners.left, x, y, z);
      if (east <= k && north <= k) this.place(corners.right, x, y, z);
    }
  }

  /**
   * The lace: a colour spilling over a neighbouring cell along their shared
   * edge, with a scalloped outline — the reference's plateaus over the ground
   * at their foot, and its patches of grass over the turf around them.
   *
   * A ramp is painted the colour of its own tier, and the plateau it climbs
   * to spills its colour over the top of the ramp, along the ramp's high
   * edge. A patch spills its own colour over the flat cells around it.
   *
   * The piece hangs INSIDE the cell spilled onto, so it must be drawn after
   * that cell's own surface. Painter's order draws a cell after its north and
   * west neighbours and before its south and east ones, so each cell settles
   * the two edges it shares with the earlier pair — in either direction —
   * and leaves the other two to the later pair.
   */
  private lace(x: number, y: number, tier: number, ramp: Ramp | undefined): void {
    const { world, tileset } = this.options;
    const { block, spec } = tileset;
    const ground = this.options.ground ?? 'tiered';
    if (!this.surfaceMaterial(ground, tier).fringe) return;
    const deco = this.options.deco ?? true;
    const patch = deco && isPatch(propAt(world, x, y)) && tier > spec.floor;
    const surface = tier * block.z;

    // An outer corner touches the plateau at one point: the lace wraps it,
    // laid on the corner's slope, so the piece stands on the ramp's base.
    if (ramp?.kind === 'outer') {
      this.place(this.surfaceMaterial(ground, tier + 1).laceCap![ramp.dir], x, y, surface);
    }

    for (const d of [DIR.N, DIR.W] as const) {
      const { dx, dy } = DIR_STEP[d];
      const nx = x + dx;
      const ny = y + dy;
      const n = tierAt(world, nx, ny);
      const nRamp = rampAt(world, nx, ny);
      const back = ((d + 2) % 4) as Dir;

      // The tier above spills over a ramp's high edge — whether that tier is
      // flat there or itself climbing on toward the next.
      if (ramp && n === tier + 1 && rampHighSides(ramp).includes(d)) {
        this.laceOver(this.surfaceMaterial(ground, n), ramp, d, x, y, surface);
        continue;
      }
      if (nRamp && n === tier - 1 && rampHighSides(nRamp).includes(back)) {
        this.laceOver(this.surfaceMaterial(ground, tier), nRamp, back, nx, ny, surface - block.z);
        continue;
      }

      if (n !== tier) continue;
      // A ridge: a sloped edge between two ramps whose surfaces bend there,
      // drawn only when it runs DOWN toward the camera — its raised end is
      // this cell's north-west corner. The edges that leave the same point
      // toward the back read as the far side of the hill, and stay bare.
      if (ramp && nRamp) {
        const h = rampCorners(ramp);
        const a = h[(d + 3) % 4];
        const b = h[d];
        if (a !== b && h[3] === 1 && foldsAt(ramp, nRamp, d)) {
          // On a flooded floor the ridge's foot is under the water: only
          // the part above the waterline is drawn.
          const folds =
            spec.floodedFloor && tier === spec.floor && tileset.emergedFold
              ? tileset.emergedFold
              : this.surfaceMaterial(ground, tier).fold!;
          this.place(folds[d][a ? 0 : 1], x, y, surface);
          continue;
        }
      }
      // Same tier as this cell, so the floor rule is the same.
      const nPatch = deco && isPatch(propAt(world, nx, ny)) && tier > spec.floor;
      if (nPatch && !patch) {
        // This cell's grid line straddles the shared edge, half of it over
        // the patch: lay the patch again on top, then its lace over here.
        this.place(this.surfaceMaterial(ground, tier).patch!, nx, ny, surface);
        this.place(this.surfaceMaterial(ground, tier).patchFringe![d], x, y, surface);
      } else if (patch && !nPatch) {
        this.place(this.surfaceMaterial(ground, tier).patchFringe![back], nx, ny, surface);
      }
    }
  }

  /**
   * The lace of `material` over ramp cell `(x, y)` along its high side `d`,
   * `base` being the ramp's own surface height. Down a straight slope the
   * lace follows the hillside; an inner corner is flat where the lace hangs,
   * so its lace lies in the plane of the tier above.
   */
  private laceOver(material: MaterialTiles, ramp: Ramp, d: Dir, x: number, y: number, base: number): void {
    const { block } = this.options.tileset;
    if (ramp.kind === 'slope' || ramp.kind === 'stairs') this.place(material.slopeFringe![d], x, y, base);
    else this.place(material.fringe![d], x, y, base + block.z);
  }

  /**
   * Foam along the waterline of a flooded floor ramp: white lines where the
   * water meets the sand, on the ramp's surface, and along its south or
   * east wall where that wall stands in the water. Each segment gets a line
   * that stays and one that drifts out and fades (see `tick`).
   */
  private foam(x: number, y: number, ramp: Ramp, elevation: number): void {
    const { world, tileset } = this.options;
    const { cell, block, spec } = tileset;
    const level = WATER_LEVEL;
    const segments: WaterlineSegment[] = [];

    for (const tri of rampTriangles(ramp)) {
      const cut = crossings(tri, level);
      if (!cut) continue;
      const [k, p, q] = planeOf(tri);
      void k;
      // Outward is downhill: against the surface's gradient.
      const n = Math.hypot(p, q) || 1;
      segments.push({ a: cut[0], b: cut[1], out: [-p / n, -q / n] });
    }

    // The walls: the south face (v = 1) borders (x, y + 1), the east (u = 1)
    // borders (x + 1, y). Only where that neighbour is open water — the sea
    // or flat flooded sand — does the wall stand in it. Its waterline runs
    // wherever the face's top edge is above the level.
    const h = rampCorners(ramp);
    const waterAt = (nx: number, ny: number) => {
      const t = tierAt(world, nx, ny);
      return t === 0 || (t === spec.floor && !rampAt(world, nx, ny));
    };
    if (waterAt(x, y + 1)) {
      const span = wallSpan(h[2], h[1], level); // SW -> SE along v = 1
      if (span) segments.push({ a: [span[0], 1], b: [span[1], 1], out: [0, 1] });
    }
    if (waterAt(x + 1, y)) {
      const span = wallSpan(h[0], h[1], level); // NE -> SE along u = 1
      if (span) segments.push({ a: [1, span[0]], b: [1, span[1]], out: [1, 0] });
    }

    const cx = (x - y) * (block.w / 2);
    const cy = (x + y) * (block.h / 2) - elevation - level * block.z;
    const toScreen = ([u, v]: readonly [number, number]): [number, number] => [
      cx + (u - v) * (block.w / 2),
      cy + (u + v) * (block.h / 2),
    ];
    const width = (cell * FOAM_WIDTH) / 128;
    const seed = seedFrom(`${world.seed}:foam:${x},${y}`);
    let s = 0;
    for (const seg of segments) {
      const a = toScreen(seg.a);
      const b = toScreen(seg.b);
      const [ox, oy] = [(seg.out[0] - seg.out[1]) * (block.w / 2), (seg.out[0] + seg.out[1]) * (block.h / 2)];
      const on = mulberry32(seed + s++);
      // The still line at the shore, and the one that drifts.
      this.layer.addChild(wavyLine(a, b, width, FOAM_ALPHA, on()));
      const ripple = wavyLine(a, b, width * 0.9, FOAM_ALPHA, on());
      this.layer.addChild(ripple);
      this.ripples.push({ line: ripple, dx: ox * FOAM_REACH, dy: oy * FOAM_REACH, phase: on() });
      this.sprites += 2;
    }
  }

  /**
   * The ink along a sloped edge of cell `(x, y)`: side `d`, from its first
   * corner (clockwise) `a` blocks up to its second `b`, above `elevation`.
   * Drawn rather than placed, since the sheet has no diagonal rim; same
   * colour and weight as the rim pieces.
   */
  private line(x: number, y: number, d: Dir, a: number, b: number, elevation: number): void {
    const { cell, block } = this.options.tileset;
    // Side d runs from corner d - 1 to corner d; corners NE SE SW NW sit at
    // the cell's right, bottom, left and top points.
    const point = (c: number, z: number): [number, number] => {
      const cx = (x - y) * (block.w / 2);
      const cy = (x + y) * (block.h / 2) - elevation - z * block.z;
      const at = [
        [cx + block.w / 2, cy + block.h / 2],
        [cx, cy + block.h],
        [cx - block.w / 2, cy + block.h / 2],
        [cx, cy],
      ][c] as [number, number];
      return at;
    };
    const from = point((d + 3) % 4, a);
    const to = point(d, b);
    const g = new Graphics();
    g.moveTo(from[0], from[1]).lineTo(to[0], to[1]).stroke({ color: INK, width: (cell * 4.6) / 128, cap: 'round' });
    this.layer.addChild(g);
    this.sprites++;
  }

  /** The material of the block at height `k` of a column standing at `tier`. */
  private blockMaterial(ground: IsoGround, tier: number, top: boolean): MaterialTiles {
    const { materials, spec } = this.options.tileset;
    if (ground !== 'tiered') return materials[ground];
    if (spec.layered) return top ? materials.dirt : materials.stone;
    return this.surfaceMaterial(ground, tier);
  }

  /** What the walkable surface of a cell at `tier` is made of. */
  private surfaceMaterial(ground: IsoGround, tier: number): MaterialTiles {
    const { materials, spec } = this.options.tileset;
    if (ground !== 'tiered') return materials[ground];
    if (spec.layered) return materials.grass;
    return materials[spec.tiers[Math.min(tier, spec.tiers.length) - 1]];
  }

  /**
   * One sheet cell on cell `(x, y)`, its base `elevation` pixels above the
   * sea floor.
   *
   * Every sprite in the sheet has its base diamond's top corner at
   * (cell / 2, cell / 2) of its cell, so placing that point on the cell's
   * projected top corner is the whole rule, for every piece.
   */
  private place(texture: Texture, x: number, y: number, elevation: number, land = true): void {
    const { cell, block } = this.options.tileset;
    const sprite = new Sprite(texture);
    const sx = (x - y) * (block.w / 2) - cell / 2;
    const sy = (x + y) * (block.h / 2) - elevation - (cell - block.h);
    sprite.position.set(sx, sy);
    this.layer.addChild(sprite);
    this.sprites++;
    if (land) {
      this.minX = Math.min(this.minX, sx);
      this.minY = Math.min(this.minY, sy);
      this.maxX = Math.max(this.maxX, sx + cell);
      this.maxY = Math.max(this.maxY, sy + cell);
    }
  }
}
