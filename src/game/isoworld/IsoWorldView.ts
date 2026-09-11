/**
 * An `IsoWorld` drawn as stacked blocks from the isometric sandbox sheet.
 *
 * Unlike `IsoIslandView`, which shears top-down tiles into diamonds, this art
 * is already isometric, so nothing is transformed: every sprite is one sheet
 * cell placed on the lattice, unscaled and pixel-exact.
 *
 * ## A cell is a column
 *
 * A land cell at tier `t` is `t` blocks stacked from the sea floor, then
 * whatever stands on top — turf, a ramp, a prop. Water is a single surface at
 * `WATER_Z`, drawn opaque, so it covers the foot of any land block behind it
 * and the coast gets a waterline for free.
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
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { BLOCK, CELL, TURF_Z, type IsoTileset, type Material, type MaterialTiles } from './sheet';
import { propAt, rampAt, tierAt, touchesSea, type IsoWorld } from './terrain';

/**
 * How the land is built. `tiered` is the default: grass turf over a dirt top
 * block, stone below it, and bare dirt for the beach ring where the land meets
 * the sea. The other three build every block from one material.
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
    const { world } = options;
    const { width: w, height: h } = world;

    // Cell (0, 0) is the top corner of the diamond, `h` half-cells right of
    // its left corner. Above it: the tallest column plus a prop standing on it.
    this.originX = h * (BLOCK.w / 2);
    this.originY = CELL - BLOCK.h + (world.tiers + 1) * BLOCK.z;
    this.width = (w + h) * (BLOCK.w / 2);
    this.height = this.originY + (w + h) * (BLOCK.h / 2);

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
    const ground = this.options.ground ?? 'tiered';
    const tier = tierAt(world, x, y);

    if (tier === 0) {
      this.place(tileset.water, x, y, 0, false);
      return;
    }

    const beach = ground === 'tiered' && tier === 1 && touchesSea(world, x, y);
    const east = tierAt(world, x + 1, y);
    const south = tierAt(world, x, y + 1);
    for (let k = 0; k < tier; k++) {
      const top = k === tier - 1;
      if (!top && east > k && south > k) continue;
      this.place(this.blockMaterial(ground, top).cube, x, y, k * BLOCK.z);
    }

    const surface = tier * BLOCK.z;
    // The turf is 4px thick, so it is laid 4px down: its top lands exactly on
    // the surface and its sides cover the top of the dirt block below.
    if (ground === 'tiered' && !beach) this.place(tileset.materials.grass.turf, x, y, surface - TURF_Z);

    const ramp = rampAt(world, x, y);
    if (ramp) {
      // Tiered: stairs are cut stone, slopes are the hillside. A flight turned
      // to face the camera has no stairs sprite and becomes a slope — and then
      // it is hillside too, not a grey wedge of stone.
      const stairsSet = tileset.materials[ground === 'tiered' ? 'stone' : ground];
      const slopeSet = tileset.materials[ground === 'tiered' ? 'grass' : ground];
      const stairs = ramp.kind === 'stairs' ? stairsSet.stairs[ramp.dir] : undefined;
      this.place(stairs ?? slopeSet.slope[ramp.dir], x, y, surface);
    }

    const prop = (this.options.deco ?? true) ? propAt(world, x, y) : undefined;
    if (prop) {
      const texture =
        prop.kind === 'post'
          ? tileset.post
          : tileset.materials[prop.kind === 'hedge' ? 'grass' : 'stone'].block[prop.dir];
      this.place(texture, x, y, surface);
    }
  }

  private blockMaterial(ground: IsoGround, top: boolean): MaterialTiles {
    const { materials } = this.options.tileset;
    if (ground !== 'tiered') return materials[ground];
    return top ? materials.dirt : materials.stone;
  }

  /**
   * One sheet cell on cell `(x, y)`, its base `elevation` pixels above the
   * sea floor.
   *
   * Every sprite in the sheet has its base diamond's top corner at
   * (16, 16) of its cell, so placing that point on the cell's projected top
   * corner is the whole rule, for every piece.
   */
  private place(texture: Texture, x: number, y: number, elevation: number, land = true): void {
    const sprite = new Sprite(texture);
    const sx = (x - y) * (BLOCK.w / 2) - CELL / 2;
    const sy = (x + y) * (BLOCK.h / 2) - elevation - (CELL - BLOCK.h);
    sprite.position.set(sx, sy);
    this.layer.addChild(sprite);
    this.sprites++;
    if (land) {
      this.minX = Math.min(this.minX, sx);
      this.minY = Math.min(this.minY, sy);
      this.maxX = Math.max(this.maxX, sx + CELL);
      this.maxY = Math.max(this.maxY, sy + CELL);
    }
  }
}
