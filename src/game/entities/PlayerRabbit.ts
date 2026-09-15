import { AnimatedSprite, Container } from 'pixi.js';
import { tilePos, tileDepth, toColRow, ISO_TILE_W, RABBIT_SCALE } from '@/config/gridConfig';
import { levelTierAt, tileScreenPos } from '@/lib/game/terrainBoard';
import * as Keys from '@/config/assetKeys';
import { getBunnyAnimTextures, BUNNY_ANIM_DEFS } from '../services/AssetLoader';
import gsap from 'gsap';

/**
 * The board a rabbit stands on: where a tile is, and how deep it sorts.
 *
 * The island is the default, solved from `seed`. The burrow hands its own pair
 * in, so the SAME rabbit — same sheet, same size, same hop — crosses somebody
 * else's homestead on a lattice the island's projection knows nothing about.
 */
export interface RabbitGrid {
  at(tileIndex: number): { x: number; y: number };
  depth(tileIndex: number): number;
}

/**
 * The knockback's shape — see `playKnockback`.
 *
 * Under the server's 1.2s stun (BOMB.STUN_MS) with room for the landing
 * bounce, so the rabbit is back on its feet before the ring relights. The
 * arc is low on purpose: the tile it lands on has to stay readable under it.
 */
const KNOCK_FLIGHT_S = 0.55;
const KNOCK_HEIGHT_PX = 34;
/** Whole turns in the air. Two is a tumble; three starts to blur. */
const KNOCK_SPINS = 2;
/** Squash on impact, as factors of the resting scale. */
const KNOCK_SQUASH_X = 1.3;
const KNOCK_SQUASH_Y = 0.7;
/** The small hop off the ground after the squash, in px. */
const KNOCK_BOUNCE_PX = 6;

export class PlayerRabbit {
  sprite: AnimatedSprite;
  container: Container;
  private sheetKey: string;
  /** The island, so every hop lands on the terrace the terrain puts it on. */
  private seed = '';
  private grid: RabbitGrid | null = null;
  isMoving = false;
  /**
   * What to play once the hop in flight lands, instead of settling to idle.
   *
   * A raid ends ON the step that ends it: the server's answer to the last tap
   * both moves the rabbit and finishes the run, so the celebration (or the
   * collapse) is asked for while the hop is still in the air. Cutting the
   * tween left the rabbit dancing a cell short of the field it had reached.
   */
  private afterMove: (() => void) | null = null;

  constructor(tileIndex: number, sheetKey = Keys.BUNNY_WHITE, seed = '', grid?: RabbitGrid) {
    this.sheetKey = sheetKey;
    this.seed = seed;
    this.grid = grid ?? null;
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
    if (this.grid) return this.grid.at(tileIndex);
    return this.seed ? tileScreenPos(this.seed, tileIndex) : tilePos(tileIndex);
  }

  /** Depth for a cell, on the scale the tiles sort by. */
  private depthFor(tileIndex: number): number {
    if (this.grid) return this.grid.depth(tileIndex);
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

  private playAnim(name: string, onComplete?: () => void, loopOverride?: boolean): void {
    const textures = getBunnyAnimTextures(this.sheetKey, name);
    if (textures.length === 0) return;

    const def = BUNNY_ANIM_DEFS[name];
    if (!def) return;

    const [, , fps, defLoop] = def;
    const loop = loopOverride ?? defLoop;
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
        const next = this.afterMove;
        this.afterMove = null;
        if (next) next();
        else this.playAnim('idle');
        onComplete?.();
      },
    });
  }

  /** Cancel any in-progress movement tween so it won't override the next animation. */
  cancelMove(): void {
    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.sprite);
    gsap.killTweensOf(this.sprite.scale);
    this.isMoving = false;
    this.afterMove = null;
  }

  /**
   * The rabbit is BLOWN to `tileIndex` — a bomb's knockback.
   *
   * It used to be `setPosition`: the blast played and the rabbit was simply
   * somewhere else, three tiles back, in the same frame. Too fast to read as
   * a throw; it read as the board glitching. So now it is a throw, and a
   * cartoon one: a low arc across to the landing tile, a fast backwards
   * tumble on the way (around the body, not the feet — the anchor moves to
   * the centre for the flight and back for the landing), and a squash-and-
   * stretch bounce as it hits the ground. Low, because the arc has to stay
   * readable against the tile it lands on; fast, because the stun the server
   * hands out is 1.2s and the rabbit should be on its feet before it lifts.
   *
   * Holds `isMoving` for the flight, so the `rabbit_moved` that follows the
   * blast (same tile) is swallowed the way a move during a hop is, and
   * `whenLanded` callers (an exhausted rabbit) run once it is down.
   */
  playKnockback(tileIndex: number, onComplete?: () => void): void {
    this.cancelMove();
    this.isMoving = true;

    const from = { x: this.container.x, y: this.container.y };
    const to = this.at(tileIndex);
    this.container.zIndex = this.depthFor(tileIndex);

    const sprite = this.sprite;
    const baseY = sprite.y;
    const baseScaleX = sprite.scale.x;
    const baseScaleY = sprite.scale.y;
    // Rotate about the body's centre for the flight. The anchor is at the
    // feet (0.5, 0.9); moving it to the middle would shift the art up by 40%
    // of its height, so the sprite drops by the same to stay put on screen.
    const h = sprite.height;
    sprite.anchor.set(0.5, 0.5);
    sprite.y = baseY - 0.4 * h;
    const flightY = sprite.y;
    // Tumble BACKWARDS relative to the throw: thrown right, it rolls
    // counter-clockwise, heels over head away from the blast.
    const dir = to.x >= from.x ? -1 : 1;
    const facing = Math.sign(baseScaleX) || 1;

    const land = () => {
      sprite.rotation = 0;
      sprite.anchor.set(0.5, 0.9);
      sprite.y = baseY;
      sprite.scale.set(baseScaleX, baseScaleY);
      this.playAnim('damage');
      // The bounce: squash on impact, overshoot tall, settle — and one small
      // hop off the ground so the landing has weight.
      const tl = gsap.timeline({
        onComplete: () => {
          sprite.scale.set(baseScaleX, baseScaleY);
          sprite.y = baseY;
          this.isMoving = false;
          const next = this.afterMove;
          this.afterMove = null;
          if (next) next();
          else this.playAnim('idle');
          onComplete?.();
        },
      });
      tl.to(sprite.scale, {
        x: facing * Math.abs(baseScaleX) * KNOCK_SQUASH_X,
        y: baseScaleY * KNOCK_SQUASH_Y,
        duration: 0.07,
        ease: 'power2.out',
      }, 0);
      tl.to(sprite.scale, { x: baseScaleX, y: baseScaleY, duration: 0.45, ease: 'elastic.out(1.1, 0.45)' }, 0.07);
      tl.to(sprite, { y: baseY - KNOCK_BOUNCE_PX, duration: 0.11, ease: 'power1.out' }, 0.07);
      tl.to(sprite, { y: baseY, duration: 0.22, ease: 'bounce.out' }, 0.18);
    };

    const tl = gsap.timeline({ onComplete: land });
    // The ground track: straight across, easing out so the rabbit arrives
    // slower than it left — a throw loses speed.
    tl.to(this.container, { x: to.x, y: to.y, duration: KNOCK_FLIGHT_S, ease: 'power1.out' }, 0);
    // The air track: up fast, down heavier.
    tl.to(sprite, { y: flightY - KNOCK_HEIGHT_PX, duration: KNOCK_FLIGHT_S * 0.42, ease: 'power2.out' }, 0);
    tl.to(sprite, { y: flightY, duration: KNOCK_FLIGHT_S * 0.58, ease: 'power2.in' }, KNOCK_FLIGHT_S * 0.42);
    // The tumble: whole turns, quick, evening out as it comes down.
    tl.to(sprite, { rotation: dir * Math.PI * 2 * KNOCK_SPINS, duration: KNOCK_FLIGHT_S, ease: 'power1.out' }, 0);
  }

  /** Run `fn` now, or once the hop in flight has landed — see `afterMove`. */
  private whenLanded(fn: () => void): void {
    if (this.isMoving) this.afterMove = fn;
    else fn();
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
    // Once the last hop has landed, not instead of it: the step that spends
    // the final point of energy is still a step, and the rabbit should be
    // seen taking it before it drops.
    //
    // `damage` is the only "worn out" row that ends on its feet, so it reads
    // as the stumble into the sleep rather than as a hit — nothing struck the
    // rabbit. Then `sleep` loops for as long as the run stays over.
    this.whenLanded(() => {
      this.playAnim('damage', () => {
        this.playAnim('sleep');
        onComplete?.();
      });
    });
  }

  /**
   * The raid is WON: the happy row, looped, for as long as the board stays up.
   *
   * `playHappy` runs the row once and sits back down, which is right for a
   * carrot picked mid-run. Reaching somebody's field is the end of the trip
   * and the rabbit keeps dancing until the scene takes it home.
   */
  celebrate(): void {
    this.whenLanded(() => this.playAnim('happy', undefined, true));
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
