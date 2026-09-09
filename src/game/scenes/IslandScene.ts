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
import { createIslandBackground, type IslandBackground } from '../services/IslandBackground';
import { MoveArrows } from '../ui/MoveArrows';
import { CloudField } from '../fx/Clouds';
import * as Keys from '@/config/assetKeys';
import {
  COLS, ROWS, SPAWN_INDEX, GRID_CENTER_X, GRID_CENTER_Y,
  isForbidden, makeShape, neighbors, screenToTile, tilePos, tileInScreenDirection,
  toColRow, type IslandShape,
} from '@/config/gridConfig';
import type { TileContent } from '@/lib/game/types';

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
  private background: IslandBackground | null = null;

  private shape: IslandShape = makeShape('default');
  private tiles = new Map<number, Tile>();
  private rabbits = new Map<string, PlayerRabbit>();
  private data: IslandSceneData | null = null;

  /** The tiles currently lit as reachable, and the sweep running over them. */
  private highlighted: number[] = [];
  private sweep: gsap.core.Tween | null = null;
  private arrows: MoveArrows | null = null;
  private clouds: CloudField | null = null;

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
    this.background = await createIslandBackground(
      this.container,
      GAME_W / 2,
      GAME_H / 2,
    );

    // The sky, behind everything: the island already moves (surf, volcano
    // smoke), so a dead blue border around it makes the frame look like a
    // screenshot. Clouds only ever cross the SEA — never the board, where they
    // would hide the numbers the game is read from.
    this.clouds = new CloudField(this.container, { width: GAME_W, height: GAME_H });

    this.buildTiles();
    // The keyboard hint, drawn ON the board rather than as a legend beside it:
    // the board answers "where does UP go?" by pointing at the answer.
    this.arrows = new MoveArrows(this.container, this.shape);
    this.arrows.setVisible(true);
    this.attachControls();
    this.refreshReachable();
    this.sound.startMusic(Keys.MUSIC_ISLAND);
  }

  /** One Tile per land square. Water squares get nothing — not a hidden tile. */
  private buildTiles(): void {
    for (let i = 0; i < COLS * ROWS; i++) {
      if (isForbidden(i, this.shape)) continue;
      const tile = new Tile(i);
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
   */
  private refreshReachable(): void {
    this.clearHighlights();

    const me = this.data ? this.rabbits.get(this.data.playerId) : null;
    if (!me) {
      this.arrows?.update(null);
      return;
    }

    for (const index of neighbors(this.myTile, this.shape)) {
      const tile = this.tiles.get(index);
      if (!tile) continue;
      tile.setHighlight(true);
      this.highlighted.push(index);
    }
    this.arrows?.update(this.myTile);
    this.startSweep();
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
      const idx = screenToTile(local.x, local.y, this.shape);
      if (idx !== null) this.requestMove(idx);
    });
  }

  /**
   * Ask to step onto a tile. Only ADJACENT tiles are sent: the server would
   * reject anything else anyway, and silently pathfinding across a minefield is
   * the last thing a player wants done on their behalf.
   */
  private requestMove(to: number): void {
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

  // ── Server events ──────────────────────────────────────────────────────────

  /** The server dug a tile — for everyone on the island, whoever dug it. */
  revealTile(index: number, content: TileContent, adjacent: number): void {
    const tile = this.tiles.get(index);
    if (!tile) return;
    tile.revealContent(content, adjacent);

    if (content === 'bomb') {
      this.sound.playExplosion();
      this.playExplosion(index);
      this.shakeScreen();
    } else if (content === 'carrot' || content === 'golden') {
      this.sound.playCoin();
    } else {
      this.sound.playStep();
    }
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
  addRabbit(playerId: string, name: string, index: number, seatIndex: number): void {
    if (this.rabbits.has(playerId)) return;
    const sheet = BUNNY_SHEETS[seatIndex % BUNNY_SHEETS.length];
    const rabbit = new PlayerRabbit(index, sheet);
    this.rabbits.set(playerId, rabbit);
    this.container.addChild(rabbit.container);
    rabbit.playSpawnDrop();
    if (playerId === this.data?.playerId) {
      this.myTile = index;
      this.refreshReachable();
    }
  }

  /** A rabbit moved. Positions come from the server, never from local input. */
  moveRabbit(playerId: string, index: number): void {
    const rabbit = this.rabbits.get(playerId);
    if (!rabbit) return;
    rabbit.moveTo(index);
    if (playerId === this.data?.playerId) {
      this.myTile = index;
      this.sound.playHop();
      // The ring travels with the rabbit.
      this.refreshReachable();
    }
  }

  /** A bomb went off under someone: damage animation, then the knockback. */
  bombHit(playerId: string, landedOn: number): void {
    const rabbit = this.rabbits.get(playerId);
    if (!rabbit) return;
    rabbit.playDamage();
    rabbit.setPosition(landedOn);
    if (playerId === this.data?.playerId) {
      this.myTile = landedOn;
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

  /** Pixi's ticker, in real milliseconds. Only the sky needs it. */
  update(deltaTime: number): void {
    this.clouds?.update(deltaTime * (1000 / 60));
  }

  destroy(): void {
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
