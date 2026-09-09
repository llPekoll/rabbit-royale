/**
 * Your burrow, as a place rather than a list of cards.
 *
 * The screen has two jobs. It shows what you own — the field, the mound, what
 * grew while you were away — and it is where you PLACE TRAPS, which is the only
 * defence you get and the reason the layout is a board at all.
 *
 * A raider crosses this same ground (see burrowConfig): they enter by the path
 * and walk towards the field, spending energy, and your traps drain it. So the
 * question this screen asks the owner is a spatial one — which approach do I
 * make expensive? — and it can only be asked on a map.
 */
import { Application, Container, Sprite, Texture, Graphics } from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { GAME_W, GAME_H } from '../Application';
import { CloudField } from '../fx/Clouds';
import { getDiamondOutline } from '../services/TileTextures';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, BURROW_ZOOM,
  burrowCell, burrowTilePos, burrowTileDepth, isTrappable,
} from '@/config/burrowConfig';

const BACKDROP_URL = '/assets/island/burrow_generated.webp';

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

export interface BurrowSceneData {
  /** Tiles that already hold a trap. */
  traps: number[];
  /** True while the owner is choosing where to put one. */
  placing: boolean;
  /** Called when a trappable tile is tapped. The server decides. */
  onPlace(tile: number): void;
}

export class BurrowScene implements Scene {
  container: Container;
  private clouds: CloudField | null = null;
  private backdrop: Sprite | null = null;
  private board = new Container();
  private trapSprites = new Map<number, Container>();
  private hints: Sprite[] = [];
  private data: BurrowSceneData = { traps: [], placing: false, onPlace: () => {} };

  constructor(private app: Application, _sceneManager: SceneManager) {
    this.container = new Container();
    this.container.sortableChildren = true;
    this.board.sortableChildren = true;
  }

  init(data?: unknown): void {
    if (data) this.data = data as BurrowSceneData;
  }

  async create(): Promise<void> {
    await this.buildBackdrop();
    // The same sky as the island, so the two screens are the same world.
    this.clouds = new CloudField(this.container, { width: GAME_W, height: GAME_H });

    this.container.addChild(this.board);
    this.buildBoard();
    this.setPlacing(this.data.placing);
    for (const tile of this.data.traps) this.addTrap(tile, false);
  }

  private async buildBackdrop(): Promise<void> {
    const img = new Image();
    img.src = BACKDROP_URL;
    try {
      await img.decode();
    } catch {
      console.warn('[burrow] backdrop failed to load');
      return;
    }
    const tex = Texture.from(img);
    tex.source.scaleMode = 'nearest';
    tex.source.autoGenerateMipmaps = false;

    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.position.set(GAME_W / 2, GAME_H / 2);
    // Cover the canvas, then ZOOM past it: the art draws a small homestead in a
    // wide field, and at 1x the played ground was a third of the frame. See
    // BURROW_ZOOM.
    const cover = Math.max(GAME_W / img.naturalWidth, GAME_H / img.naturalHeight);
    sprite.width = img.naturalWidth * cover * BURROW_ZOOM;
    sprite.height = img.naturalHeight * cover * BURROW_ZOOM;
    sprite.zIndex = -10;
    this.backdrop = sprite;
    this.container.addChild(sprite);
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
      if (burrowCell(i) === 'blocked') continue;

      const { x, y } = burrowTilePos(i);
      // Outline rather than fill: an outlined diamond reads as a CELL you can
      // pick, where a flat wash just tinted the artwork underneath.
      const hint = new Sprite(getDiamondOutline());
      hint.anchor.set(0.5);
      hint.position.set(x, y);
      hint.zIndex = burrowTileDepth(i);
      hint.tint = PLACEABLE_TINT;
      hint.alpha = 0;
      hint.eventMode = 'static';
      hint.visible = false;
      hint.on('pointertap', () => {
        if (this.data.placing && isTrappable(i)) this.data.onPlace(i);
      });
      this.board.addChild(hint);
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
    this.hints.forEach((hint, n) => {
      const tile = this.tileOfHint(n);
      const usable = placing && isTrappable(tile) && !this.trapSprites.has(tile);
      hint.visible = usable;
      hint.cursor = usable ? 'pointer' : 'default';
      gsap.killTweensOf(hint);
      gsap.to(hint, { alpha: usable ? PLACEABLE_ALPHA : 0, duration: 0.2 });
    });
  }

  /** The board skips blocked tiles, so hint order is not tile order. */
  private tileOfHint(n: number): number {
    let seen = 0;
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(i) === 'blocked') continue;
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
    const { x, y } = burrowTilePos(tile);

    const group = new Container();
    group.position.set(x, y);
    group.zIndex = burrowTileDepth(tile) + 0.5;

    const marker = new Sprite(getDiamondOutline());
    marker.anchor.set(0.5);
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

    this.board.addChild(group);
    this.trapSprites.set(tile, group);

    if (animate) {
      group.scale.set(0);
      gsap.to(group.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2)' });
    }
    // The tile it sits on is no longer placeable.
    this.setPlacing(this.data.placing);
  }

  /** A trap was sprung or removed. */
  removeTrap(tile: number): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;
    this.trapSprites.delete(tile);
    gsap.to(group, {
      alpha: 0,
      duration: 0.25,
      onComplete: () => group.destroy({ children: true }),
    });
    this.setPlacing(this.data.placing);
  }

  update(deltaTime: number): void {
    this.clouds?.update(deltaTime * (1000 / 60));
  }

  destroy(): void {
    this.clouds?.destroy();
    for (const g of this.trapSprites.values()) gsap.killTweensOf(g);
    this.trapSprites.clear();
    for (const h of this.hints) gsap.killTweensOf(h);
    this.hints = [];
    this.backdrop?.destroy();
    this.container.destroy({ children: true });
  }
}
