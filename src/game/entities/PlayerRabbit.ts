import { AnimatedSprite, Assets, Container, Sprite, Texture } from 'pixi.js';
import { tilePos, ISO_TILE_W, RABBIT_SCALE } from '@/config/gridConfig';
import { tileScreenPos } from '@/lib/game/terrainBoard';
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
    this.container.zIndex = 50;

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

  playDeath(onComplete?: () => void): void {
    this.cancelMove();
    this.playAnim('death', () => {
      // Keep last death frame visible on the tile
      this.sprite.stop();
      this.playGhostAscend();
      onComplete?.();
    });
  }

  /** Spawn a ghostly angel rabbit that floats up to the sky after death. */
  private playGhostAscend(): void {
    const tex1 = Assets.get<Texture>(Keys.GHOST_DOWN);
    const tex2 = Assets.get<Texture>(Keys.GHOST_UP);
    if (!tex1 || !tex2) return;

    // 2-frame wing-flap animation
    const ghost = new AnimatedSprite([tex1, tex2]);
    ghost.anchor.set(0.5, 0.8);
    // The ghost art is 136px to the rabbit's 32, so match its on-screen size.
    ghost.scale.set((RABBIT_SCALE * 32) / 136);
    ghost.animationSpeed = 3 / 60; // slow flap ~3 fps
    ghost.loop = true;
    ghost.alpha = 0.6;
    ghost.blendMode = 'add';
    ghost.zIndex = 60;
    ghost.position.copyFrom(this.sprite.position);

    this.container.addChild(ghost);

    // Slow float upward (fire-and-forget, cleans up on its own)
    gsap.to(ghost, {
      y: ghost.y - 150,
      alpha: 0,
      duration: 6,
      ease: 'none',
      onComplete: () => {
        ghost.stop();
        this.container.removeChild(ghost);
        ghost.destroy();
      },
    });

    ghost.play();
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
  }

  destroy(): void {
    this.sprite.stop();
    this.container.destroy({ children: true });
  }
}
