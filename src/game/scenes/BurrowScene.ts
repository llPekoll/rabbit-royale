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
  AnimatedSprite, Application, Container, Sprite, Texture, Graphics, Polygon,
  type BitmapText,
} from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { GAME_W, GAME_H } from '../Application';
import { CloudField } from '../fx/Clouds';
import { CarrotCrop } from '../entities/CarrotCrop';
import { getDiamondOutline, diamondScaleFor } from '../services/TileTextures';
import { getBunnyAnimTextures } from '../services/AssetLoader';
import { pixelText } from '../ui/PixelText';
import * as Keys from '@/config/assetKeys';
import { BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H } from '@/config/burrowConfig';
import { burrowCell, isTrappable } from '@/game/burrow/board';
import { burrowTileScreen, burrowDepth } from '@/game/burrow/screen';
import { createBurrowTerrain, type BurrowTerrainView } from '@/game/burrow/BurrowTerrain';
import { homeCam, boardCam, raidCam, type BurrowCam } from './burrowCamera';

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

/** Placed traps read as YOURS — gold, like the crown and the carrot count. */
const TRAP_TINT = 0xffd45c;
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
// ## The homestead itself is the secret now
//
// This overlay used to be drawn OVER a burrow in full view — every tree, the
// door, the field — and that was defensible while the burrow was one painting
// every player had already seen a hundred times. The only hidden thing was
// where the traps were, and the dim wash on unvisited tiles said "you have not
// read this one yet" rather than "you cannot see this".
//
// On generated ground that is a giveaway. Where the cliffs run, which corner
// holds the garden, which approach the trees force — all of it is information
// the raider is supposed to be BUYING one step at a time, and drawing the
// whole island hands it over before the first move. So the terrain is hidden
// and uncovered cell by cell (`BurrowTerrainView.reveal`), and what a raider
// looks at is a few tiles of somebody's land floating in the sea.
//
// Which also fixes the thing that made the old overlay unreadable: the dim
// tints had to fight a busy pixel-art meadow underneath them. Against open
// water they simply read.

/** A tile the raider has read. Cool and dim: it is known, not offered. */
const SEEN_TINT = 0x9fb4c7;
const SEEN_ALPHA = 0.30;
/** A tile the raider may step onto next. The one thing asking to be tapped. */
const STEP_TINT = 0xffd45c;
const STEP_ALPHA = 0.55;
/**
 * The edge of the known world: a tile the raider can see but has NOT read.
 *
 * These are the neighbours of where they have walked — uncovered ground whose
 * clue number they have, but which they have not stood on. Drawn darker than a
 * read tile so the frontier of the crossing is legible as a frontier.
 */
const FRONTIER_ALPHA = 0.16;
/**
 * How large the raider is drawn, as a multiple of its 32px sprite.
 *
 * Smaller than the island's `RABBIT_SCALE` (2.4): this board's cells are the
 * same size, but a burrow is a place you are sneaking through rather than a
 * field you own, and a rabbit that fills three cells hides the very clue
 * numbers the crossing is read from.
 */
const RAIDER_SCALE = 1.5;
/** Clue colours by count, so a 3 reads as worse than a 1 before it is read as
 *  a number at all — the same trick the island's hints use. */
const CLUE_COLOURS = [0x7fd1ff, 0x8fe388, 0xffd45c, 0xff9d5c, 0xff6b6b];

/** One tile as a raider may see it. `clue` null means a smoke screen hides it. */
export interface RaidTile {
  tile: number;
  clue: number | null;
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
}

export class BurrowScene implements Scene {
  container: Container;
  private clouds: CloudField | null = null;
  private terrain: BurrowTerrainView | null = null;
  private crop: CarrotCrop | null = null;
  private board = new Container();
  private trapSprites = new Map<number, Container>();
  private hints: Sprite[] = [];
  /** The raid overlay: the attacker's read of this board. Empty when at home. */
  private raidCells: Sprite[] = [];
  private raidLabels: BitmapText[] = [];
  /** The raider's own sprite — a Container, so it is torn down separately. */
  private raidActors: Container[] = [];
  /** Where the raider stands, so the camera can follow them. */
  private raiderAt = 0;
  private raiding = false;
  /** Where the camera is now, so a re-entry does not re-tween to where it sits. */
  private cam: BurrowCam = homeCam();
  private onResize: (() => void) | null = null;
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
    this.onResize = () => this.moveCamera(this.wantedCam(), true);
    window.addEventListener('resize', this.onResize);
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
    this.data.level = level;
    this.terrain?.setLevel(level);
    if (grew && this.crop) this.resowCrop();
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
        // TEMPORARY (see `rrDiag` in page.tsx): a tap reaching this line is the
        // one fact no log has ever shown, so it is worth saying out loud until
        // lifting a bomb is confirmed working.
        console.log('[tap]', JSON.stringify({
          tile: i,
          placing: this.data.placing,
          trappable: isTrappable(this.data.seed, i),
          mined: this.trapSprites.has(i),
        }));
        if (!this.data.placing || !isTrappable(this.data.seed, i)) return;
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
   */
  private wantedCam(): BurrowCam {
    // A raid follows the raider; placing frames the whole homestead. They used
    // to share one answer, which was right while both sides saw the same fully
    // drawn board — see `raidCam` for why a hidden board needs its own shot.
    if (this.raiding) return raidCam(this.data.seed, this.raiderAt);
    return this.data.placing ? boardCam(this.data.seed) : homeCam();
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
  addTrap(tile: number, animate = true): void {
    if (this.trapSprites.has(tile)) return;

    const group = new Container();
    group.sortableChildren = true;

    const marker = burrowDiamond();
    marker.tint = TRAP_TINT;
    marker.alpha = 0.75;
    group.addChild(marker);

    // A small cross of stakes, so a trap is legible as a THING on the ground
    // and not merely a coloured square.
    const stakes = new Graphics()
      .moveTo(-BURROW_HALF_W * 0.22, 0).lineTo(BURROW_HALF_W * 0.22, 0)
      .moveTo(0, -BURROW_HALF_H * 0.34).lineTo(0, BURROW_HALF_H * 0.34)
      .stroke({ color: 0x3a2a12, width: 2 });
    group.addChild(stakes);

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
    }
    // The tile it sits on is no longer placeable.
    this.setPlacing(this.data.placing);
  }

  // ── Raiding ───────────────────────────────────────────────────────────────
  //
  // The same ground, read from the attacker's side. The scene is told WHAT to
  // draw and never works anything out: the server decides which tiles a raider
  // may see, what their numbers are, and where they may step. That split is the
  // whole security model of a raid — a client that computed its own view could
  // simply compute the trap positions too.

  /**
   * Draw a raid in progress, or clear it with `null`.
   *
   * Called on every step rather than diffed, because a step changes what is
   * visible, what is steppable and where the raider stands all at once, and
   * three separate updates would show a frame of the board disagreeing with
   * itself.
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
    /**
     * Tiles the raider has actually STOOD on.
     *
     * Distinct from `view`, which also carries the neighbours they can merely
     * see from there. The difference is what separates crossed ground from the
     * frontier, and without it the board shows no progress — see
     * `FRONTIER_ALPHA`.
     */
    walked?: number[];
    /** Whose burrow is being crossed — their id, which seeds their ground. */
    seed: string;
    /** The defender's burrow level, which picks their building. */
    level?: number | null;
    onStep(tile: number): void;
  } | null): Promise<void> {
    this.clearRaid();
    if (!state) {
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

    await this.showGround(state.seed, state.level);

    // Only the ground the raider has uncovered is drawn at all — the rest of
    // the homestead is not dimmed, it is absent. See the note above.
    //
    // The CROP is uncovered with it. It is drawn by the scene rather than by
    // the terrain, so it does not follow automatically — and a carrot is the
    // most legible thing on this board, so plants left drawn over hidden
    // ground were an arrow pointing straight at the raid's objective.
    const uncovered = state.view.map((v) => v.tile);
    this.terrain?.reveal(uncovered);
    this.crop?.revealOnly(uncovered);
    const visited = new Set(state.walked ?? []);

    // A raider must not see the OWNER's traps. They are hidden rather than
    // never drawn, because the same scene serves both sides and the owner may
    // have been looking at their own burrow a moment ago.
    for (const group of this.trapSprites.values()) group.visible = false;
    // Set before setPlacing: it reframes, and a raid wants the pulled-back
    // board — without this the camera would fly home and straight back out.
    this.raiding = true;
    // Before setPlacing, which reframes: the camera centres on the raider, so
    // it has to know where they are standing first.
    this.raiderAt = state.at;
    this.setPlacing(false);
    const steppable = new Set(state.steps);

    for (const { tile, clue } of state.view) {
      const { x, y } = burrowTileScreen(this.data.seed, tile);
      const canStep = steppable.has(tile);
      const walked = visited.has(tile);

      const cell = burrowDiamond();
      cell.position.set(x, y);
      cell.zIndex = burrowDepth(this.data.seed, tile);
      cell.tint = canStep ? STEP_TINT : SEEN_TINT;
      // Three readings, not two: a tile you have STOOD on, a tile you may step
      // onto next, and a tile you can merely see from where you are. The last
      // is the frontier, and it was previously drawn identically to ground the
      // raider had already crossed — so the board gave no sense of progress.
      cell.alpha = canStep ? STEP_ALPHA : walked ? SEEN_ALPHA : FRONTIER_ALPHA;
      if (canStep) {
        cell.eventMode = 'static';
        cell.cursor = 'pointer';
        cell.on('pointertap', () => state.onStep(tile));
        // The next step breathes. It is the only thing on this screen asking to
        // be pressed, and a still outline does not ask.
        gsap.to(cell, { alpha: STEP_ALPHA * 0.55, duration: 0.9, yoyo: true, repeat: -1 });
      }
      this.board.addChild(cell);
      this.raidCells.push(cell);

      // The number. Absent under a smoke screen — and a zero is drawn as
      // nothing at all, exactly as minesweeper does, so the eye goes to the
      // tiles that carry danger.
      if (clue !== null && clue > 0) {
        const label = pixelText(x, y - 3, String(clue));
        label.anchor.set(0.5);
        label.scale.set(0.5);
        label.tint = CLUE_COLOURS[Math.min(clue, CLUE_COLOURS.length - 1)];
        label.zIndex = burrowDepth(this.data.seed, tile) + 0.4;
        this.board.addChild(label);
        this.raidLabels.push(label);
      }
    }

    // The raider themselves — an actual rabbit standing on the ground, not a
    // coloured lozenge. A raid is the player walking into somebody's home, and
    // a tinted diamond among other tinted diamonds gave them nothing to follow
    // with their eye: on a board of a dozen visible cells the one thing that
    // must be unmistakable is where you are.
    const here = burrowTileScreen(this.data.seed, state.at);
    const raider = this.buildRaider();
    raider.position.set(here.x, here.y);
    raider.zIndex = burrowDepth(this.data.seed, state.at) + 0.6;
    this.board.addChild(raider);
    this.raidActors.push(raider);
  }

  /**
   * The attacker's sprite.
   *
   * The game's own bunny, idling, so the figure crossing a burrow is the same
   * character that digs an island — one player, two screens. Falls back to a
   * plain marker when the sheets have not loaded, because a raid that draws no
   * raider at all is worse than one that draws a lozenge.
   */
  private buildRaider(): Container {
    const group = new Container();
    const frames = getBunnyAnimTextures(Keys.BUNNY_WHITE, 'idle');

    // A contact shadow first, so the rabbit reads as standing on the tile
    // rather than floating over it — the same trick the island's deco uses.
    group.addChild(
      new Graphics()
        .ellipse(0, 0, BURROW_HALF_W * 0.34, BURROW_HALF_H * 0.34)
        .fill({ color: 0x000000, alpha: 0.26 }),
    );

    if (frames.length) {
      const sprite = new AnimatedSprite(frames);
      // Feet at the tile's centre, like every other standing thing here.
      sprite.anchor.set(0.5, 0.9);
      sprite.scale.set(RAIDER_SCALE);
      sprite.animationSpeed = 8 / 60;
      sprite.loop = true;
      sprite.play();
      group.addChild(sprite);
    } else {
      const marker = burrowDiamond();
      marker.tint = STEP_TINT;
      marker.alpha = 0.95;
      group.addChild(marker);
    }
    return group;
  }

  /**
   * A trap went off under the raider.
   *
   * Its own call rather than something inferred from the next `setRaid`,
   * because springing a trap is the moment the raid turns and it has to be felt
   * — a board that simply redrew one tile darker would not register.
   */
  springTrap(tile: number): void {
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
    for (const c of this.raidCells) { gsap.killTweensOf(c); c.destroy(); }
    for (const l of this.raidLabels) l.destroy();
    for (const a of this.raidActors) { gsap.killTweensOf(a); a.destroy({ children: true }); }
    this.raidCells = [];
    this.raidLabels = [];
    this.raidActors = [];
    if (this.raiding) {
      for (const group of this.trapSprites.values()) group.visible = true;
      this.raiding = false;
    }
  }

  /** A trap was sprung or removed. */
  removeTrap(tile: number): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;
    this.trapSprites.delete(tile);
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
    this.clouds?.update(ms);
    this.crop?.update(ms);
    // The terrain sways: the same wind that crosses the island crosses the
    // homestead, which is half of what makes the two read as one world.
    this.terrain?.update(ms);
  }

  destroy(): void {
    this.clearRaid();
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = null;
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
