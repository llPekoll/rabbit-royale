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
import { PlayerRabbit } from '../entities/PlayerRabbit';
import { SoundManager } from '../services/SoundManager';
import { getExplosionTextures } from '../services/AssetLoader';
import { KeyboardControls } from '../services/KeyboardControls';
import { createTerrainBackground, type TerrainBackground } from '../services/TerrainBackground';
import { MoveArrows } from '../ui/MoveArrows';
import { CloudField } from '../fx/Clouds';
import * as Keys from '@/config/assetKeys';
import {
  COLS, ROWS, SPAWN_INDEX, GRID_CENTER_X, GRID_CENTER_Y,
  isForbidden, makeShape, screenToTile, tilePos, tileInScreenDirection,
  toColRow, type IslandShape,
} from '@/config/gridConfig';
import { farmableTiles, terrainTileAt, tierLift } from '@/lib/game/terrainBoard';
import type { TileContent } from '@/lib/game/types';
import { ENERGY } from '@config/tuning';
import { reachableTiles } from '@/lib/game/reachable';

/** What the scene needs from the outside world. The socket layer supplies it. */
export interface IslandSceneData {
  /** Seed the island's coastline is cut from — the server's island id. */
  seed: string;
  /** Called when the player wants to step to a tile. The server decides. */
  onMoveIntent(index: number): void;
  /** The local player's id, so their own rabbit can be told apart. */
  playerId: string;
}

/** Explosion presentation. The art is a 48x48 sheet — see AssetLoader. */
const EXPLOSION_SCALE = 1.6;
/** Lifted off the tile centre so the blast reads as going OFF, not lying flat. */
const EXPLOSION_LIFT = 20;
const EXPLOSION_FPS = 20;
/** Peak offset of the board kick, in design px. */
const SHAKE_PX = 4;
/** Seconds between blinks as the sweep travels round the rabbit. */
const SWEEP_STEP_SECONDS = 0.25;

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
  private data: IslandSceneData | null = null;

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

  /** Where the local rabbit is, for direction-relative movement. */
  private myTile = SPAWN_INDEX;

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

    // The sky, behind everything: the island already moves (surf, volcano
    // smoke), so a dead blue border around it makes the frame look like a
    // screenshot. Clouds only ever cross the SEA — never the board, where they
    // would hide the numbers the game is read from.
    this.clouds = new CloudField(this.container, { width: GAME_W, height: GAME_H });

    // The design space is scaled to FIT the window, so a viewport that is not
    // 16:9 leaves bare canvas the ground has to reach across. That margin
    // changes with every resize, hence the listener rather than a one-off.
    this.onResize = () => this.background?.layout(GAME_W / 2, GAME_H / 2);
    window.addEventListener('resize', this.onResize);

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
      const tile = new Tile(i, undefined, tierLift(this.data?.seed ?? '', i));
      // Per-tile click. The Seeker is a touch device, so this — not the
      // keyboard — is how the game is actually played.
      tile.container.on('pointertap', () => this.requestMove(i));
      this.tiles.set(i, tile);
      this.container.addChild(tile.container);
    }
    this.tiles.get(SPAWN_INDEX)?.markSpawn();
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

    // Tiles carry their own click handler (see buildTiles). This catches taps
    // that land on the gap BETWEEN two diamonds, which are frequent on a phone
    // and would otherwise feel like the game ignoring you.
    this.container.eventMode = 'static';
    this.container.hitArea = { contains: () => true };
    this.container.on('pointertap', (e) => {
      const local = this.container.toLocal(e.global);
      // Terrace-aware: a tap on a plateau must name the plateau, not the
      // grass drawn below it.
      const idx = terrainTileAt(this.data?.seed ?? '', local.x, local.y);
      if (idx !== null) this.requestMove(idx);
    });
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
    if (Math.abs(a.col - b.col) > 1 || Math.abs(a.row - b.row) > 1) return;
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

    this.myTile = SPAWN_INDEX;
    this.buildTiles();
    this.refreshReachable();
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

  revealTile(index: number, content: TileContent, adjacent: number): void {
    const tile = this.tiles.get(index);
    if (!tile) return;
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

  /** Is this tile one of the local rabbit's eight? */
  private isNeighborOfMine(index: number): boolean {
    const a = toColRow(this.myTile);
    const b = toColRow(index);
    return index !== this.myTile
      && Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
  }

  /**
   * The blast. Drawn ABOVE everything on the tile (zIndex 55, over the rabbits'
   * 50) and lifted off the tile's centre, because an explosion whose middle
   * sits on the ground reads as a puddle rather than as something going off.
   *
   * Fire-and-forget: it removes and destroys itself on the last frame, so
   * nothing has to track it.
   */
  private playExplosion(index: number): void {
    const textures = getExplosionTextures();
    if (textures.length === 0) return;

    const { x, y } = tilePos(index);
    const boom = new AnimatedSprite(textures);
    boom.anchor.set(0.5);
    boom.position.set(x, y - EXPLOSION_LIFT);
    boom.scale.set(EXPLOSION_SCALE);
    boom.zIndex = 55;
    boom.animationSpeed = EXPLOSION_FPS / 60;
    boom.loop = false;
    boom.onComplete = () => {
      this.container.removeChild(boom);
      boom.destroy();
    };
    this.container.addChild(boom);
    boom.play();
  }

  /**
   * A short kick on the whole board. The bomb takes energy the player cannot
   * get back, so it should be FELT — the sound and the sprite alone let a blast
   * slide past unnoticed while the player is reading numbers elsewhere.
   *
   * Tweens the container's position and restores it exactly, so repeated blasts
   * cannot accumulate drift.
   */
  private shakeScreen(): void {
    const { x, y } = this.container.position;
    gsap.killTweensOf(this.container.position);
    gsap.to(this.container.position, {
      x: x + SHAKE_PX,
      y: y + SHAKE_PX * 0.6,
      duration: 0.05,
      repeat: 7,
      yoyo: true,
      ease: 'none',
      onComplete: () => this.container.position.set(x, y),
    });
  }

  /** A rabbit appeared (joined, or respawned after an eruption). */
  addRabbit(playerId: string, name: string, index: number, seatIndex: number, energy?: number): void {
    if (this.rabbits.has(playerId)) return;
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
    }
  }

  /**
   * The local rabbit's energy changed without it moving (a carrot banked by
   * someone else's dig, a refill). Re-lights the ring only when the change
   * crosses the "can I afford a dig?" line, which is the only thing the ring
   * reads energy for.
   */
  setEnergy(energy: number): void {
    const couldDig = this.myEnergy >= ENERGY.DIG_COST;
    this.myEnergy = energy;
    if (couldDig !== (energy >= ENERGY.DIG_COST)) this.refreshReachable();
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
    rabbit.playDamage();
    rabbit.setPosition(landedOn);
    if (playerId === this.data?.playerId) {
      this.myTile = landedOn;
      if (stunnedUntil !== undefined) this.stunnedUntil = stunnedUntil;
      this.refreshReachable();
    }
  }

  /** A run ended. The rabbit dies in place and its ghost drifts off. */
  killRabbit(playerId: string): void {
    this.rabbits.get(playerId)?.playDeath();
    if (playerId === this.data?.playerId) {
      this.sound.playDie();
      // Nothing is reachable from a dead rabbit — leaving the ring lit would
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
      this.background?.layout(GAME_W / 2, GAME_H / 2);
    }
  }

  destroy(): void {
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = null;
    }
    this.clearHighlights();
    this.clouds?.destroy();
    this.arrows?.destroy();
    this.controls?.destroy();
    this.background?.destroy();
    this.sound.stopMusic();
    for (const r of this.rabbits.values()) r.destroy();
    this.container.destroy({ children: true });
  }
}
