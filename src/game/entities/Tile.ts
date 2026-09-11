import { Container, Sprite, Assets, BitmapText, Polygon, AnimatedSprite, Graphics } from 'pixi.js';
import { HALF_W, HALF_H, tilePos, tileDepth } from '@/config/gridConfig';
import * as Keys from '@/config/assetKeys';
import { pixelText, shadowedPixelText, formatMult, TINT_MULT } from '../ui/PixelText';
import { getDiamondFill, getDiamondOutline } from '../services/TileTextures';
import { lootBoxSheet } from '../services/AssetLoader';
import type { TileContent } from '@/lib/game/types';
import gsap from 'gsap';

/**
 * Minesweeper's classic hint ladder. Kept exactly: a player reads "3 = danger"
 * from the COLOUR before they read the glyph, and that mapping is decades of
 * muscle memory it would be perverse to reinvent.
 */
const HINT_TINTS = [
  0xffffff, 0x4aa3ff, 0x3ecf7f, 0xff6b6b, 0xb46bff,
  0xffb03a, 0x3ecfcf, 0xdddddd, 0x888888,
];

/**
 * The carrot's on-tile geometry. Scale rather than a target width: the art is
 * 13x29 and pinning either axis squashes it (the same trap the chest's
 * CHEST_SCALE comment describes).
 */
const CARROT_SCALE = 0.7;
/**
 * Where the carrot's tip rests at the BOTTOM of its hover, relative to the
 * tile's centre. Negative: the carrot floats ABOVE the tile face, which is what
 * separates it from the ground it is lying on and stops the rabbit standing
 * next to it from occluding half of it.
 */
const CARROT_REST_Y = -6;
/** How far it lifts at the top of its hover, in px. */
const CARROT_BOB_HEIGHT = 6;
/** Seconds for one rise (jittered per carrot, so they never sync up). */
const CARROT_BOB_SECONDS = 1.15;
/** How long the taken carrot is held big before it lifts away. */
const CARROT_POP_SECONDS = 0.16;
const CARROT_HOLD_SECONDS = 0.30;
const CARROT_FADE_SECONDS = 0.34;
/** The skull left on a tile that killed someone. */
const SKULL_SCALE = 0.6;

/** Contact shadow: an ellipse a little narrower than the art. */
const CARROT_SHADOW_RX = 5;
const CARROT_SHADOW_RY = 2.5;
const CARROT_SHADOW_Y = 4;
const CARROT_SHADOW_ALPHA = 0.3;

/**
 * The lid over an undug tile.
 *
 * These were calibrated against the PAINTED island backdrop, which is darker
 * and busier than open grass. Over generated terrain the same translucent navy
 * reads as a slightly different shade of ground rather than as a covered tile
 * — the fog is present but stops saying "you cannot see this yet". Overridable
 * per tile so that trade can be tuned against whatever is actually behind the
 * board; the defaults are what ships today.
 */
const FOG_COLOR = 0x1a2a3a;
const FOG_ALPHA = 0.55;

/** How an undug tile is veiled. Omitted fields keep the defaults above. */
export interface FogStyle {
  color?: number;
  alpha?: number;
}
const HIGHLIGHT_COLOR = 0xffd700;
const MINE_TINT = 0xff3333;
/** How far above its tile a chest starts when it DROPS in with the board. */
const CHEST_DROP_HEIGHT = 90;
/**
 * On-tile size of the chest, as a SCALE on the art's native pixels — never a
 * target width. The loot-box atlas trims each frame to its own content, so its
 * frames are 23, 25 and 30px wide: setting `width` pins whichever frame is
 * current to that size and squashes every other one, and the box visibly
 * breathes as the shine plays. A fixed scale keeps every frame at the same
 * pixel size AND on the pixel grid (integer, so the art stays crisp).
 */
const CHEST_SCALE = 2;
/** The shine (`highlight` tag) plays on its own every few seconds, jittered so
 *  two chests on screen never pulse in lockstep. */
const CHEST_SHINE_EVERY = [4.5, 8] as const;
/** The chest sits still and gives a short SHAKE on its own every few seconds
 *  (jittered, same as the shine) instead of a constant hover — a settled box
 *  that twitches now and then reads as "something alive inside" without the
 *  float that made it look unanchored from its tile. */
const CHEST_SHAKE_EVERY = [2.6, 5.5] as const;
/** Contact shadow under the chest: an ellipse a bit narrower than the art,
 *  drawn on the tile so the box reads as SITTING on the island rather than
 *  floating over it — and it squashes when the box drops in. */
const CHEST_SHADOW_ALPHA = 0.32;
/**
 * How loudly each rarity announces itself on the board. The chest SHOWS what
 * it holds (decided 2026-08-23): the walk to it is the trade the feature is
 * about, so the player has to be able to price it from across the island —
 * a "legendary, five steps out, do I dare" is the moment we are selling.
 * `beam` is the height of the shaft of light in px (0 = none), `motes` the
 * number of rising specks.
 */
const CHEST_TIER_FLAIR: Record<string, { beam: number; width: number; motes: number; glow: number }> = {
  // Every rarity gets a beam, COMMON included: giving it none made the cheapest
  // chest look like a rendering bug rather than a modest prize. The ladder is
  // in the SIZE of the flair, not in its presence.
  //
  // These are deliberately LOUD. The chest has to be picked out from across a
  // 36-tile island against busy pixel-art grass, and the first pass — a 7px
  // beam at 22% alpha — was invisible at the size the game actually draws the
  // board. Anything subtle here reads as nothing at all.
  common: { beam: 26, width: 11, motes: 3, glow: 0.75 },
  rare: { beam: 40, width: 13, motes: 5, glow: 0.85 },
  epic: { beam: 58, width: 15, motes: 7, glow: 0.95 },
  legendary: { beam: 78, width: 18, motes: 10, glow: 1 },
};

function diamondFill(color: number, alpha: number): Sprite {
  const s = new Sprite(getDiamondFill());
  s.anchor.set(0.5);
  s.tint = color;
  s.alpha = alpha;
  return s;
}

function diamondOutline(color: number): Sprite {
  const s = new Sprite(getDiamondOutline());
  s.anchor.set(0.5);
  s.tint = color;
  return s;
}

export class Tile {
  container: Container;
  private fog: Sprite;
  private highlightGfx: Sprite;
  private blinkGfx: Sprite;
  private contentSprite: Sprite | null = null;
  private chestSprite: Sprite | null = null;
  private chestGlow: Sprite | null = null;
  private chestRing: Sprite | null = null;
  private chestShakeTween: gsap.core.Timeline | null = null;
  private chestShakeCall: gsap.core.Tween | null = null;
  private chestGlowTween: gsap.core.Tween | null = null;
  /** Brightest the glow goes — the rarity's own ceiling, so the drop's fade-in
   *  and the idle pulse agree on where "full" is. */
  private glowPeak = 0.92;
  private chestDropTl: gsap.core.Timeline | null = null;
  private chestAnim: AnimatedSprite | null = null;
  private chestShadow: Graphics | null = null;
  private chestBeam: Graphics | null = null;
  private chestBeamTween: gsap.core.Tween | null = null;
  private chestRingTween: gsap.core.Tween | null = null;
  private chestMotes: Graphics[] = [];
  private chestLabel: BitmapText | null = null;
  private chestLabelTween: gsap.core.Tween | null = null;
  private chestShineCall: gsap.core.Tween | null = null;
  private palierHolder: Container | null = null;
  private palierText: BitmapText | null = null;
  /** Holds the palier label AND its drop shadow. Every transform (the pop-in
   *  scale, the idle bob) rides this, so the shadow can never drift off the
   *  face it belongs to. */
  private palierGroup: Container | null = null;
  private palierBobTween: gsap.core.Tween | null = null;
  /** The minesweeper hint label, if this tile shows one. */
  private hintGroup: Container | null = null;
  /** The carrot's hover and its shadow's matching squash. Killed on destroy —
   *  an infinite tween on a destroyed sprite is a leak that survives the tile. */
  private carrotBob: gsap.core.Tween | null = null;
  private carrotShadow: Graphics | null = null;
  private carrotShadowTween: gsap.core.Tween | null = null;
  /** The hovering carrot, if this tile has one. Read by the float test. */
  carrotSprite: Sprite | null = null;
  index: number;
  revealed = false;
  private palierRaised = false;
  /** Y offset used to float the multiplier above the rabbit's head while
   *  the rabbit sits on this tile. Tuned so the text clears the sprite's
   *  silhouette regardless of idle/hop frame. */
  private static readonly PALIER_RAISED_Y = -39;
  /** Peak-to-trough amplitude of the idle bob while the multiplier is
   *  floating over the rabbit's head. */
  private static readonly PALIER_BOB_AMP = 2.5;

  constructor(index: number, fogStyle?: FogStyle, lift = 0) {
    this.index = index;
    const { x, y: flatY } = tilePos(index);
    // Raised onto its own terrace. Without this the board is a flat
    // chequerboard lying across a landscape with plateaus: the ground rises,
    // the tiles stay at sea level, and the two visibly contradict each other.
    const y = flatY - lift;
    const depth = tileDepth(index);

    this.container = new Container();
    this.container.position.set(x, y);
    this.container.zIndex = depth;

    // Fog diamond
    this.fog = diamondFill(fogStyle?.color ?? FOG_COLOR, fogStyle?.alpha ?? FOG_ALPHA);
    this.container.addChild(this.fog);

    // Highlight diamond (hidden by default)
    this.highlightGfx = diamondOutline(HIGHLIGHT_COLOR);
    this.highlightGfx.visible = false;
    this.container.addChild(this.highlightGfx);

    // Blink overlay — opaque gold diamond (same hue as the highlight) that
    // snaps on then fades out, drawing the eye to reachable neighbours.
    this.blinkGfx = diamondFill(HIGHLIGHT_COLOR, 1);
    this.blinkGfx.visible = false;
    this.blinkGfx.alpha = 0;
    this.container.addChild(this.blinkGfx);

    // Set up interactivity with diamond hit area
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.hitArea = new Polygon([
      0, -HALF_H,
      HALF_W, 0,
      0, HALF_H,
      -HALF_W, 0,
    ]);
  }

  /**
   * Uncover the tile.
   *
   * The casino version showed a bomb or a cash multiplier. This one is
   * minesweeper: a dug tile shows what was buried (bomb, carrot, chest) or —
   * far more often — the HINT, the count of bombs among its eight neighbours.
   * Reading those numbers is the entire game, so they are what this method is
   * really for.
   */
  revealContent(
    content: TileContent,
    adjacent: number,
    animate = true,
    isKiller = false,
  ): void {
    if (this.revealed) return;
    this.revealed = true;

    if (animate) {
      gsap.to(this.fog, { alpha: 0, duration: 0.25, ease: 'power2.out' });
    } else {
      this.fog.alpha = 0;
    }

    if (content === 'bomb' && !isKiller) {
      this.addContentSprite(Keys.BOMB_SMALL);
    } else if (content === 'carrot' || content === 'golden') {
      // No carrot sprite ships with the original art (it was a casino: the
      // pickup was a coin), so the golden-coin frames stand in until one is
      // drawn. Golden carrots are the same art, larger and brighter.
      this.addCarrot(content === 'golden');
    } else if (content === 'empty' && adjacent > 0) {
      this.addHint(adjacent, animate);
    }
  }

  private addContentSprite(key: string): void {
    const tex = Assets.get(key);
    if (!tex) return;
    this.contentSprite = new Sprite(tex);
    this.contentSprite.anchor.set(0.5);
    this.container.addChild(this.contentSprite);
  }

  /**
   * The minesweeper hint. Colour-coded on the classic ladder — that mapping is
   * decades of muscle memory and a player reads "3 = danger" before they read
   * the glyph, so it is worth keeping exactly.
   */
  /**
   * Replace the number on an already-revealed tile.
   *
   * Redrawn rather than tweened: a hint that animated when it changed would
   * announce itself, and the whole point of a corrupted number is that it
   * looks like it was always there. A tile with no hint (a true zero, or one
   * not yet dug) is left alone — inventing a number for ground the player has
   * not opened reads as a bug, not as sabotage.
   */
  setHint(count: number): void {
    if (!this.revealed || !this.hintGroup) return;
    this.hintGroup.destroy({ children: true });
    this.hintGroup = null;
    if (count > 0) this.addHint(count, false);
  }

  private addHint(count: number, animate: boolean): void {
    const label = shadowedPixelText(0, 0, String(count));
    label.face.tint = HINT_TINTS[Math.min(count, HINT_TINTS.length - 1)];
    label.group.zIndex = 40;
    this.container.addChild(label.group);
    this.hintGroup = label.group;

    if (animate) {
      label.group.scale.set(0);
      gsap.to(label.group.scale, { x: 1.4, y: 1.4, duration: 0.22, ease: 'back.out(2)' });
    } else {
      label.group.scale.set(1.4);
    }
  }

  /**
   * A carrot pickup: pops out of the ground, then HOVERS.
   *
   * The float is what makes it read as a collectable rather than as scenery
   * painted on the tile, and the shadow underneath is what keeps the float from
   * reading as "this sprite is drawn in the wrong place" — a hovering object
   * with no contact point looks detached from the board. The two go together;
   * neither works alone. Same reasoning as the chest's own contact shadow.
   */
  private addCarrot(golden: boolean): void {
    const tex = Assets.get<import('pixi.js').Texture>(Keys.CARROT);
    if (!tex) return;

    // The contact shadow, drawn on the tile FIRST so the carrot floats over it.
    // It squashes as the carrot rises, which is what sells the height.
    const shadow = new Graphics()
      .ellipse(0, CARROT_SHADOW_Y, CARROT_SHADOW_RX, CARROT_SHADOW_RY)
      .fill({ color: 0x000000, alpha: CARROT_SHADOW_ALPHA });
    shadow.zIndex = 38;
    this.container.addChild(shadow);
    this.carrotShadow = shadow;

    // The art is TALL (13x29): scale it as a whole so it never squashes, and
    // keep the factor integer-ish so the pixels stay on the grid.
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5, 1);   // feet on the ground, so `y` IS its height
    sprite.scale.set(golden ? CARROT_SCALE * 1.35 : CARROT_SCALE);
    if (golden) sprite.tint = 0xffe066;
    sprite.zIndex = 40;
    sprite.y = CARROT_REST_Y;
    this.contentSprite = sprite;
    this.container.addChild(sprite);

    // Exposed for the float test — the tween is what makes the carrot hover,
    // and it is the only part of this worth asserting mechanically.
    this.carrotSprite = sprite;

    // Pop out of the dirt…
    sprite.alpha = 0;
    gsap.from(sprite, { y: CARROT_REST_Y + 12, duration: 0.28, ease: 'back.out(2)' });
    gsap.to(sprite, { alpha: 1, duration: 0.18 });
    gsap.from(shadow.scale, { x: 0.3, y: 0.3, duration: 0.28, ease: 'back.out(2)' });

    // …then hover. Jittered so two carrots on screen never bob in lockstep,
    // which reads as a repeating texture rather than as life.
    const period = CARROT_BOB_SECONDS * (0.85 + Math.random() * 0.3);
    this.carrotBob = gsap.to(sprite, {
      y: CARROT_REST_Y - CARROT_BOB_HEIGHT,
      duration: period,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: Math.random() * period,
    });
    // The shadow shrinks as the carrot rises — the whole reason it is there.
    this.carrotShadowTween = gsap.to(shadow.scale, {
      x: 0.72,
      y: 0.72,
      duration: period,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: Math.random() * period,
    });
  }

  /**
   * The carrot has been taken: show it clearly for a beat, then let it go.
   *
   * A pickup that vanishes the instant it is touched leaves the player unsure
   * what they got — especially at the speed this game is played. So it pops
   * BIGGER first (the payoff is legible), and only then rises and fades out.
   */
  collectCarrot(): void {
    const sprite = this.carrotSprite;
    if (!sprite) return;
    this.carrotSprite = null;

    // Stop the hover, or it fights the exit tween for the same property.
    this.carrotBob?.kill();
    this.carrotBob = null;
    this.carrotShadowTween?.kill();
    this.carrotShadowTween = null;

    const shadow = this.carrotShadow;
    this.carrotShadow = null;

    const tl = gsap.timeline({
      onComplete: () => {
        sprite.destroy();
        shadow?.destroy();
      },
    });
    // Beat one: it grows, so the eye lands on it.
    tl.to(sprite.scale, {
      x: sprite.scale.x * 1.5, y: sprite.scale.y * 1.5,
      duration: CARROT_POP_SECONDS, ease: 'back.out(3)',
    }, 0);
    if (shadow) tl.to(shadow, { alpha: 0, duration: CARROT_POP_SECONDS }, 0);
    // Beat two: it lifts away and fades. Held long enough to read, short enough
    // not to sit on the tile the player is about to walk onto.
    tl.to(sprite, {
      y: sprite.y - 26, alpha: 0,
      duration: CARROT_FADE_SECONDS, ease: 'power1.in',
    }, CARROT_HOLD_SECONDS);

    this.contentSprite = null;
  }

  /**
   * What a bomb leaves behind.
   *
   * The explosion is over in half a second, and the tile has to keep saying
   * "someone died here" long after — for the player who walked it, and for the
   * three others reading the same board. The skull is that record.
   */
  markBombSite(): void {
    const tex = Assets.get<import('pixi.js').Texture>(Keys.DEAD_SKULL);
    if (!tex) return;

    // The bomb sprite drawn by revealContent has done its job.
    if (this.contentSprite) {
      gsap.killTweensOf(this.contentSprite);
      this.contentSprite.destroy();
      this.contentSprite = null;
    }

    const skull = new Sprite(tex);
    skull.anchor.set(0.5);
    skull.scale.set(SKULL_SCALE);
    skull.zIndex = 39;   // above the tile, below a rabbit standing on it
    this.container.addChild(skull);
    this.contentSprite = skull;

    // Fade in UNDER the blast rather than popping in after it: the explosion is
    // still playing over this tile, and a skull appearing on its last frame
    // reads as a second, separate event.
    skull.alpha = 0;
    gsap.to(skull, { alpha: 1, duration: 0.4, delay: 0.25 });
  }

  /** Kept for the palier ladder the casino used; unused by this game. */
  revealPalier(palierValue: number, animate = true): void {
    if (palierValue && palierValue > 1) {
      // Multiplier is only revealed when the rabbit lands on the tile —
      // start it floating above the rabbit's head so the sprite doesn't
      // hide the text. It drops onto the tile when the rabbit hops away.
      // The holder owns the raise/lower motion; the text bobs inside the
      // holder on a separate tween so idle float doesn't fight the drop.
      this.palierHolder = new Container();
      this.palierHolder.position.set(0, Tile.PALIER_RAISED_Y);
      this.palierHolder.zIndex = 60;
      this.container.addChild(this.palierHolder);

      // Gold on grass, dirt, sand and water — the shadow is what gives it an
      // edge on all four. See shadowedPixelText.
      const label = shadowedPixelText(0, 0, `x${formatMult(palierValue)}`);
      this.palierGroup = label.group;
      this.palierText = label.face;
      this.palierText.tint = TINT_MULT;
      this.palierHolder.addChild(this.palierGroup);
      this.palierRaised = true;

      if (animate) {
        this.palierGroup.scale.set(0);
        gsap.to(this.palierGroup.scale, {
          x: 2,
          y: 2,
          duration: 0.3,
          ease: 'back.out(1.7)',
          onComplete: () => this.startPalierBob(),
        });
      } else {
        this.palierGroup.scale.set(2);
        this.startPalierBob();
      }
    }
  }

  /** Drop the multiplier onto the tile (rabbit is leaving — nothing is
   *  hiding it anymore). No-op if the tile has no multiplier or it's
   *  already resting on the tile. */
  lowerPalier(): void {
    if (!this.palierHolder || !this.palierRaised) return;
    this.palierRaised = false;
    this.stopPalierBob();
    gsap.killTweensOf(this.palierHolder.position);
    gsap.to(this.palierHolder.position, {
      y: 0,
      duration: 0.35,
      ease: 'bounce.out',
    });
  }

  /** Lift the multiplier above the rabbit's head (rabbit is returning to
   *  this tile). No-op if there's no multiplier or it's already raised. */
  raisePalier(): void {
    if (!this.palierHolder || this.palierRaised) return;
    this.palierRaised = true;
    gsap.killTweensOf(this.palierHolder.position);
    gsap.to(this.palierHolder.position, {
      y: Tile.PALIER_RAISED_Y,
      duration: 0.22,
      ease: 'power3.out',
      onComplete: () => this.startPalierBob(),
    });
  }

  /** Gentle idle float applied to the multiplier while it hovers above the
   *  rabbit's head. Runs on the text's local y inside `palierHolder`, so
   *  raise/lower tweens on the holder never collide with it. */
  private startPalierBob(): void {
    if (!this.palierGroup || this.palierBobTween) return;
    this.palierGroup.position.y = 0;
    this.palierBobTween = gsap.to(this.palierGroup.position, {
      y: -Tile.PALIER_BOB_AMP,
      duration: 0.9,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private stopPalierBob(): void {
    if (this.palierBobTween) {
      this.palierBobTween.kill();
      this.palierBobTween = null;
    }
    if (this.palierGroup) this.palierGroup.position.y = 0;
  }

  /** Brief white flash on click, then fade back to normal. */
  flash(): void {
    const flash = diamondFill(0xffffff, 0.6);
    flash.zIndex = 50;
    this.container.addChild(flash);
    gsap.to(flash, {
      alpha: 0,
      duration: 0.3,
      ease: 'power2.out',
      onComplete: () => {
        this.container.removeChild(flash);
        flash.destroy();
      },
    });
  }

  setHighlight(on: boolean): void {
    this.highlightGfx.visible = on;
    gsap.killTweensOf(this.blinkGfx);
    this.blinkGfx.alpha = 0;
    this.blinkGfx.visible = on;
    // A lit tile is a clickable one, so say so with the cursor too — on a
    // desktop the pointer is the affordance a player reads before the glow.
    // (A phone has no cursor and simply ignores this.)
    this.container.cursor = on ? 'pointer' : 'default';
  }

  /** One-shot gold flash: snap to full opacity, then fade back to
   *  transparent over 1s. Driven externally by GameScene so the four
   *  highlighted neighbours can be fired in a rotating order around the
   *  rabbit. */
  blink(): void {
    if (!this.blinkGfx.visible) return;
    gsap.killTweensOf(this.blinkGfx);
    this.blinkGfx.alpha = 1;
    gsap.to(this.blinkGfx, {
      alpha: 0,
      duration: 1,
      ease: 'sine.out',
    });
  }

  markSpawn(): void {
    this.fog.alpha = 0;
    this.revealed = true;
  }

  /**
   * Put the round's chest on this tile — visible THROUGH the fog from the
   * first frame (the spec's "il le voit et choisit d'y aller"): added after
   * the fog child, so paint order keeps it on top while the tile is unrevealed.
   * `tint` is the rarity accent (chestConfig.CHEST_TIER_COLOR).
   */
  setChest(tint: number, drop = false, tier: string = 'common'): void {
    if (this.chestSprite) return;
    const tex = Assets.get(Keys.TREASURE_CHEST);
    if (!tex) return;
    const flair = CHEST_TIER_FLAIR[tier] ?? CHEST_TIER_FLAIR.common;

    // The rarity is carried by the GROUND GLOW and the RING, never by tinting
    // the chest sprite: a tint MULTIPLIES the art, and the art is already a
    // dark red-brown, so common and legendary came out as the same muddy
    // brown — the accent has to sit on something light or behind the piece.
    // Nearly opaque: the glow has to OVERRIDE whatever the tile is painted
    // with (fog, a highlight, an eligibility overlay), not blend into it —
    // a translucent tint reads as the surface's colour, not the rarity's.
    this.chestGlow = diamondFill(tint, 0.92);
    this.container.addChild(this.chestGlow);
    this.chestGlow.alpha = 0.95 * flair.glow;
    this.glowPeak = 0.95 * flair.glow;
    const ring = diamondOutline(tint);
    ring.scale.set(1.06); // a touch proud of the diamond, so it reads as a rim
    this.chestRing = ring;
    this.container.addChild(ring);


    // Contact shadow first, so it sits under the box and above the glow.
    const shadow = new Graphics()
      .ellipse(0, 0, 13, 5)
      .fill({ color: 0x000000, alpha: CHEST_SHADOW_ALPHA });
    shadow.y = 2;
    this.chestShadow = shadow;
    this.container.addChild(shadow);

    const s = this.buildChestSprite(tex);
    this.chestSprite = s;
    this.container.addChild(s);

    if (flair.beam > 0) {
      // A shaft of light in the rarity's own colour, tapering upward. Drawn
      // BEHIND the box (added before it would fight the drop tween's order),
      // so it reads as light coming off the chest rather than a bar in front.
      const half = flair.width / 2;
      const beam = new Graphics()
        // Outer cone…
        .poly([-half, 0, half, 0, half * 0.45, -flair.beam, -half * 0.45, -flair.beam])
        .fill({ color: tint, alpha: 0.5 })
        // …plus a brighter core, which is what makes it read as LIGHT rather
        // than as a flat translucent triangle.
        .poly([-half * 0.42, 0, half * 0.42, 0, half * 0.16, -flair.beam * 0.92, -half * 0.16, -flair.beam * 0.92])
        .fill({ color: 0xffffff, alpha: 0.28 });
      beam.alpha = 0.72;
      beam.y = -6;
      beam.zIndex = -1;
      this.chestBeam = beam;
      this.container.addChildAt(beam, this.container.getChildIndex(s));
      this.chestBeamTween = gsap.to(beam, {
        alpha: 1,
        duration: 1.3,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });

      // The rarity SPELLED OUT above the chest — the flair says "valuable",
      // the word says exactly how much, and no player has to learn a colour
      // code to read the board.
      const label = pixelText(0, -flair.beam - 12, tier.toUpperCase());
      label.anchor.set(0.5);
      label.scale.set(1.6);
      label.tint = tint;
      label.zIndex = 62;
      this.chestLabel = label;
      this.container.addChild(label);
      this.chestLabelTween = gsap.to(label, {
        y: label.y - 2,
        duration: 1.1,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });

      for (let i = 0; i < flair.motes; i++) {
        const big = i % 3 === 0;
        const size = big ? 3 : 2;
        const mote = new Graphics().rect(0, 0, size, size).fill({ color: big ? 0xffffff : tint, alpha: 1 });
        mote.position.set((Math.random() - 0.5) * flair.width * 1.6, -4);
        this.container.addChild(mote);
        this.chestMotes.push(mote);
        // Each speck rises on its own loop, staggered so they never march.
        gsap.fromTo(
          mote,
          { y: -4, alpha: 0.9 },
          {
            y: -flair.beam * (0.8 + Math.random() * 0.4),
            alpha: 0,
            duration: 1.1 + Math.random() * 0.8,
            delay: i * 0.22 + Math.random() * 0.4,
            repeat: -1,
            ease: 'sine.out',
          },
        );
      }
    }

    if (drop) {
      // It DROPS onto the island with the board, so the player sees it arrive
      // rather than finding it already there: fall, squash on impact, then
      // settle into the idle bob. The glow and ring fade in on landing —
      // showing the rarity mid-air would give the outcome away before the
      // piece has even touched the ground.
      const restY = s.y;
      s.y = restY - CHEST_DROP_HEIGHT;
      this.chestGlow.alpha = 0;
      ring.alpha = 0;
      // The shadow is the depth cue: tiny while the box is high, full size at
      // the moment of contact.
      shadow.scale.set(0.35);
      shadow.alpha = 0.12;
      if (this.chestBeam) this.chestBeam.alpha = 0;
      if (this.chestLabel) this.chestLabel.alpha = 0;
      for (const m of this.chestMotes) m.alpha = 0;
      // `onInterrupt` is the safety net a story exercises constantly: changing
      // a Storybook control (or a round ending mid-drop) tears the tile down
      // while this timeline is in flight, and everything it was about to fade
      // IN stays at alpha 0 — a chest with no halo at all. Landing the final
      // state explicitly means the visuals never depend on the drop finishing.
      const land = () => {
        if (this.chestGlow) this.chestGlow.alpha = this.glowPeak;
        if (this.chestRing) this.chestRing.alpha = 1;
        if (this.chestBeam) this.chestBeam.alpha = 0.72;
        if (this.chestLabel) this.chestLabel.alpha = 1;
        if (this.chestShadow) {
          this.chestShadow.alpha = CHEST_SHADOW_ALPHA;
          this.chestShadow.scale.set(1);
        }
      };
      this.chestDropTl = gsap
        .timeline({ onInterrupt: land })
        .to(s, { y: restY, duration: 0.45, ease: 'bounce.out' })
        .to(shadow.scale, { x: 1, y: 1, duration: 0.45, ease: 'bounce.out' }, '<')
        .to(shadow, { alpha: CHEST_SHADOW_ALPHA, duration: 0.45, ease: 'bounce.out' }, '<')
        .to(s.scale, { y: s.scale.y * 0.72, duration: 0.08, ease: 'power2.out' }, '-=0.02')
        .to(s.scale, { y: s.scale.y, duration: 0.22, ease: 'back.out(2.5)' })
        .to(this.chestGlow, { alpha: this.glowPeak, duration: 0.25 }, '-=0.2')
        .to(ring, { alpha: 1, duration: 0.25 }, '<')
        .to([this.chestBeam, this.chestLabel].filter(Boolean), { alpha: 1, duration: 0.25 }, '<')
        .add(() => {
          land();
          this.scheduleChestShake();
          this.startChestAmbience();
        });
    } else {
      this.scheduleChestShake();
      this.startChestAmbience();
    }
  }

  /**
   * The chest sprite. Prefers the ANIMATED loot box (shared with the arena,
   * `loot-box.json`): its idle frames sit still and its `highlight` tag is the
   * shine, played on a timer rather than looped — a permanent sparkle stops
   * reading as an event. Falls back to the still treasure-chest PNG when the
   * atlas has not loaded, so a chest is never invisible.
   */
  private buildChestSprite(fallback: import('pixi.js').Texture): Sprite {
    const idle = lootBoxSheet?.animations?.['higblight'] ?? lootBoxSheet?.animations?.['highlight'];
    if (idle && idle.length > 0) {
      const anim = new AnimatedSprite(idle);
      anim.anchor.set(0.5, 0.8);
      anim.scale.set(CHEST_SCALE);
      anim.gotoAndStop(0); // idle = the closed box, still
      this.chestAnim = anim;
      this.scheduleChestShine();
      return anim;
    }
    const s = new Sprite(fallback);
    s.anchor.set(0.5, 0.8);
    // The fallback PNG is 28px wide against the atlas' 23 — match the drawn
    // size rather than the scale, so swapping to it is not a size jump.
    s.scale.set((23 * CHEST_SCALE) / fallback.width);
    return s;
  }

  /** Play the shine once, then book the next one. */
  private scheduleChestShine(): void {
    const [lo, hi] = CHEST_SHINE_EVERY;
    const delay = lo + Math.random() * (hi - lo);
    this.chestShineCall = gsap.delayedCall(delay, () => {
      const anim = this.chestAnim;
      if (!anim || anim.destroyed) return;
      anim.loop = false;
      anim.animationSpeed = 0.35;
      anim.gotoAndPlay(0);
      anim.onComplete = () => {
        anim.gotoAndStop(0);
        this.scheduleChestShine();
      };
    });
  }

  /**
   * The idle loops — glow pulse, rim breath — started ONLY once the chest has
   * landed. Running them from creation made them fight the drop timeline over
   * the same `alpha`: whichever tween ticked last won, so the halo was
   * sometimes bright, sometimes gone entirely. One owner per property at a
   * time is the rule; the drop owns them until it hands over here.
   */
  private startChestAmbience(): void {
    if (this.chestGlow && !this.chestGlowTween) {
      this.chestGlow.alpha = this.glowPeak;
      this.chestGlowTween = gsap.to(this.chestGlow, {
        alpha: this.glowPeak * 0.47,
        duration: 0.75,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    }
    if (this.chestRing && !this.chestRingTween) {
      this.chestRingTween = gsap.to(this.chestRing.scale, {
        x: 1.16,
        y: 1.16,
        duration: 1.1,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    }
  }

  /**
   * In place of a constant hover, the chest holds still and gives a short shake
   * every few seconds — booked like the shine (`scheduleChestShine`) so two
   * chests never twitch in lockstep. It ROCKS around its base: the sprite is
   * anchored (0.5, 0.8), so a small rotation reads as a box rattling on the
   * ground rather than sliding across it. Each shake captures the resting x and
   * returns to it, so a killed/rescheduled shake never drifts the chest.
   */
  private scheduleChestShake(): void {
    const [lo, hi] = CHEST_SHAKE_EVERY;
    const delay = lo + Math.random() * (hi - lo);
    this.chestShakeCall = gsap.delayedCall(delay, () => {
      const s = this.chestSprite;
      if (!s || s.destroyed) return;
      const baseX = s.x;
      this.chestShakeTween = gsap
        .timeline({ onComplete: () => this.scheduleChestShake() })
        .to(s, { x: baseX - 2, rotation: -0.05, duration: 0.045, ease: 'none' })
        .to(s, { x: baseX + 2, rotation: 0.05, duration: 0.05, ease: 'none' })
        .to(s, { x: baseX - 1.4, rotation: -0.035, duration: 0.045, ease: 'none' })
        .to(s, { x: baseX + 1.4, rotation: 0.035, duration: 0.045, ease: 'none' })
        .to(s, { x: baseX, rotation: 0, duration: 0.05, ease: 'power2.out' });
    });
  }

  /** The chest was collected — pop it off the board. */
  clearChest(animate = true): void {
    const s = this.chestSprite;
    if (!s) return;
    this.chestSprite = null;
    this.stopChestTweens();
    for (const deco of [this.chestGlow, this.chestRing, this.chestShadow, this.chestBeam, this.chestLabel, ...this.chestMotes]) {
      if (deco) gsap.to(deco, { alpha: 0, duration: 0.3, onComplete: () => deco.destroy() });
    }
    this.chestGlow = null;
    this.chestRing = null;
    this.chestShadow = null;
    this.chestBeam = null;
    this.chestLabel = null;
    this.chestMotes = [];
    if (animate) {
      gsap.to(s.scale, { x: s.scale.x * 1.5, y: s.scale.y * 1.5, duration: 0.25, ease: 'back.in(2)' });
      gsap.to(s, { alpha: 0, duration: 0.25, onComplete: () => s.destroy() });
    } else {
      s.destroy();
    }
  }

  private stopChestTweens(): void {
    if (this.chestShineCall) {
      this.chestShineCall.kill();
      this.chestShineCall = null;
    }
    if (this.chestAnim) {
      this.chestAnim.onComplete = undefined;
      this.chestAnim.stop();
      this.chestAnim = null;
    }
    if (this.chestDropTl) {
      this.chestDropTl.kill();
      this.chestDropTl = null;
    }
    if (this.chestShakeCall) {
      this.chestShakeCall.kill();
      this.chestShakeCall = null;
    }
    if (this.chestShakeTween) {
      this.chestShakeTween.kill();
      this.chestShakeTween = null;
    }
    if (this.chestGlowTween) {
      this.chestGlowTween.kill();
      this.chestGlowTween = null;
    }
  }

  grayOut(): void {
    if (this.palierText) {
      this.palierText.tint = 0x666666;
    }
  }

  highlightKiller(): void {
    this.container.addChildAt(diamondOutline(MINE_TINT), 0);
  }

  destroy(): void {
    gsap.killTweensOf(this.blinkGfx);
    gsap.killTweensOf(this.fog);
    this.stopChestTweens();
    if (this.chestSprite) {
      gsap.killTweensOf(this.chestSprite);
      gsap.killTweensOf(this.chestSprite.scale);
      this.chestSprite = null;
    }
    if (this.chestGlow) {
      gsap.killTweensOf(this.chestGlow);
      this.chestGlow = null;
    }
    if (this.chestShadow) {
      gsap.killTweensOf(this.chestShadow);
      gsap.killTweensOf(this.chestShadow.scale);
      this.chestShadow = null;
    }
    if (this.chestBeamTween) {
      this.chestBeamTween.kill();
      this.chestBeamTween = null;
    }
    if (this.chestRingTween) {
      this.chestRingTween.kill();
      this.chestRingTween = null;
    }
    if (this.chestBeam) {
      gsap.killTweensOf(this.chestBeam);
      this.chestBeam = null;
    }
    if (this.chestLabelTween) {
      this.chestLabelTween.kill();
      this.chestLabelTween = null;
    }
    if (this.chestLabel) {
      gsap.killTweensOf(this.chestLabel);
      this.chestLabel = null;
    }
    for (const m of this.chestMotes) gsap.killTweensOf(m);
    this.chestMotes = [];
    this.stopPalierBob();
    if (this.palierGroup) {
      gsap.killTweensOf(this.palierGroup);
      gsap.killTweensOf(this.palierGroup.scale);
      gsap.killTweensOf(this.palierGroup.position);
      this.palierGroup = null;
    }
    if (this.palierText) {
      gsap.killTweensOf(this.palierText);
      this.palierText = null;
    }
    if (this.palierHolder) {
      gsap.killTweensOf(this.palierHolder.position);
      this.palierHolder = null;
    }
    // The carrot's hover repeats FOREVER: left alive it keeps ticking against a
    // destroyed sprite for the rest of the session, once per dug carrot.
    if (this.carrotBob) {
      this.carrotBob.kill();
      this.carrotBob = null;
    }
    if (this.carrotShadowTween) {
      this.carrotShadowTween.kill();
      this.carrotShadowTween = null;
    }
    if (this.carrotShadow) {
      gsap.killTweensOf(this.carrotShadow);
      gsap.killTweensOf(this.carrotShadow.scale);
      this.carrotShadow = null;
    }
    if (this.contentSprite) {
      gsap.killTweensOf(this.contentSprite);
      this.contentSprite.destroy();
      this.contentSprite = null;
    }
    this.container.destroy({ children: true });
  }
}
