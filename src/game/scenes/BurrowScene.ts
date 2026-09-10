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
import { Application, Container, Sprite, Texture, Graphics, type BitmapText } from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { GAME_W, GAME_H } from '../Application';
import { CloudField } from '../fx/Clouds';
import { CarrotCrop } from '../entities/CarrotCrop';
import { getDiamondOutline } from '../services/TileTextures';
import { pixelText } from '../ui/PixelText';
import * as Keys from '@/config/assetKeys';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, BURROW_ZOOM,
  burrowCell, burrowTilePos, burrowTileDepth, isTrappable,
} from '@/config/burrowConfig';
import { burrowArt } from '@/config/burrowArt';
import { homeCam, boardCam, type BurrowCam } from './burrowCamera';

// The hand-drawn art, field left BARE — the crop is drawn over it as live,
// growing sprites (see components/carrot-field.tsx), because a carrot painted
// into a backdrop can never grow.
//
// WHICH painting depends on the burrow's level (see config/burrowArt), so an
// upgrade is something you can see rather than only a number that moved. The
// board does not move with it: every level's art is pre-aligned to put the
// field in the same place, so burrowConfig's origin, zoom and LAYOUT — measured
// against level 1 — hold for all of them. test/burrow-calibration.test.ts
// enforces that, for every level.

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
// The same board, read from the other side. A raider sees clue NUMBERS and the
// steps they may take; they never see a trap until they spring it, which is the
// whole reason burying one is worth doing.

/** A tile the raider has read. Cool and dim: it is known, not offered. */
const SEEN_TINT = 0x9fb4c7;
const SEEN_ALPHA = 0.30;
/** A tile the raider may step onto next. The one thing asking to be tapped. */
const STEP_TINT = 0xffd45c;
const STEP_ALPHA = 0.55;
/** Where the raider stands. */
const RAIDER_TINT = 0xff8c42;
/** Clue colours by count, so a 3 reads as worse than a 1 before it is read as
 *  a number at all — the same trick the island's hints use. */
const CLUE_COLOURS = [0x7fd1ff, 0x8fe388, 0xffd45c, 0xff9d5c, 0xff6b6b];

/** One tile as a raider may see it. `clue` null means a smoke screen hides it. */
export interface RaidTile {
  tile: number;
  clue: number | null;
}

export interface BurrowSceneData {
  /** Tiles that already hold a trap. */
  traps: number[];
  /** True while the owner is choosing where to put one. */
  placing: boolean;
  /** Called when a trappable tile is tapped. The server decides. */
  onPlace(tile: number): void;
  /**
   * How full the garden is, 0..1 — `gardenReady / capacity`.
   *
   * Drives the crop growing in the field. Absent (or null) runs the decorative
   * loop instead, for a viewer with no garden of their own.
   */
  gardenProgress?: number | null;
  /**
   * The burrow's level, which picks the backdrop.
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
  private backdrop: Sprite | null = null;
  /** Which art is currently up, so a level change can skip a no-op reload. */
  private backdropUrl: string | null = null;
  private crop: CarrotCrop | null = null;
  private board = new Container();
  private trapSprites = new Map<number, Container>();
  private hints: Sprite[] = [];
  /** The raid overlay: the attacker's read of this board. Empty when at home. */
  private raidCells: Sprite[] = [];
  private raidLabels: BitmapText[] = [];
  private raiding = false;
  /** Where the camera is now, so a re-entry does not re-tween to where it sits. */
  private cam: BurrowCam = homeCam();
  private onResize: (() => void) | null = null;
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

  private async buildBackdrop(): Promise<void> {
    const url = burrowArt(this.data.level);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      console.warn('[burrow] backdrop failed to load');
      return;
    }
    this.backdropUrl = url;
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
    // An upgrade replaces the picture in place. Destroying the old sprite
    // rather than leaving it behind matters: they are the full canvas at
    // BURROW_ZOOM, so stacking them would keep every backdrop the player has
    // ever had resident and drawn.
    this.backdrop?.destroy();
    this.backdrop = sprite;
    this.container.addChild(sprite);
  }

  /**
   * The burrow was upgraded — show the level's art.
   *
   * The board, the crop and the traps all stay exactly where they are: every
   * level's painting is pre-aligned on the same field, so this changes the
   * picture and nothing about the ground underneath it.
   */
  async setLevel(level: number | null | undefined): Promise<void> {
    this.data.level = level;
    if (burrowArt(level) === this.backdropUrl) return;
    await this.buildBackdrop();
  }

  /**
   * The crop growing in the field.
   *
   * Positioned from the SAME plot list the still art was measured with
   * (carrotPlots.json), in the backdrop's own coordinate space — so the plants
   * sit in the furrows the art draws, at any canvas size, with no offsets
   * tuned by hand.
   */
  private buildCrop(): void {
    const sheet = Texture.from(Keys.CARROT_GROWTH);
    this.crop = new CarrotCrop(this.container, sheet);
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
    this.moveCamera(this.wantedCam());
    this.hints.forEach((hint, n) => {
      const tile = this.tileOfHint(n);
      const usable = placing && isTrappable(tile) && !this.trapSprites.has(tile);
      hint.visible = usable;
      hint.cursor = usable ? 'pointer' : 'default';
      gsap.killTweensOf(hint);
      gsap.to(hint, { alpha: usable ? PLACEABLE_ALPHA : 0, duration: 0.2 });
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
    return (this.raiding || this.data.placing) ? boardCam() : homeCam();
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
   */
  setRaid(state: {
    view: RaidTile[];
    /** Where the raider stands. */
    at: number;
    /** Tiles they may step onto — the server's list, not ours. */
    steps: number[];
    onStep(tile: number): void;
  } | null): void {
    this.clearRaid();
    if (!state) {
      // Back to being a home: the owner's own traps come back into view, and
      // the camera comes back in with them (setPlacing reframes).
      for (const tile of this.data.traps) this.addTrap(tile, false);
      this.setPlacing(this.data.placing);
      return;
    }

    // A raider must not see the OWNER's traps. They are hidden rather than
    // never drawn, because the same scene serves both sides and the owner may
    // have been looking at their own burrow a moment ago.
    for (const group of this.trapSprites.values()) group.visible = false;
    // Set before setPlacing: it reframes, and a raid wants the pulled-back
    // board — without this the camera would fly home and straight back out.
    this.raiding = true;
    this.setPlacing(false);
    const steppable = new Set(state.steps);

    for (const { tile, clue } of state.view) {
      const { x, y } = burrowTilePos(tile);
      const canStep = steppable.has(tile);

      const cell = new Sprite(getDiamondOutline());
      cell.anchor.set(0.5);
      cell.position.set(x, y);
      cell.zIndex = burrowTileDepth(tile);
      cell.tint = canStep ? STEP_TINT : SEEN_TINT;
      cell.alpha = canStep ? STEP_ALPHA : SEEN_ALPHA;
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
        label.zIndex = burrowTileDepth(tile) + 0.4;
        this.board.addChild(label);
        this.raidLabels.push(label);
      }
    }

    // The raider themselves, on top of their own tile.
    const here = burrowTilePos(state.at);
    const marker = new Sprite(getDiamondOutline());
    marker.anchor.set(0.5);
    marker.position.set(here.x, here.y);
    marker.zIndex = burrowTileDepth(state.at) + 0.6;
    marker.tint = RAIDER_TINT;
    marker.alpha = 0.95;
    this.board.addChild(marker);
    this.raidCells.push(marker);
  }

  /**
   * A trap went off under the raider.
   *
   * Its own call rather than something inferred from the next `setRaid`,
   * because springing a trap is the moment the raid turns and it has to be felt
   * — a board that simply redrew one tile darker would not register.
   */
  springTrap(tile: number): void {
    const { x, y } = burrowTilePos(tile);
    const blast = new Sprite(getDiamondOutline());
    blast.anchor.set(0.5);
    blast.position.set(x, y);
    blast.zIndex = burrowTileDepth(tile) + 1;
    blast.tint = 0xff6b6b;
    this.board.addChild(blast);
    gsap.to(blast.scale, { x: 2.2, y: 2.2, duration: 0.45, ease: 'power2.out' });
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
    this.raidCells = [];
    this.raidLabels = [];
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
    this.backdrop?.destroy();
    this.container.destroy({ children: true });
  }
}
