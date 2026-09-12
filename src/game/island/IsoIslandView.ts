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
import { Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
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
   * Override the ground of individual cells, as `(x, y) => GroundKind | null`.
   *
   * For a patch that has to read as something other than the meadow around it
   * — the burrow's tilled carrot field, which is the objective of a raid and
   * has to be findable from across the board. Returning null leaves the cell
   * to the normal `ground` rule.
   *
   * A GROUND swap rather than a tint or an overlay, because the blob set
   * autotiles: the patch gets its own rounded edges against the grass, so it
   * reads as soil somebody turned over rather than as a coloured rectangle
   * lying on a lawn.
   */
  groundAt?: (x: number, y: number) => GroundKind | null;
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
  /**
   * Where the standing art goes: trees, bushes, rocks, sheep, soldiers.
   *
   * Defaults to this view's own `world`, which is what every standalone use
   * wants — one container, one sorted island.
   *
   * A board laid OVER the terrain needs the other arrangement. Pixi sorts
   * siblings, and everything in here is a child of `view`: the whole landscape
   * is painted during `view`'s turn, so it lands entirely in front of the
   * board's tiles or entirely behind them, never woven between. Handing in the
   * scene's own container makes each tree and sheep a SIBLING of the tiles, at
   * which point their `isoDepth` and the tiles' `tileDepth` — the same ruler —
   * finally decide it per sprite: a sheep in front of the fog on its cell, a
   * tree behind a rabbit standing nearer the camera.
   *
   * The sprites are positioned in `view`'s space, so a foreign container must
   * share its origin; `TerrainBackground` aligns the two before passing it.
   */
  decoLayer?: Container;
  /**
   * Drop a contact shadow under everything that STANDS on the island.
   *
   * Off by default, because the standalone views draw the terrain on its own
   * and an ellipse under every tree is noise when there is no board to anchor
   * against. On the playing board it is the opposite: a tree and a sheep hover
   * over a grid of lit diamonds without one, and the eye cannot tell which cell
   * a sprite belongs to — the same reason the carrots and chests on `Tile`
   * already carry one.
   *
   * Only the standing art gets one. Ground, cliff faces and sea rocks are part
   * of the landscape rather than objects on it.
   */
  decoShadows?: boolean;
}

/** The contact shadow under a standing sprite: an ellipse a little narrower
 *  than the cell, so it reads as touching rather than as a painted disc. */
const SHADOW_RX = 0.34;
const SHADOW_RY = 0.17;
const SHADOW_ALPHA = 0.26;

const DEFAULT_FRAME_MS = 130;

/**
 * How the wind crosses the island, and how the crowd avoids marching in step.
 *
 * Every animated prop used to share one global frame counter with an integer
 * offset, which meant the whole island changed texture on the same tick: forty
 * trees, eight possible phases, so five of them were always exactly in unison.
 * That reads as a clock, not as weather. Each sprite now carries a fractional
 * phase and is sampled on its own clock, so no two ever have to turn together.
 *
 * For vegetation the phase is not random — it is the cell's distance along the
 * wind, so the sway arrives at one tree after another and crosses the island as
 * a gust. `WIND` is that direction (south-east, matching the light) and
 * `WIND_TILES_PER_FRAME` is how many tiles the gust advances per frame of the
 * sway: low numbers make a slow, wide wave, high numbers a ripple.
 *
 * Units get a random phase instead. A patrol is not blown by the wind, and
 * giving soldiers a positional phase would have neighbours idling in lockstep,
 * which is the very thing this fixes.
 */
const WIND = { x: 1, y: 0.6 };
const WIND_TILES_PER_FRAME = 1.7;

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

/**
 * How tall the thing being hidden is, in pixels, for `facesHiding`.
 *
 * A rabbit, which is the only thing that asks. Deliberately a constant: the
 * question is "would a player-sized sprite be covered on this cell", and a
 * caller checking a cell before anything stands on it has nothing to measure.
 */
const RABBIT_H = 26;

/** How far `facesHiding` looks for rock, in cells. */
const RADIUS = 3;

interface AnimatedProp {
  sprite: Sprite;
  frames: Texture[];
  /** Frames of head start, fractional — see `WIND`. */
  phase: number;
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
  private readonly livestock: Array<{ occupant: Occupant; sprite: Sprite; tier: number; shadow?: Container }> = [];
  /** Cells claimed by a sheep or soldier, for the spacing rule. */
  private readonly inhabited = new Set<string>();
  /**
   * Every sprite a cliff cell draws — faces, rock rim and grass — by cell.
   *
   * Kept for the same reason `livestock` is: a cliff is the OTHER thing on this
   * island tall enough to hide a rabbit, and until now nothing outside this
   * view could reach one. `fadeBehind` only ever knew about occupants, so a
   * player walking along the foot of a plateau went behind a wall of rock that
   * had no idea it was covering anybody — the one case the fade was invented
   * for that it never actually handled.
   *
   * The whole COLUMN rather than its faces, and that distinction was a visible
   * bug before it was a design note: a cell's grass is drawn on top of its own
   * wall, so fading the wall alone left a lid of turf hanging over the hole.
   * Everything the cell puts between the camera and what is behind it has to
   * go together — several faces (a deep drop repeats the tile down the gap),
   * the rim, and the surface.
   *
   * Only cells that show rock are in here; a cell inside a plateau hides
   * nothing and must keep its ground.
   */
  private readonly faces = new Map<string, Sprite[]>();
  /**
   * Everything this view put somewhere OTHER than its own `view`.
   *
   * Empty unless `decoLayer` was given. `view.destroy({children:true})` reaches
   * its own subtree and nothing else, so without this set a deported tree
   * would outlive the scene that drew it — a leak that only exists with the
   * option set, which is exactly the kind that goes unnoticed.
   *
   * `Container`, not `Sprite`: contact shadows are `Graphics`, and everything
   * done to the set — move it, destroy it — is defined on the common base.
   */
  private readonly decoSprites = new Set<Container>();
  /** The shadow `stamp` just drew, for the caller that wants to keep it. */
  private lastShadow: Container | undefined;
  /**
   * One container per land cell — the block — by cell key.
   *
   * Kept so the board can put a cell's VEIL inside its block (`mountVeil`),
   * which is what stops veils compounding: with the whole terrain behind the
   * board, a raised tile's veil lay straight on its lower neighbour's with
   * nothing opaque between them, and every terrace edge wore a double-dark
   * wedge. Inside the block the cell's own grass sits between the two.
   */
  private readonly blocks = new Map<string, Container>();
  /**
   * Everything standing ON a cell, by cell key — trees, props, rocks, units.
   *
   * Separate from `blocks` (which holds the ground) because the two are hidden
   * for different reasons and, crucially, live in different subtrees once the
   * deco is deported to a `decoLayer`. Kept so a caller can hide a whole cell —
   * its ground AND what stands on it — which is what `revealOnly` is for.
   *
   * The scatter is a plain list per cell rather than one sprite: a cell can
   * carry a tree, its contact shadow, and a mushroom at once, and hiding the
   * tree while leaving its shadow painted on the fog is exactly the kind of
   * half-hidden cell this exists to prevent.
   */
  private readonly onCell = new Map<string, Container[]>();
  /**
   * The cliff face sprites under each cell, and how far they reach.
   *
   * A face is built once, tall enough to meet the ground the cell actually
   * stands on. When most of the island is HIDDEN (`revealOnly`) that ground may
   * not be drawn, and the column is then a slab of rock hanging over open
   * water — which reads as a rendering fault rather than as a cliff.
   *
   * Kept so the reveal can show only the topmost face of an exposed cell: one
   * tier of rock says "this is a shelf" without claiming to reach a sea floor
   * the viewer cannot see.
   */
  private readonly cliffFaces = new Map<string, { faces: Sprite[]; x: number; y: number }>();
  /**
   * Where `view` was moved to, mirrored onto the deported sprites.
   *
   * Sprites inside `view` follow it for free; deported ones are in another
   * subtree and have to be told. Zero until `placeDeco` is called, which is
   * correct for every caller that never deports anything.
   */
  private decoOffsetX = 0;
  private decoOffsetY = 0;
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
      // The ground always stays in `world`; only the STANDING art can be asked
      // to live elsewhere, because only it needs to interleave with a board.
      const deco = options.decoLayer ?? world;
      if (options.placements) {
        // The things the BOARD has, and nothing else. `drawPlacements` had
        // been written for exactly this and never called: the view went on
        // scattering its own trees and flock from its own rolls, so the
        // player saw a pine on a cell the server called free, a bare patch of
        // grass where the server had a tree, and a flock the server's moves
        // could not find by id — sheep that never moved.
        this.drawPlacements(deco, options.placements);
        this.buildSeaRocks(deco);
      } else {
        this.buildDeco(deco);
        this.buildInhabitants(deco);
      }
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
        case 'tree': {
          const tree = tileset.trees[p.variant % tileset.trees.length];
          sprite = this.foot(world, { texture: tree.frames[0], anchorY: tree.anchorY }, p.x, p.y, tier, depth);
          frames = tree.frames;
          break;
        }
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
      // The board's OWN id, so a `sheep_moved` from the server names a sprite
      // this view actually holds — and the shadow `foot` just dropped, so a
      // sheep that bolts takes it along (see `register`).
      this.livestock.push({
        occupant: { id: p.id, kind: p.kind, x: p.x, y: p.y },
        sprite,
        tier,
        shadow: this.lastShadow,
      });
      this.lastShadow = undefined;
      if (blocksCell(p.kind)) this.occupied.add(key(p.x, p.y));
      if (frames) {
        const windblown = p.kind === 'tree' || p.kind === 'bush';
        this.animated.push({
          sprite,
          frames,
          phase: windblown ? this.windPhase(p.x, p.y) : this.freePhase(frames, rng),
        });
      }
    }
  }

  /**
   * The little rocks bobbing in open water, for an island drawn from
   * placements.
   *
   * The board has nothing to say about the sea — nothing stands there — so the
   * placements carry no rocks and the view rolls its own, on a stream of its
   * own so the land is not disturbed. `buildDeco` keeps rolling them inline
   * for the standalone views, whose scatter this must not change.
   */
  private buildSeaRocks(world: Container): void {
    const { map, tileset } = this.options;
    const rng = mulberry32(seedFrom(`${map.seed}:sea-rocks`));
    const scale = this.options.decoScale ?? 1;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (levelAt(map, x, y) !== 0) continue;
        if (touchesLand(map, x, y) || rng() > SEA_ROCK_CHANCE) continue;
        const frames = tileset.seaRocks[Math.floor(rng() * tileset.seaRocks.length)];
        const sprite = this.stamp(world, frames[0], x, y, 0, isoDepth(x, y, 0) + 1, 0.5);
        sprite.scale.set(scale);
        this.animated.push({ sprite, frames, phase: this.windPhase(x, y) });
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
      // Claimed rather than looked up: `stamp` has just drawn it, and reading
      // it here is what lets a wandering sheep take its shadow with it.
      shadow: this.lastShadow,
    });
    this.lastShadow = undefined;
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
   * The sprite drawing one inhabitant, by its id.
   *
   * `occupants()` hands out the OBSTACLES — where things are, not what they
   * look like — and that is the right shape for the board, which must not be
   * able to reach a texture. But an effect applied to the thing hiding the
   * player (a dissolve, a tint, an outline) needs the sprite itself, and the
   * alternative is exposing `livestock` wholesale and letting every caller
   * rummage through the view's internals.
   *
   * Returns undefined for an unknown id rather than throwing: a caller holding
   * a stale occupant list across a rebuild should skip that entry, not crash
   * the frame.
   */
  spriteFor(id: string): Sprite | undefined {
    return this.livestock.find((entry) => entry.occupant.id === id)?.sprite;
  }

  /**
   * The cliff faces standing between the camera and a cell — the rock a
   * rabbit on this cell is walking behind.
   *
   * Decided from where the sprites actually LAND rather than from a fixed
   * neighbourhood, because on this projection the two are not the same thing
   * and guessing the offsets got it wrong twice. A face closes the drop on its
   * cell's south and east sides, so it hangs below that cell — but the cell it
   * belongs to is also lifted by its own tier, and the two cancel out to
   * different amounts depending on how deep the drop is. The cells whose rock
   * ends up in front of a given rabbit are not a neat "one row north" or "one
   * row south"; they are wherever that arithmetic puts them.
   *
   * So this asks the projection directly. A face is in the way when it
   *
   *   - stands on higher ground than the rabbit (lower rock is behind it),
   *   - sorts AFTER the rabbit (`isoDepth`, the same ruler the renderer uses,
   *     so this can never disagree with what is actually drawn on top), and
   *   - overlaps the rabbit vertically on screen, within the band its own art
   *     covers.
   *
   * `RABBIT_H` is how tall the thing being hidden is. It is a constant rather
   * than a measurement because the answer wanted is "is a player-sized sprite
   * covered here", not "is this particular texture covered" — and a caller
   * asking about a cell has no sprite to measure yet.
   */
  facesHiding(x: number, y: number): Sprite[] {
    const { map } = this.options;
    const here = levelAt(map, x, y);
    const hereDepth = isoDepth(x, y, here);
    const hereY = isoProject(x + 0.5, y + 0.5, here, this.metrics).y;
    const out: Sprite[] = [];

    // Only cells near enough to matter: a face more than a few cells away
    // cannot reach across the screen to cover this one, and walking the whole
    // map every frame for every occluder is the kind of cost that turns a nice
    // effect into a dropped frame.
    for (let cy = y - RADIUS; cy <= y + RADIUS; cy++) {
      for (let cx = x - RADIUS; cx <= x + RADIUS; cx++) {
        const tier = levelAt(map, cx, cy);
        if (tier <= here) continue;
        if (isoDepth(cx, cy, tier) <= hereDepth) continue;

        const stack = this.faces.get(key(cx, cy));
        if (!stack) continue;

        // The band this column of rock covers: from the top of its face down
        // through however many tiles were stacked to close the drop.
        const topY = isoProject(cx + 0.5, cy + 0.5, tier, this.metrics).y;
        const bottomY = topY + stack.length * FACE_SOLID_H;
        // The rabbit's body, not its feet: standing at `hereY`, it occupies the
        // band above that point.
        if (bottomY < hereY - RABBIT_H || topY > hereY) continue;

        // The whole stack or none of it: a window through the top slab of a
        // three-deep column shows the two below, which is worse than no
        // window at all.
        out.push(...stack);
      }
    }
    return out;
  }

  /**
   * Put a board tile's veil INSIDE its cell's block, over the grass.
   *
   * The block draws as one thing in painter's order, so a raised cell's grass
   * — opaque — lands between its veil and the veil of the lower cell it
   * overlaps. That is the whole fix for veils compounding along terrace edges,
   * and it needs no mask and no second sort: the sort the blocks already have
   * is the one the veils now share.
   *
   * Local depth 2: above the rim (0) and the grass (1), below nothing — a veil
   * is the last thing a cell paints. Positioned at the cell's centre in the
   * terrain's own space, which is where the board's diamond already was once
   * `TerrainBackground` aligned the two grids.
   *
   * False when there is no block here (sea, or a map without this cell), so a
   * caller can keep the veil where it was.
   */
  mountVeil(x: number, y: number, veil: Container, zIndex = 2): boolean {
    const block = this.blocks.get(key(x, y));
    if (!block) return false;
    const tier = levelAt(this.options.map, x, y);
    const p = isoProject(x + 0.5, y + 0.5, tier, this.metrics);
    veil.position.set(p.x, p.y);
    // Inside the block, and above the ground it covers. `zIndex` is a
    // parameter because a cell can carry more than one mounted thing: the
    // burrow puts a placement diamond AND, on top of it, the marker for the
    // bomb buried there. Both have to be positioned by this method — anything
    // placed by hand alongside them lands in a different space and drifts off
    // the cell, which is exactly what the trap markers did.
    veil.zIndex = zIndex;
    block.addChild(veil);
    return true;
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
    for (const entry of this.livestock) {
      const { occupant, sprite } = entry;
      // The tier is read from the MAP, not from where the thing was created.
      // A sheep keeps to its own shelf, but "its own shelf" is a property of
      // the cell it stands on now — a cached tier left a wandering sheep drawn
      // at the height of its birthplace, which shows up as a sheep floating
      // beside a plateau it walked off the edge of.
      const tier = levelAt(this.options.map, occupant.x, occupant.y);
      entry.tier = tier;
      const p = isoProject(occupant.x + 0.5, occupant.y + 0.5, tier, this.metrics);
      // Through the same shift the sprite was stamped with: a deported sheep
      // moved by raw projection would snap back to the terrain's inner origin
      // the first time it wandered.
      this.placeSprite(sprite, p.x, p.y);
      sprite.zIndex = isoDepth(occupant.x, occupant.y, tier) + 1;
      // The shadow travels with its owner. Left behind it reads as a stain on
      // the grass, which is worse than having no shadow at all.
      if (entry.shadow) {
        this.placeSprite(entry.shadow, p.x, p.y);
        entry.shadow.zIndex = sprite.zIndex - 0.5;
      }
    }
  }

  /**
   * The phase for something the wind moves: how far its cell lies downwind.
   *
   * Two trees on the same gust line sway together, which is what a gust IS;
   * the wave is across the wind, not within it. The fractional part matters —
   * it is what keeps the island off a single tick.
   */
  private windPhase(x: number, y: number): number {
    return (x * WIND.x + y * WIND.y) / WIND_TILES_PER_FRAME;
  }

  /** The phase for something that moves itself: anywhere in the cycle. */
  private freePhase(frames: Texture[], rng: () => number): number {
    return rng() * frames.length;
  }

  /** Advance the tree sway. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.elapsed += deltaMs;
    const t = this.elapsed / this.frameMs;
    for (const item of this.animated) {
      // Floor AFTER adding the phase, not before: a fractional phase has to
      // survive into the sample or every sprite snaps back onto the same tick.
      const n = item.frames.length;
      item.sprite.texture = item.frames[((Math.floor(t + item.phase) % n) + n) % n];
    }
  }

  /**
   * Put a sprite at a projected point, in whichever space it actually lives in.
   *
   * Sprites inside `view` sit in `world`, which already carries the island's
   * origin, so the raw projection is right for them. A deported sprite is in a
   * foreign container and carries both shifts itself. Every positioning path
   * goes through here so the two cannot drift apart — which is precisely what
   * happened to `syncOccupants`, where a wandering sheep was re-placed by raw
   * projection and snapped back to the terrain's inner origin.
   */
  /** Remember that `sprite` stands on cell `(x, y)`, for `revealOnly`. */
  private registerOnCell(x: number, y: number, sprite: Container): void {
    const k = key(x, y);
    const list = this.onCell.get(k);
    if (list) list.push(sprite);
    else this.onCell.set(k, [sprite]);
  }

  /**
   * Show only these cells, and hide the rest of the island completely.
   *
   * For a board a player is meant to discover by WALKING it — the burrow a
   * raider is crossing. Everything about a generated homestead is information:
   * where the cliffs run, where the trees are, which corner the garden is in.
   * Drawing all of it and merely dimming the unvisited cells hands the raider
   * the whole route for free, which is what the burrow's raid overlay did the
   * moment the ground stopped being one picture everybody had already seen.
   *
   * So this hides rather than dims: a cell nobody has reached is not drawn at
   * all, and the sea the island floats in is what a raider sees around the
   * part they have uncovered.
   *
   * Passing null puts the whole island back, which is what the OWNER sees —
   * your own burrow holds no secrets from you.
   */
  revealOnly(cells: Iterable<{ x: number; y: number }> | null): void {
    if (cells === null) {
      for (const block of this.blocks.values()) block.visible = true;
      for (const list of this.onCell.values()) {
        for (const sprite of list) sprite.visible = true;
      }
      for (const { faces } of this.cliffFaces.values()) {
        for (const face of faces) face.visible = true;
      }
      return;
    }

    const shown = new Set<string>();
    for (const c of cells) shown.add(key(c.x, c.y));

    for (const [k, block] of this.blocks) block.visible = shown.has(k);
    for (const [k, list] of this.onCell) {
      const visible = shown.has(k);
      for (const sprite of list) sprite.visible = visible;
    }

    // Trim the cliffs.
    //
    // A face is built tall enough to reach whatever the cell actually stands
    // on — often, at the island's rim, the sea floor several tiers down. With
    // the sea and the lower ground hidden, that full column is a slab of rock
    // hanging in mid-air, which reads as a rendering fault rather than as a
    // cliff.
    //
    // A revealed cell therefore shows only as much rock as the revealed ground
    // BELOW it justifies: the drop to the lowest neighbour that is itself
    // drawn. Where nothing below is drawn that is one tier — enough to say
    // "this is a shelf" without claiming a depth the viewer cannot see.
    for (const [k, { faces, x, y }] of this.cliffFaces) {
      if (!shown.has(k)) continue;
      const map = this.options.map;
      const tier = levelAt(map, x, y);

      // The two sides this projection can see past, counted only where the
      // neighbour is actually on screen.
      let floor = tier - 1;
      for (const [dx, dy] of [[0, 1], [1, 0]] as const) {
        if (!shown.has(key(x + dx, y + dy))) continue;
        floor = Math.min(floor, levelAt(map, x + dx, y + dy));
      }
      const visibleDrop = Math.max(1, tier - floor);

      // `faces` was pushed deepest-first (the loop counts down), so the LAST
      // entries are the ones nearest the surface — keep that many.
      const keep = Math.min(faces.length, visibleDrop);
      faces.forEach((face, i) => { face.visible = i >= faces.length - keep; });
    }
  }

  private placeSprite(sprite: Container, x: number, y: number): void {
    if (this.decoSprites.has(sprite)) {
      sprite.position.set(x + this.originX + this.decoOffsetX, y + this.originY + this.decoOffsetY);
    } else {
      sprite.position.set(x, y);
    }
  }

  /**
   * Mirror `view`'s own position onto the deported deco sprites.
   *
   * Call it after moving `view`. Sprites inside `view` are carried by it; the
   * ones handed to a `decoLayer` live in a different subtree and would
   * otherwise stay at the origin, a screenful from the ground they belong to.
   *
   * A no-op when nothing was deported, so a caller that does not use
   * `decoLayer` need not know this exists.
   */
  placeDeco(x: number, y: number): void {
    const dx = x - this.decoOffsetX;
    const dy = y - this.decoOffsetY;
    this.decoOffsetX = x;
    this.decoOffsetY = y;
    for (const sprite of this.decoSprites) sprite.position.set(sprite.x + dx, sprite.y + dy);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.animated.length = 0;
    // Deco handed to a FOREIGN container is not under `view`, so destroying
    // `view` would leave every tree and sheep on the scene after it closed.
    // Owned here rather than by the caller: this view created the sprites, and
    // a leak that only happens with one option set is the kind nobody notices
    // until a scene has been entered and left a dozen times.
    const deco = this.options.decoLayer;
    if (deco && deco !== this.view) {
      for (const sprite of this.decoSprites) sprite.destroy();
      this.decoSprites.clear();
    }
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
        // Registered against its cell like everything else, so a board that
        // hides most of itself (`revealOnly`) hides its water too. Left drawn,
        // the sea painted a lighter diamond over the scene's own background in
        // exactly the shape of the island's bounding box — which tells a
        // raider how big the homestead is and where it sits before they have
        // taken a step.
        this.registerOnCell(x, y, this.stampGround(world, tileset.water, x, y, 0, isoDepth(x, y, 0)));
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

        // Everything this cell draws, as one group.
        //
        // The faces alone are not enough, and the gap showed up the moment the
        // effect worked: dissolving the wall left the cell's own GRASS sitting
        // opaque on top of the hole, so the island read as a slab of turf
        // floating over a gap. The surface is part of what stands between the
        // camera and anyone behind this column, so it dissolves with it — the
        // rock rim too, which is drawn as a separate sprite under the grass and
        // would otherwise survive as a thin stone lip around nothing.
        const column: Sprite[] = [];

        /**
         * ONE CONTAINER PER CELL — the block.
         *
         * Everything this cell draws goes in here — the cliff faces, the rock
         * rim, the grass, and (once the board mounts it) the veil — and the
         * block is added to `world` with a SINGLE depth. The pieces sort among
         * themselves with small local numbers and never against a neighbour:
         * as loose siblings at `depth - 1 - i`, `depth - 1` and `depth`, a
         * neighbouring cell could sort into the gaps between them. A cell
         * cannot interleave with a cell.
         */
        const block = new Container();
        block.sortableChildren = true;
        block.zIndex = depth;
        world.addChild(block);
        this.blocks.set(key(x, y), block);

        // How far this cell has to reach down before it meets something. The
        // south and east neighbours are the two the camera can see past on
        // this projection; the drop is to the LOWER of them, because the one
        // rectangle drawn here stands in for both faces and has to be as tall
        // as the deeper — measured against the south alone, a plateau edge on
        // the sea loses its east-facing cliff and floats.
        const drop = tier - Math.min(levelAt(map, x, y + 1), levelAt(map, x + 1, y));

        if (drop > 0) {
          // The face is a WALL, not ground: it stands vertically, so unlike the
          // flat layers it is not sheared into the cell's diamond. It is only
          // squashed horizontally to the diamond's width, so that it spans the
          // cell it holds up without leaning with it.
          const face = tileset.elevation[FACE_ROW][blobCol(mask)];
          // The baked tile already carries ONE tier of side, so the stack only
          // has to cover what is left below it. A one-tier drop — the common
          // case by far — therefore stamps nothing at all, and a deeper one
          // stamps the shortfall. Without this every block drew its own side
          // twice and every shelf came out a tier too tall.
          const covered = this.metrics.z;
          const remaining = drop * this.metrics.z - covered;
          const count = remaining <= 0
            ? 0
            : columnFaces(remaining / this.metrics.z, this.metrics, FACE_SOLID_H);
          // Bottom-up, so the face nearest the camera is drawn last and its
          // lit top edge is not overdrawn by the one below it. Depths are
          // local to the block: the faces stack under the surface.
          const faces: Sprite[] = [];
          for (let i = count - 1; i >= 0; i--) {
            const sprite = this.stamp(block, face, x, y, tier, -1 - i, 0);
            faces.push(sprite);
            // No horizontal squash here any more: the baked sheet already
            // carries the face at the diamond's width (`gen_iso_sheets.py`
            // resizes the face rows rather than projecting them, because a
            // wall stands up and must not be laid onto the ground plane).
            // Scaling again would take it to 30px on a 44px cell.
            sprite.x -= TILE / 2;
            sprite.y += covered + i * FACE_SOLID_H;
            // Interactive with no action: the wall CATCHES the pointer so it
            // never reaches the veil of the lower tile drawn under it. Rock on
            // screen, nothing under the cursor — which is what rock is.
            //
            // Confined to the cell it actually stands on. A face sprite is the
            // sheet's full 64x64 while a cell is `w` by `z` — so hit-tested by
            // its BOUNDING BOX (the default) each wall swallowed the taps of
            // the cells around it as well as its own, and on a board whose
            // cells are 44 wide that is 10px of dead ground on either side
            // plus everything above and below. A bomb buried near a cliff then
            // could not be tapped at all: the wall answered instead, with
            // nothing, and the tap died there without ever reaching a handler.
            //
            // The rectangle is in the sprite's own space. A face is stamped
            // with anchorY 0, so the box runs from the anchor DOWNWARD: the
            // cell's own column is the middle `w` of it, `z` tall from the top.
            const { w, z } = this.metrics;
            sprite.eventMode = 'static';
            sprite.hitArea = new Rectangle((TILE - w) / 2, 0, w, z);
            sprite.label = 'wall';
            column.push(sprite);
          }
          // Kept so `revealOnly` can trim a cliff that would otherwise hang
          // into open sea — see the note there.
          // The cell's coordinates ride along rather than being parsed back out
          // of the key: the key's format is an implementation detail of the
          // map, and re-deriving numbers from a string is how it becomes one.
          this.cliffFaces.set(key(x, y), { faces, x, y });
        }

        // Rock rim under the grass, exactly as the top-down view does it: the
        // grass corners are transparent, so a thin lip of stone survives.
        if (tier > 1) {
          column.push(this.stampGround(
            block,
            tileset.elevation[ELEVATION_SURFACE_ROW[blobRow(mask)]][blobCol(mask)],
            x, y, tier, 0,
          ));
        }

        // A cell may ask for its own ground — the burrow's tilled field does.
        // It is autotiled against ITS OWN patch rather than against the land,
        // so the soil gets rounded edges where it meets the meadow.
        const override = this.options.groundAt?.(x, y) ?? null;
        if (override) {
          const patch = edgeMask(
            (cx, cy) => this.options.groundAt?.(cx, cy) === override,
            x, y,
          );
          const soil = tileset.flat[override];
          column.push(this.stampGround(
            block, soil[blobRow(patch)][blobCol(patch)], x, y, tier, 1,
          ));
        } else {
          const flat =
            ground === 'tiered'
              ? tileset.tierGrass[Math.min(tier - 1, tileset.tierGrass.length - 1)]
              : tileset.flat[ground];
          column.push(this.stampGround(block, flat[blobRow(mask)][blobCol(mask)], x, y, tier, 1));
        }

        // Only cells that actually SHOW rock are worth remembering: a cell in
        // the middle of a plateau has no face, and dissolving its grass would
        // punch a hole in ground nothing was hiding behind.
        if (drop > 0) this.faces.set(key(x, y), column);
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
          this.animated.push({ sprite, frames, phase: this.windPhase(x, y) });
          continue;
        }

        if (underCliff(map, x, y, tier)) continue;
        // Rolled BEFORE the clear test rather than after, so that masking the
        // board does not reshuffle the scenery outside it: the same seed keeps
        // the same island whether or not a board is laid over it.
        if (keepClear?.(x, y)) { rng(); rng(); continue; }
        const roll = rng();
        if (roll < TREE_CHANCE && isInterior(map, x, y, tier)) {
          const tree = tileset.trees[Math.floor(rng() * tileset.trees.length)];
          const sprite = this.foot(world, { texture: tree.frames[0], anchorY: tree.anchorY }, x, y, tier, depth);
          sprite.scale.set(scale);
          this.register('tree', sprite, x, y, tier);
          this.animated.push({ sprite, frames: tree.frames, phase: this.windPhase(x, y) });
        } else if (roll < TREE_CHANCE + BUSH_CHANCE) {
          // Bushes take the cell but fade when the rabbit is behind them, so
          // they cost a tile without ever hiding the player (see `blocking`).
          const bush = tileset.bushes[Math.floor(rng() * tileset.bushes.length)];
          const sprite = this.foot(world, { texture: bush.frames[0], anchorY: bush.anchorY }, x, y, tier, depth);
          sprite.scale.set(scale);
          this.register('bush', sprite, x, y, tier);
          this.animated.push({ sprite, frames: bush.frames, phase: this.windPhase(x, y) });
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
    // A free phase, or every sheep on the island breathes in sync. Not the
    // wind's: a patrol keeps its own time, and neighbours must not match.
    this.animated.push({ sprite, frames: unit.frames, phase: this.freePhase(unit.frames, rng) });
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
    sprite.zIndex = depth;

    // Every deco sprite funnels through here, so this is the one place that
    // knows whether one is landing outside `view`.
    const deported = this.options.decoLayer;
    if (deported && world === deported) this.decoSprites.add(sprite);
    // Every standing sprite funnels through `stamp`, so this is the one place
    // that can tie one to the cell it stands on — see `revealOnly`.
    this.registerOnCell(x, y, sprite);
    this.placeSprite(sprite, p.x, p.y);

    /**
     * The contact shadow, added BEFORE the sprite so it cannot cover it.
     *
     * Only for things anchored at the FOOT (`anchorY` near 1) — that is what
     * separates a tree or a sheep, which stands on the ground, from a ground
     * texture sheared into its own diamond. Testing the anchor rather than the
     * kind means anything added later gets one for free, and nothing that lies
     * flat ever does.
     *
     * Depth is `depth - 0.5`: under its own sprite, over the ground of the same
     * cell (which sits at `depth - 1`). Half a step because the scale is
     * integer per cell, so there is room between a sprite and its ground and
     * nowhere else for a neighbour to slip in.
     */
    if (this.options.decoShadows && anchorY > 0.9) {
      const shadow = new Graphics()
        .ellipse(0, 0, this.metrics.w * SHADOW_RX, this.metrics.h * SHADOW_RY)
        .fill({ color: 0x000000, alpha: SHADOW_ALPHA });
      shadow.zIndex = depth - 0.5;
      if (deported && world === deported) this.decoSprites.add(shadow);
      // The shadow belongs to the same cell as the sprite above it: hiding one
      // without the other leaves an ellipse painted on empty sea.
      this.registerOnCell(x, y, shadow);
      this.placeSprite(shadow, p.x, p.y);
      world.addChild(shadow);
      // Handed to whoever stamped this, so `register` can tie it to an
      // occupant and `syncOccupants` can carry it along. A field rather than a
      // return value because `stamp`'s contract is "the sprite", and every
      // existing caller reads it that way.
      this.lastShadow = shadow;
    }

    world.addChild(sprite);
    return sprite;
  }

  /**
   * Put one GROUND texture on cell `(x, y)`, sheared into the cell's diamond.
   *
   * The ground USED to be sheared here, by a matrix taking the tile's unit
   * square to the cell's diamond. That was the right correction for top-down
   * art — square tiles on an iso lattice read as a staircase of playing cards
   * — but it paid for it every frame, on nearest-neighbour pixel art, by
   * resampling a 64px square down to a 44x24 diamond at draw time. Squashing
   * to 69% of the width and 37% of the height at sample time is what made the
   * ground read as mushy, and it is the thing the art was criticised for.
   *
   * The terrain sheets are now baked ALREADY PROJECTED (`tools/gen_iso_sheets.py`,
   * which applies that same matrix once, offline, at 8x supersampling). So the
   * shear here would run a second time: a tile measured 42x24 after the bake
   * comes out 14x8 after a second pass — confetti. The sprite is therefore
   * placed, not transformed.
   *
   * The cell stays 64px with the diamond centred inside it, which is why this
   * offsets by half the box: the sheet geometry, `tileset.ts`'s slicing and
   * every prop anchor in the pack are unchanged by the swap.
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
    const { h } = this.metrics;
    // The baked cell is TILE square with the diamond centred in it, so the
    // diamond's top vertex sits at (TILE/2, (TILE - h)/2) inside the box.
    // `isoProject` answers where that vertex belongs on screen; subtracting
    // its in-box position gives the box's top-left.
    const p = isoProject(x, y, tier, this.metrics);
    sprite.position.set(p.x - TILE / 2, p.y - (TILE - h) / 2);
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
