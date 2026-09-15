/**
 * The island — the scene a run is played in.
 *
 * Replaces the casino's 2200-line GameScene, which was mostly betting UI (bet
 * rows, cash-out, the multiplier ladder). None of that exists here: this game
 * is F2P non-gambling, so what is left is the part that was always the game —
 * walk the island, dig, read the numbers, don't die.
 *
 * The scene RENDERS and SENDS INTENT. It decides nothing: what a tile holds,
 * how much energy a dig costs and where a bomb throws you are all the server's
 * answers, arriving as events. A tile is drawn face-down until the server says
 * otherwise, because the client is never told what it has not dug.
 */
import { AnimatedSprite, Application, Container } from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { GAME_W, GAME_H } from '../Application';
import { Tile } from '../entities/Tile';
import { CHEST_TIER_COLOR, isChestTier } from '@/config/chestConfig';
import { PlayerRabbit } from '../entities/PlayerRabbit';
import { SoundManager } from '../services/SoundManager';
import {
  getLightningTextures, LIGHTNING_FOOT, LIGHTNING_SHAPES,
} from '../services/AssetLoader';
import { KeyboardControls } from '../services/KeyboardControls';
import { createTerrainBackground, type TerrainBackground } from '../services/TerrainBackground';
import { MoveArrows } from '../ui/MoveArrows';
import { CloudField } from '../fx/Clouds';
import {
  initBlastTextures, playBlast, knockBack, impactShake, blastDepth, SHAKE_PX,
} from '../fx/Blast';
import * as Keys from '@/config/assetKeys';
import {
  COLS, ROWS, SPAWN_INDEX, GRID_CENTER_X, GRID_CENTER_Y, HALF_W,
  isForbidden, makeShape, screenToTile, tilePos, tileInScreenDirection,
  toColRow, type IslandShape,
} from '@/config/gridConfig';
import { farmableTiles, levelTierAt, spawnTile, terrainTileAt, tierLift, tileScreenPos } from '@/lib/game/terrainBoard';
import {
  islandCam, lookAt, panCam, zoomCam, toScene, toScreen, type IslandCam, type Point,
} from './islandCamera';
import { PanZoomGestures } from '../input/PanZoomGestures';
import type { TileContent } from '@/lib/game/types';
import { ENERGY, LIGHTNING } from '@config/tuning';
import { canDig, reachableTiles } from '@/lib/game/reachable';

/** What the scene needs from the outside world. The socket layer supplies it. */
export interface IslandSceneData {
  /** Seed the island's coastline is cut from — the server's island id. */
  seed: string;
  /** Called when the player wants to step to a tile. The server decides. */
  onMoveIntent(index: number): void;
  /** The local player's id, so their own rabbit can be told apart. */
  playerId: string;
  /**
   * The canvas the camera should frame against, overriding `GAME_W`/`GAME_H`.
   *
   * For STORIES only; the game never passes it. `GAME_W`/`GAME_H` are swapped
   * by `Application.resize`, which Storybook never runs — so in a story they
   * are stuck at the landscape 960x540 whatever size the canvas actually is,
   * and a portrait story would report a shot nobody is looking at. The very
   * thing the island camera exists to fix is the PORTRAIT framing, so a story
   * that cannot show portrait cannot show the fix.
   */
  canvas?: { width: number; height: number };
  /**
   * Skip the camera entirely, leaving the scene at the identity transform.
   *
   * For STORIES only; the game never passes it. This is not "a different
   * camera" but the absence of one — the board sitting at the raw
   * `ISO_ORIGIN_*` coordinates with only `Application`'s design-space fit on
   * top, which is exactly what shipped and exactly what was too small. A story
   * that showed the bug by feeding the camera wrong numbers would be showing a
   * third thing that never existed.
   */
  noCamera?: boolean;
}

/** Frames per second the bolt plays at. Six frames, so this is its whole life. */
const LIGHTNING_FPS = 14;

/** Seconds between blinks as the sweep travels round the rabbit. */
const SWEEP_STEP_SECONDS = 0.25;

/**
 * How hard one wheel notch zooms. A notch is ~100 units of `deltaY` on a
 * mouse, so this is about 15% per click; a trackpad sends a stream of small
 * deltas and the same constant gives it a smooth glide.
 */
const WHEEL_ZOOM_PER_UNIT = 0.0015;
/**
 * A trackpad pinch arrives as a wheel event with `ctrlKey` set and deltas an
 * order of magnitude smaller than a scroll — this brings it back up to a
 * pinch's pace.
 */
const TRACKPAD_PINCH_BOOST = 6;
/**
 * The share of the screen, from each edge, the rabbit may not walk into
 * without the camera following. The board is bigger than the screen now, so a
 * rabbit left to walk off the edge would be playing blind; the camera slides
 * to re-centre on it once it gets this close to the frame. A third rather than
 * a hair, so that the follow reads as the camera keeping up and not as the
 * ground twitching under every hop.
 */
const FOLLOW_MARGIN = 0.3;
/** How long the follow slide takes. Slower than a hop, faster than a thought. */
const FOLLOW_SECONDS = 0.45;

/** The bunny sheets, handed out per player so four rabbits are distinguishable. */
const BUNNY_SHEETS = [
  Keys.BUNNY_WHITE, Keys.BUNNY_BROWN, Keys.BUNNY_GRAY,
  Keys.BUNNY_ORANGE, Keys.BUNNY_YELLOW,
];

export class IslandScene implements Scene {
  container: Container;
  private app: Application;
  private sound = new SoundManager();
  private controls: KeyboardControls | null = null;
  private background: TerrainBackground | null = null;

  private shape: IslandShape = makeShape('default');
  private tiles = new Map<number, Tile>();
  private rabbits = new Map<string, PlayerRabbit>();
  /** Pending beats of blasts still in flight, cancelled on teardown. */
  private blastCancels = new Set<() => void>();
  private data: IslandSceneData | null = null;

  /**
   * Pending bolt timers, so a scene torn down mid-strike does not fire into a
   * destroyed container. A strike is staggered over a few hundred ms, which is
   * easily long enough to cross an island change.
   */
  private readonly lightningTimers = new Set<number>();

  /** The tiles currently lit as reachable, and the sweep running over them. */
  private highlighted: number[] = [];
  private sweep: gsap.core.Tween | null = null;

  /**
   * The local rabbit's energy, and when its stun wears off — mirrored from the
   * server purely so the ring can tell an ACCEPTABLE move from a refused one
   * (see refreshReachable). Never a source of truth: the HUD reads the server's
   * own numbers, and a move is still the server's to allow.
   */
  private myEnergy = Infinity;
  private stunnedUntil = 0;
  /** Re-lights the ring the moment a stun expires. */
  private stunTimer: ReturnType<typeof setTimeout> | null = null;
  private arrows: MoveArrows | null = null;
  private clouds: CloudField | null = null;
  private onResize: (() => void) | null = null;
  /** Last canvas size the ground was laid out for. */
  private lastW = 0;
  private lastH = 0;
  /**
   * Where the camera IS: the one transform on the scene container. Written
   * only through `setCam`, so the container, the sky and `shakeScreen`'s
   * return point can never disagree about it.
   */
  private cam: IslandCam = { scale: 1, x: 0, y: 0 };
  /** The design canvas `cam` was solved against — see `reframe`. */
  private camW = 0;
  private camH = 0;
  /** Whether the last shot was solved for a portrait canvas — see `reframe`. */
  private lastPortrait: boolean | null = null;
  /** The tap / drag / pinch recogniser on the scene container. */
  private gestures: PanZoomGestures | null = null;
  /** Mouse wheel and trackpad pinch, straight off the canvas. */
  private onWheel: ((e: WheelEvent) => void) | null = null;
  /**
   * The tile whose veil the current press landed on, if any. Set by the
   * tile's own `pointerdown` (which resolves through the draw order) and
   * consumed on the release, when the gesture turns out to be a tap.
   */
  private pressTile: number | null = null;
  /** The camera slide keeping the rabbit in frame, while one is running. */
  private follow: gsap.core.Tween | null = null;
  /**
   * UI hook: told when the local rabbit leaves the frame or comes back into it,
   * so the chrome can offer a way back. The follow only runs on a STEP, and a
   * player who has panned their rabbit off-screen on a phone has no tile left
   * in reach to step onto — without this there was no way back but dragging.
   */
  private rabbitInViewListener: ((inView: boolean) => void) | null = null;
  private rabbitInView = true;

  /**
   * The canvas everything in this scene is laid out against.
   *
   * One pair of accessors rather than `GAME_W`/`GAME_H` at each use site, so
   * the camera, the clouds and the ground cannot end up framing three
   * different boxes when a story overrides the size — see `canvas` on
   * `IslandSceneData`.
   */
  private get canvasW(): number { return this.data?.canvas?.width ?? GAME_W; }
  private get canvasH(): number { return this.data?.canvas?.height ?? GAME_H; }

  /** Where the local rabbit is, for direction-relative movement. */
  private myTile = SPAWN_INDEX;
  /**
   * Where each sheep stands NOW, by placement id — the server's word.
   *
   * The board only knows where the flock started, so the ring is drawn from
   * this on top of it: a lit tile with a sheep on it is a tap the server will
   * refuse, and the ring must not promise one.
   */
  private sheepTiles = new Map<string, number>();

  constructor(app: Application, _sceneManager: SceneManager) {
    this.app = app;
    this.container = new Container();
    this.container.sortableChildren = true;
  }

  init(data?: unknown): void {
    if (data) this.data = data as IslandSceneData;
    if (this.data) this.shape = makeShape(this.data.seed);
  }

  async create(): Promise<void> {
    // The GROUND the server is playing on, generated from the island's seed
    // rather than picked from three paintings. Both sides build it from the
    // seed alone, so what blocks a tile here is what the server refuses.
    this.background = await createTerrainBackground(this.container, this.data?.seed ?? '');
    this.syncFlock();
    // The blast's smoke and flash discs, generated once against this renderer.
    initBlastTextures(this.app.renderer);

    // The sky, behind everything: the island already moves (surf, volcano
    // smoke), so a dead blue border around it makes the frame look like a
    // screenshot. Clouds only ever cross the SEA — never the board, where they
    // would hide the numbers the game is read from.
    this.clouds = new CloudField(this.container, { width: this.canvasW, height: this.canvasH });

    // The design space is scaled to FIT the window, so a viewport that is not
    // 16:9 leaves bare canvas the ground has to reach across. That margin
    // changes with every resize, hence the listener rather than a one-off.
    this.onResize = () => {
      this.background?.layout(this.canvasW / 2, this.canvasH / 2);
      // Same reason as the ground: the sky's bands are fractions of the design
      // space, so a rotation that swaps it leaves them solved for the old one.
      this.clouds?.resize(this.canvasW, this.canvasH);
      this.reframe();
    };
    window.addEventListener('resize', this.onResize);
    this.solveCamera();
    // Seed the size watch in `update` with the size the shot was just solved
    // for. Left at 0 it reports a change on the very first frame and re-solves
    // for nothing; worse, a scene built while HIDDEN is not ticked at all, so
    // the pair stayed at 0 until it was shown and the first frame after the
    // cut spent itself recomputing a camera that was already right.
    this.lastW = this.app.renderer.width;
    this.lastH = this.app.renderer.height;

    this.buildTiles();
    // The keyboard hint, drawn ON the board rather than as a legend beside it:
    // the board answers "where does UP go?" by pointing at the answer.
    this.arrows = new MoveArrows(this.container, this.shape);
    this.arrows.setSeed(this.data?.seed ?? '');
    this.arrows.setVisible(true);
    this.attachControls();
    this.refreshReachable();
    this.sound.startMusic(Keys.MUSIC_ISLAND);
  }

  /**
   * One Tile per PLAYABLE square.
   *
   * Driven by the terrain rather than by the flat silhouette: the sea, the
   * rock under a cliff face, the cells with a tree on them and the pockets cut
   * off behind a plateau all get nothing — not a hidden tile. The server buries
   * content on exactly this set, so a tile here is a tile it knows about.
   */
  private buildTiles(): void {
    for (const i of farmableTiles(this.data?.seed ?? '')) {
      // Lifted onto the terrace the terrain puts it on, so the board follows
      // the landscape instead of lying flat across it.
      const seed = this.data?.seed ?? '';
      const { col, row } = toColRow(i);
      const tile = new Tile(i, undefined, tierLift(seed, i), levelTierAt(seed, col, row));
      // Per-tile press, on the VEIL: the pointer follows the tile as drawn,
      // and a wall over it catches the press instead (see Tile's constructor).
      // The Seeker is a touch device, so this — not the keyboard — is how the
      // game is actually played. Only REMEMBERED here: whether the press is a
      // tap or the start of a drag is decided on the release (see `onTap`).
      tile.onPress(() => { this.pressTile = i; });
      this.tiles.set(i, tile);
      this.container.addChild(tile.container);
      // The veil goes into the cell's terrain block, so it sorts with the
      // ground rather than stacking on the veils of lower neighbours — the
      // double-dark wedge along every terrace edge was two veils with nothing
      // opaque between them. The hints and highlights stay up here.
      tile.mountVeil((veil, z) => this.background?.mountVeil(i, veil, z) ?? false);
    }
    // The spawn comes from the terrain, as the server's does (`spawnRabbit`):
    // the centre of a flat 16x16 can be open sea, or a cell with a pine on it.
    const spawn = spawnTile(this.data?.seed ?? '');
    this.tiles.get(spawn)?.markSpawn();
    this.myTile = spawn;
  }

  // ── Reachability ───────────────────────────────────────────────────────────

  /**
   * Light the tiles a single step can reach, and put the direction marks on the
   * four a key press covers.
   *
   * This is the game's whole affordance: on an isometric board "which squares
   * can I click?" is not obvious from the geometry, and lighting them answers
   * it without a tutorial. Called after every step, so the ring travels with
   * the rabbit.
   *
   * Lit means CLICKABLE, not merely adjacent. The ring used to light all eight
   * land neighbours, which over-promised: while stunned nothing is accepted,
   * and on the last point of energy only ALREADY-REVEALED ground is, since a
   * fresh dig costs energy the rabbit does not have. Lighting a tile the server
   * is about to refuse teaches the player the ring cannot be trusted, which
   * costs more than the ring is worth. So the same three gates the server
   * applies (see resolveMove) decide what gets lit.
   */
  private refreshReachable(): void {
    this.clearHighlights();

    const me = this.data ? this.rabbits.get(this.data.playerId) : null;
    if (!me) {
      this.arrows?.update(null);
      return;
    }

    const reachable = reachableTiles({
      tile: this.myTile,
      energy: this.myEnergy,
      alive: true,
      stunnedUntil: this.stunnedUntil,
      isRevealed: (i) => this.tiles.get(i)?.revealed ?? false,
      blocked: new Set(this.sheepTiles.values()),
    }, this.data?.seed ?? '');

    // Stunned: nothing came back, and the ring must stay dark for exactly as
    // long as the server will keep refusing. It re-lights itself on expiry.
    if (this.isStunned()) this.scheduleStunRefresh();

    for (const index of reachable) {
      const tile = this.tiles.get(index);
      if (!tile) continue;
      tile.setHighlight(true);
      this.highlighted.push(index);
    }
    // The keyboard marks follow the same rule — pointing at a tile the ring
    // has gone dark on would put the two hints in contradiction.
    this.arrows?.update(reachable.length > 0 ? this.myTile : null, reachable);

    // Anything tall between the rabbit and the camera goes see-through, so the
    // player is never lost inside a pine they cannot walk into anyway.
    const standing = toColRow(this.myTile);
    this.background?.fadeBehind(standing.col, standing.row);
    this.startSweep();
  }

  private isStunned(): boolean {
    return Date.now() < this.stunnedUntil;
  }

  /** Re-light the ring the instant the stun lapses, with no move needed. */
  private scheduleStunRefresh(): void {
    if (this.stunTimer) clearTimeout(this.stunTimer);
    this.stunTimer = setTimeout(() => {
      this.stunTimer = null;
      this.refreshReachable();
    }, Math.max(0, this.stunnedUntil - Date.now()) + 16);
  }

  /**
   * Blink the lit tiles one at a time, going round the rabbit, so the ring
   * reads as a rotating sweep rather than an uncoordinated twinkle. Sorted by
   * ANGLE from the rabbit, which is what makes it travel in a circle rather
   * than in index order.
   */
  private startSweep(): void {
    this.stopSweep();
    if (this.highlighted.length === 0) return;

    const { col: rc, row: rr } = toColRow(this.myTile);
    const ring = [...this.highlighted].sort((a, b) => {
      const p = toColRow(a);
      const q = toColRow(b);
      return Math.atan2(p.row - rr, p.col - rc) - Math.atan2(q.row - rr, q.col - rc);
    });

    let step = 0;
    const tick = () => {
      this.tiles.get(ring[step % ring.length])?.blink();
      step++;
      this.sweep = gsap.delayedCall(SWEEP_STEP_SECONDS, tick);
    };
    tick();
  }

  private stopSweep(): void {
    this.sweep?.kill();
    this.sweep = null;
  }

  /** Blink the whole reachable ring at once — the reply to a tap out of reach. */
  private pulseRing(): void {
    for (const index of this.highlighted) this.tiles.get(index)?.blink();
  }

  private clearHighlights(): void {
    this.stopSweep();
    if (this.stunTimer) {
      clearTimeout(this.stunTimer);
      this.stunTimer = null;
    }
    for (const index of this.highlighted) this.tiles.get(index)?.setHighlight(false);
    this.highlighted = [];
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private attachControls(): void {
    // Keyboard: the player presses a direction they SEE, and the grid resolves
    // which of the 8 neighbours that is (see tileInScreenDirection).
    this.controls = new KeyboardControls({
      onMove: (dx, dy) => {
        const to = tileInScreenDirection(this.myTile, dx, dy, this.shape);
        if (to !== null) this.requestMove(to);
      },
      onConfirm: () => {},
      // The hint has done its job once a key has been pressed: it fades rather
      // than vanishing, so the board does not visibly change under the player.
      onFirstUse: () => this.arrows?.markUsed(),
    });
    this.controls.attach();

    // The whole scene is one pointer surface: every press lands here (a tile's
    // own veil sees it first and bubbles up), and the gesture recogniser sorts
    // the presses into taps, drags and pinches. The all-covering hit area is
    // also what catches taps on the gap BETWEEN two diamonds, which are
    // frequent on a phone and would otherwise feel like the game ignoring you.
    this.container.eventMode = 'static';
    this.container.hitArea = { contains: () => true };
    this.gestures = new PanZoomGestures(
      this.container,
      // Renderer px -> design px, through the root that fits the design space
      // to the window. The camera's arithmetic lives in design px.
      (g) => this.designPoint(g),
      {
        onGestureStart: () => this.stopFollow(),
        onPan: (dx, dy) => {
          if (this.data?.noCamera) return;
          this.setCam(panCam(this.cam, dx, dy, this.seed, this.canvasW, this.canvasH));
        },
        onPinch: (factor, at) => {
          if (this.data?.noCamera) return;
          this.setCam(zoomCam(this.cam, factor, at, this.seed, this.canvasW, this.canvasH));
        },
        onTap: (at) => this.onTap(at),
      },
    );
    this.gestures.attach();

    // The wheel is bound on the DOM, not through Pixi: Pixi's own wheel
    // listener is passive, and a trackpad pinch (a wheel event with `ctrlKey`)
    // has to be `preventDefault`ed or the browser zooms the page instead.
    const canvas = this.app.canvas as HTMLCanvasElement;
    this.onWheel = (e) => {
      if (this.data?.noCamera) return;
      e.preventDefault();
      this.stopFollow();
      const rect = canvas.getBoundingClientRect();
      const at = this.designPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      // A `deltaMode` of lines (Firefox with a mouse) reports ~3 per notch
      // where pixels report ~100; normalise so a notch is a notch.
      const units = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaY;
      const rate = WHEEL_ZOOM_PER_UNIT * (e.ctrlKey ? TRACKPAD_PINCH_BOOST : 1);
      this.setCam(zoomCam(this.cam, Math.exp(-units * rate), at, this.seed, this.canvasW, this.canvasH));
    };
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** The seed everything on this scene is built from. */
  private get seed(): string { return this.data?.seed ?? ''; }

  /**
   * Renderer px -> design px, through the root that fits the design space to
   * the window. Before the scene is mounted there is no root, and the point
   * is taken as already being in design px — which is what a story sees.
   */
  private designPoint(g: Point): Point {
    const root = this.container.parent;
    if (!root) return { x: g.x, y: g.y };
    const p = root.toLocal(g);
    return { x: p.x, y: p.y };
  }

  /**
   * A press that lifted where it landed: a move.
   *
   * The tile pressed is what Pixi's hit test found under the finger, walls and
   * terraces included (see `Tile.onPress`). Only when the press hit no tile at
   * all — the hairline between two diamonds — is the point resolved
   * geometrically, and terrace-aware: a tap on a plateau must name the
   * plateau, not the grass drawn below it.
   */
  private onTap(at: Point): void {
    const pressed = this.pressTile;
    this.pressTile = null;
    if (pressed !== null) {
      this.requestMove(pressed);
      return;
    }
    const local = this.data?.noCamera ? at : toScene(this.cam, at);
    const idx = terrainTileAt(this.seed, local.x, local.y);
    if (idx !== null) this.requestMove(idx);
  }

  /**
   * Ask to step onto a tile. Only ADJACENT tiles are sent: the server would
   * reject anything else anyway, and silently pathfinding across a minefield is
   * the last thing a player wants done on their behalf.
   */
  private requestMove(to: number): void {
    // No rabbit on this board means this is somebody else's run being watched.
    // Bail BEFORE the flash: the tap must not light a tile up, because the
    // server will (rightly) never act on it and a lit tile that never resolves
    // reads as a broken game rather than as "you are only watching". The same
    // test the reachable ring uses, so the two can never disagree.
    if (!this.data || !this.rabbits.has(this.data.playerId)) return;
    if (to === this.myTile) return;
    const a = toColRow(this.myTile);
    const b = toColRow(to);
    if (Math.abs(a.col - b.col) > 1 || Math.abs(a.row - b.row) > 1) {
      // Out of reach. On a board bigger than the screen players tap far
      // tiles all the time, and a tap that does NOTHING reads as a dead game.
      // The answer is the ring: light every tile a tap CAN reach, at once.
      this.pulseRing();
      return;
    }
    if (!this.tiles.has(to)) return;

    // Flash the tile immediately, before the server has answered. The move may
    // still be refused, but a tap with NO feedback until a round trip reads as
    // a dropped input — and on a phone that is the difference between "this
    // game is responsive" and "this game is broken".
    this.tiles.get(to)?.flash();
    this.data?.onMoveIntent(to);
  }

  /**
   * Move to a different island, without rebuilding the scene.
   *
   * The seed decides the coastline and which ground is painted, and both used
   * to be settled once in `create()` — so a new island meant a new scene, which
   * React did by remounting the whole Pixi app. That was a race it always lost:
   * the app mounts with a placeholder seed, the server answers with the real
   * one, the prop changes, the app is torn down and rebuilt — and the rebuilt
   * scene has already missed the `island` event that carried the rabbits. The
   * result was a board with no tiles and no rabbit on it.
   *
   * Re-cutting the coastline here is cheap (it is arithmetic on a seed) and
   * costs no reload at all.
   */
  async setIsland(seed: string): Promise<void> {
    if (this.data) this.data.seed = seed;
    this.shape = makeShape(seed);

    // Tear down what belonged to the old island, keep everything else.
    this.clearHighlights();
    for (const tile of this.tiles.values()) tile.destroy();
    this.tiles.clear();
    for (const rabbit of this.rabbits.values()) rabbit.destroy();
    this.rabbits.clear();

    this.arrows?.destroy();
    this.arrows = new MoveArrows(this.container, this.shape);
    this.arrows.setSeed(this.data?.seed ?? '');
    this.arrows.setVisible(true);

    // A new island, generated from the new seed.
    this.background?.destroy();
    this.background = await createTerrainBackground(this.container, seed);

    this.syncFlock();
    this.buildTiles();
    this.refreshReachable();

    // The shot is solved from the SEED's own terrain — where its spawn is, how
    // far its lattice reaches — so a new island needs a new one. Without this
    // the scene keeps the previous island's framing while drawing this one,
    // which is how the farm ended up zoomed into a corner.
    this.solveCamera();
  }

  // ── Server events ──────────────────────────────────────────────────────────

  /** The server dug a tile — for everyone on the island, whoever dug it. */
  /**
   * Redraw the number on a tile that is already dug.
   *
   * For hints that CHANGE after the fact: a saboteur's bomb pushing a 2 to a
   * 3, or a mirage bending one. The scene is not told which — it redraws what
   * the server sent, and a number quietly disagreeing with its neighbours is
   * exactly the thing a player is meant to notice for themselves.
   */
  setHint(index: number, adjacent: number): void {
    this.tiles.get(index)?.setHint(adjacent);
  }

  /**
   * The cascade opened this tile's number without digging it.
   *
   * The tile stays covered and still holds whatever it holds; only the count
   * is written on the lid, and the lid thins so the board reads "known, not
   * yet walked" beside "unknown". No sound, no shake: a zone opening is a
   * reading, not an event.
   */
  hintTile(index: number, adjacent: number): void {
    this.tiles.get(index)?.revealHint(adjacent);
  }

  /**
   * A sheep moved, because the server said so.
   *
   * No rules here: the flight logic lives on the server (`flee.ts`), and the
   * client plays what it is told — the same bargain as `rabbit_moved`. A sheep
   * BLOCKS its cell, so a browser that decided this for itself would disagree
   * with the server about which moves are legal.
   *
   * `sprinting` is accepted and not yet used: a bolting sheep should read as
   * faster than a grazing one, but the sprites move instantly today and adding
   * a tween belongs with the rest of the animation work.
   */
  /**
   * A sheep walked a route, because the server said so.
   *
   * Same bargain as `moveSheep` — no rules here, the flight logic is the
   * server's (`flee.ts`) — but with the cells it crossed rather than only
   * where it stopped. `tiles` is in order and its last entry is the
   * destination; that is the one the roster and the reachable ring use, and
   * they are updated NOW, not when the animation lands, so the client never
   * disagrees with the server about which tiles are free.
   */
  walkSheep(id: string, tiles: readonly number[], sprinting = false): void {
    if (!tiles.length) return;
    const last = tiles[tiles.length - 1];
    this.sheepTiles.set(id, last);
    const cells = tiles.map((t) => {
      const { col, row } = toColRow(t);
      return { x: col, y: row };
    });
    // Falls back to the plain hop when the ground has no such sprite — the
    // same stale-roster case `moveSheep` handles by dropping the id.
    this.background?.walkSheep(id, cells, sprinting);
    this.refreshReachable();
  }

  moveSheep(id: string, tile: number, _sprinting = false): void {
    // Remembered first, so a roster that lands before the ground is built
    // (the snapshot races `create`, and `setIsland` rebuilds the ground after
    // the snapshot that named the island) is replayed by `syncFlock`.
    this.sheepTiles.set(id, tile);
    const { col, row } = toColRow(tile);
    this.background?.moveSheep(id, col, row);
    // The ring is drawn from what is walkable, and a sheep that moved just
    // changed that: the cell it left is open now and the one it took is not.
    this.refreshReachable();
  }

  /**
   * Put the flock where the roster says, on freshly built ground.
   *
   * The ground draws the sheep where the SEED put them; the roster is where
   * the server has since moved them. Ids the new island does not know — the
   * previous island's flock, still in the map when the seed changed — are
   * dropped, or the ring would darken tiles nothing stands on.
   */
  private syncFlock(): void {
    for (const [id, tile] of this.sheepTiles) {
      const { col, row } = toColRow(tile);
      if (!this.background?.moveSheep(id, col, row)) this.sheepTiles.delete(id);
    }
  }

  revealTile(index: number, content: TileContent, adjacent: number): void {
    const tile = this.tiles.get(index);
    if (!tile) return;
    // A dug chest has been opened — take the box, its beam and its label off
    // the board. Left standing it would go on advertising a prize that is
    // already in somebody's bag, and on a shared island that is a lie the next
    // player would walk several tiles for. No-op on every other tile.
    tile.clearChest();
    tile.revealContent(content, adjacent);

    if (content === 'bomb') {
      this.sound.playExplosion();
      this.playExplosion(index);
      this.shakeScreen();
      // The blast is over in half a second; the tile has to go on saying
      // "someone died here" for the rest of the run.
      tile.markBombSite();
    } else if (content === 'carrot' || content === 'golden') {
      this.sound.playCoin();
      // Show it, then let it go. Digging a carrot IS taking it — there is no
      // second step — so the pickup animation starts with the reveal.
      tile.collectCarrot();
    } else {
      this.sound.playStep();
    }

    // Ground someone just dug is free to WALK onto, so a neighbour turning
    // revealed can make a tile clickable that a moment ago was not — the case
    // that matters on the last point of energy, where the ring is otherwise
    // dark and this is the player's only remaining move.
    if (this.isNeighborOfMine(index)) this.refreshReachable();
  }

  /**
   * Put the island's undug chests on the board.
   *
   * Chests are the one thing drawn BEFORE it is dug (see `publicView`): the
   * player has to be able to price the walk from across the island, and a box
   * nobody can see until they stand on it is a surprise rather than a decision.
   *
   * Idempotent, because both the join snapshot and every reconnect call this
   * with the same list — `setChest` returns early on a tile that already has
   * one, so a re-applied snapshot never stacks two boxes on a tile.
   *
   * `drop` is for the JOIN only: the chests fall in with the board, which reads
   * as the island being dealt. A reconnect mid-run must not replay that — the
   * chests were already there, and watching them drop again would say something
   * arrived when nothing did.
   */
  showChests(chests: ReadonlyArray<{ tile: number; tier: string }>, drop = false): void {
    for (const c of chests) {
      const tile = this.tiles.get(c.tile);
      if (!tile) continue;
      const tier = isChestTier(c.tier) ? c.tier : 'bronze';
      tile.setChest(CHEST_TIER_COLOR[tier], drop, tier);
    }
  }

  /** Is this tile one of the local rabbit's eight? */
  private isNeighborOfMine(index: number): boolean {
    const a = toColRow(this.myTile);
    const b = toColRow(index);
    return index !== this.myTile
      && Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
  }

  /**
   * The blast — every layer of it. See `fx/Blast.ts` for what each one is for
   * and why the old single-sprite version read as weak.
   *
   * The local rabbit is knocked back when it is standing NEXT to the tile: it
   * is the only thing on screen that can say the blast had a direction. A
   * rabbit standing ON the tile is the death, which the server answers with
   * `playExhausted` and a respawn — not this.
   */
  private playExplosion(index: number): void {
    const seed = this.data?.seed ?? '';
    const me = this.data ? this.rabbits.get(this.data.playerId) : null;
    const hitMe = me != null && this.isNeighborOfMine(index);
    const cancel = playBlast(this.container, seed, index, {
      onShockwave: hitMe
        ? (origin) => { me.playDamage(); knockBack(me.container, origin); }
        : undefined,
    });
    // A scene torn down mid-blast must not fire the later beats into a
    // destroyed container — the run ends on a bomb often enough that this is
    // the common path, not the edge case.
    //
    // The forget-timer goes in `lightningTimers`, which `destroy` already
    // clears: parked on a bare `setTimeout` it would be the one callback left
    // reaching into a dead scene, which is the bug this block exists to stop.
    this.blastCancels.add(cancel);
    const forget = window.setTimeout(() => {
      this.lightningTimers.delete(forget);
      this.blastCancels.delete(cancel);
    }, 1500);
    this.lightningTimers.add(forget);
  }

  /**
   * The lightning strike: a bolt per tile it opened, staggered.
   *
   * Staggered rather than simultaneous because a 3x3 of identical flashes
   * going off on the same frame reads as one big sprite, not as a strike
   * spreading. `LIGHTNING.STAGGER_MS` between them is barely perceptible and
   * is the whole difference.
   *
   * Each bolt picks its shape from the tile index, so every client watching
   * the same strike draws the same weather — and two neighbouring tiles rarely
   * get the same silhouette, which is what stops it reading as a stamp.
   */
  playLightning(target: number, tiles: number[]): void {
    this.sound.playExplosion();
    this.shakeScreen();
    const order = tiles.length > 0 ? tiles : [target];
    order.forEach((index, i) => {
      const delay = i * LIGHTNING.STAGGER_MS;
      const timer = window.setTimeout(() => {
        this.lightningTimers.delete(timer);
        this.playBolt(index);
      }, delay);
      this.lightningTimers.add(timer);
    });
  }

  /** One bolt, standing on its tile. */
  private playBolt(index: number): void {
    const textures = getLightningTextures(index % LIGHTNING_SHAPES);
    if (textures.length === 0) return;

    const { x, y } = tilePos(index);
    const bolt = new AnimatedSprite(textures);
    // Anchored at the FOOT, not the middle: the art draws a bolt falling from
    // the top of its cell and splashing at the bottom, so the splash is what
    // has to land on the tile.
    bolt.anchor.set(0.5, LIGHTNING_FOOT);
    bolt.position.set(x, y - tierLift(this.data?.seed ?? '', index));
    // On the TERRAIN's depth ruler, not a literal — the bolt shares a sorted
    // container with the ground, whose blocks sit in the hundreds. At 60 it
    // was drawn UNDER the island everywhere but the back corner, the same bug
    // the blast had. See `blastDepth`.
    bolt.zIndex = blastDepth(this.data?.seed ?? '', index, 9);
    bolt.animationSpeed = LIGHTNING_FPS / 60;
    bolt.loop = false;
    bolt.onComplete = () => {
      this.container.removeChild(bolt);
      bolt.destroy();
    };
    this.container.addChild(bolt);
    bolt.play();
  }

  /**
   * A short kick on the whole board. The bomb takes energy the player cannot
   * get back, so it should be FELT — the sound and the sprite alone let a blast
   * slide past unnoticed while the player is reading numbers elsewhere.
   *
   * Tweens the container's position and restores it exactly, so repeated blasts
   * cannot accumulate drift.
   */
  // ── Camera ─────────────────────────────────────────────────────────────────

  /**
   * Put the camera somewhere: one transform on the scene container.
   *
   * Everything in the scene — terrain, tiles, rabbits, fog, arrows — is laid
   * out in the board's own coordinates around `ISO_ORIGIN_*`, and stays there.
   * This is the only place that decides how that ground maps onto the screen,
   * which is why the whole scene keeps its measured internal relationships
   * while the shot changes. See `islandCamera` for the arithmetic and the
   * limits; the gestures, the wheel, the follow and the resize all end here.
   *
   * The sky is counter-scaled every time: its bands are parked just off the
   * FRAME's edges, and a camera that dragged the parked bank into view would
   * read as fog rolling over the board.
   */
  private setCam(cam: IslandCam): void {
    this.cam = cam;
    this.camW = this.canvasW;
    this.camH = this.canvasH;
    // A shake owns the position until it completes, and it restores to
    // `this.cam` — which this has just updated. Writing position here as well
    // would fight the tween for the rest of the blast.
    gsap.killTweensOf(this.container.position);
    this.container.scale.set(cam.scale);
    this.container.position.set(cam.x, cam.y);
    this.clouds?.counterCamera(cam.scale, cam.x, cam.y);

    const inView = this.isRabbitInView();
    if (inView !== this.rabbitInView) {
      this.rabbitInView = inView;
      this.rabbitInViewListener?.(inView);
    }
  }

  /** Subscribe the chrome to the rabbit leaving / re-entering the frame. */
  setRabbitInViewListener(cb: ((inView: boolean) => void) | null): void {
    this.rabbitInViewListener = cb;
    this.rabbitInView = this.isRabbitInView();
    cb?.(this.rabbitInView);
  }

  /**
   * Is the local rabbit's tile on screen, at least a tile clear of the edges?
   * True when there is no rabbit to lose (spectating, no camera), so the
   * chrome never offers to find one.
   */
  private isRabbitInView(): boolean {
    if (!this.data || this.data.noCamera || !this.rabbits.has(this.data.playerId)) return true;
    const on = toScreen(this.cam, tileScreenPos(this.seed, this.myTile));
    const margin = HALF_W * 2 * this.cam.scale;
    return on.x > margin && on.x < this.canvasW - margin
      && on.y > margin && on.y < this.canvasH - margin;
  }

  /** Slide back to the local rabbit, keeping the player's zoom. */
  recentre(): void {
    if (this.data?.noCamera) return;
    this.slideTo(tileScreenPos(this.seed, this.myTile));
  }

  /**
   * The opening shot for this island: the default zoom, centred on the local
   * rabbit if there is one and on the spawn otherwise — which is where the
   * rabbit is about to land.
   */
  private solveCamera(): void {
    this.stopFollow();
    this.lastPortrait = this.canvasH > this.canvasW;
    if (this.data?.noCamera) {
      this.setCam({ scale: 1, x: 0, y: 0 });
      return;
    }
    const me = this.data ? this.rabbits.get(this.data.playerId) : null;
    const focus = me ? tileScreenPos(this.seed, this.myTile) : undefined;
    this.setCam(islandCam(this.seed, this.canvasW, this.canvasH, focus));
  }

  /**
   * The canvas changed size under the camera.
   *
   * A resize keeps the player's zoom and whatever was in the middle of the
   * screen, and only re-clamps — the player chose that shot, and a window
   * being dragged wider is no reason to take it away. A ROTATION is different:
   * the design space swaps from 960x540 to 480x860, and the zoom that made a
   * 60px tile in one is nonsense in the other, so it re-opens on the default.
   */
  private reframe(): void {
    if (this.data?.noCamera) return;
    const portrait = this.canvasH > this.canvasW;
    if (this.lastPortrait !== null && portrait !== this.lastPortrait) {
      this.solveCamera();
      return;
    }
    this.lastPortrait = portrait;
    // The scene point that was centred BEFORE the size changed, re-centred on
    // the new canvas. Recovered from the camera and the canvas it was solved
    // against, not from the renderer's pixel size — the camera works in
    // design px and those are what it was centred in.
    const centre = toScene(this.cam, { x: this.camW / 2, y: this.camH / 2 });
    this.setCam(lookAt(this.seed, centre, this.cam.scale, this.canvasW, this.canvasH));
  }

  /**
   * Slide the camera to keep the local rabbit in frame.
   *
   * Not a follow-cam: the camera holds still while the rabbit walks around the
   * middle of the screen, so the ground does not drift under every hop, and
   * only moves once the rabbit gets within `FOLLOW_MARGIN` of an edge. Then it
   * re-centres in one slide. A player who has panned away to read the far
   * side of the island gets the camera brought back on their next step, which
   * is also when they need it back.
   */
  private keepInView(): void {
    if (this.data?.noCamera) return;
    // A finger on the screen owns the camera; the follow waits for the next
    // step rather than fighting the drag for it.
    if (this.gestures?.active) return;
    const at = tileScreenPos(this.seed, this.myTile);
    const on = toScreen(this.cam, at);
    const W = this.canvasW;
    const H = this.canvasH;
    const inside = on.x > W * FOLLOW_MARGIN && on.x < W * (1 - FOLLOW_MARGIN)
      && on.y > H * FOLLOW_MARGIN && on.y < H * (1 - FOLLOW_MARGIN);
    if (inside) return;
    this.slideTo(at);
  }

  /** Centre `at` (scene px) in one eased slide, at the current zoom. */
  private slideTo(at: Point): void {
    this.stopFollow();
    const to = lookAt(this.seed, at, this.cam.scale, this.canvasW, this.canvasH);
    const proxy = { x: this.cam.x, y: this.cam.y };
    this.follow = gsap.to(proxy, {
      x: to.x,
      y: to.y,
      duration: FOLLOW_SECONDS,
      ease: 'power2.out',
      onUpdate: () => this.setCam({ scale: to.scale, x: proxy.x, y: proxy.y }),
      onComplete: () => { this.follow = null; },
    });
  }

  /** A finger on the screen owns the camera; the follow lets go. */
  private stopFollow(): void {
    this.follow?.kill();
    this.follow = null;
  }

  private shakeScreen(): void {
    // One hard hit that DECAYS, rather than the same jolt eight times — see
    // `impactShake`. Restores to the CAMERA's framing rather than to a
    // position captured when the shake began: a pan mid-blast moves the
    // camera, and returning to the old spot would undo it.
    impactShake(this.container, this.cam, SHAKE_PX);
  }

  /**
   * A rabbit appeared (joined, or respawned after an eruption).
   *
   * A rabbit we already hold is REPOSITIONED rather than ignored. This arrives
   * from an island snapshot, which is the server's word on where everyone is:
   * a player who walked home and came back out gets a new rabbit at the spawn,
   * and the sprite left standing wherever the old run ended has to be moved to
   * meet it. Dropping the event instead left them looking at a rabbit that was
   * not where the server thought they were, and every move they made was
   * answered from the spawn.
   */
  addRabbit(playerId: string, name: string, index: number, seatIndex: number, energy?: number): void {
    const known = this.rabbits.get(playerId);
    if (known) {
      // Teleport, not `moveTo`: a respawn is not a hop, and the spawn is
      // usually nowhere near the tile the last run ended on.
      known.cancelMove();
      known.setPosition(index);
      known.playSpawnDrop();
      if (playerId === this.data?.playerId) {
        this.myTile = index;
        this.stunnedUntil = 0;
        if (energy !== undefined) this.myEnergy = energy;
        this.refreshReachable();
        // A respawn is a cut, not a hop: the camera cuts with it.
        this.solveCamera();
      }
      return;
    }
    const sheet = BUNNY_SHEETS[seatIndex % BUNNY_SHEETS.length];
    const rabbit = new PlayerRabbit(index, sheet, this.data?.seed ?? '');
    this.rabbits.set(playerId, rabbit);
    this.container.addChild(rabbit.container);
    rabbit.playSpawnDrop();
    if (playerId === this.data?.playerId) {
      this.myTile = index;
      // A fresh rabbit is never stunned, whatever the last run ended in.
      this.stunnedUntil = 0;
      if (energy !== undefined) this.myEnergy = energy;
      this.refreshReachable();
      // Open on the rabbit, wherever the spawn came out on this island.
      this.solveCamera();
    }
  }

  /**
   * A rabbit moved. Positions come from the server, never from local input.
   *
   * `energy` is the mover's, straight off the same event the HUD reads. Taken
   * here rather than tracked locally because a dig's real cost is the server's
   * to decide (a bomb takes more than a step does) — and the ring needs the
   * true figure to know whether the next dig is still affordable.
   */
  moveRabbit(playerId: string, index: number, energy?: number): void {
    const rabbit = this.rabbits.get(playerId);
    if (!rabbit) return;
    rabbit.moveTo(index);
    if (playerId === this.data?.playerId) {
      this.myTile = index;
      if (energy !== undefined) this.myEnergy = energy;
      this.sound.playHop();
      // The ring travels with the rabbit.
      this.refreshReachable();
      // And so does the camera, once the rabbit nears the edge of the frame.
      this.keepInView();
    }
  }

  /**
   * The local rabbit's energy changed without it moving (a carrot banked by
   * someone else's dig, a refill). Re-lights the ring only when the change
   * crosses the "can I afford a dig?" line, which is the only thing the ring
   * reads energy for.
   */
  setEnergy(energy: number): void {
    const couldDig = canDig(this.myEnergy);
    this.myEnergy = energy;
    if (couldDig !== canDig(energy)) this.refreshReachable();
  }

  /**
   * A bomb went off under someone: damage animation, then the knockback.
   *
   * `stunnedUntil` is the server's own timestamp. While it stands the server
   * refuses every move, so the ring goes dark for exactly that long rather than
   * inviting taps that will bounce — and comes back by itself when it lapses.
   */
  bombHit(playerId: string, landedOn: number, stunnedUntil?: number): void {
    const rabbit = this.rabbits.get(playerId);
    if (!rabbit) return;
    // The throw, not a teleport — see `playKnockback`. The `rabbit_moved`
    // that follows carries the same tile and is swallowed by the flight.
    rabbit.playDamage();
    rabbit.playKnockback(landedOn);
    if (playerId === this.data?.playerId) {
      this.myTile = landedOn;
      if (stunnedUntil !== undefined) this.stunnedUntil = stunnedUntil;
      this.refreshReachable();
      // A knockback can throw the rabbit clean out of the frame.
      this.keepInView();
    }
  }

  /**
   * A run ended. The rabbit is spent, not dead — it drops where it stands.
   *
   * A run only ever ends on `energy <= 0` (`run.ts`), so there is nothing to
   * mourn: the death animation, the ascending ghost and the death sting all
   * claimed a fatality the rules never hand out, and the recap on the same
   * screen says "Out of energy" underneath them.
   */
  exhaustRabbit(playerId: string): void {
    this.rabbits.get(playerId)?.playExhausted();
    if (playerId === this.data?.playerId) {
      // Nothing is reachable on an empty tank — leaving the ring lit would
      // invite clicks the server will refuse.
      this.clearHighlights();
      this.arrows?.update(null);
    }
  }

  removeRabbit(playerId: string): void {
    this.rabbits.get(playerId)?.destroy();
    this.rabbits.delete(playerId);
  }

  /** Pixi's ticker, in real milliseconds. */
  update(deltaTime: number): void {
    this.clouds?.update(deltaTime * (1000 / 60));
    // The island breathes: trees sway, bushes rustle, the flock shifts.
    this.background?.update(deltaTime * (1000 / 60));

    // The canvas can change size WITHOUT a window resize — the season board
    // mounting or unmounting beside it does exactly that, and the ground was
    // left sized for the old box, showing bare sea at the bottom. Cheap to
    // check, and it only does work when the number actually moved.
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w;
      this.lastH = h;
      this.background?.layout(this.canvasW / 2, this.canvasH / 2);
      this.clouds?.resize(this.canvasW, this.canvasH);
      this.reframe();
    }
  }

  destroy(): void {
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = null;
    }
    this.clearHighlights();
    // A strike is staggered over a few hundred ms — easily long enough to
    // outlive an island change and fire a bolt into a destroyed container.
    for (const timer of this.lightningTimers) window.clearTimeout(timer);
    this.lightningTimers.clear();
    // Same reason as the bolts: a blast's debris, smoke and scorch land up to
    // 150ms after the bang, which easily outlives an island change.
    for (const cancel of this.blastCancels) cancel();
    this.blastCancels.clear();
    this.stopFollow();
    this.gestures?.destroy();
    this.gestures = null;
    if (this.onWheel) {
      (this.app.canvas as HTMLCanvasElement).removeEventListener('wheel', this.onWheel);
      this.onWheel = null;
    }
    this.clouds?.destroy();
    this.arrows?.destroy();
    this.controls?.destroy();
    this.background?.destroy();
    this.sound.stopMusic();
    for (const r of this.rabbits.values()) r.destroy();
    this.container.destroy({ children: true });
  }
}
