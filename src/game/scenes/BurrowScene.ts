/**
 * Your burrow, as a place rather than a list of cards.
 *
 * The screen has two jobs. It shows what you own — the field, the mound, what
 * grew while you were away — and it is where you PLACE TRAPS, which is the only
 * defence you get and the reason the layout is a board at all.
 *
 * A raider crosses this same ground (see game/burrow/board): they come in at
 * the entrance and walk towards the field, spending energy, and your traps
 * drain it. So the question this screen asks the owner is a spatial one —
 * which approach do I make expensive? — and it can only be asked on a map.
 *
 * ## The ground is GENERATED, and it is yours
 *
 * This screen used to draw one full-canvas painting with an invisible grid
 * calibrated over it, the same picture for every player in the game. The
 * ground is now tiles, cut from the owner's own seed (their player id) on the
 * same terrain the island uses — so two burrows are two different places, a
 * raider has to actually read the homestead they are crossing, and a cliff is
 * a real obstacle rather than a painted one.
 *
 * Everything on this screen therefore needs to know WHOSE burrow it is, which
 * is what `BurrowSceneData.seed` carries.
 */
import {
  Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, Polygon,
} from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { GAME_W, GAME_H } from '../Application';
import { CloudField } from '../fx/Clouds';
import { CarrotCrop } from '../entities/CarrotCrop';
import { getDiamondFill, getDiamondOutline, diamondScaleFor } from '../services/TileTextures';
import { shadowedPixelText } from '../ui/PixelText';
import { PlayerRabbit } from '../entities/PlayerRabbit';
import { FOG_COLOR, FOG_ALPHA, HIGHLIGHT_COLOR, HINT_TINTS } from '../entities/Tile';
import * as Keys from '@/config/assetKeys';
import { BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, burrowColRow } from '@/config/burrowConfig';
import {
  burrowCell, isTrappable, walkableTiles, fieldTiles, burrowAround,
} from '@/game/burrow/board';
import { burrowTileScreen, burrowDepth } from '@/game/burrow/screen';
import { createBurrowTerrain, type BurrowTerrainView } from '@/game/burrow/BurrowTerrain';
import {
  homeCam, boardCam, placeCam, panPlaceCam, zoomPlaceCam, clampPlaceCam, type BurrowCam,
} from './burrowCamera';
import { PanZoomGestures, type Point } from '../input/PanZoomGestures';

/**
 * A diamond sprite sized for THIS board.
 *
 * The texture is baked at the island's tile size; the burrow's is smaller. Every
 * diamond on this screen goes through here, because one that skips it is drawn
 * a quarter too big and stops matching the ground under it — which is exactly
 * how the placement grid ended up unreadable.
 */
function burrowDiamond(): Sprite {
  const s = new Sprite(getDiamondOutline());
  s.anchor.set(0.5);
  const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
  s.scale.set(k.x, k.y);
  return s;
}

/**
 * The same diamond, SOLID.
 *
 * The outline is 30% white plus a 2px stroke, which reads beautifully against
 * open water and disappears completely against a sunlit meadow — and a raider
 * stands on grass, not on water. A steppable cell has to be found at a glance
 * on a board the player has never seen, so it gets a filled body instead of a
 * hairline. Placement mode learned this exact lesson already (see
 * `PLACEABLE_TINT`: "the first pass at 16% white simply vanished into the
 * grass").
 */
function burrowDiamondSolid(): Sprite {
  const s = new Sprite(getDiamondFill());
  s.anchor.set(0.5);
  const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
  s.scale.set(k.x, k.y);
  return s;
}

/** Placed traps read as YOURS — gold, like the crown and the carrot count. */
const TRAP_TINT = 0xffd45c;
/**
 * A rearming trap FILLS UP, like a glass.
 *
 * One bomb drawn twice: a dim copy for the part still to come, and a solid
 * copy underneath it clipped to a waterline that rises as the trap recharges.
 * The boundary between the two IS the progress bar — no second sprite, no
 * gauge hovering over the tile, and nothing to compare against.
 *
 * This replaced fading the whole sprite up together, which was readable but
 * ambiguous: a half-faded bomb could equally be a bomb drawn faint, and the
 * eye had to guess whether the value it saw was "half charged" or just "the
 * colour rearming traps are". A LINE has a position, and a position is read
 * as a level without being taught.
 */
const REARMING_ALPHA = 0.3;


/**
 * A tile you may trap, shown only while placing: the rest of the time this
 * screen is a picture of your home, not a grid.
 *
 * Loud on purpose. The backdrop is busy pixel art in the same greens, and the
 * first pass at 16% white simply vanished into the grass — a target you cannot
 * see is a target you cannot choose, which is the whole interaction.
 */
const PLACEABLE_TINT = 0x8fd6ff;
const PLACEABLE_ALPHA = 0.42;

// ── Raiding someone else's burrow ────────────────────────────────────────────
//
// The same board, read from the other side, and the reading is now the whole
// point. A raider sees clue NUMBERS and the steps they may take; they never
// see a trap until they spring it, which is the whole reason burying one is
// worth doing.
//
// ## The homestead is in full view; the NUMBERS are the secret
//
// The overlay is drawn over the defender's whole burrow — every tree, the
// cliffs, the door, the field. For a while the terrain was hidden and
// uncovered cell by cell instead (`BurrowTerrainView.reveal`), on the theory
// that the shape of generated ground was itself information a raider should
// pay for. It played terribly: a raider looked at three or four tiles adrift
// in open water, could not tell where the field was, which way the island
// ran, or why one step was a wall, and read the whole screen as broken.
//
// So the ground is shown and the CLUES are what a raider earns by walking.
// Where the traps are is the only real secret, the server never sends it, and
// a number is only drawn on a tile the raider has stood on or next to. Knowing
// where the garden is tells them where to go; it does not tell them what is
// buried on the way.

/** Seconds between blinks as the sweep travels round the raider — the
 *  island's own cadence (`SWEEP_STEP_SECONDS` there). */
const RAID_SWEEP_SECONDS = 0.25;
/** The island's hint pops in at this size; the raid's clue is the same glyph. */
const CLUE_SCALE = 1.4;

/**
 * How hard one wheel notch zooms while placing, and the trackpad's correction.
 *
 * The island's numbers, unchanged, because the gesture is the same gesture on
 * the same hardware — a notch that moved the island by 15% should not move the
 * burrow by some other amount. See `IslandScene` for the derivation.
 */
const WHEEL_ZOOM_PER_UNIT = 0.0015;
const TRACKPAD_PINCH_BOOST = 6;
/**
 * The ring of cells around the carrot field, marked from the first frame.
 *
 * A raid is a trip TO somewhere, and on a full map the garden reads as one
 * more patch of scenery: the raider could see the whole island and still not
 * know which corner ended the trip. So the cells that touch the field wear
 * red instead of the navy fog, always — the fog says "not read yet", this
 * says "one step from the win", and the two must not be the same colour.
 * The field itself wears nothing: it is the prize, in plain sight.
 */
const GOAL_TINT = 0xff3b3b;
const GOAL_ALPHA = 0.5;

/** One tile as a raider may see it. `clue` null means a smoke screen hides it. */
export interface RaidTile {
  tile: number;
  clue: number | null;
}

/** One cell of the raid board — the island's `Tile`, reduced to what a raid draws. */
interface RaidCell {
  /**
   * What the veil says: `fog` lifts as the raider is sent the tile, `goal`
   * stays red for the whole raid, `none` is the field — bare, and tappable.
   */
  veil: 'fog' | 'goal' | 'none';
  /** The lid over the ground — navy fog, or the goal ring's red. */
  fog: Sprite;
  /** The gold outline on a tile they may step onto. */
  ring: Sprite;
  /** The gold flash the sweep runs round the raider. */
  blink: Sprite;
  /** The hint number, when the tile carries one. */
  clue: Container | null;
  clueCount: number | null;
}

export interface BurrowSceneData {
  /**
   * WHOSE burrow this is — the owner's player id, which is the seed their
   * ground is grown from (see `game/burrow/board`).
   *
   * Required, and deliberately not defaulted to something: a burrow drawn from
   * the wrong seed is a different homestead, so every trap the owner placed
   * would land on ground that does not exist. Callers that have no player yet
   * (the signed-out backdrop, a story) pass a fixed seed of their own and get
   * a consistent burrow to look at.
   */
  seed: string;
  /** Tiles that already hold a trap. */
  traps: number[];
  /** True while the owner is choosing where to put one. */
  placing: boolean;
  /**
   * A minable tile was tapped. `mined` says which way it goes: a bare tile
   * takes a bomb, a mined one gives it back.
   *
   * ONE callback rather than an onPlace and an onRemove, because the scene
   * already knows which tiles hold a bomb (it drew them) and the caller would
   * otherwise have to work that out a second time from its own copy of the
   * list. The server still decides — this only says what was asked for.
   */
  onToggle(tile: number, mined: boolean): void;
  /**
   * How full the garden is, 0..1 — `gardenReady / capacity`.
   *
   * Drives the crop growing in the field. Absent (or null) runs the decorative
   * loop instead, for a viewer with no garden of their own.
   */
  gardenProgress?: number | null;
  /**
   * The burrow's level, which picks the BUILDING standing on the ground.
   *
   * Absent means level 1 — the scene is shown before the burrow has loaded, and
   * to viewers with no burrow at all, and both want a picture rather than a
   * blank.
   */
  level?: number | null;
  /**
   * Milliseconds of shield left on the OWNER's burrow, or null for none.
   *
   * The sign belongs on the board rather than only in the side column: the
   * shield is a fact about the place, and the place is what the player is
   * looking at while they decide whether to go farm or dig in.
   */
  shieldMs?: number | null;
}

/** How opaque a cell's veil is, for what it says and whether the raider has been sent it. */
function veilAlpha(veil: RaidCell['veil'], seen: boolean): number {
  if (veil === 'none') return 0;
  if (veil === 'goal') return GOAL_ALPHA;
  return seen ? 0 : FOG_ALPHA;
}

export class BurrowScene implements Scene {
  container: Container;
  private clouds: CloudField | null = null;
  private terrain: BurrowTerrainView | null = null;
  private crop: CarrotCrop | null = null;
  private board = new Container();
  private trapSprites = new Map<number, Container>();
  /**
   * tile -> how charged it is, 0 (just sprung) to 1 (armed).
   *
   * A FRACTION rather than a flag, because the screen shows the climb: the
   * owner watching their burrow sees each bomb fill back up rather than
   * flicking from dead to alive at some invisible instant.
   */
  private trapCharge = new Map<number, number>();
  /** The bomb art, kept so a charge can be re-cropped from the FULL frame
   *  every time — cropping a crop would shrink the slice away. */
  private bombTexture: Texture | null = null;
  /** tile -> ms left before it is armed, as the server last said. `update`
   *  counts these down so the ramp moves between polls rather than in steps. */
  private trapRearmMsLeft = new Map<number, number>();
  /** tile -> the full rearm window, so a remaining time can be made a
   *  fraction. Kept per trap: the stagger means no two share a window. */
  private trapRearmTotalMs = new Map<number, number>();
  private hints: Sprite[] = [];
  /**
   * The raid board: one cell per walkable tile of the DEFENDER's ground,
   * built once per raid and updated on every step. Empty when at home.
   */
  private raidCells = new Map<number, RaidCell>();
  /** Whose ground the cells were built for — a different seed is a rebuild. */
  private raidCellsSeed: string | null = null;
  /** The raider: the island's own rabbit, kept across steps so it HOPS. */
  private raider: PlayerRabbit | null = null;
  private raiderAt = -1;
  /** The tiles currently lit as steppable, and the sweep running over them. */
  private raidLit: number[] = [];
  private raidSweep: gsap.core.Tween | null = null;
  private raidSteps = new Set<number>();
  private onRaidStep: ((tile: number) => void) | null = null;
  private raiding = false;
  /** Where the camera is now, so a re-entry does not re-tween to where it sits. */
  private cam: BurrowCam = homeCam();
  private onResize: (() => void) | null = null;
  /** Drag / pinch on the board while placing. Null outside placement. */
  private gestures: PanZoomGestures | null = null;
  /** The all-covering surface BEHIND the board that catches drags — see create. */
  private dragSurface: Container | null = null;
  private onWheel: ((e: WheelEvent) => void) | null = null;
  /**
   * True once the player has moved the placement camera themselves.
   *
   * `setPlacing` runs on every trap added or removed, and it asks `wantedCam`
   * for the shot — so without this flag, burying a trap would yank the board
   * back to the opening framing and lose the corner the player had just
   * dragged to. Cleared when placement ends, so the next visit opens centred.
   */
  private camMovedByPlayer = false;
  private data: BurrowSceneData = {
    seed: 'burrow', traps: [], placing: false, onToggle: () => {},
  };
  /**
   * The player's OWN burrow, kept apart from what is currently on screen.
   *
   * `data.seed` and `data.level` describe the ground being DRAWN, which during
   * a raid is the defender's homestead. These two are what to come home to
   * when the raid ends — without them, leaving a raid would leave the player
   * standing in the victim's garden.
   */
  private ownSeed = 'burrow';
  private ownLevel: number | null | undefined = null;

  constructor(private app: Application, _sceneManager: SceneManager) {
    this.container = new Container();
    this.container.sortableChildren = true;
    this.board.sortableChildren = true;
  }

  init(data?: unknown): void {
    if (data) this.data = data as BurrowSceneData;
    this.ownSeed = this.data.seed;
    this.ownLevel = this.data.level;
  }

  /**
   * Put someone's ground on screen: terrain, building and crop.
   *
   * Rebuilt rather than re-tinted, because a different seed is a different
   * island — a different coastline, different cliffs, a field in a different
   * corner. Cheap enough to do on the two ends of a raid (it is one terrain of
   * 361 cells and the sheets are already in Pixi's cache), and it happens
   * under the screen wipe that the raid already plays.
   */
  private async showGround(seed: string, level: number | null | undefined): Promise<void> {
    if (seed === this.data.seed && this.terrain) {
      this.terrain.setLevel(level);
      // setLevel re-parks the sign against the new roofline but does not know
      // whose ground this is; applyShield is what answers that.
      this.applyShield();
      return;
    }
    this.data.seed = seed;
    this.data.level = level;

    this.terrain?.destroy();
    this.terrain = null;
    this.crop?.destroy();
    this.crop = null;
    for (const hint of this.hints) hint.destroy();
    this.hints = [];

    await this.buildTerrain();
    this.buildCrop();
    this.buildBoard();
  }

  async create(): Promise<void> {
    await this.buildTerrain();
    this.buildCrop();
    // The same sky as the island, so the two screens are the same world.
    this.clouds = new CloudField(this.container, { width: GAME_W, height: GAME_H });

    this.container.addChild(this.board);
    this.buildBoard();
    // Land on the right framing rather than travelling to it: there is no
    // previous shot to move from on the scene's first frame.
    this.moveCamera(this.wantedCam(), true);
    // A rotation swaps the design space under us (see Application.resize), and
    // the pulled-back framing is solved against it — so the shot has to be
    // re-solved rather than kept, or a phone turned mid-placement would hold a
    // landscape camera over a portrait board.
    //
    // The sky is solved against the same numbers and has to move with the shot:
    // its bands are fractions of the design space, so a field left on the old
    // height parks its bottom bank hundreds of px below a taller portrait frame
    // and the bottom of the screen goes bare.
    this.onResize = () => {
      this.clouds?.resize(GAME_W, GAME_H);
      this.moveCamera(this.wantedCam(), true);
    };
    window.addEventListener('resize', this.onResize);

    /* ── Drag and pinch the board while placing ──────────────────────────
       The board is drawn closer than it fits now (see `placeCam`), so the
       cells off the edge have to be reachable. The recogniser is the island's,
       unchanged: it is the piece that tells a tap from a drag, which matters
       more here than there — a tile's own `pointertap` fires at the end of a
       drag too, so without it, panning across the board would bury a trap
       wherever the finger happened to stop.

       Bound on the CONTAINER, not a tile: a drag that starts on the sea
       between two diamonds is still a drag. Each hint keeps its own handler
       and sees the press first, then it bubbles up to here.

       WHY A SURFACE OF ITS OWN, and not the container.
       The island puts an all-covering `hitArea` on its scene container,
       because its tiles carry no handlers at all: it resolves a tap from
       COORDINATES (`terrainTileAt`). The burrow is built the other way round
       on purpose — every hint owns a polygon hit area and its own
       `pointertap`, and `burrow/screen.ts` says at `burrowTileAt` why: with
       the diamonds answering, there is only ever ONE projection to keep in
       step with the drawing.

       So the island's trick does not port. Measured, both halves of it fail:
       a covering `hitArea` on the container swallows the presses before any
       diamond sees them (placement goes dead — no `pointerdown` on the hint,
       no trap, no error), and `eventMode: 'passive'` — children only — gives
       the tiles back but leaves the container deaf, so a drag moves nothing.

       The surface below is the shape that satisfies both. It is added FIRST,
       so it sits under every diamond: Pixi hit-tests front to back, so a
       press over a cell finds the hint and a press over sea falls through to
       this. It covers everything, so a drag can start anywhere; it is behind
       everything, so it never takes a tap that a cell wanted. */
    this.dragSurface = new Container();
    this.dragSurface.eventMode = 'static';
    this.dragSurface.hitArea = { contains: () => true };
    // The container SORTS its children (`sortableChildren`), so the index this
    // is inserted at decides nothing — `zIndex` does. Far below any tile's
    // depth (`burrowDepth`), so the surface is genuinely behind the board and
    // every diamond is hit-tested before it.
    this.dragSurface.zIndex = -1e6;
    this.container.addChild(this.dragSurface);
    this.gestures = new PanZoomGestures(
      this.dragSurface,
      (g) => this.designPoint(g),
      {
        onPan: (dx, dy) => {
          if (!this.data.placing || this.raiding) return;
          this.setPlaceCam(panPlaceCam(this.cam, dx, dy, this.data.seed));
        },
        onPinch: (factor, at) => {
          if (!this.data.placing || this.raiding) return;
          this.setPlaceCam(zoomPlaceCam(this.cam, factor, at, this.data.seed));
        },
        // Taps stay with the tiles' own `pointertap` handlers, which know
        // which tile they are. This one only has a point.
        onTap: () => {},
      },
    );
    this.gestures.attach();

    // The wheel is bound on the DOM rather than through Pixi, whose own wheel
    // listener is passive: a trackpad pinch (a wheel event with `ctrlKey`)
    // has to be `preventDefault`ed or the browser zooms the page instead.
    const canvas = this.app.canvas as HTMLCanvasElement;
    this.onWheel = (e: WheelEvent) => {
      if (!this.data.placing || this.raiding) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const at = this.designPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      // A `deltaMode` of lines (Firefox with a mouse) reports ~3 per notch
      // where pixels report ~100; normalise so a notch is a notch.
      const units = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaY;
      const rate = WHEEL_ZOOM_PER_UNIT * (e.ctrlKey ? TRACKPAD_PINCH_BOOST : 1);
      this.setPlaceCam(zoomPlaceCam(this.cam, Math.exp(-units * rate), at, this.data.seed));
    };
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.setPlacing(this.data.placing);
    for (const tile of this.data.traps) this.addTrap(tile, false);
  }

  /**
   * The ground: the owner's own terrain, drawn from their seed.
   *
   * Awaited before anything else in `create` — the board, the crop and the
   * traps are all positioned against tiles, and building them over a terrain
   * that has not decoded yet would put them on an empty frame.
   */
  private async buildTerrain(): Promise<void> {
    this.terrain = await createBurrowTerrain(
      this.container, this.data.seed, this.data.level,
    );
    // A terrain built fresh knows nothing of a shield that was already up —
    // re-entering the scene, or coming home from a raid, rebuilds the ground.
    this.applyShield();
  }

  /**
   * Hang the shield sign, but only over the player's OWN homestead.
   *
   * During a raid the ground on screen is the defender's, and their shield is
   * none of the attacker's business — a raid only happens because there was no
   * shield to stop it, so a badge there would be a plain contradiction.
   */
  private applyShield(): void {
    const own = this.data.seed === this.ownSeed;
    this.terrain?.setShield(own ? this.data.shieldMs ?? null : null);
  }

  /** The shield went up, ticked down, or ran out. */
  setShield(ms: number | null): void {
    this.data.shieldMs = ms;
    this.applyShield();
  }

  /**
   * The burrow was upgraded — show the level's building, and the bigger garden.
   *
   * The ground, the board and the traps all stay exactly where they are: the
   * level picks which building stands on the burrow's cell, so that half of an
   * upgrade is one texture swap rather than a re-drawn homestead. (It used to
   * be a whole new full-canvas painting, which is why every level's art had to
   * be pre-aligned with every other level's.)
   *
   * The CROP is the exception, because a bigger burrow holds more carrots and
   * therefore grows more of them — see `plantsPerCell`. Re-sowing it is what
   * makes the upgrade visible in the field and not only on the building, and
   * it is cheap: a couple of dozen sprites on ground that is already drawn.
   * The seed is unchanged, so the plants that were already there come back in
   * the same places with the new ones filled in between.
   */
  setLevel(level: number | null | undefined): void {
    this.ownLevel = level;
    // Only touches the screen when the player's OWN ground is up: an upgrade
    // that landed mid-raid must not swap the victim's hut for the raider's
    // castle.
    if (this.data.seed !== this.ownSeed) return;
    const grew = level !== this.data.level;
    // Louder than a swap: the building it grew INTO announces itself. Only
    // upward — a level read for the first time (null before) is not news.
    const celebrate = grew && typeof level === 'number' && typeof this.data.level === 'number' && level > this.data.level;
    this.data.level = level;
    this.terrain?.setLevel(level);
    if (grew && this.crop) this.resowCrop();
    if (celebrate) this.terrain?.celebrateLevel();
  }

  /**
   * Sow the field again at the current level, keeping what is on screen.
   *
   * A bare re-build would clear the field and regrow it from nothing, which is
   * the picture `harvestGarden` uses to say "your carrots have been collected"
   * — exactly the wrong thing to show someone who just spent carrots on an
   * upgrade. So the fullness is carried across: the field the player was
   * looking at is still standing, with more plants in it.
   */
  private resowCrop(): void {
    const progress = this.data.gardenProgress ?? null;
    this.crop?.destroy();
    this.buildCrop();
    this.crop?.setProgress(progress);
  }

  /**
   * The crop growing in the field.
   *
   * Sown on the FIELD TILES the owner's seed chose — see `CarrotCrop`. There
   * is no painted soil to line the plants up with any more, which is the point:
   * the furrows and the plants are now the same set of cells.
   *
   * Sown at the DEFENDER's level, `data.level`, rather than the viewer's: this
   * is a picture of the burrow on screen, and during a raid that is somebody
   * else's. `setLevel` re-sows it when the level changes.
   */
  private buildCrop(): void {
    const sheet = Texture.from(Keys.CARROT_GROWTH);
    this.crop = new CarrotCrop(this.container, sheet, this.data.seed, this.data.level);
    this.crop.setProgress(this.data.gardenProgress ?? null);
  }

  /** The garden filled or was collected — the field follows. */
  setGardenProgress(progress: number | null): void {
    this.data.gardenProgress = progress;
    this.crop?.setProgress(progress);
  }

  /**
   * The harvest was taken: clear the field and let it grow back.
   *
   * Called on the ACTION rather than inferred from progress falling, so that
   * collecting has an immediate visible consequence on the place instead of
   * waiting for the next poll to notice.
   */
  harvestGarden(): void {
    this.crop?.reset();
    this.crop?.setProgress(0);
  }

  /**
   * The walkable ground, as click targets.
   *
   * Drawn as flat diamonds rather than as `Tile`s: a burrow tile has no fog to
   * lift and nothing buried in it, and reusing the island's Tile would drag in
   * chest shines and minesweeper hints that mean nothing here.
   */
  private buildBoard(): void {
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(this.data.seed, i) === 'blocked') continue;

      const { x, y } = burrowTileScreen(this.data.seed, i);
      // Outline rather than fill: an outlined diamond reads as a CELL you can
      // pick, where a flat wash just tinted the artwork underneath.
      const hint = burrowDiamond();
      hint.position.set(x, y);
      hint.zIndex = burrowDepth(this.data.seed, i);
      hint.tint = PLACEABLE_TINT;
      hint.alpha = 0;
      hint.visible = false;
      /**
       * The DIAMOND is what the pointer sees — the farm's arrangement, down to
       * the polygon, so both boards answer "which tile is under the pointer"
       * the same way and neither can drift from the other.
       *
       * The hit area is the real diamond rather than the sprite's bounding
       * BOX. A box overlaps its four diagonal neighbours, so z-order decided
       * which cell replied instead of the pointer; on terraced ground that
       * made every raised cell answer for the one a row behind it. Expressed
       * in the sprite's own un-scaled space, since the texture is baked at the
       * island's size and scaled down to this board's (`diamondScaleFor`).
       *
       * Sorting does the rest: mounted in its terrain block (below), a raised
       * diamond is tested before the lower one it covers, exactly as it is
       * drawn — so the answer matches the picture without any second
       * projection to keep in step.
       *
       * The FULL diamond, not the inset one the texture draws: the hairline
       * between two cells belongs to one of them rather than to whatever shows
       * through it.
       */
      const hw = BURROW_HALF_W / hint.scale.x;
      const hh = BURROW_HALF_H / hint.scale.y;
      // Named so a hit test says WHICH cell answered rather than 'Sprite' —
      // the island's veils carry the same kind of label for the same reason.
      hint.label = `burrow-hint-${i}`;
      hint.eventMode = 'static';
      hint.hitArea = new Polygon([0, -hh, hw, 0, 0, hh, -hw, 0]);
      hint.on('pointertap', () => {
        if (!this.data.placing || !isTrappable(this.data.seed, i)) return;
        // Pixi fires `pointertap` at the end of a DRAG as readily as after a
        // tap, and the board is panned by dragging across exactly these
        // sprites — so without this, sliding the board would bury a trap on
        // whichever cell the finger stopped over.
        if (this.gestures?.didDrag) return;
        this.data.onToggle(i, this.trapSprites.has(i));
      });
      // Into the cell's own terrain block when the ground will take it, so a
      // raised cell's diamond is covered by the grass of the cell in front
      // instead of lapping over it. The farm solved the identical problem this
      // way (`IsoIslandView.mountVeil`); the board keeps the sprite either
      // way, so `setPlacing` and `tileOfHint` are unaffected by which parent
      // won. Falls back to the flat board when there is no block.
      if (!this.terrain?.mountVeil(i, hint)) this.board.addChild(hint);
      this.hints.push(hint);
    }
  }

  /**
   * Enter or leave placement mode.
   *
   * Outside it the board is invisible: this screen is a picture of your home,
   * and a permanent grid over it would turn a place into a spreadsheet. The
   * grid appears exactly when it is the thing being decided.
   */
  setPlacing(placing: boolean): void {
    // Leaving placement forgets the player's framing, so the next visit opens
    // on the centred shot rather than on a corner they dragged to minutes ago.
    if (!placing) this.camMovedByPlayer = false;
    this.data.placing = placing;
    this.moveCamera(this.wantedCam());
    this.hints.forEach((hint, n) => {
      const tile = this.tileOfHint(n);
      const usable = placing && isTrappable(this.data.seed, tile);
      // A mined tile keeps its diamond — tapping it lifts the bomb — but the
      // diamond is drawn at alpha 0, because its own gold marker already says
      // the cell is taken and a blue outline under it would read as "free to
      // mine" on the one cell that is not.
      //
      // Invisible, NOT hidden: `visible = false` takes a sprite out of hit
      // testing, and this is the one cell that most needs to answer a tap. The
      // farm relies on the same distinction for a dug tile (see `Tile`).
      const mined = this.trapSprites.has(tile);
      hint.visible = usable;
      hint.cursor = usable ? 'pointer' : 'default';
      gsap.killTweensOf(hint);
      gsap.to(hint, { alpha: usable && !mined ? PLACEABLE_ALPHA : 0, duration: 0.2 });
    });
  }

  /**
   * Move the camera.
   *
   * Animated rather than snapped: the pull-back is a change of reading, not a
   * change of screen, and a cut would make it look like the burrow was replaced
   * by a different one. `back.out` overshoots very slightly on the way, which
   * is what makes it read as a camera being pulled rather than a picture being
   * resized.
   *
   * `immediate` is for the first frame of the scene, where there is no previous
   * framing to travel from and an animation would just be a lurch on arrival.
   */
  private moveCamera(to: BurrowCam, immediate = false): void {
    // Re-entering placement while already pulled back must not re-tween — the
    // board re-runs setPlacing on every trap added or removed. `immediate`
    // skips the check: it is used for the first frame and after a rotation,
    // where the numbers can be unchanged and yet still need applying.
    if (!immediate
      && Math.abs(to.scale - this.cam.scale) < 0.001
      && Math.abs(to.x - this.cam.x) < 0.5
      && Math.abs(to.y - this.cam.y) < 0.5) return;
    this.cam = to;

    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.scale);
    if (immediate) {
      this.container.position.set(to.x, to.y);
      this.container.scale.set(to.scale);
      this.pinSky();
      return;
    }
    const ease = 'back.out(1.3)';
    // The sky is pinned every frame rather than at the ends: the tween
    // interpolates, and clouds corrected only on arrival would swim across the
    // garden for the whole half second in between.
    gsap.to(this.container, { x: to.x, y: to.y, duration: 0.55, ease, onUpdate: () => this.pinSky() });
    gsap.to(this.container.scale, { x: to.scale, y: to.scale, duration: 0.55, ease });
  }

  /** Hold the clouds against the frame while the camera moves under them. */
  private pinSky(): void {
    this.clouds?.counterCamera(
      this.container.scale.x, this.container.position.x, this.container.position.y,
    );
  }

  /**
   * The framing this screen's current job wants.
   *
   * Placing and raiding are the same request — show me the whole board — so
   * they share one answer rather than each nudging the camera their own way and
   * fighting when a raid begins while the grid is still up.
   *
   * A raid briefly had its own close shot that followed the raider, because the
   * defender's ground was hidden and a fit of a hidden board framed empty sea.
   * The ground is drawn in full again (see the raid note above), so the fit is
   * the right shot: the raider is choosing a route across a homestead, and a
   * route needs the whole homestead in frame.
   */
  private wantedCam(): BurrowCam {
    // A RAID is still a fit: the raider is choosing a route across ground they
    // do not own, and a route needs the whole homestead in frame.
    if (this.raiding) return boardCam(this.data.seed);
    if (this.data.placing) {
      // Once the player has dragged or pinched, their framing is the right
      // one — `setPlacing` runs again on every trap buried, and re-solving the
      // shot there would snatch the board back from under them.
      return this.camMovedByPlayer
        ? clampPlaceCam(this.cam, this.data.seed)
        : placeCam(this.data.seed);
    }
    return homeCam();
  }

  /**
   * Renderer px -> design px, through the root that fits the design space to
   * the window — the space the camera's arithmetic lives in. Before the scene
   * is mounted there is no root and the point is already in design px, which
   * is what a story sees.
   */
  private designPoint(g: Point): Point {
    const root = this.container.parent;
    if (!root) return { x: g.x, y: g.y };
    const p = root.toLocal(g);
    return { x: p.x, y: p.y };
  }

  /** Apply a camera the PLAYER moved: no tween, and remember they moved it. */
  private setPlaceCam(to: BurrowCam): void {
    if (!this.data.placing || this.raiding) return;
    this.camMovedByPlayer = true;
    this.cam = to;
    // Set directly rather than through `moveCamera`: a drag is continuous and
    // a half-second ease on every pointermove would lag the finger.
    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.scale);
    this.container.position.set(to.x, to.y);
    this.container.scale.set(to.scale);
    this.pinSky();
  }

  /** The board skips blocked tiles, so hint order is not tile order. */
  private tileOfHint(n: number): number {
    let seen = 0;
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(this.data.seed, i) === 'blocked') continue;
      if (seen === n) return i;
      seen++;
    }
    return -1;
  }

  /**
   * Show a trap the owner has placed.
   *
   * The OWNER sees their own traps — they have to, or they cannot tell a
   * covered approach from an open one. A raider is sent none of this: the
   * server never puts trap positions in a raider's payload, which is what keeps
   * them worth placing.
   */
  addTrap(tile: number, animate = true, armed = true): void {
    if (this.trapSprites.has(tile)) return;

    const group = new Container();
    group.sortableChildren = true;

    // Painted by `paintTrap` once the bomb is in the group: how a trap looks
    // is one function of its rearm progress, so the mount path and the frame
    // that follows it cannot disagree about what 40% charged looks like.
    const marker = burrowDiamond();
    group.addChild(marker);

    // The bomb itself, the same art the island reveals under a dug tile — one
    // buried bomb, one picture of a bomb, wherever the player meets it. It
    // stood as a small cross of stakes before, which read as a marker ON the
    // ground rather than as the thing that is buried in it.
    //
    // Sat on the diamond rather than centred in it: the sprite is anchored at
    // its foot so the bomb RESTS on the cell the way the rabbit and the crops
    // do, instead of floating through the tile it is buried under.
    const bombTex = Assets.get<Texture>(Keys.BOMB_SMALL);
    if (bombTex) {
      // Scaled off the cell, not off the texture's own pixels: the tile size is
      // a tuning knob (`setBurrowTileSize`), and a sprite pinned to a pixel
      // count stops matching the ground the moment that slider moves.
      const k = (BURROW_HALF_W * 0.62) / bombTex.width;

      // THE BOMB, TWICE. The dim copy is what has not charged yet; the solid
      // one is clipped to a waterline that rises as it does. Same texture,
      // same anchor, same scale — so the two line up exactly and the only
      // thing the eye sees is the boundary between them.
      const bomb = new Sprite(bombTex);
      bomb.anchor.set(0.5, 0.78);
      bomb.scale.set(k);
      group.addChild(bomb);

      this.bombTexture = bombTex;
      const filled = new Sprite(bombTex);
      filled.anchor.set(0.5, 0.78);
      filled.scale.set(k);
      // NO MASK. The filled copy shows a CROP of the texture instead: its
      // frame is narrowed to the bottom `t` of the art and the sprite is
      // re-anchored to keep that slice sitting where it belongs.
      //
      // Two attempts with a Graphics mask failed for the same underlying
      // reason — a display object used as a mask is pulled out of the render
      // pass, so as a child of the group it never received a transform and
      // measured zero on the canvas (clipping nothing), and as a child of the
      // masked sprite it collapsed that sprite's own bounds instead. Cropping
      // the texture needs no second display object at all, which is both
      // simpler and impossible to get wrong this way.
      group.addChild(filled);
    }

    // Transparent to the pointer, so the tap falls through to the cell's own
    // diamond underneath — which is what lifts the bomb. The marker is drawn
    // OVER that diamond, so without this it would swallow every tap meant for
    // the one cell that most needs to answer them.
    group.eventMode = 'none';
    group.label = `burrow-trap-${tile}`;

    // Into the cell's terrain block, through the SAME call that placed the
    // diamond under it — at a higher zIndex so it draws over it.
    //
    // Positioned by hand against `burrowTileScreen` before, which is a
    // different space from the one `mountVeil` puts the diamond in: the
    // markers came out sitting a few pixels above the grid that placed them,
    // so a bomb appeared to be buried between two cells. One cell, one call,
    // one answer — the marker cannot drift from the diamond it covers because
    // neither is positioned independently any more.
    if (!this.terrain?.mountVeil(tile, group, 3)) {
      const { x, y } = burrowTileScreen(this.data.seed, tile);
      group.position.set(x, y);
      group.zIndex = burrowDepth(this.data.seed, tile) + 0.5;
      this.board.addChild(group);
    }
    this.trapSprites.set(tile, group);
    // An armed trap has no ramp to climb. One that is rearming starts at the
    // floor and is driven up by `update` until the server confirms it is back.
    this.trapCharge.set(tile, armed ? 1 : 0);
    this.paintTrap(tile);
    // Remember it on the DATA too, not just as a sprite. A raid tears the
    // ground down and rebuilds it (`showGround`), and what comes back is
    // redrawn from `data.traps` — which was only ever the list handed in at
    // mount (empty), so every bomb placed during a session vanished off the
    // board the moment the player raided someone and came home. They were
    // still in the database; the screen simply stopped showing them.
    if (!this.data.traps.includes(tile)) this.data.traps = [...this.data.traps, tile];

    if (animate) {
      group.scale.set(0);
      gsap.to(group.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2)' });
      // Dust off the ground as it goes in: a bomb BURIED, not a marker placed.
      this.dustPuff(group);
    }
    // The tile it sits on is no longer placeable.
    this.setPlacing(this.data.placing);
  }

  /**
   * A puff of dust out of a cell — the sound of digging, drawn.
   *
   * Six small discs thrown up and out, fading as they fall. Added to the
   * group so they ride whatever positioned it (the terrain block or the
   * board); `zIndex` keeps them over the bomb they are announcing.
   */
  private dustPuff(at: Container): void {
    for (let i = 0; i < 6; i++) {
      const puff = new Graphics().circle(0, 0, 2 + Math.random() * 2).fill({ color: 0xc9b48a, alpha: 0.85 });
      puff.zIndex = 5;
      puff.position.set(0, -2);
      at.addChild(puff);
      const dx = (i / 5 - 0.5) * 26 + (Math.random() - 0.5) * 6;
      const tl = gsap.timeline({ onComplete: () => puff.destroy() });
      tl.to(puff, { x: dx, duration: 0.42, ease: 'power1.out' }, 0);
      tl.to(puff, { y: -12 - Math.random() * 8, duration: 0.18, ease: 'power2.out' }, 0);
      tl.to(puff, { y: 2, duration: 0.24, ease: 'power1.in' }, 0.18);
      tl.to(puff, { alpha: 0, duration: 0.2 }, 0.22);
    }
  }

  // ── Raiding ───────────────────────────────────────────────────────────────
  //
  // The same ground, read from the attacker's side. The scene is told WHAT to
  // draw and never works anything out: the server decides which tiles a raider
  // may see, what their numbers are, and where they may step. That split is the
  // whole security model of a raid — a client that computed its own view could
  // simply compute the trap positions too.
  //
  // ## Drawn the way the island is, on purpose
  //
  // A raid used to have a reading of its own: tinted lozenges for "seen",
  // "walked" and "may step", numbers in a colour ladder of its own, a smaller
  // rabbit. The player had learned the island's board — a navy veil over
  // ground they had not dug, a gold ring that sweeps round the rabbit, a hint
  // that pops in when a tile is cleared — and then met a second grammar on the
  // same tiles and could not read it: the lozenges vanished into the grass,
  // the ring did not look like the ring. So this is the island's `Tile`, cell
  // for cell: the same fog, the same gold, the same hint ladder, the same
  // rabbit at the same size, hopping the same way.

  /**
   * Draw a raid in progress, or clear it with `null`.
   *
   * Called on every step rather than diffed, because a step changes what is
   * visible, what is steppable and where the raider stands all at once, and
   * three separate updates would show a frame of the board disagreeing with
   * itself. The cells themselves persist across calls, so a reveal FADES and
   * the raider HOPS instead of everything being torn down and put back.
   *
   * A raid also changes WHOSE ground this is. The defender's burrow is a
   * different homestead grown from their own id, so the scene swaps its
   * terrain for theirs on the way in and back to the player's own on the way
   * out — see `showGround`. Without that the raider would be walking the
   * server's tile indices across a picture of their own garden, and every
   * clue, step and wall would land on the wrong cell.
   */
  async setRaid(state: {
    view: RaidTile[];
    /** Where the raider stands. */
    at: number;
    /** Tiles they may step onto — the server's list, not ours. */
    steps: number[];
    /** Whose burrow is being crossed — their id, which seeds their ground. */
    seed: string;
    /** The defender's burrow level, which picks their building. */
    level?: number | null;
    onStep(tile: number): void;
  } | null): Promise<void> {
    if (!state) {
      this.clearRaid();
      // Back to being a home: the player's own ground, their own traps, and
      // the camera comes back in with them (setPlacing reframes).
      await this.showGround(this.ownSeed, this.ownLevel);
      // Your own burrow holds no secrets from you: the whole homestead back,
      // garden included.
      this.terrain?.reveal(null);
      this.crop?.revealOnly(null);
      for (const tile of this.data.traps) this.addTrap(tile, false);
      this.setPlacing(this.data.placing);
      return;
    }

    // A different burrow is a different terrain, and the cells live INSIDE
    // its blocks — they go down with it. Dropped here, before the ground is
    // swapped, so nothing is destroyed twice.
    if (this.raidCellsSeed !== state.seed) this.clearRaid();
    await this.showGround(state.seed, state.level);

    // The whole homestead, garden included — the veils, not the terrain, are
    // what say "not dug yet". A terrain that survives (raiding the same burrow
    // twice) may still carry an earlier reveal, so it is put back explicitly.
    this.terrain?.reveal(null);
    this.crop?.revealOnly(null);

    // A raider must not see the OWNER's traps. They are hidden rather than
    // never drawn, because the same scene serves both sides and the owner may
    // have been looking at their own burrow a moment ago.
    for (const group of this.trapSprites.values()) group.visible = false;
    // Set before setPlacing: it reframes, and a raid wants the pulled-back
    // board — without this the camera would fly home and straight back out.
    this.raiding = true;
    this.setPlacing(false);

    const fresh = this.raidCellsSeed !== state.seed;
    if (fresh) this.buildRaidCells(state.seed);
    this.onRaidStep = state.onStep;

    // Fog: lifted off every tile the raider has been sent, left on the rest.
    // Faded, as the island fades a dig, except on the first frame — a board
    // that fades in its whole starting patch reads as loading, not as seen.
    const seen = new Map(state.view.map((v) => [v.tile, v.clue]));
    for (const [tile, cell] of this.raidCells) {
      const target = veilAlpha(cell.veil, seen.has(tile));
      gsap.killTweensOf(cell.fog);
      if (fresh || cell.fog.alpha === target) cell.fog.alpha = target;
      else gsap.to(cell.fog, { alpha: target, duration: 0.25, ease: 'power2.out' });
      this.setClue(cell, seen.get(tile) ?? null, !fresh);
    }

    // The raider: the island's rabbit, hopping from where it was to where the
    // server says it now is. Dropped in from above on arrival, as on the farm.
    if (!this.raider) {
      this.raider = this.buildRaider(state.seed, state.at);
      this.board.addChild(this.raider.container);
      this.raider.playSpawnDrop();
    } else if (state.at !== this.raiderAt) {
      this.raider.cancelMove();
      this.raider.moveTo(state.at);
    }
    this.raiderAt = state.at;

    // The ring: the tiles a tap will be accepted on, lit and swept exactly as
    // the island lights and sweeps the eight around its rabbit. A finished
    // raid sends none, and the ring goes dark.
    this.lightSteps(state.steps, state.at);
  }

  /**
   * One veil per walkable tile of the defender's ground, the island's `Tile`
   * in miniature: fog, ring and blink, all mounted in the cell's own terrain
   * block so they sort with the ground rather than lapping over the cell
   * behind (see `Tile.mountVeil` for the double-dark wedge this avoids).
   */
  private buildRaidCells(seed: string): void {
    this.raidCellsSeed = seed;
    const hit = () => {
      // The diamond is scaled to the burrow's tile; the hit polygon is in the
      // sprite's own space, so it is scaled back — see `buildBoard`.
      const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
      return new Polygon([
        0, -BURROW_HALF_H / k.y,
        BURROW_HALF_W / k.x, 0,
        0, BURROW_HALF_H / k.y,
        -BURROW_HALF_W / k.x, 0,
      ]);
    };
    // The field, and the ring of walkable cells touching it — see `GOAL_TINT`.
    const field = new Set(fieldTiles(seed));
    const goal = new Set<number>();
    for (const f of field) {
      for (const n of burrowAround(seed, f)) if (!field.has(n)) goal.add(n);
    }
    for (const tile of walkableTiles(seed)) {
      const veil = field.has(tile) ? 'none' : goal.has(tile) ? 'goal' : 'fog';
      const fog = burrowDiamondSolid();
      fog.tint = veil === 'goal' ? GOAL_TINT : FOG_COLOR;
      fog.alpha = veilAlpha(veil, false);
      // The VEIL is what the pointer sees, as on the island: it sorts with
      // the ground, so a raised tile's veil answers before the lower one it
      // covers. Interactive whether or not it is lit — the hit test does not
      // read alpha — and the handler checks the ring, so a tap on dark ground
      // is silently nothing rather than a refused request.
      fog.eventMode = 'static';
      fog.label = `raid-step-${tile}`;
      fog.hitArea = hit();
      fog.on('pointerdown', () => {
        if (this.raidSteps.has(tile)) this.onRaidStep?.(tile);
      });

      const ring = burrowDiamond();
      ring.tint = HIGHLIGHT_COLOR;
      ring.visible = false;

      const blink = burrowDiamondSolid();
      blink.tint = HIGHLIGHT_COLOR;
      blink.visible = false;
      blink.alpha = 0;

      // Local depths as `Tile.mountVeil` assigns them: fog 2, ring 4, blink
      // 5 — and the clue above all three (see `setClue`).
      const { x, y } = burrowTileScreen(seed, tile);
      for (const [sprite, z] of [[fog, 2], [ring, 4], [blink, 5]] as const) {
        if (this.terrain?.mountVeil(tile, sprite, z)) continue;
        sprite.position.set(x, y);
        sprite.zIndex = burrowDepth(seed, tile) + z / 10;
        this.board.addChild(sprite);
      }
      this.raidCells.set(tile, { veil, fog, ring, blink, clue: null, clueCount: null });
    }
  }

  /**
   * The number on a cleared tile — the island's hint, glyph for glyph: the
   * same shadowed face, the same minesweeper colour ladder, the same pop-in.
   * A zero is drawn as nothing, as minesweeper does, and a smoke screen (`null`)
   * likewise: the eye goes to the tiles that carry danger.
   */
  private setClue(cell: RaidCell, count: number | null, animate: boolean): void {
    const wanted = count !== null && count > 0 ? count : null;
    if (cell.clueCount === wanted) return;
    cell.clue?.destroy({ children: true });
    cell.clue = null;
    cell.clueCount = wanted;
    if (wanted === null) return;

    const label = shadowedPixelText(0, 0, String(wanted));
    label.face.tint = HINT_TINTS[Math.min(wanted, HINT_TINTS.length - 1)];
    // Above the ring and the blink in the cell's block. Mounted there rather
    // than on the flat board so it is read against the cell it belongs to
    // once the terrain sorts (`mountVeil` positions it by the block's own
    // projection).
    const tile = [...this.raidCells].find(([, c]) => c === cell)?.[0];
    if (tile === undefined || !this.terrain?.mountVeil(tile, label.group, 6)) {
      this.board.addChild(label.group);
    }
    cell.clue = label.group;
    if (animate) {
      label.group.scale.set(0);
      gsap.to(label.group.scale, { x: CLUE_SCALE, y: CLUE_SCALE, duration: 0.22, ease: 'back.out(2)' });
    } else {
      label.group.scale.set(CLUE_SCALE);
    }
  }

  /**
   * Light the tiles a tap will be accepted on, and sweep the blink round the
   * raider — `IslandScene.refreshReachable` and `startSweep`, on this board.
   */
  private lightSteps(steps: number[], at: number): void {
    this.darkenSteps();
    this.raidSteps = new Set(steps);
    for (const tile of steps) {
      const cell = this.raidCells.get(tile);
      if (!cell) continue;
      cell.ring.visible = true;
      cell.blink.visible = true;
      cell.blink.alpha = 0;
      cell.fog.cursor = 'pointer';
      this.raidLit.push(tile);
    }
    if (this.raidLit.length === 0) return;

    // Sorted by ANGLE from the raider, so the blink travels in a circle
    // rather than in index order.
    const { col: rc, row: rr } = burrowColRow(at);
    const ring = [...this.raidLit].sort((a, b) => {
      const p = burrowColRow(a);
      const q = burrowColRow(b);
      return Math.atan2(p.row - rr, p.col - rc) - Math.atan2(q.row - rr, q.col - rc);
    });
    let step = 0;
    const tick = () => {
      const cell = this.raidCells.get(ring[step % ring.length]);
      if (cell) {
        gsap.killTweensOf(cell.blink);
        cell.blink.alpha = 1;
        gsap.to(cell.blink, { alpha: 0, duration: 1, ease: 'sine.out' });
      }
      step++;
      this.raidSweep = gsap.delayedCall(RAID_SWEEP_SECONDS, tick);
    };
    tick();
  }

  private darkenSteps(): void {
    this.raidSweep?.kill();
    this.raidSweep = null;
    for (const tile of this.raidLit) {
      const cell = this.raidCells.get(tile);
      if (!cell) continue;
      cell.ring.visible = false;
      gsap.killTweensOf(cell.blink);
      cell.blink.visible = false;
      cell.blink.alpha = 0;
      cell.fog.cursor = 'default';
    }
    this.raidLit = [];
    this.raidSteps = new Set();
  }

  /**
   * The attacker: the island's own rabbit, on the burrow's lattice.
   *
   * The same class the farm spawns, handed this board's projection and depth
   * so its hops land on the defender's terraces — one player, one character,
   * two screens. Sorted half a cell in front of the tile it stands on, as the
   * island sorts it.
   */
  private buildRaider(seed: string, at: number): PlayerRabbit {
    return new PlayerRabbit(at, Keys.BUNNY_WHITE, '', {
      at: (tile) => burrowTileScreen(seed, tile),
      depth: (tile) => burrowDepth(seed, tile) + 0.6,
    });
  }

  /**
   * The raid is over, and the board says so before the trip home.
   *
   * Won: the rabbit dances on the field. Lost: it collapses where its energy
   * ran out, as it does on the island. Either way the ring goes dark — there
   * is nowhere left to step — and the page takes the player home a couple of
   * seconds later (see `RAID_OVER_MS` there).
   */
  finishRaid(succeeded: boolean): void {
    this.darkenSteps();
    if (succeeded) this.raider?.celebrate();
    else this.raider?.playExhausted();
  }

  /**
   * A trap went off under the raider.
   *
   * Its own call rather than something inferred from the next `setRaid`,
   * because springing a trap is the moment the raid turns and it has to be felt
   * — a board that simply redrew one tile darker would not register. The
   * rabbit takes the hit the way it takes a bomb on the island.
   */
  springTrap(tile: number): void {
    this.raider?.playDamage();
    const { x, y } = burrowTileScreen(this.data.seed, tile);
    const blast = burrowDiamond();
    blast.position.set(x, y);
    blast.zIndex = burrowDepth(this.data.seed, tile) + 1;
    blast.tint = 0xff6b6b;
    this.board.addChild(blast);
    // Relative to the tile's own scale, not an absolute 2.2: the diamond is
    // pre-scaled to burrow size now, and an absolute target would snap it back
    // to the island's tile on the first frame of the blast.
    gsap.to(blast.scale, {
      x: blast.scale.x * 2.2,
      y: blast.scale.y * 2.2,
      duration: 0.45,
      ease: 'power2.out',
    });
    gsap.to(blast, {
      alpha: 0,
      duration: 0.45,
      onComplete: () => blast.destroy(),
    });
  }

  /** Tear the raid overlay down. */
  private clearRaid(): void {
    this.darkenSteps();
    for (const cell of this.raidCells.values()) {
      for (const s of [cell.fog, cell.ring, cell.blink]) { gsap.killTweensOf(s); s.destroy(); }
      if (cell.clue) { gsap.killTweensOf(cell.clue.scale); cell.clue.destroy({ children: true }); }
    }
    this.raidCells.clear();
    this.raidCellsSeed = null;
    this.onRaidStep = null;
    if (this.raider) {
      this.raider.cancelMove();
      this.raider.destroy();
      this.raider = null;
    }
    this.raiderAt = -1;
    if (this.raiding) {
      for (const group of this.trapSprites.values()) group.visible = true;
      this.raiding = false;
    }
  }

  /**
   * A trap came back up, or went down.
   *
   * Repaints in place rather than tearing the sprite down and building it
   * again: the marker is the SAME trap on the same tile either way, and a
   * remove/add pair would pop it off the board and back for what is really a
   * change of state. The pop is reserved for a trap the owner actually placed.
   */
  setTrapArmed(tile: number, armed: boolean): void {
    this.setTrapRearm(tile, armed ? null : { msLeft: 0, totalMs: 0 });
  }

  /**
   * Where a trap is on its way back, as the SERVER sees it.
   *
   * `null` means armed. Otherwise `msLeft` is what is left of `totalMs`, and
   * the ramp is drawn from their ratio — so a trap two thirds charged looks
   * two thirds charged on every client, however long ago it was sprung.
   *
   * The server is the authority on the CLOCK; the scene only interpolates
   * between polls. Deriving the fraction here from a local timestamp would
   * drift on a sleeping tab and show a bomb as armed while the server still
   * refuses to spring it.
   */
  setTrapRearm(tile: number, rearm: { msLeft: number; totalMs: number } | null): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;

    if (!rearm || rearm.msLeft <= 0) {
      const was = this.trapCharge.get(tile) ?? 1;
      this.trapCharge.set(tile, 1);
      this.trapRearmMsLeft.delete(tile);
      this.trapRearmTotalMs.delete(tile);
      this.paintTrap(tile);
      // The moment it comes back gets the placement's own bounce: the owner
      // sees the burrow heal rather than merely finding it healed. Only on the
      // TRANSITION, or every poll would make an armed board twitch.
      if (was < 1) {
        gsap.fromTo(group.scale, { x: 1.18, y: 1.18 }, {
          x: 1, y: 1, duration: 0.4, ease: 'back.out(2)',
        });
      }
      return;
    }

    const total = Math.max(1, rearm.totalMs || rearm.msLeft);
    this.trapRearmMsLeft.set(tile, rearm.msLeft);
    this.trapRearmTotalMs.set(tile, total);
    this.trapCharge.set(tile, Math.max(0, Math.min(1, 1 - rearm.msLeft / total)));
    this.paintTrap(tile);
  }

  /**
   * Draw one trap at its current charge.
   *
   * The single place that turns a fraction into pixels, so the mount path, the
   * per-frame ramp and a server correction all render the same way. Tint and
   * alpha both ride the ramp: colour carries "is this dangerous", alpha
   * carries "how far along", and moving them together is what makes the climb
   * legible without a second sprite to compare against.
   */
  private paintTrap(tile: number): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;
    const t = Math.max(0, Math.min(1, this.trapCharge.get(tile) ?? 1));
    const [marker, bomb, filled] = group.children as [
      Sprite, Sprite | undefined, Sprite | undefined,
    ];

    // The tile under it stays gold and simply dims — the ground is still
    // MINED at any charge, which is what the marker has always said.
    // The tile stays clearly MINED at any charge — it is still the owner's
    // ground and nothing else can be buried there. The dimming is slight on
    // purpose: the marker says "mined", the waterline says "how ready", and
    // fading the marker hard made a rearming trap disappear into the grass,
    // which is the failure this whole treatment exists to avoid.
    if (marker) {
      marker.tint = TRAP_TINT;
      marker.alpha = 0.55 + 0.2 * t;
    }
    if (bomb) bomb.alpha = REARMING_ALPHA;

    if (!filled) return;

    // The waterline, as a CROP of the texture rather than a mask.
    //
    // The slice is the bottom `t` of the art. Re-anchoring by the same
    // fraction is what keeps it in place: a sprite showing the bottom third
    // must be anchored a third of the way up its own (now shorter) frame, or
    // the crop would slide down the tile as it grew.
    const src = this.bombTexture;
    if (!src) return;
    filled.visible = t > 0;
    if (t <= 0) return;

    const full = src.frame;
    const sliceH = Math.max(1, Math.round(full.height * t));
    const top = full.y + (full.height - sliceH);
    filled.texture = new Texture({
      source: src.source,
      frame: new Rectangle(full.x, top, full.width, sliceH),
    });
    // The bomb sits at (0.5, 0.78) of the WHOLE art. Measured from the bottom
    // of the crop, that same point is this far up the slice.
    const anchorFromBottom = (1 - 0.78) * full.height;
    filled.anchor.set(0.5, 1 - anchorFromBottom / sliceH);
  }

  /** A trap was sprung or removed. */
  removeTrap(tile: number): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;
    this.trapSprites.delete(tile);
    this.trapCharge.delete(tile);
    this.trapRearmMsLeft.delete(tile);
    this.trapRearmTotalMs.delete(tile);
    // ...and off the data, or a raid would bring back a bomb that was lifted.
    this.data.traps = this.data.traps.filter((t) => t !== tile);
    gsap.to(group, {
      alpha: 0,
      duration: 0.25,
      onComplete: () => group.destroy({ children: true }),
    });
    this.setPlacing(this.data.placing);
  }

  update(deltaTime: number): void {
    const ms = deltaTime * (1000 / 60);
    this.advanceRearm(ms);
    this.clouds?.update(ms);
    this.crop?.update(ms);
    // The terrain sways: the same wind that crosses the island crosses the
    // homestead, which is half of what makes the two read as one world.
    this.terrain?.update(ms);
  }

  /**
   * Walk every rearming trap forward by one frame.
   *
   * Between polls, which is what makes the opacity a RAMP rather than a
   * staircase — the burrow poll is seconds apart and a bomb that stepped
   * three times over an hour would read as a glitch, not as recharging.
   *
   * It only ever moves the bar UP to just short of full: the server owns the
   * moment a trap is armed again, and a client that finished the job itself
   * would show a live bomb on a tile the server still lets a raider cross.
   */
  private advanceRearm(ms: number): void {
    if (this.trapRearmMsLeft.size === 0) return;
    for (const [tile, left] of this.trapRearmMsLeft) {
      const total = this.trapRearmTotalMs.get(tile) ?? 0;
      if (total <= 0) continue;
      const next = Math.max(0, left - ms);
      this.trapRearmMsLeft.set(tile, next);
      // Capped just under 1 — the last sliver is the server's to grant.
      const charge = Math.min(0.98, 1 - next / total);
      if (Math.abs(charge - (this.trapCharge.get(tile) ?? 0)) < 0.002) continue;
      this.trapCharge.set(tile, charge);
      this.paintTrap(tile);
    }
  }

  destroy(): void {
    this.clearRaid();
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = null;
    }
    this.gestures?.destroy();
    this.gestures = null;
    this.dragSurface = null;
    if (this.onWheel) {
      (this.app.canvas as HTMLCanvasElement).removeEventListener('wheel', this.onWheel);
      this.onWheel = null;
    }
    // The camera tweens the container itself, which is about to go.
    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.scale);
    this.clouds?.destroy();
    for (const g of this.trapSprites.values()) gsap.killTweensOf(g);
    this.trapSprites.clear();
    for (const h of this.hints) gsap.killTweensOf(h);
    this.hints = [];
    this.crop?.destroy();
    this.terrain?.destroy();
    this.container.destroy({ children: true });
  }
}
