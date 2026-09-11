/**
 * The same `IslandMap`, the same sheets, drawn isometrically — with volume.
 *
 * `IslandView` paints the map top-down: cell (x, y) goes to (x*64, y*64) and a
 * plateau is legible only because each tier takes a different grass palette.
 * This one projects the grid into diamonds instead (see `iso.ts`) and gets its
 * depth from geometry rather than from colour.
 *
 * ## The column, which is the whole point
 *
 * Lifting a plateau tile by `tier * z` and stopping there does not read as
 * raised — it reads as a shape hovering over a hole, because the lift opens a
 * gap underneath and nothing fills it. So a raised cell is not one sprite, it
 * is a STACK:
 *
 *     surface        the grass, at the cell's own tier
 *     face, face...  the cliff repeated down the gap to the ground below
 *
 * How far down is not a constant: it is the drop to the LOWEST neighbour the
 * viewer can see past, which is the south and east sides on this projection.
 * A shelf standing on another shelf shows one tier of rock; the same shelf
 * where it meets the sea shows all of them.
 *
 * ## Draw order
 *
 * Painter's algorithm along `x + y` — the diagonal running away from the
 * camera — with height breaking ties. Every sprite goes into one flat
 * container sorted by `isoDepth`, rather than into per-layer containers, since
 * a tree on a low cell must be able to come out in front of a cliff behind it
 * and no stack of layers can express that.
 */
import { Container, Matrix, Sprite, type Texture } from 'pixi.js';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { blobCol, blobRow, edgeMask, ELEVATION_SURFACE_ROW } from './autotile';
import { atOrAbove, levelAt, type IslandMap } from './generate';
import { columnFaces, isoBounds, isoDepth, isoProject, ISO_TILE, type IsoMetrics } from './iso';
import type { Occupant, OccupantKind } from './board';
import type { Placement } from './terrain';
import { blocksCell, fadeAlpha } from './blocking';
import { TILE, type FootSprite, type GroundKind, type IslandTileset, type UnitKind } from './tileset';

export interface IsoIslandViewOptions {
  map: IslandMap;
  tileset: IslandTileset;
  /** Diamond and lift sizes. Defaults to the classic 2:1 `ISO_TILE`. */
  metrics?: Partial<IsoMetrics>;
  /**
   * How the ground is coloured. `tiered` (the default) still gives each level
   * its own grass palette — the geometry already separates the tiers here, so
   * this is no longer load-bearing, but it keeps the terraces legible in a
   * screenshot. `grass` or `sand` paints every level from one flat set.
   */
  ground?: 'tiered' | GroundKind;
  /** Scatter trees, props and sea rocks. On by default. */
  deco?: boolean;
  /**
   * How large the standing art is drawn, as a multiple of its own pixels.
   *
   * The props and trees are cut for 64px tiles. On a board whose cells are
   * smaller they tower: a tree is three times the height of a playable tile
   * and simply hides the ground the player walks on. Scaling them with the
   * cell keeps scenery reading as scenery. 1 leaves the art at native size.
   */
  decoScale?: number;
  /**
   * Cells that must stay clear of trees and props, as `(x, y) => boolean`.
   *
   * For a terrain drawn UNDER a playing board: scenery inside the playable
   * area competes with the tiles for the eye and buries the thing the player
   * is actually reading. Scenery outside it frames the board instead.
   */
  keepClear?: (x: number, y: number) => boolean;
  /**
   * Share of the land given over to sheep and soldiers. Defaults to
   * `INHABITED_SHARE`; 0 leaves the island uninhabited.
   */
  inhabitedShare?: number;
  /**
   * The things standing on the island, decided elsewhere.
   *
   * When given, the view draws exactly these and scatters nothing of its own.
   * That is what makes the client a REFLECTION: the server generates the
   * placements from the seed, validates moves against them, and the browser
   * redraws the same island rather than inventing a second one that happens to
   * look similar. Leave it out and the view scatters its own, which is what
   * the standalone stories want.
   */
  placements?: readonly Placement[];
  /** Draw the open-sea tiles under the island. On by default. */
  sea?: boolean;
  /** Milliseconds per sway frame. */
  frameMs?: number;
}

const DEFAULT_FRAME_MS = 130;

const TREE_CHANCE = 0.08;
const BUSH_CHANCE = 0.05;
const PROP_CHANCE = 0.11;
const SEA_ROCK_CHANCE = 0.025;
const NATURAL_PROPS = 15;
const LANDMARK_CHANCE = 0.08;

/**
 * How much of the island the scatter is allowed to take.
 *
 * This is the dial that matters, and it is a BUDGET rather than a set of
 * independent chances on purpose. Trees and props already claim about 19% of a
 * 320-cell island (~61 cells); adding sheep and soldiers as more independent
 * rolls is how a map silently fills up until there is nowhere left to move.
 *
 * So inhabitants draw from a fixed allowance of the remaining land, and the
 * placement loop STOPS when the allowance is gone. Raise it and the island gets
 * busier; the free space a player moves through shrinks by exactly as much,
 * which is the trade made visible instead of emergent.
 *
 * Down from 0.06, which read as a field of livestock rather than as an island
 * somebody keeps sheep on: at that share a 320-cell map carried ~19 of them,
 * and the flocks (2-4 each) landed often enough to meet. Scenery is supposed
 * to lose the staring contest with the board.
 */
const INHABITED_SHARE = 0.025;

/**
 * Nobody stands next to anybody else.
 *
 * A flock that lands on adjacent cells reads as one blob of sheep rather than
 * as several, and worse, it walls off a corridor. Spacing them by one cell
 * costs a little density and buys back every path between them.
 */
const INHABITANT_SPACING = 1;

/** Sheep come in small flocks; soldiers patrol alone or in pairs. */
const FLOCK = { min: 2, max: 4 } as const;
const PATROL = { min: 1, max: 2 } as const;

/**
 * Who lives here, and how often relative to each other.
 *
 * Weights, not probabilities — they are normalised, so adding a kind here does
 * not silently dilute the budget above.
 *
 * Sheep outweigh soldiers two to one on purpose. Every kind added to the
 * soldier side used to shift the balance silently — six armed men and no
 * livestock is a garrison, not an island somebody keeps sheep on — and a
 * soldier is the obstacle that NEVER moves, so a board covered in them is a
 * maze rather than a field.
 */
const INHABITANTS = [
  { kind: 'sheepIdle', weight: 6, group: FLOCK, scale: 0.62 },
  { kind: 'sheepBounce', weight: 4, group: FLOCK, scale: 0.62 },
  { kind: 'pawnBlue', weight: 1, group: PATROL, scale: 0.5 },
  { kind: 'warriorBlue', weight: 1, group: PATROL, scale: 0.5 },
  { kind: 'archerBlue', weight: 1, group: PATROL, scale: 0.5 },
  { kind: 'warriorRed', weight: 1, group: PATROL, scale: 0.5 },
  { kind: 'torchRed', weight: 1, group: PATROL, scale: 0.5 },
  { kind: 'pawnRed', weight: 1, group: PATROL, scale: 0.5 },
] as const satisfies ReadonlyArray<{
  kind: UnitKind;
  weight: number;
  group: { min: number; max: number };
  scale: number;
}>;

/**
 * Cliff faces come from row 3 of the elevation sheet, the tall variant.
 *
 * `IslandView` picks between rows 3 and 5 by how deep the shelf is, because
 * top-down it draws exactly one face per shelf and the two are cut to sit
 * under different silhouettes. A column repeats its face to whatever depth it
 * needs, so only the tall one is ever right here.
 */
const FACE_ROW = 3;

/** How much of a 64px face tile is solid rock, measured off the sheet. */
const FACE_SOLID_H = 32;

interface AnimatedProp {
  sprite: Sprite;
  frames: Texture[];
  offset: number;
}

export class IsoIslandView {
  /** Add this to a stage. Its origin is the top-left of the island's box. */
  readonly view = new Container();

  /** Projected size in pixels, for centring or fitting the camera. */
  readonly width: number;
  readonly height: number;

  /**
   * Where cell (0, 0)'s centre sits inside `view`, in pixels.
   *
   * Exposed because a caller that has to line this terrain up with ANOTHER
   * grid — the game's playable board, say — cannot do it from the size alone:
   * the lattice's origin is not its top-left corner, and how far in it sits
   * depends on the map's height and its tallest tier. Subtracting these is
   * what turns "put cell (a, b) under that other grid's cell (c, d)" into one
   * subtraction rather than a fudge factor.
   */
  readonly originX: number;
  readonly originY: number;

  private readonly metrics: IsoMetrics;
  private readonly animated: AnimatedProp[] = [];
  /** Cells claimed by a tree or prop, so an inhabitant never stands in one. */
  private readonly occupied = new Set<string>();
  /**
   * The inhabitants, paired with the sprite drawing each one.
   *
   * Kept so the island can be handed to an `IslandBoard` as OBSTACLES rather
   * than as decoration: a soldier is a wall and a sheep is a wall that moves,
   * and neither can be either unless something outside this view can see them.
   * `syncOccupants` is the other half — it moves the sprites back.
   */
  private readonly livestock: Array<{ occupant: Occupant; sprite: Sprite; tier: number }> = [];
  /** Cells claimed by a sheep or soldier, for the spacing rule. */
  private readonly inhabited = new Set<string>();
  private readonly frameMs: number;
  private elapsed = 0;
  private destroyed = false;

  constructor(private readonly options: IsoIslandViewOptions) {
    const { map } = options;
    this.metrics = { ...ISO_TILE, ...options.metrics };
    this.frameMs = options.frameMs ?? DEFAULT_FRAME_MS;

    // The art hangs below its anchor by half a tile, so the box has to allow
    // for it or the southernmost row is clipped by the camera that fits this.
    const bounds = isoBounds(map.width, map.height, map.tiers, this.metrics, TILE / 2);
    this.width = bounds.width;
    this.height = bounds.height;
    this.originX = bounds.originX;
    this.originY = bounds.originY;

    // One flat sorted container, not a stack of layers: a tree on a near cell
    // has to be able to draw in front of a cliff on a far one.
    const world = new Container();
    world.sortableChildren = true;
    world.position.set(bounds.originX, bounds.originY);
    this.view.addChild(world);

    if (options.sea ?? true) this.buildSea(world);
    this.buildGround(world);
    if (options.deco ?? true) {
      this.buildDeco(world);
      this.buildInhabitants(world);
    }
  }

  /**
   * Draw exactly the things the terrain decided on — inventing nothing.
   *
   * The mirror of `buildDeco`, and the one the real game uses. Every sprite
   * here corresponds to a `Placement` the server also has, so what the player
   * sees blocking a tile is what the server refuses to walk onto.
   */
  private drawPlacements(world: Container, placements: readonly Placement[]): void {
    const { tileset, map } = this.options;
    const scale = this.options.decoScale ?? 1;
    const rng = mulberry32(seedFrom(`${map.seed}:frames`));

    for (const p of placements) {
      const tier = levelAt(map, p.x, p.y);
      const depth = isoDepth(p.x, p.y, tier) + 1;
      let sprite: Sprite;
      let frames: Texture[] | undefined;

      switch (p.kind) {
        case 'tree':
          sprite = this.foot(world, { texture: tileset.tree.frames[0], anchorY: tileset.tree.anchorY }, p.x, p.y, tier, depth);
          frames = tileset.tree.frames;
          break;
        case 'bush': {
          const bush = tileset.bushes[p.variant % tileset.bushes.length];
          sprite = this.foot(world, { texture: bush.frames[0], anchorY: bush.anchorY }, p.x, p.y, tier, depth);
          frames = bush.frames;
          break;
        }
        case 'sheep':
        case 'soldier': {
          const kinds = p.kind === 'sheep'
            ? (['sheepIdle', 'sheepBounce'] as const)
            : (['pawnBlue', 'warriorBlue', 'archerBlue', 'warriorRed', 'torchRed', 'pawnRed'] as const);
          const unit = tileset.units[kinds[p.variant % kinds.length]];
          sprite = this.foot(world, { texture: unit.frames[0], anchorY: unit.anchorY }, p.x, p.y, tier, depth);
          sprite.scale.set(sprite.scale.x * (p.kind === 'sheep' ? 0.62 : 0.5), sprite.scale.y * (p.kind === 'sheep' ? 0.62 : 0.5));
          frames = unit.frames;
          break;
        }
        default: {
          // Props and landmarks: loose clutter, one still frame each.
          const pool = p.kind === 'landmark'
            ? tileset.props.slice(NATURAL_PROPS)
            : tileset.props.slice(0, NATURAL_PROPS);
          sprite = this.foot(world, pool[p.variant % pool.length], p.x, p.y, tier, depth);
          break;
        }
      }

      if (p.kind !== 'sheep' && p.kind !== 'soldier') sprite.scale.set(scale);
      this.livestock.push({ occupant: { id: p.id, kind: p.kind, x: p.x, y: p.y }, sprite, tier });
      if (blocksCell(p.kind)) this.occupied.add(key(p.x, p.y));
      if (frames) {
        this.animated.push({ sprite, frames, offset: Math.floor(rng() * frames.length) });
      }
    }
  }

  /**
   * Record a thing on a cell, so the board can refuse the step.
   *
   * Everything the island draws on the ground goes through here — a tree as
   * much as a sheep. Whether the cell is actually taken out of play is
   * `blocking.ts`'s answer, not this method's: a mushroom registers exactly
   * like a pine and the registry is what tells them apart. That is what keeps
   * "what is drawn" and "where you may walk" from drifting apart, which is the
   * bug this whole registry exists to make impossible.
   */
  private register(kind: OccupantKind, sprite: Sprite, x: number, y: number, tier: number): void {
    this.livestock.push({
      occupant: { id: `${kind}-${this.livestock.length}`, kind, x, y },
      sprite,
      tier,
    });
    if (blocksCell(kind)) this.occupied.add(key(x, y));
  }

  /**
   * Fade whatever the rabbit is standing behind.
   *
   * A pine is three cells tall and the rabbit is one: standing north of one
   * puts the player inside the trunk, which reads as the sprite being broken
   * rather than as cover. So the things tall enough to hide someone go
   * see-through while they would — `fadeTo` per kind in `blocking.ts`, 1 for
   * anything short enough not to need it.
   *
   * The cell stays blocked either way. Fading is about being able to SEE the
   * rabbit, never about being allowed to walk there.
   */
  fadeBehind(rabbitX: number, rabbitY: number): void {
    for (const { occupant, sprite } of this.livestock) {
      const target = fadeAlpha(occupant.kind);
      if (target >= 1) continue;
      // "In front of" on this projection is the cell one step nearer the
      // camera, plus the two beside it — the span a tall sprite covers.
      const hides =
        occupant.y >= rabbitY &&
        occupant.y <= rabbitY + 2 &&
        Math.abs(occupant.x - rabbitX) <= 1 &&
        !(occupant.x === rabbitX && occupant.y === rabbitY);
      sprite.alpha = hides ? target : 1;
    }
  }

  /**
   * The island's inhabitants, as board obstacles.
   *
   * Hand these to an `IslandBoard` and everything standing on the terrain —
   * trees, bushes, rocks, sheep, soldiers — becomes something a rabbit has to
   * route around rather than a sprite it walks through. The objects are the
   * SAME ones the board then mutates, so a sheep that wanders is already at
   * its new cell here; `syncOccupants` is what moves its sprite to match.
   */
  occupants(): Occupant[] {
    return this.livestock.map((entry) => entry.occupant);
  }

  /**
   * Move every inhabitant's sprite to wherever the board has walked it.
   *
   * Cheap enough to call every tick: it touches one position and one depth per
   * inhabitant, and a wandering flock is a few dozen sprites at most. Depth has
   * to be recomputed as well as position — a sheep that walks south passes IN
   * FRONT of what it was behind, and leaving `zIndex` alone would have it slide
   * through a tree it should now occlude.
   */
  syncOccupants(): void {
    for (const { occupant, sprite, tier } of this.livestock) {
      const p = isoProject(occupant.x + 0.5, occupant.y + 0.5, tier, this.metrics);
      sprite.position.set(p.x, p.y);
      sprite.zIndex = isoDepth(occupant.x, occupant.y, tier) + 1;
    }
  }

  /** Advance the tree sway. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.elapsed += deltaMs;
    const step = Math.floor(this.elapsed / this.frameMs);
    for (const item of this.animated) {
      item.sprite.texture = item.frames[(step + item.offset) % item.frames.length];
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.animated.length = 0;
    // The textures are slices of shared sheets and outlive this view.
    this.view.destroy({ children: true });
  }

  /**
   * Open water, one tile per sea cell.
   *
   * Not a `TilingSprite` like the top-down view uses: a tiling sprite is a
   * rectangle, and the sea here has to be a diamond that sorts cell by cell
   * against the land in front of it.
   */
  private buildSea(world: Container): void {
    const { map, tileset } = this.options;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (levelAt(map, x, y) !== 0) continue;
        this.stampGround(world, tileset.water, x, y, 0, isoDepth(x, y, 0));
      }
    }
  }

  /**
   * Every land cell as a column: cliff faces down the drop, surface on top.
   *
   * Walked cell by cell rather than tier by tier — unlike the top-down view,
   * which paints whole tiers in passes because a tier is a flat region there.
   * Here each cell owns a different amount of rock depending on what stands
   * beside it, so the tier is a property of the cell, not a layer.
   */
  private buildGround(world: Container): void {
    const { map, tileset } = this.options;
    const ground = this.options.ground ?? 'tiered';

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tier = levelAt(map, x, y);
        if (tier === 0) continue;

        const depth = isoDepth(x, y, tier);
        const inTier = atOrAbove(map, tier);
        const mask = edgeMask(inTier, x, y);

        // How far this cell has to reach down before it meets something. The
        // south and east neighbours are the two the camera can see past on
        // this projection; the drop is to the lower of them.
        const drop = tier - Math.min(levelAt(map, x, y + 1), levelAt(map, x + 1, y));

        if (drop > 0) {
          // The face is a WALL, not ground: it stands vertically, so unlike the
          // flat layers it is not sheared into the cell's diamond. It is only
          // squashed horizontally to the diamond's width, so that it spans the
          // cell it holds up without leaning with it.
          const face = tileset.elevation[FACE_ROW][blobCol(mask)];
          const count = columnFaces(drop, this.metrics, FACE_SOLID_H);
          // Bottom-up, so the face nearest the camera is drawn last and its
          // lit top edge is not overdrawn by the one below it.
          for (let i = count - 1; i >= 0; i--) {
            const sprite = this.stamp(world, face, x, y, tier, depth - 1 - i, 0);
            sprite.scale.set(this.metrics.w / TILE, 1);
            sprite.y += i * FACE_SOLID_H;
          }
        }

        // Rock rim under the grass, exactly as the top-down view does it: the
        // grass corners are transparent, so a thin lip of stone survives.
        if (tier > 1) {
          this.stampGround(
            world,
            tileset.elevation[ELEVATION_SURFACE_ROW[blobRow(mask)]][blobCol(mask)],
            x, y, tier, depth,
          );
        }

        const flat =
          ground === 'tiered'
            ? tileset.tierGrass[Math.min(tier - 1, tileset.tierGrass.length - 1)]
            : tileset.flat[ground];
        this.stampGround(world, flat[blobRow(mask)][blobCol(mask)], x, y, tier, depth);
      }
    }
  }

  /**
   * Trees, props and sea rocks, same rules and same rolls as the top-down view
   * so that one island's scatter is recognisable in both projections.
   */
  private buildDeco(world: Container): void {
    const { map, tileset } = this.options;
    const rng = mulberry32(seedFrom(`${map.seed}:deco`));
    const scale = this.options.decoScale ?? 1;
    const keepClear = this.options.keepClear;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tier = levelAt(map, x, y);
        // Deco sits just in front of its own tile: same cell, one step nearer.
        const depth = isoDepth(x, y, tier) + 1;

        if (tier === 0) {
          if (touchesLand(map, x, y) || rng() > SEA_ROCK_CHANCE) continue;
          const frames = tileset.seaRocks[Math.floor(rng() * tileset.seaRocks.length)];
          const sprite = this.stamp(world, frames[0], x, y, 0, depth, 0.5);
          sprite.scale.set(scale);
          // Sea rocks sit in open water, which is off-board anyway — they are
          // registered for completeness, not because anything could walk there.
          this.animated.push({ sprite, frames, offset: Math.floor(rng() * frames.length) });
          continue;
        }

        if (underCliff(map, x, y, tier)) continue;
        // Rolled BEFORE the clear test rather than after, so that masking the
        // board does not reshuffle the scenery outside it: the same seed keeps
        // the same island whether or not a board is laid over it.
        if (keepClear?.(x, y)) { rng(); rng(); continue; }
        const roll = rng();
        if (roll < TREE_CHANCE && isInterior(map, x, y, tier)) {
          const sprite = this.foot(world, { texture: tileset.tree.frames[0], anchorY: tileset.tree.anchorY }, x, y, tier, depth);
          sprite.scale.set(scale);
          this.register('tree', sprite, x, y, tier);
          this.animated.push({
            sprite,
            frames: tileset.tree.frames,
            offset: Math.floor(rng() * tileset.tree.frames.length),
          });
        } else if (roll < TREE_CHANCE + BUSH_CHANCE) {
          // Bushes take the cell but fade when the rabbit is behind them, so
          // they cost a tile without ever hiding the player (see `blocking`).
          const bush = tileset.bushes[Math.floor(rng() * tileset.bushes.length)];
          const sprite = this.foot(world, { texture: bush.frames[0], anchorY: bush.anchorY }, x, y, tier, depth);
          sprite.scale.set(scale);
          this.register('bush', sprite, x, y, tier);
          this.animated.push({
            sprite,
            frames: bush.frames,
            offset: Math.floor(rng() * bush.frames.length),
          });
        } else if (roll < TREE_CHANCE + BUSH_CHANCE + PROP_CHANCE) {
          // The last three props are a skull marker, a signpost and a
          // scarecrow: placed things with a volume, so they block where a
          // mushroom lying on the grass does not.
          const isLandmark = rng() < LANDMARK_CHANCE;
          const pool = isLandmark
            ? tileset.props.slice(NATURAL_PROPS)
            : tileset.props.slice(0, NATURAL_PROPS);
          const propSprite = this.foot(world, pool[Math.floor(rng() * pool.length)], x, y, tier, depth);
          propSprite.scale.set(scale);
          this.register(isLandmark ? 'landmark' : 'prop', propSprite, x, y, tier);
        }
      }
    }
  }

  /**
   * Sheep and soldiers, placed against a budget rather than by per-cell rolls.
   *
   * The island has to stay PLAYABLE, so this works the opposite way round from
   * `buildDeco`: instead of asking every cell "does something spawn here?", it
   * computes how many inhabitants the map can afford (`INHABITED_SHARE` of the
   * land), collects the cells that could host one, and fills only that many.
   * A denser island is then a one-number change with a visible cost, and no
   * seed can accidentally produce a map carpeted in livestock.
   *
   * Candidates exclude what `buildDeco` already claimed, anything under a cliff
   * face, and every cell within `INHABITANT_SPACING` of an inhabitant already
   * placed — that last rule is what keeps a flock from fusing into a wall.
   */
  private buildInhabitants(world: Container): void {
    const { map, tileset } = this.options;
    // Its own stream, so adding inhabitants does not shift the tree and prop
    // rolls that `${seed}:deco` already produced for this island.
    const rng = mulberry32(seedFrom(`${map.seed}:life`));

    // Interior land only: a unit on an edge cell overhangs its own cliff.
    const candidates: Array<{ x: number; y: number; tier: number }> = [];
    let landCells = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tier = levelAt(map, x, y);
        if (tier === 0) continue;
        landCells++;
        if (this.occupied.has(key(x, y))) continue;
        if (underCliff(map, x, y, tier)) continue;
        if (!isInterior(map, x, y, tier)) continue;
        candidates.push({ x, y, tier });
      }
    }
    if (!candidates.length) return;

    // Fisher-Yates on the seeded stream: shuffling and then taking a prefix
    // spreads the group over the whole island, where scanning in row order
    // would pile everyone into the north.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const budget = Math.floor(landCells * (this.options.inhabitedShare ?? INHABITED_SHARE));
    const totalWeight = INHABITANTS.reduce((sum, e) => sum + e.weight, 0);
    let placed = 0;

    for (const spot of candidates) {
      if (placed >= budget) break;
      if (!this.isClearOfInhabitants(spot.x, spot.y)) continue;

      // Pick a species, then place a small group of it around this anchor, so
      // the map reads as flocks and patrols rather than as evenly-spread noise.
      let roll = rng() * totalWeight;
      const entry = INHABITANTS.find((e) => (roll -= e.weight) < 0) ?? INHABITANTS[0];
      const size = entry.group.min + Math.floor(rng() * (entry.group.max - entry.group.min + 1));

      for (let n = 0; n < size && placed < budget; n++) {
        const cell = n === 0 ? spot : this.nearbyFreeCell(spot.x, spot.y, rng);
        if (!cell) break;
        this.placeInhabitant(world, entry.kind, entry.scale, cell.x, cell.y, cell.tier, rng);
        placed++;
      }
    }
  }

  /** No inhabitant within `INHABITANT_SPACING` cells, in any direction. */
  private isClearOfInhabitants(x: number, y: number): boolean {
    const r = INHABITANT_SPACING;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (this.inhabited.has(key(x + dx, y + dy))) return false;
      }
    }
    return !this.occupied.has(key(x, y));
  }

  /** A free interior cell just outside the anchor, for the rest of a group. */
  private nearbyFreeCell(
    x: number,
    y: number,
    rng: () => number,
  ): { x: number; y: number; tier: number } | null {
    const { map } = this.options;
    const ring = [...NEIGHBOURS_8];
    for (let i = ring.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ring[i], ring[j]] = [ring[j], ring[i]];
    }
    for (const [dx, dy] of ring) {
      // Two cells out: the anchor's own neighbours are inside the spacing ring.
      const nx = x + dx * (INHABITANT_SPACING + 1);
      const ny = y + dy * (INHABITANT_SPACING + 1);
      const tier = levelAt(map, nx, ny);
      if (tier === 0) continue;
      if (underCliff(map, nx, ny, tier)) continue;
      if (!isInterior(map, nx, ny, tier)) continue;
      if (!this.isClearOfInhabitants(nx, ny)) continue;
      return { x: nx, y: ny, tier };
    }
    return null;
  }

  /** Stand one animated character on a cell and register the ground it takes. */
  private placeInhabitant(
    world: Container,
    kind: UnitKind,
    scale: number,
    x: number,
    y: number,
    tier: number,
    rng: () => number,
  ): void {
    const unit = this.options.tileset.units[kind];
    const depth = isoDepth(x, y, tier) + 1;
    const sprite = this.foot(world, { texture: unit.frames[0], anchorY: unit.anchorY }, x, y, tier, depth);
    // These sheets are drawn at 128/192px for a 64px tile, so they tower over
    // the terrain at 1:1 — scaled down to read as inhabitants of it.
    sprite.scale.set(sprite.scale.x * scale, sprite.scale.y * scale);
    // A random starting frame, or every sheep on the island breathes in sync.
    this.animated.push({ sprite, frames: unit.frames, offset: Math.floor(rng() * unit.frames.length) });
    this.inhabited.add(key(x, y));

    // Sheep wander, soldiers hold their ground — the distinction the board
    // plays on, decided here because this is where the species is known.
    const species: OccupantKind = kind.startsWith('sheep') ? 'sheep' : 'soldier';
    this.livestock.push({
      occupant: { id: `${species}-${this.livestock.length}`, kind: species, x, y },
      sprite,
      tier,
    });
  }

  /**
   * Put one texture on cell `(x, y)` at `tier`, WITHOUT reshaping it.
   *
   * Anchored at the middle of the tile's own square, which lands the art's
   * centre on the diamond's centre. For anything that stands UP out of the
   * ground — a tree, a prop, a sea rock — that is the whole job: those are
   * drawn facing the camera in an isometric scene too.
   */
  private stamp(
    world: Container,
    texture: Texture,
    x: number,
    y: number,
    tier: number,
    depth: number,
    anchorY = 0.5,
  ): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, anchorY);
    const p = isoProject(x + 0.5, y + 0.5, tier, this.metrics);
    sprite.position.set(p.x, p.y);
    sprite.zIndex = depth;
    world.addChild(sprite);
    return sprite;
  }

  /**
   * Put one GROUND texture on cell `(x, y)`, sheared into the cell's diamond.
   *
   * This is the correction that makes the projection work. Moving a square
   * tile onto an isometric lattice and leaving it square does not read as
   * isometric: the tile's edges stay horizontal and vertical while the grid
   * runs diagonally, so neighbours overlap as offset rectangles and a plateau
   * comes out looking like a staircase of playing cards rather than like
   * ground. Seen small it passes; at close range it falls apart completely.
   *
   * So the ground is transformed after all. The matrix takes the tile's unit
   * square to the cell's diamond — `(1,0)` to the screen step for one step
   * east, `(0,1)` to the step for one step south — which is exactly the
   * projection expressed as a 2x2, and it makes tile edges land on cell edges.
   *
   * The cost is the one the pixel art always pays for this: the shear does not
   * fall on the pixel grid, so the ground softens slightly. Only the flat
   * layers go through here. Trees and props keep `stamp` and stay crisp and
   * upright, which is how an isometric scene draws them anyway.
   */
  private stampGround(
    world: Container,
    texture: Texture,
    x: number,
    y: number,
    tier: number,
    depth: number,
  ): Sprite {
    const sprite = new Sprite(texture);
    const { w, h } = this.metrics;
    // Columns of the projection matrix: one step east, then one step south.
    // Divided by TILE because the source art is TILE px across, not 1 unit.
    sprite.setFromMatrix(
      new Matrix(w / 2 / TILE, h / 2 / TILE, -w / 2 / TILE, h / 2 / TILE, 0, 0),
    );
    const p = isoProject(x, y, tier, this.metrics);
    sprite.position.set(p.x, p.y);
    sprite.zIndex = depth;
    world.addChild(sprite);
    return sprite;
  }

  /** A prop, standing on its own feet rather than on its box's bottom edge. */
  private foot(world: Container, prop: FootSprite, x: number, y: number, tier: number, depth: number): Sprite {
    return this.stamp(world, prop.texture, x, y, tier, depth, prop.anchorY);
  }
}

const NEIGHBOURS_8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

/** Cell key for the occupancy sets. */
function key(x: number, y: number): string {
  return `${x},${y}`;
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
