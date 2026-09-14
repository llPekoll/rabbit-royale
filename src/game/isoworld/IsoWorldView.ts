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
import type { IsoTileset, Material, MaterialTiles } from './sheet';
import {
  DIR,
  DIR_STEP,
  propAt,
  rampAt,
  rampCorners,
  rampHighSides,
  tierAt,
  touchesSea,
  type Dir,
  type IsoWorld,
  type Ramp,
} from './terrain';

const DIRS: readonly Dir[] = [DIR.N, DIR.E, DIR.S, DIR.W];

/** The outline colour of the smooth sheet, for the one line the sheet cannot carry. */
const INK = 0x3a6c3e;

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

    for (let s = 0; s <= w + h - 2; s++) {
      for (let x = Math.max(0, s - h + 1); x <= Math.min(s, w - 1); x++) this.buildCell(x, s - x);
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

  private buildCell(x: number, y: number): void {
    const { world, tileset } = this.options;
    const { block, spec } = tileset;
    const ground = this.options.ground ?? 'tiered';
    const tier = tierAt(world, x, y);

    if (tier === 0) {
      if (tileset.water) this.place(tileset.water, x, y, 0, false);
      // The sea draws the island's foot: its rims, at floor height, along
      // every edge where land stands.
      this.outline(x, y, 0);
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
    this.outline(x, y, tier, ramp);

    const prop = (this.options.deco ?? true) ? propAt(world, x, y) : undefined;
    if (prop) {
      // A sheet without a piece for a prop draws none of that kind.
      const texture =
        prop.kind === 'post'
          ? tileset.post
          : prop.kind === 'patch'
            ? tier > spec.floor
              ? surfaceSet.patch
              : undefined
            : tileset.materials[prop.kind === 'hedge' ? spec.hedge : spec.boulder].block?.[prop.dir];
      if (texture) this.place(texture, x, y, surface);
    }

    this.lace(x, y, tier, ramp);
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
        const far = d === DIR.N || d === DIR.W;
        if (far || n < tier) this.place(rim[d], x, y, surface);
      }
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
    const patch = deco && propAt(world, x, y)?.kind === 'patch' && tier > spec.floor;
    const surface = tier * block.z;

    // An outer corner touches the plateau at one point: the lace wraps it.
    if (ramp?.kind === 'outer') {
      this.place(this.surfaceMaterial(ground, tier + 1).laceCap![ramp.dir], x, y, surface + block.z);
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
        this.place(this.surfaceMaterial(ground, n).fringe![d], x, y, surface + block.z);
        continue;
      }
      if (nRamp && n === tier - 1 && rampHighSides(nRamp).includes(back)) {
        this.place(this.surfaceMaterial(ground, tier).fringe![back], nx, ny, surface);
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
          this.place(tileset.corners!.fold[d][a ? 0 : 1], x, y, surface);
          continue;
        }
      }
      // Same tier as this cell, so the floor rule is the same.
      const nPatch = deco && propAt(world, nx, ny)?.kind === 'patch' && tier > spec.floor;
      if (nPatch && !patch) {
        this.place(this.surfaceMaterial(ground, tier).patchFringe![d], x, y, surface);
      } else if (patch && !nPatch) {
        this.place(this.surfaceMaterial(ground, tier).patchFringe![back], nx, ny, surface);
      }
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
