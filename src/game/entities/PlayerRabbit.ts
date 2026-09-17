import { AnimatedSprite, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { tilePos, tileDepth, toColRow, ISO_TILE_W, RABBIT_SCALE } from '@/config/gridConfig';
import { levelTierAt, tileScreenPos } from '@/lib/game/terrainBoard';
import * as Keys from '@/config/assetKeys';
import { getBunnyAnimTextures, BUNNY_ANIM_DEFS } from '../services/AssetLoader';
import { outlinedPixelText } from '../ui/PixelText';
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

/* ── THE SEASON LEADER'S CROWN ────────────────────────────────────────────
   Tuned in `stories/CrownedRabbit.stories.tsx`, which has a camera for the
   purpose — every one of these numbers looked fine at the size the game draws
   a rabbit and wrong once magnified. */

/**
 * The crown's width, as a share of the rabbit's ART.
 *
 * Sized to the HEAD, not the body: the head spans ~11 of the sheet's pixels
 * against the art's 14, and a crown matched to the whole body swallows the
 * ears.
 */
const CROWN_SCALE = 0.32;
/**
 * Where the band's underside sits, in the container's units, measured from the
 * rabbit's feet.
 *
 * The art stands ~16 units tall (idle frame top at y18 of 32, times
 * RABBIT_SCALE — the measurement `Tile.HINT_RAISED_Y` is also taken from), so
 * this is a couple of units INSIDE the ears. The overlap is the point: a crown
 * level with the ear tips hovers, and a hovering crown reads as a marker
 * floating over a rabbit rather than as headwear.
 */
const CROWN_Y = -12.5;
/**
 * How far right of the art's centre the head actually is, in source pixels.
 *
 * The sprite's anchor is 0.5 of the whole frame, which centres on the BODY —
 * and the haunches stick out to the left, so the head's centre is a pixel to
 * the right of it. Without this the crown leans off the side of the skull.
 */
const CROWN_DX = 1;
/** The jaunty lean. A crown square to the pixel grid reads as a hat. */
const CROWN_TILT = -14;
/** The float's amplitude and period — felt rather than seen, and always less
 *  than the overlap above, or the bob lifts the band clear of the head. */
const CROWN_BOB_PX = 0.6;
const CROWN_BOB_MS = 520;
/**
 * How much bigger the crowned rabbit is drawn than everyone else.
 *
 * The leader is not merely marked, they are LARGER — the same claim the season
 * board's podium makes. 2 rather than more: past that the king starts to cover
 * the tiles around them, and those are the game.
 *
 * It is a COMPARISON, which is why it is not applied everywhere: see
 * `setCrownGrows`. On the island there are other rabbits to be bigger than; on
 * your own homestead you are the only one there, so the size says nothing and
 * only costs the art — at 1.8 x 2 the rabbit stood taller than the trees.
 */
const CROWN_LEAD_SCALE = 2;

/* ── THE NAME PLATE ───────────────────────────────────────────────────────── */

/**
 * How far above the feet the name floats.
 *
 * Clear of the crown rather than of the ears: a leader wears both, and a plate
 * measured against a bare head is a plate the crown grows through.
 */
const NAME_Y = -30;
/**
 * The plate's size, in the container's units.
 *
 * Small on purpose. Four of these can be on screen at once and they are labels
 * on top of the board the game is actually read from — a name that competes
 * with the hint numbers is a name that costs the player the run.
 */
const NAME_SCALE = 0.55;
/** Your own name reads gold, everyone else's white — the game's own YOURS ink. */
const NAME_TINT_ME = 0xffd45c;
const NAME_TINT_OTHER = 0xffffff;

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
  /** The season leader's crown, when this rabbit wears one. */
  private crown: Sprite | null = null;
  private crownBob: gsap.core.Tween | null = null;
  /**
   * The container's scale with no crown on it.
   *
   * Crowning MULTIPLIES this rather than replacing it: the burrow draws its
   * idle rabbit larger than the island does, and a crown that set an absolute
   * scale silently undid that the moment the season leader walked onto their
   * own homestead.
   */
  private baseScale = 1;
  /** Whether the crown also makes this rabbit bigger — see `CROWN_LEAD_SCALE`. */
  private crownGrows = true;
  /** The floating name plate, when this rabbit has been given one. */
  private nameplate: Container | null = null;

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

  /**
   * "No": a quick side-to-side of the sprite, settling where it stood.
   *
   * The answer to a move the server refused. Only the sprite's x, so a hop or
   * a knockback in flight (which move the container) is never fought.
   */
  shakeHead(): void {
    if (this.isMoving) return;
    gsap.killTweensOf(this.sprite, 'x');
    gsap.fromTo(this.sprite, { x: -4 }, { x: 0, duration: 0.35, ease: 'elastic.out(1.4, 0.25)' });
  }

  private stunRing: Container | null = null;
  private stunSpin: gsap.core.Tween | null = null;
  private stunTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Stars round the head for exactly as long as the server's stun holds.
   *
   * The stun used to show only as the ring going dark around the rabbit —
   * a thing ABSENT, which does not read as a state. Three gold pixels
   * orbiting a flattened circle do, and they leave on the server's own clock.
   */
  playStunned(ms: number): void {
    this.clearStun();
    if (ms <= 0) return;
    const ring = new Container();
    // The rabbit's art fills the bottom of its 32px cell (see profile-menu's
    // ART crop): its head is about a third of the sprite's height above the
    // feet the anchor sits on.
    ring.y = -this.sprite.height * 0.42;
    for (let i = 0; i < 3; i++) {
      ring.addChild(new Graphics().rect(-1, -3, 2, 6).rect(-3, -1, 6, 2).fill({ color: 0xffd138 }));
    }
    this.container.addChild(ring);
    this.stunRing = ring;
    const spin = { a: 0 };
    this.stunSpin = gsap.to(spin, {
      a: Math.PI * 2,
      duration: 0.7,
      repeat: -1,
      ease: 'none',
      onUpdate: () => {
        ring.children.forEach((star, i) => {
          const a = spin.a + (i / 3) * Math.PI * 2;
          star.position.set(Math.cos(a) * 11, Math.sin(a) * 4);
          // The far side of the orbit passes behind the head.
          star.alpha = Math.sin(a) < -0.2 ? 0.45 : 1;
        });
      },
    });
    this.stunTimer = setTimeout(() => this.clearStun(), ms);
  }

  /**
   * Wear the season's crown — or take it off.
   *
   * Idempotent, because the crown arrives with every island snapshot and the
   * same rabbit is told it more than once; and reversible, because the lead
   * changes hands mid-season and the sprite has to give the crown up when it
   * does.
   *
   * The crown is parented to the CONTAINER, never to the sprite. The sprite's
   * `scale.x` flips on every direction change (`moveTo`) and its anchor moves
   * to the body's centre mid-flight (`playKnockback`), so a child of it would
   * mirror its own crown and swing about the wrong pivot when a bomb throws
   * the rabbit. The container only ever moves and sorts, which is exactly what
   * the crown should inherit — including its z-order among the tiles.
   *
   * The leader is also drawn bigger, and that is scaled on the container too,
   * so the crown grows with the head it sits on and the rabbit keeps standing
   * on its own tile (the sprite is anchored at the feet).
   */
  setCrowned(on: boolean): void {
    if (this.container.destroyed) return;
    if (on === !!this.crown) return;

    if (!on) {
      this.crownBob?.kill();
      this.crownBob = null;
      if (this.crown && !this.crown.destroyed) this.crown.destroy();
      this.crown = null;
      this.container.scale.set(this.baseScale);
      this.applyNameScale();
      return;
    }

    const texture = Assets.get<Texture>(Keys.CROWN);
    // No crown art loaded is not a reason to lose the rabbit: the size still
    // marks the leader, and the sprite renders as it always did.
    if (texture) {
      const crown = new Sprite(texture);
      // Anchored at the BAND'S UNDERSIDE, which is the part that rests on the
      // head — so that is the point worth positioning by.
      crown.anchor.set(0.5, 1);
      crown.scale.set(RABBIT_SCALE * CROWN_SCALE);
      crown.position.set(CROWN_DX * RABBIT_SCALE, CROWN_Y);
      crown.angle = CROWN_TILT;
      this.container.addChild(crown);
      this.crown = crown;

      this.crownBob = gsap.to(crown, {
        y: CROWN_Y - CROWN_BOB_PX,
        duration: CROWN_BOB_MS / 1000,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }

    this.container.scale.set(this.baseScale * this.crownFactor());
    this.applyNameScale();
  }

  /**
   * Float this rabbit's name above its head.
   *
   * A child of the CONTAINER, like the crown, so it travels with every hop,
   * knockback and tumble for free — a plate parented to the board would need
   * its own follow, and would drift for the length of each tween.
   *
   * The scale is DIVIDED BY the container's, so the plate is the same size on
   * everyone. Crowning doubles the container (see `setCrowned`), and a name
   * that inherited that would shout the leader's name twice as loud as the
   * rest — the crown already says who leads, and the label is only there to
   * say who is who.
   *
   * Passing an empty name removes the plate: a guest with no name set is
   * better served by no label than by an empty ring of outline.
   */
  setName(name: string, isMe = false): void {
    if (this.container.destroyed) return;

    if (this.nameplate) {
      this.nameplate.destroy({ children: true });
      this.nameplate = null;
    }
    if (!name) return;

    const plate = outlinedPixelText(0, NAME_Y, name);
    plate.face.tint = isMe ? NAME_TINT_ME : NAME_TINT_OTHER;
    this.nameplate = plate.group;
    this.container.addChild(plate.group);
    this.applyNameScale();
  }

  /**
   * Say whether wearing the crown should also make this rabbit bigger.
   *
   * On by default, for the island. The burrow turns it off: its rabbit is
   * already drawn large and has nobody to be compared with.
   */
  setCrownGrows(on: boolean): void {
    this.crownGrows = on;
    this.container.scale.set(this.baseScale * (this.crown ? this.crownFactor() : 1));
    this.applyNameScale();
  }

  private crownFactor(): number {
    return this.crownGrows ? CROWN_LEAD_SCALE : 1;
  }

  /** Keep the plate the same size on screen whatever the container is doing. */
  private applyNameScale(): void {
    if (!this.nameplate) return;
    const k = this.container.scale.x || 1;
    this.nameplate.scale.set(NAME_SCALE / k);
  }

  /**
   * How big this rabbit is drawn, before any crown.
   *
   * Set rather than assigning `container.scale` directly, so that crowning
   * still multiplies the right number — see `baseScale`.
   */
  setBaseScale(scale: number): void {
    this.baseScale = scale;
    this.container.scale.set(this.crown ? scale * this.crownFactor() : scale);
    this.applyNameScale();
  }

  private clearStun(): void {
    if (this.stunTimer) clearTimeout(this.stunTimer);
    this.stunTimer = null;
    this.stunSpin?.kill();
    this.stunSpin = null;
    if (this.stunRing && !this.stunRing.destroyed) this.stunRing.destroy({ children: true });
    this.stunRing = null;
  }

  /**
   * Leave the island: squeeze up and fade, then go.
   *
   * `destroy` in one frame made a rabbit that walked home blink out mid-board,
   * which reads as a rendering fault rather than as somebody leaving.
   */
  vanish(): void {
    this.cancelMove();
    this.clearStun();
    this.crownBob?.kill();
    this.crownBob = null;
    this.crown = null;
    this.sprite.stop();
    gsap.to(this.container, { alpha: 0, duration: 0.3, ease: 'power1.in' });
    gsap.to(this.sprite.scale, {
      x: this.sprite.scale.x * 0.6,
      y: this.sprite.scale.y * 1.3,
      duration: 0.3,
      ease: 'power1.in',
      onComplete: () => {
        if (!this.container.destroyed) this.container.destroy({ children: true });
      },
    });
  }

  destroy(): void {
    this.clearStun();
    // The bob outlives the sprite otherwise: gsap holds the crown alive and
    // keeps writing `y` to a destroyed display object.
    this.crownBob?.kill();
    this.crownBob = null;
    this.crown = null;
    this.nameplate = null;
    if (this.container.destroyed) return;
    this.sprite.stop();
    this.container.destroy({ children: true });
  }
}
