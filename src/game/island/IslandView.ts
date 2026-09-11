/**
 * Draws an `IslandMap` with the Tiny Swords terrain sheets.
 *
 * Four layers, in the order the eye reads them:
 *
 *   sea     one tiling sprite of open water
 *   foam    froth under every shore tile, all shore tiles on the same frame
 *   ground  the tiers, painted from the bottom up
 *   deco    trees, props and rocks, sorted by their feet
 *
 * The ground layer is where the pack's design shows through. A tier above sea
 * level is drawn TWICE: once as rock from the elevation sheet, then again as
 * grass laid over it. The grass tiles have rounded, transparent corners, so a
 * thin rim of the rock survives around their edge as the plateau's lip. The
 * cliff FACE is a third tile, drawn one cell further down, standing on whatever
 * is below it.
 *
 * Each tier takes its grass from a DIFFERENT palette. That is not decoration:
 * a cliff face is only drawn on a shelf's southern edge, so without a colour
 * shift the other three sides of every plateau dissolve into the ground they
 * stand on, and a terraced island reads as a flat one with walls lying on it.
 *
 * Sea-level ground skips the rock pass entirely, which is what lets a beach
 * meet the water with nothing but foam between them.
 */
import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { blobCol, blobRow, edgeMask, ELEVATION_SURFACE_ROW, elevationWallRow } from './autotile';
import { atOrAbove, levelAt, type IslandMap } from './generate';
import { TILE, type FootSprite, type GroundKind, type IslandTileset } from './tileset';

export interface IslandViewOptions {
  map: IslandMap;
  tileset: IslandTileset;
  /**
   * How the ground is coloured. `tiered` (the default) gives each level its own
   * grass palette, which is what the pack's key art does and the only thing
   * that keeps a plateau's outline readable away from its cliff face. `grass`
   * or `sand` paints every level from one flat set instead.
   */
  ground?: 'tiered' | GroundKind;
  /** Scatter trees, props and sea rocks. On by default. */
  deco?: boolean;
  /** Milliseconds per foam and sway frame. */
  frameMs?: number;
}

/** Cells per second the shoreline froth and the trees animate at. */
const DEFAULT_FRAME_MS = 130;

/** Share of eligible cells that grow a tree, and that get a loose prop. */
const TREE_CHANCE = 0.08;
const PROP_CHANCE = 0.11;
const SEA_ROCK_CHANCE = 0.025;

/**
 * The last three props are a skull marker, a signpost and a scarecrow: they
 * read as PLACED, and scattering them at the same rate as mushrooms makes an
 * island look signposted by nobody. The first fifteen are scenery.
 */
const NATURAL_PROPS = 15;
const LANDMARK_CHANCE = 0.08;

/** Props stand a quarter-tile below the centre, so they read as ON the tile. */
const FOOT_OFFSET = TILE * 0.25;

/**
 * The wind that crosses this island, as in `IsoIslandView` — see the long note
 * there. Vegetation takes its sway phase from how far downwind its cell lies,
 * so the gust travels tree by tree instead of the whole field turning at once.
 */
const WIND = { x: 1, y: 0.6 };
const WIND_TILES_PER_FRAME = 1.7;
const windPhase = (x: number, y: number) => (x * WIND.x + y * WIND.y) / WIND_TILES_PER_FRAME;

interface AnimatedProp {
  sprite: Sprite;
  frames: Texture[];
  /**
   * Frames of head start, fractional, so a field of trees does not sway as one
   * organism — and, being fractional, does not change texture on one tick.
   */
  phase: number;
}

export class IslandView {
  /** Add this to a stage. Its origin is the map's top-left corner. */
  readonly view = new Container();

  /** Map size in pixels, for centring or fitting the camera. */
  readonly width: number;
  readonly height: number;

  private readonly foam: Sprite[] = [];
  private readonly animated: AnimatedProp[] = [];
  private readonly foamFrames: Texture[];
  private readonly frameMs: number;
  private elapsed = 0;
  private destroyed = false;

  constructor(private readonly options: IslandViewOptions) {
    const { map, tileset } = options;
    this.width = map.width * TILE;
    this.height = map.height * TILE;
    this.foamFrames = tileset.foam;
    this.frameMs = options.frameMs ?? DEFAULT_FRAME_MS;

    const sea = new TilingSprite({ texture: tileset.water, width: this.width, height: this.height });
    this.view.addChild(sea);

    const foamLayer = new Container();
    const groundLayer = new Container();
    const decoLayer = new Container();
    this.view.addChild(foamLayer, groundLayer, decoLayer);

    this.buildFoam(foamLayer);
    this.buildGround(groundLayer);
    if (options.deco ?? true) this.buildDeco(decoLayer);
  }

  /** Advance the foam and the sway. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.elapsed += deltaMs;
    const step = Math.floor(this.elapsed / this.frameMs);

    const foamFrame = this.foamFrames[step % this.foamFrames.length];
    for (const sprite of this.foam) sprite.texture = foamFrame;

    // Each prop is sampled on its own clock: flooring after the phase is added
    // is what keeps the field off a single shared tick.
    const t = this.elapsed / this.frameMs;
    for (const item of this.animated) {
      const n = item.frames.length;
      item.sprite.texture = item.frames[((Math.floor(t + item.phase) % n) + n) % n];
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.foam.length = 0;
    this.animated.length = 0;
    // The textures are slices of shared sheets and outlive this view: tearing
    // down their sources here would blank the next island built from the cache.
    this.view.destroy({ children: true });
  }

  /**
   * Froth under every land cell that can see open water, including diagonally.
   *
   * Drawn UNDER the ground rather than around it: each frame is a filled
   * 192px square whose fringe is the only part that escapes the land tile on
   * top, which is how neighbouring shore tiles share one continuous rim
   * instead of stamping a ring each.
   */
  private buildFoam(layer: Container): void {
    const { map } = this.options;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (levelAt(map, x, y) < 1) continue;
        if (!touchesSea(map, x, y)) continue;
        const sprite = new Sprite(this.foamFrames[0]);
        sprite.anchor.set(0.5);
        sprite.position.set((x + 0.5) * TILE, (y + 0.5) * TILE);
        layer.addChild(sprite);
        this.foam.push(sprite);
      }
    }
  }

  private buildGround(layer: Container): void {
    const { map, tileset } = this.options;
    const ground = this.options.ground ?? 'tiered';

    for (let tier = 1; tier <= map.tiers; tier++) {
      const inTier = atOrAbove(map, tier);
      // Palettes run out before tiers do on a tall island; the top ones share
      // the last one rather than wrapping back to the colour of sea level.
      const flat =
        ground === 'tiered'
          ? tileset.tierGrass[Math.min(tier - 1, tileset.tierGrass.length - 1)]
          : tileset.flat[ground];

      if (tier > 1) {
        // The rock shelf, and the face that holds it up.
        this.paint(layer, inTier, (mask) => tileset.elevation[ELEVATION_SURFACE_ROW[blobRow(mask)]][blobCol(mask)]);

        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            if (!inTier(x, y) || inTier(x, y + 1)) continue;
            if (y + 1 >= map.height) continue;
            const mask = edgeMask(inTier, x, y);
            const row = elevationWallRow(!mask.n);
            const wall = new Sprite(tileset.elevation[row][blobCol(mask)]);
            wall.position.set(x * TILE, (y + 1) * TILE);
            layer.addChild(wall);
          }
        }
      }

      // Grass over the top, its rounded corners leaving the rock rim showing.
      this.paint(layer, inTier, (mask) => flat[blobRow(mask)][blobCol(mask)]);
    }
  }

  /** Stamp one autotiled pass of a region into `layer`. */
  private paint(
    layer: Container,
    inRegion: (x: number, y: number) => boolean,
    pick: (mask: ReturnType<typeof edgeMask>) => Texture,
  ): void {
    const { map } = this.options;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!inRegion(x, y)) continue;
        const sprite = new Sprite(pick(edgeMask(inRegion, x, y)));
        sprite.position.set(x * TILE, y * TILE);
        layer.addChild(sprite);
      }
    }
  }

  /**
   * Scatter the loose things.
   *
   * A tree is tall enough to hang over a cliff it stands near, so trees are
   * kept to cells whose four neighbours share their tier. Props are smaller and
   * only have one place they must not go: a cell that RECEIVES a cliff face
   * from the tier above, where a mushroom would end up growing out of the rock.
   *
   * Everything is sorted by its foot before being added, so a tree lower on the
   * map overlaps the one behind it rather than the other way round.
   */
  private buildDeco(layer: Container): void {
    const { map, tileset } = this.options;
    const rng = mulberry32(seedFrom(`${map.seed}:deco`));
    const placed: Array<{ sprite: Sprite; footY: number; frames?: Texture[]; phase?: number }> = [];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tier = levelAt(map, x, y);
        const footY = (y + 0.5) * TILE + FOOT_OFFSET;

        if (tier === 0) {
          if (touchesLand(map, x, y) || rng() > SEA_ROCK_CHANCE) continue;
          const frames = tileset.seaRocks[Math.floor(rng() * tileset.seaRocks.length)];
          const sprite = new Sprite(frames[0]);
          sprite.anchor.set(0.5);
          sprite.position.set((x + 0.5) * TILE, (y + 0.5) * TILE);
          placed.push({ sprite, footY, frames, phase: windPhase(x, y) });
          continue;
        }

        if (underCliff(map, x, y, tier)) continue;
        // One roll decides both, so a tree turned down for standing too near an
        // edge falls through to the prop branch rather than leaving a bare cell.
        // Edges end up bushy instead of wooded, which is what a coast looks like.
        const roll = rng();
        if (roll < TREE_CHANCE && isInterior(map, x, y, tier)) {
          const tree = tileset.trees[Math.floor(rng() * tileset.trees.length)];
          const sprite = this.footSprite(
            { texture: tree.frames[0], anchorY: tree.anchorY },
            x,
            y,
          );
          placed.push({ sprite, footY, frames: tree.frames, phase: windPhase(x, y) });
        } else if (roll < TREE_CHANCE + PROP_CHANCE) {
          const pool =
            rng() < LANDMARK_CHANCE
              ? tileset.props.slice(NATURAL_PROPS)
              : tileset.props.slice(0, NATURAL_PROPS);
          const prop = pool[Math.floor(rng() * pool.length)];
          placed.push({ sprite: this.footSprite(prop, x, y), footY });
        }
      }
    }

    placed.sort((a, b) => a.footY - b.footY);
    for (const item of placed) {
      layer.addChild(item.sprite);
      if (item.frames) {
        this.animated.push({ sprite: item.sprite, frames: item.frames, phase: item.phase ?? 0 });
      }
    }
  }

  private footSprite(prop: FootSprite, x: number, y: number): Sprite {
    const sprite = new Sprite(prop.texture);
    sprite.anchor.set(0.5, prop.anchorY);
    sprite.position.set((x + 0.5) * TILE, (y + 0.5) * TILE + FOOT_OFFSET);
    return sprite;
  }
}

const NEIGHBOURS_8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

function touchesSea(map: IslandMap, x: number, y: number): boolean {
  return NEIGHBOURS_8.some(([dx, dy]) => levelAt(map, x + dx, y + dy) === 0);
}

function touchesLand(map: IslandMap, x: number, y: number): boolean {
  return NEIGHBOURS_8.some(([dx, dy]) => levelAt(map, x + dx, y + dy) > 0);
}

/** True when the cell above is higher, so a cliff face is drawn over this one. */
function underCliff(map: IslandMap, x: number, y: number, tier: number): boolean {
  return levelAt(map, x, y - 1) > tier;
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
