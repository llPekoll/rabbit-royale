import { AnimatedSprite, Container } from 'pixi.js';
import { tilePos, tileDepth, toColRow, ISO_TILE_W, RABBIT_SCALE } from '@/config/gridConfig';
import { levelTierAt, tileScreenPos } from '@/lib/game/terrainBoard';
import * as Keys from '@/config/assetKeys';
import { getBunnyAnimTextures, BUNNY_ANIM_DEFS } from '../services/AssetLoader';
import gsap from 'gsap';

export class PlayerRabbit {
  sprite: AnimatedSprite;
  container: Container;
  private sheetKey: string;
  /** The island, so every hop lands on the terrace the terrain puts it on. */
  private seed = '';
  isMoving = false;

  constructor(tileIndex: number, sheetKey = Keys.BUNNY_WHITE, seed = '') {
    this.sheetKey = sheetKey;
    this.seed = seed;
    this.container = new Container();
    // Sorted by its CELL, on the same scale as the tiles (see `Tile`): a fixed
    // depth put the rabbit behind every tile further down the board once tiles
    // started sorting by `depth * 16 + tier`. The +8 is half a cell, so the
    // rabbit stands on its own tile and in front of it, but behind the next
    // row down.
    this.container.zIndex = this.depthFor(tileIndex);

    const { x, y } = this.at(tileIndex);

    // Create with idle animation textures
    const idleTextures = getBunnyAnimTextures(sheetKey, 'idle');
    this.sprite = new AnimatedSprite(idleTextures);
    this.sprite.anchor.set(0.5, 0.9); // feet at tile center
    this.sprite.scale.set(RABBIT_SCALE);
    this.sprite.animationSpeed = BUNNY_ANIM_DEFS.idle[2] / 60; // fps → speed factor
    this.sprite.loop = true;
    this.sprite.play();

    this.container.addChild(this.sprite);
    this.container.position.set(x, y);
  }

  /** Where a tile's centre is, terrace included. */
  private at(tileIndex: number): { x: number; y: number } {
    return this.seed ? tileScreenPos(this.seed, tileIndex) : tilePos(tileIndex);
  }

  /** Depth for a cell, on the scale the tiles sort by. */
  private depthFor(tileIndex: number): number {
    const cell = toColRow(tileIndex);
    const tier = this.seed ? levelTierAt(this.seed, cell.col, cell.row) : 0;
    return tileDepth(tileIndex) * 16 + tier + 8;
  }

  /** Drop the rabbit from above with a snappy bounce landing. */
  playSpawnDrop(onComplete?: () => void): void {
    const landY = this.sprite.y;
    this.sprite.y = landY - 120;
    gsap.to(this.sprite, {
      y: landY,
      duration: 0.35,
      ease: 'bounce.out',
      onComplete,
    });
  }

  private playAnim(name: string, onComplete?: () => void): void {
    const textures = getBunnyAnimTextures(this.sheetKey, name);
    if (textures.length === 0) return;

    const def = BUNNY_ANIM_DEFS[name];
    if (!def) return;

    const [, , fps, loop] = def;
    this.sprite.textures = textures;
    this.sprite.animationSpeed = fps / 60;
    this.sprite.loop = loop;
    this.sprite.gotoAndPlay(0);

    if (!loop && onComplete) {
      this.sprite.onComplete = () => {
        this.sprite.onComplete = undefined;
        onComplete();
      };
    }
  }

  moveTo(tileIndex: number, onComplete?: () => void): void {
    if (this.isMoving) {
      onComplete?.();
      return;
    }
    this.isMoving = true;

    const { x, y } = this.at(tileIndex);
    // Re-sorted as it goes: a rabbit that kept its old depth would walk behind
    // the tiles it is moving towards.
    this.container.zIndex = this.depthFor(tileIndex);

    // Flip sprite based on horizontal direction
    if (x < this.container.x) this.sprite.scale.x = -Math.abs(this.sprite.scale.x);
    else if (x > this.container.x) this.sprite.scale.x = Math.abs(this.sprite.scale.x);

    this.playAnim('move');

    gsap.to(this.container, {
      x,
      y,
      duration: 0.2,
      ease: 'quad.inOut',
      onComplete: () => {
        this.isMoving = false;
        this.playAnim('idle');
        onComplete?.();
      },
    });
  }

  /** Cancel any in-progress movement tween so it won't override the next animation. */
  cancelMove(): void {
    gsap.killTweensOf(this.container);
    this.isMoving = false;
  }

  /**
   * The run ended: the rabbit is OUT OF ENERGY, not dead.
   *
   * It used to play the death row and send a ghost up to the sky, which said
   * something the rules never say — `resolveMove` ends a run on `energy <= 0`
   * and nothing else, and a bomb is survivable (see `run.ts`, and the recap in
   * `run-recap.tsx` which already tells the player "Out of energy"). So the
   * rabbit slumps where it stands and sleeps it off: that is what actually
   * happened, and it is what a refill undoes.
   */
  playExhausted(onComplete?: () => void): void {
    this.cancelMove();
    // `damage` is the only "worn out" row that ends on its feet, so it reads
    // as the stumble into the sleep rather than as a hit — nothing struck the
    // rabbit. Then `sleep` loops for as long as the run stays over.
    this.playAnim('damage', () => {
      this.playAnim('sleep');
      onComplete?.();
    });
  }

  playHappy(onComplete?: () => void): void {
    this.playAnim('happy', () => {
      this.playAnim('idle');
      onComplete?.();
    });
  }

  playDamage(): void {
    this.playAnim('damage');
  }

  playEat(): void {
    this.playAnim('eat', () => {
      this.playAnim('idle');
    });
  }

  setPosition(tileIndex: number): void {
    const { x, y } = this.at(tileIndex);
    this.container.position.set(x, y);
    this.container.zIndex = this.depthFor(tileIndex);
  }

  destroy(): void {
    this.sprite.stop();
    this.container.destroy({ children: true });
  }
}
