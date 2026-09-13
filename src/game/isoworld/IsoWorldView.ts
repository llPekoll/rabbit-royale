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
import { Container, Sprite, type Texture } from 'pixi.js';
import type { IsoTileset, Material, MaterialTiles } from './sheet';
import { DIR, DIR_STEP, propAt, rampAt, rampHighSides, tierAt, touchesSea, type Dir, type IsoWorld } from './terrain';

const DIRS: readonly Dir[] = [DIR.N, DIR.E, DIR.S, DIR.W];

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
      this.outline(x, y, 0);
      return;
    }

    const layered = ground === 'tiered' && spec.layered;
    const beach = layered && tier === 1 && touchesSea(world, x, y);
    const east = tierAt(world, x + 1, y);
    const south = tierAt(world, x, y + 1);
    for (let k = 0; k < tier; k++) {
      const top = k === tier - 1;
      if (!top && east > k && south > k) continue;
      this.place(this.blockMaterial(ground, tier, top).cube, x, y, k * block.z);
    }

    const surface = tier * block.z;
    // The turf is thin, so it is laid its own thickness down: its top lands
    // exactly on the surface and its sides cover the top of the dirt block.
    if (layered && !beach) this.place(tileset.materials.grass.turf, x, y, surface - tileset.turfZ);

    const surfaceSet = this.surfaceMaterial(ground, tier);
    const ramp = rampAt(world, x, y);
    if (ramp) {
      // Layered: stairs are cut stone, slopes are the hillside. A flight turned
      // to face the camera has no stairs sprite and becomes a slope — and then
      // it is hillside too, not a grey wedge of stone.
      const stairsSet = layered ? tileset.materials.stone : surfaceSet;
      const piece =
        ramp.kind === 'stairs'
          ? stairsSet.stairs[ramp.dir]
          : ramp.kind === 'inner'
            ? surfaceSet.inner?.[ramp.dir]
            : ramp.kind === 'outer'
              ? surfaceSet.outer?.[ramp.dir]
              : undefined;
      this.place(piece ?? surfaceSet.slope[ramp.dir], x, y, surface);
    }
    this.outline(x, y, tier, ramp !== undefined);

    const prop = (this.options.deco ?? true) ? propAt(world, x, y) : undefined;
    if (prop) {
      // A sheet without prop pieces draws none; the smooth sheet is terrain only.
      const texture =
        prop.kind === 'post'
          ? tileset.post
          : tileset.materials[prop.kind === 'hedge' ? spec.hedge : spec.boulder].block?.[prop.dir];
      if (texture) this.place(texture, x, y, surface);
    }
  }

  /**
   * The ink on a cell standing at `tier`: rims along its top edges and
   * corners down its walls, by the rules in the class notes. Nothing on the
   * pixel sheet, which has no outline pieces.
   */
  private outline(x: number, y: number, tier: number, ramp = false): void {
    const { world, tileset } = this.options;
    const { block, corners } = tileset;
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

    const surface = tier * block.z;
    if (!ramp) {
      for (const d of DIRS) {
        const { tier: n, joins } = around[d];
        if (joins || n === tier) continue;
        const far = d === DIR.N || d === DIR.W;
        if (far || n < tier) this.place(rim[d], x, y, surface);
      }
    }

    const east = around[DIR.E].tier;
    const south = around[DIR.S].tier;
    const west = around[DIR.W].tier;
    const north = around[DIR.N].tier;
    // A ramp's own block has its edges drawn in the sprite; only the blocks under it get corners.
    const top = ramp ? tier - 1 : tier;
    for (let k = 0; k < top; k++) {
      const z = k * block.z;
      if (east <= k && south <= k) this.place(corners.front, x, y, z);
      if (south <= k && west <= k) this.place(corners.left, x, y, z);
      if (east <= k && north <= k) this.place(corners.right, x, y, z);
    }
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
