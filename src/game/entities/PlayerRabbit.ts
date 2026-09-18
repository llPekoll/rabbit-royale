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
 * How far ABOVE the feet the name floats.
 *
 * It went UNDER the feet on 2026-09-18, to get it off the board — over the
 * head it had spanned three cells of counts and wiped out the numbers behind
 * it. Under the feet it was legible but wrong: the plate sat in the rabbit's
 * lap, close enough to read as part of the sprite rather than as a label for
 * it ("c'est null"). So it goes back up, but MUCH higher than it ever was —
 * clear of the head by a good half-tile, with a leader line down to the ears
 * (see NAME_STEM_*) doing the work the proximity used to do.
 *
 * Negative: the sprite is anchored at 0.9, so the feet are y 0 and up is less.
 * The rabbit's art stands ~16 units tall, so this leaves well over a tile's own
 * height of air between the ears and the plate's foot — which is the gap the
 * line is drawn in, and the reason the name no longer reads as a hat. Raised
 * again from -46 once the line proved it could carry the distance: the further
 * up the plate goes, the more of the board around the rabbit stays readable,
 * and the line is what makes that free.
 */
export const NAME_Y = -62;
/**
 * The plate's size, in the container's units.
 *
 * Small on purpose. Four of these can be on screen at once and they are labels
 * on top of the board the game is actually read from — a name that competes
 * with the hint numbers is a name that costs the player the run.
 */
const NAME_SCALE = 0.55;
/**
 * THE LEADER LINE, from the plate down to the rabbit's head.
 *
 * A label parked a half-tile above a sprite, on a board with four rabbits on
 * it, belongs to NOBODY: at that distance the eye has to guess which rabbit a
 * name goes with, and on a crowded island it guesses wrong. The line is what
 * makes the pairing unambiguous without moving the plate back down into the
 * art — the same trick a map's callout uses, and the reason the plate can
 * afford to be this far up at all.
 *
 * White rather than the name's own ink: the line is structure, not text, and
 * a gold line under a gold name reads as part of the glyphs.
 *
 * BARE white, with no dark edge. It wore the plate's outline at first, on the
 * argument that a hairline needs one to survive pale ground — but an outlined
 * hairline is mostly outline: two dark pixels around one white one read as a
 * dark post, which is the opposite of the light touch this wants. Drawn over
 * the counts (see the name layer's rank in IslandScene) it has the board's own
 * art behind it rather than the sky, and white alone holds.
 */
const NAME_STEM_TINT = 0xffffff;
/**
 * Where the line starts and stops, in the container's units — from just under
 * the plate down to just over the ears, so it touches neither.
 *
 * Exported, with NAME_Y, because the three are a GEOMETRY and not three loose
 * numbers: the line has to reach from inside the plate to above the head, and
 * getting one of them wrong gives either a floating name joined to nothing or
 * a stick through the rabbit's skull. `test/rabbit-name.test.ts` asserts the
 * relationship, which is the kind of thing a later retune breaks silently.
 */
export const NAME_STEM_TOP = NAME_Y + 6;
export const NAME_STEM_BOTTOM = -18;
/**
 * The line's width. A whole number, because the art is pixels and a 1.5px line
 * renders as two grey ones.
 */
const NAME_STEM_W = 1;
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
  /**
   * The line joining the plate to the head.
   *
   * Inside the container rather than on the name layer, so it moves with the
   * sprite for free. It is destroyed WITH the container (it is a child), so
   * unlike the plate it needs no hand cleanup — only the handle is dropped.
   */
  private nameStem: Graphics | null = null;
  /**
   * Where the plate is drawn, when the scene wants it out of the sort.
   *
   * Null keeps it inside the rabbit, which is right for a lone rabbit with no
   * board under it (the burrow's HomeRabbit, the stories) — the deported plate
   * costs a per-frame sync and buys nothing when nothing can cover it.
   */
  private nameLayer: Container | null = null;

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

  /**
   * Take the rabbit's own art out of shot, leaving everything else it carries
   * — name plate, crown, position, depth — exactly where it is.
   *
   * For effects that REPLACE the animal rather than dress it: the burrow's
   * electrocution swaps in a flickering pose at the same size and anchor, and
   * the rabbit showing through it would read as two sprites overlapping. The
   * sprite is hidden rather than destroyed because it has to come back — the
   * raider is still the scene's, still standing on its tile.
   */
  hideSprite(hidden: boolean): void {
    if (this.sprite.destroyed) return;
    this.sprite.visible = !hidden;
  }

  /**
   * Flinch.
   *
   * Leaves the rabbit ON the last frame of the `damage` row, and the last three
   * frames of that row are EMPTY — so the animal ends up invisible, still
   * standing where it was. That suits the island, where a hit is followed by
   * the run ending or the rabbit being moved, but anywhere it has to remain on
   * screen the caller must follow this with something that draws: `playAnim`
   * with an `idle` completion, or `playDeath`, which ends on a full frame.
   */
  playDamage(): void {
    this.playAnim('damage');
  }

  /**
   * Put the rabbit back on its feet once a flinch has played out.
   *
   * Pairs with `playDamage` wherever the animal has to still be there
   * afterwards — see the note above on the `damage` row's empty tail. Kept
   * separate rather than folded into `playDamage` because the island's uses of
   * it genuinely want the rabbit gone: a hit there is followed by the run
   * ending or the rabbit being moved.
   */
  recoverFromDamage(): void {
    const frames = getBunnyAnimTextures(this.sheetKey, 'damage').length;
    const fps = BUNNY_ANIM_DEFS.damage?.[2] ?? 12;
    if (frames === 0) return;
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    this.recoverTimer = setTimeout(() => {
      this.recoverTimer = null;
      if (this.sprite.destroyed) return;
      this.playAnim('idle');
    }, (frames / fps) * 1000);
  }

  /** The pending `recoverFromDamage`, so a second hit does not stack two. */
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Go down and STAY down.
   *
   * Unlike `damage`, the `death` row ends on a full frame — the rabbit flat on
   * its side, drawn low in the cell — so it holds by itself with nothing to
   * restore afterwards, and the caller decides how long the body lies there.
   * `onComplete` fires when the last frame is reached, which is the cue to
   * start counting that hold rather than to put the animal back on its feet.
   */
  playDeath(onComplete?: () => void): void {
    this.playAnim('death', onComplete);
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
   * Draw this rabbit's plate on `layer` instead of inside the rabbit.
   *
   * Set by a scene that has a sorted board, BEFORE the name — the plate is
   * mounted where it is told to at `setName` time, and re-mounting a live one
   * is work nobody needs. The scene then calls `syncName` each frame.
   */
  setNameLayer(layer: Container | null): void {
    this.nameLayer = layer;
  }

  /**
   * Float this rabbit's name high above its head, on a leader line.
   *
   * Drawn WHOLE. It was cut to four characters earlier the same day, to keep
   * it from covering the board — but a name is who somebody is, and "CURS..."
   * names nobody. What buys the room is the height, not the trimming: this far
   * up the plate clears the counts around the rabbit instead of lying across
   * them, and the line (see NAME_STEM_*) says whose it is.
   *
   * The plate is the same size on everyone, whatever the container is doing:
   * crowning doubles the rabbit (see `setCrowned`), and a name that inherited
   * that would shout the leader's name twice as loud as the rest. The crown
   * already says who leads; the label is only there to say who is who.
   *
   * Passing an empty name removes the plate AND its line: a guest with no name
   * set is better served by no label than by an empty ring of outline hanging
   * off a stick.
   */
  setName(name: string, isMe = false): void {
    if (this.container.destroyed) return;

    if (this.nameplate) {
      this.nameplate.destroy({ children: true });
      this.nameplate = null;
    }
    if (this.nameStem) {
      this.nameStem.destroy();
      this.nameStem = null;
    }
    if (!name) return;

    /**
     * The line first, so it is BEHIND the plate: it runs up to NAME_STEM_TOP,
     * a few units into where the glyphs sit, and a line drawn after them would
     * cross the first letter's foot.
     *
     * It goes wherever the plate goes, and for the same reason. Inside the
     * rabbit it sorted at the rabbit's own depth — which put it UNDER the
     * counts, so a line crossing a dug tile was interrupted by the number on
     * it and the plate looked joined to nothing. On the layer it draws over
     * them, whole, which is what a leader line has to do to be one.
     *
     * Its coordinates stay the rabbit's, not the world's: `syncName` walks the
     * pair down together, so the two keep the relationship the constants give
     * them however the rabbit moves.
     */
    const stem = new Graphics();
    if (this.nameLayer) this.nameLayer.addChild(stem);
    else {
      // Un-deported, the line lives in the rabbit's units and never changes:
      // parent and plate scale together, so the gap between them is fixed.
      stem.moveTo(0, NAME_STEM_TOP).lineTo(0, NAME_STEM_BOTTOM)
        .stroke({ color: NAME_STEM_TINT, width: NAME_STEM_W, cap: 'square' });
      this.container.addChild(stem);
    }
    this.nameStem = stem;

    const plate = outlinedPixelText(0, NAME_Y, name);
    plate.face.tint = isMe ? NAME_TINT_ME : NAME_TINT_OTHER;
    this.nameplate = plate.group;
    /**
     * ON THE SHARED LAYER when the scene hands one over, in the rabbit's
     * container otherwise.
     *
     * A plate parented to the rabbit is drawn at the rabbit's own depth, so
     * anything sorting after it draws over the top — a neighbour's ground, a
     * tree, another rabbit one cell down. Whole names are long, and a long
     * label at this height reaches well into the cells around it, so the odds
     * of something covering a letter are high.
     *
     * Same arrangement the counts already use (`Tile`'s hintLayer): a layer
     * over everything, with the plate carrying the rabbit's world position
     * itself. `syncName` is what keeps it there.
     */
    if (this.nameLayer) {
      this.nameLayer.addChild(plate.group);
      this.syncName();
    } else {
      this.container.addChild(plate.group);
    }
    this.applyNameScale();
  }

  /**
   * Put the deported plate back under its rabbit.
   *
   * Called every frame by the scene, because the rabbit is moved by GSAP —
   * hops, knockback, the spawn drop, the stun spin all write `container`
   * straight — and there is no event to hang this on. Cheap: two adds and a
   * write, for at most a handful of rabbits.
   */
  syncName(): void {
    const plate = this.nameplate;
    if (!plate || plate.destroyed || plate.parent !== this.nameLayer) return;
    const k = this.container.scale.y;
    /**
     * NAME_Y straight, with no scale on it.
     *
     * The plate is drawn at a fixed size on screen (`applyNameScale`), so its
     * height above the rabbit has to be fixed too — multiplying it by the
     * container's scale sent the crowned leader's name to twice the height of
     * everyone else's while its line, correctly pinned to the head, stopped a
     * plate's worth of air short of it. Every rabbit's name now sits at the
     * same height, which is also what makes a row of them readable.
     */
    plate.position.set(this.container.x, this.container.y + NAME_Y);
    // A rabbit that fades (see `playDeath`) takes its name with it.
    plate.alpha = this.container.alpha;
    plate.visible = this.container.visible;

    const stem = this.nameStem;
    if (!stem || stem.destroyed || stem.parent !== this.nameLayer) return;
    /**
     * REDRAWN each frame, because its two ends do not move together.
     *
     * The plate is a fixed size on screen whatever the rabbit does
     * (`applyNameScale`), so its foot is always NAME_Y screen-pixels up. The
     * line's other end is pinned to the HEAD, which is the rabbit's own
     * geometry and rides the container's scale — a crowned rabbit is twice as
     * big and its ears are twice as far up.
     *
     * So the length is a difference between one number that scales and one
     * that does not, and it cannot be baked into the path. Drawn once at
     * `setName` with the rabbit's scale folded in, the crowned leader's line
     * ran to NAME_Y * 2 — a mast standing a whole plate's height above its own
     * name, while every other rabbit's line was right.
     */
    stem.position.set(this.container.x, this.container.y);
    stem.clear()
      // The top is the plate's own frame — unscaled, like the plate.
      .moveTo(0, NAME_STEM_TOP)
      // The bottom is the rabbit's — scaled, so it tracks the ears.
      .lineTo(0, NAME_STEM_BOTTOM * k)
      .stroke({ color: NAME_STEM_TINT, width: NAME_STEM_W, cap: 'square' });
    stem.alpha = this.container.alpha;
    stem.visible = this.container.visible;
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

  /**
   * Keep the plate the same size on screen whatever the container is doing.
   *
   * Two cases, because the plate has two possible parents. Inside the rabbit
   * it INHERITS the container's scale, so it has to be divided back out —
   * crowning doubles the container and a name that rode that would shout the
   * leader's name twice as loud as everyone else's. On the shared layer it
   * inherits nothing, so the figure is used as it stands.
   */
  private applyNameScale(): void {
    if (!this.nameplate) return;
    if (this.nameplate.parent === this.nameLayer) {
      this.nameplate.scale.set(NAME_SCALE);
      return;
    }
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
    /**
     * The plate fades on its own, and is dropped by hand.
     *
     * Deported, it is not a child of the container, so neither the alpha tween
     * above nor the `destroy({ children: true })` below reaches it — and the
     * scene has already taken this rabbit out of `rabbits` by now, so
     * `syncName` is not running either. Left to itself the name would stay at
     * full strength through the fade and then hang over empty grass for the
     * life of the island.
     */
    const plate = this.nameplate;
    if (plate && !plate.destroyed) gsap.to(plate, { alpha: 0, duration: 0.3, ease: 'power1.in' });
    gsap.to(this.sprite.scale, {
      x: this.sprite.scale.x * 0.6,
      y: this.sprite.scale.y * 1.3,
      duration: 0.3,
      ease: 'power1.in',
      onComplete: () => {
        if (plate && !plate.destroyed) plate.destroy({ children: true });
        this.nameplate = null;
        // The line fades with the container it hangs in, and goes with it.
        this.nameStem = null;
        if (!this.container.destroyed) this.container.destroy({ children: true });
      },
    });
  }

  destroy(): void {
    this.clearStun();
    // Would otherwise fire onto a destroyed sprite after the rabbit is gone.
    if (this.recoverTimer) { clearTimeout(this.recoverTimer); this.recoverTimer = null; }
    // The bob outlives the sprite otherwise: gsap holds the crown alive and
    // keeps writing `y` to a destroyed display object.
    this.crownBob?.kill();
    this.crownBob = null;
    this.crown = null;
    // Deported, the plate is NOT a child of the container, so destroying the
    // container leaves it on the layer: a name hanging over empty ground for
    // the life of the island. Dropped explicitly, before the handle is let go.
    if (this.nameplate && !this.nameplate.destroyed) this.nameplate.destroy({ children: true });
    this.nameplate = null;
    // A child of the container, so `destroy({ children: true })` below takes
    // it — only the handle is let go here.
    this.nameStem = null;
    if (this.container.destroyed) return;
    this.sprite.stop();
    this.container.destroy({ children: true });
  }
}
