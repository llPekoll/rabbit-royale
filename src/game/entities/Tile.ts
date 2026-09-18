import { Container, Sprite, Assets, Polygon, AnimatedSprite, Graphics, type Texture } from 'pixi.js';
import { HALF_W, HALF_H, tilePos, tileDepth } from '@/config/gridConfig';
import * as Keys from '@/config/assetKeys';
import { outlinedPixelText, shadowedPixelText, formatMult, TINT_MULT } from '../ui/PixelText';
import type { Label } from '@/game/ui/textFace';
import { getDiamondFill, getDiamondOutline } from '../services/TileTextures';
import { lootBoxSheet } from '../services/AssetLoader';
import type { TileContent } from '@/lib/game/types';
import gsap from 'gsap';

/** A bomb's width on a tile, in the tile's px — the size the first bomb art had. */
const BOMB_TILE_W = 20;

/**
 * Minesweeper's classic hint ladder. Kept exactly: a player reads "3 = danger"
 * from the COLOUR before they read the glyph, and that mapping is decades of
 * muscle memory it would be perverse to reinvent.
 */
export const HINT_TINTS = [
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
/**
 * The crater left where a bomb went off — see `markBombSite`.
 * Burnt earth at the rim, black in the pit; the pit is this share of the tile.
 */
const CRATER_RIM = 0x1a100a;
const CRATER_PIT = 0x050302;
const CRATER_PIT_SCALE = 0.72;
/**
 * The crater is translucent, not painted: a solid black diamond on a bright
 * island read as a hole in the RENDER rather than a hole in the ground.
 * Letting the grass through at the rim keeps it on the terrain.
 */
const CRATER_RIM_ALPHA = 0.55;
const CRATER_PIT_ALPHA = 0.75;

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
 *
 * LIGHTER, AND A SHADE RATHER THAN A STAIN. Navy at 55% over the generated
 * grass turned the whole board a bruised olive checkerboard: the ground the
 * island is drawn to show was the least legible thing on it. The lid is now a
 * dark green at about a third, which reads as the grass in shadow — still
 * clearly "not dug yet" beside a dug cell, which goes fully clear (see
 * `revealContent`), so the board still says where you have been. Shared with
 * the raid board on purpose: the two are meant to read the same way.
 */
export const FOG_COLOR = 0x10241a;
export const FOG_ALPHA = 0.32;
/**
 * How much of the lid a HINTED tile keeps — see `revealHint`. Enough to still
 * read as undug beside dug ground, thin enough to read as known beside fog.
 */
const HINTED_FOG_SHARE = 0.45;


/** How an undug tile is veiled. Omitted fields keep the defaults above. */
export interface FogStyle {
  color?: number;
  alpha?: number;
}
export const HIGHLIGHT_COLOR = 0xffd700;
/**
 * The X's red: the mark itself, and the ring in X MODE on every tile an X may
 * land on. Nothing else on the board is this colour.
 */
export const RISK_COLOR = 0xff5a4a;

/**
 * Prefix on a tile container's `label`, followed by the tile index.
 *
 * The island's sorted layer holds tiles, rabbits, bolts and coins as
 * siblings, and the depth hole walks that layer deciding what to dither away.
 * It is handed a `Container`, not a `Tile`, so this is how the one is read
 * back from the other — `tileIndexOf` does the parse.
 */
export const TILE_CONTAINER_LABEL = 'tile-container-';

/** The tile index behind a sorted child, or null if it is not a tile. */
export function tileIndexOf(child: { label?: string | null }): number | null {
  const label = child.label;
  if (!label || !label.startsWith(TILE_CONTAINER_LABEL)) return null;
  const i = Number(label.slice(TILE_CONTAINER_LABEL.length));
  return Number.isInteger(i) ? i : null;
}
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
const CHEST_SCALE = 1.25;
/**
 * The closed chest's frames, or null while the atlas is still coming.
 *
 * `higblight` is how the tag is spelled in the Aseprite file; `highlight` is
 * the spelling it would have if anyone ever fixes it. Both are accepted so a
 * corrected export does not empty the raid board.
 */
function chestIdleFrames(): Texture[] | null {
  const idle = lootBoxSheet?.animations?.['higblight'] ?? lootBoxSheet?.animations?.['highlight'];
  return idle && idle.length > 0 ? idle : null;
}
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
 * How loudly each tier announces itself on the board. The chest SHOWS what
 * it holds (decided 2026-08-23): the walk to it is the trade the feature is
 * about, so the player has to be able to price it from across the island —
 * a "CROWN, five steps out, do I dare" is the moment we are selling.
 *
 * The tiers are METALS, not rarity words, and deliberately so: RR Genesis
 * pieces carry their own common/rare/epic/legendary, and a chest that used
 * those same words would have a LEGENDARY one pay out a COMMON rabbit. See
 * config/chestConfig.ts.
 * `beam` is the height of the shaft of light in px (0 = none), `motes` the
 * number of rising specks.
 */
const CHEST_TIER_FLAIR: Record<string, { beam: number; width: number; motes: number; glow: number }> = {
  // Every tier gets a beam, BRONZE included: giving it none made the cheapest
  // chest look like a rendering bug rather than a modest prize. The ladder is
  // in the SIZE of the flair, not in its presence.
  //
  // These are deliberately LOUD. The chest has to be picked out from across a
  // 36-tile island against busy pixel-art grass, and the first pass — a 7px
  // beam at 22% alpha — was invisible at the size the game actually draws the
  // board. Anything subtle here reads as nothing at all.
  bronze: { beam: 26, width: 11, motes: 3, glow: 0.75 },
  silver: { beam: 40, width: 13, motes: 5, glow: 0.85 },
  gold: { beam: 58, width: 15, motes: 7, glow: 0.95 },
  crown: { beam: 78, width: 18, motes: 10, glow: 1 },
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
  /** What is drawn on a dug tile: a bomb, a carrot — or the crater's container. */
  private contentSprite: Container | null = null;
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
  private chestLabel: Container | null = null;
  private chestLabelTween: gsap.core.Tween | null = null;
  private chestShineCall: gsap.core.Tween | null = null;
  private palierHolder: Container | null = null;
  private palierText: Label | null = null;
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
  /** The number is on the lid but the tile is undug — see `revealHint`. */
  hinted = false;
  private palierRaised = false;
  /** Y offset used to float the multiplier above the rabbit's head while
   *  the rabbit sits on this tile. Tuned so the text clears the sprite's
   *  silhouette regardless of idle/hop frame. */
  private static readonly PALIER_RAISED_Y = -39;
  /** Peak-to-trough amplitude of the idle bob while the multiplier is
   *  floating over the rabbit's head. */
  private static readonly PALIER_BOB_AMP = 2.5;

  /**
   * Where the NUMBER is drawn, when not on the tile itself.
   *
   * The island hands every tile one shared layer that sorts above all the
   * rabbits, because a hint inside the tile's own container sorts with the
   * tile — and a rabbit standing one cell south of it draws over it. The
   * number is the whole game; a sprite must never be able to cover one. The
   * burrow's raid board passes nothing and keeps the hint on the tile.
   */
  private hintLayer: Container | null;
  /** The hint's resting y in its parent: the tile's own y on the shared layer, 0 on the tile. */
  private hintBaseY = 0;
  /**
   * How far above its tile a lifted hint floats: just clear of the rabbit.
   *
   * It borrowed the palier's perch (PALIER_RAISED_Y, -39), a good half-tile
   * higher than the rabbit's ears — high enough that the number read as the
   * count of the tile to the NORTH. The rabbit's art stands ~16 units tall
   * (idle frame top at y18 of 32, RABBIT_SCALE 1.5) and the glyph is ~11
   * units tall at the hint's 1.4 scale, so -26 leaves ~3 units of air
   * between the ears and the number's foot.
   */
  private static readonly HINT_RAISED_Y = -26;
  /**
   * The lifted hint's levitation, in the group's own units (x1.4 on screen).
   * A number that hovers reads as carried BY the rabbit; a still one at that
   * height reads as printed on the ground behind it.
   */
  private static readonly HINT_BOB = 1.6;
  /**
   * How big the count is drawn, as a multiple of the face's 8px cell.
   *
   * 1.2, down from 1.4: with the outline ring around every glyph (see
   * `outlinedPixelText`) the numbers read from further away than they used to,
   * and at 1.4 they crowded the tiles they belong to. A whole 8px cell times
   * 1.2 still lands on clean pixel edges at the island's camera.
   */
  private static readonly HINT_SCALE = 1.2;
  /**
   * THE NUMBERS LIE ON THE GROUND, in the lattice's own plane.
   *
   * Upright, each count was a HUD marker parked over a tile rather than a
   * thing belonging to it: a field of vertical glyphs, each with its own black
   * ring, reported as "tout les nombres c'est hyper messy" (2026-09-18) on a
   * board where 30-odd of them were up at once. Laid flat they read as painted
   * on the grass, and the board goes quiet.
   *
   * Expressed as SKEW rather than as a matrix on purpose. `setFromMatrix`
   * replaces the whole transform — position and pivot included — and those two
   * are spoken for: `raiseHint` tweens `position.y` to lift the count over a
   * rabbit's head and `startHintBob` tweens `pivot.y` to make it hover. Skew
   * composes with both, so the lift still travels straight UP the screen. A
   * matrix would have sent it off along the lattice's diagonal.
   *
   * The values are the decomposition of the iso projection at the board's own
   * cell (`isoProject` with HALF_W/HALF_H): x goes (+HALF_W, +HALF_H), y goes
   * (-HALF_W, +HALF_H). Pixi builds its transform as
   *     a = cos(rot + skewY) * sx      c = -sin(rot - skewX) * sy
   *     b = sin(rot + skewY) * sx      d =  cos(rot - skewX) * sy
   * so at rotation 0 that projection is exactly the angles below, with both
   * axes scaled by `hypot(HALF_W, HALF_H) / HALF_W`. Derived rather than
   * eyeballed: the glyphs share the ground's vanishing lines, so they sit in
   * the picture instead of on it.
   */
  private static readonly HINT_SKEW_X = -Math.atan2(HALF_W, HALF_H);
  private static readonly HINT_SKEW_Y = Math.atan2(HALF_H, HALF_W);
  /** What the skew costs in glyph size, so HINT_SCALE still means what it did. */
  private static readonly HINT_SKEW_SCALE = Math.hypot(HALF_W, HALF_H) / HALF_W;
  /**
   * The ring under multiply, pale rather than the kit's ink.
   *
   * White is multiply's identity, so a pale ring darkens nothing and reads as
   * a halo of UNTOUCHED ground around the glyph — which is the separation the
   * dark ring was there to give. The ink ring multiplied is a disaster and was
   * the first thing tried: near-black times grass is near-black, so every
   * count came out as a black lozenge with a coloured scratch in it (kept as
   * `Island/HintPerspective` → MultiplyWithInkRing so nobody retries it).
   *
   * Not pure white: at 0xffffff the ring is exactly the identity and vanishes,
   * losing the glyph its edge on pale ground (sand, dug dirt). A touch under
   * leaves a whisper of darkening that still separates.
   */
  private static readonly HINT_RING_TINT = 0xf2f4ff;
  private hintBob: gsap.core.Tween | null = null;

  constructor(index: number, fogStyle?: FogStyle, lift = 0, tier = 0, hintLayer?: Container) {
    this.index = index;
    this.hintLayer = hintLayer ?? null;
    const { x, y: flatY } = tilePos(index);
    // Raised onto its own terrace. Without this the board is a flat
    // chequerboard lying across a landscape with plateaus: the ground rises,
    // the tiles stay at sea level, and the two visibly contradict each other.
    const y = flatY - lift;
    // Depth on the SAME scale the terrain sorts by (`isoDepth`), height
    // included. `tileDepth` alone is `col + row`, which gives a raised tile and
    // a sea-level one on the same diagonal an identical depth — so which of
    // them draws on top is arbitrary, and neighbouring tiles visibly overlap.
    const depth = tileDepth(index) * 16 + tier;

    this.container = new Container();
    this.container.position.set(x, y);
    this.container.zIndex = depth;
    // Named so the island can find the TILE behind one of its sorted children
    // — the depth window punches holes in whatever covers the rabbit, and a
    // tile holding a chest has to be spared (see `tileIndexOf`).
    this.container.label = `${TILE_CONTAINER_LABEL}${index}`;

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

    /**
     * The VEIL is what the pointer sees, not the container.
     *
     * The veil is the tile as drawn: it lives in the cell's terrain block and
     * sorts with the ground, so a raised tile's veil is tested before the
     * lower veil it covers, and Pixi's draw order answers "which tile is under
     * the pointer" exactly as the picture does. The container holds hints and
     * highlights, which float above everything and must not catch the pointer
     * for a tile whose veil is hidden under a neighbour's wall — the wall
     * itself is interactive with no action, so it swallows that pointer
     * instead (see `buildGround`).
     *
     * A dug tile keeps its veil at alpha 0 and stays tappable: the hit test
     * does not read alpha. The hit area is the FULL diamond, not the inset one
     * the texture draws, so the hairline between two tiles belongs to one of
     * them rather than to whatever shows through it.
     */
    this.container.eventMode = 'passive';
    this.fog.eventMode = 'static';
    this.fog.cursor = 'pointer';
    this.fog.label = `tile-${index}`;
    this.fog.hitArea = new Polygon([
      0, -HALF_H,
      HALF_W, 0,
      0, HALF_H,
      -HALF_W, 0,
    ]);
  }

  /**
   * The veil itself — the diamond that covers undug ground.
   *
   * Exposed so the cascade's ripple can lift the LID and nothing else: the
   * veil is mounted in the cell's terrain block (`mountVeil`) beside the grass
   * and the cliff face, so moving the block would heave the landscape. What
   * rises as a zone opens is the cover coming off, not the island breathing.
   */
  get veil(): Sprite {
    return this.fog;
  }

  /**
   * Run `fn` when a pointer goes DOWN on the tile. Bound to the veil — see the
   * constructor.
   *
   * A press, not a tap: this fires on `pointerdown`, and the tile does not know
   * whether the finger will lift where it landed or drag the camera away. The
   * scene remembers which tile was pressed and decides on the release, once
   * its gesture recogniser has said whether this was a tap or a pan (see
   * `PanZoomGestures`). Resolving the press here through Pixi's hit test is
   * still what makes a raised tile win over the lower one its wall covers —
   * the draw order answers "which tile is under the pointer" exactly as the
   * picture does, which the flat geometric resolver cannot.
   */
  onPress(fn: () => void): void {
    this.fog.on('pointerdown', fn);
  }

  /**
   * Hand the veil to a host that will draw it somewhere else.
   *
   * The island scene mounts it inside the cell's TERRAIN block, so it sorts
   * with the ground it covers instead of with the tile's hints and highlights
   * (which stay here, above everything). The tile keeps tweening it — the
   * reveal does not care whose child it is. If the host declines, the veil
   * goes back where it was, under everything else the tile draws.
   */
  mountVeil(host: (veil: Sprite, zIndex?: number) => boolean): void {
    /**
     * All THREE flat diamonds go into the block, not just the fog.
     *
     * The highlight and the blink are the same shape as the veil and lie just
     * as flat, so leaving them in the container was the bug `mountVeil`
     * already fixes for the fog, twice over: the diamond texture draws ~21px
     * tall against an 18px tier lift, so every one of them overhangs the cell
     * behind it by ~3px, and two translucent quads over one pixel compound
     * (0.30 over 0.30 reads 0.51). On terraced ground that is the double-dark
     * wedge along every shelf edge — and with the highlight up it was a
     * double-GOLD one.
     *
     * Local depths above the veil's 2, in the order they paint: the fog is
     * the ground's own cover, the highlight rings the tile you may move to,
     * and the blink flashes over both. Nothing else in the block goes this
     * high — the burrow's trap marker, the only other mounted thing, sits at
     * 3 on a board that has no highlight.
     */
    this.container.removeChild(this.fog);
    if (!host(this.fog, 2)) this.container.addChildAt(this.fog, 0);

    this.container.removeChild(this.highlightGfx);
    if (!host(this.highlightGfx, 4)) this.container.addChildAt(this.highlightGfx, 1);

    this.container.removeChild(this.blinkGfx);
    if (!host(this.blinkGfx, 5)) this.container.addChildAt(this.blinkGfx, 2);
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
    // A shove can still set off a marked bomb; the X goes with the lid.
    this.clearFlag();

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
    }

    // THE NUMBER, on every dug tile that is not a bomb — carrot and chest
    // tiles included. It used to be drawn for empty ground only, so a dug
    // carrot beside two bombs showed the carrot lifting away and then
    // nothing: a blank that read as "0" on the one tile the player had just
    // paid attention to. Reported as "a tile next to a bomb shows nothing".
    // The carrot pops over it for a beat and lifts; the number stays.
    // A hint the cascade already wrote on the lid is kept, not drawn twice.
    if (content !== 'bomb' && adjacent > 0 && !this.hintGroup) {
      this.addHint(adjacent, animate);
    }
  }

  private unknownMark: Container | null = null;

  /**
   * A "?" on a tile the ring offers but nobody has READ.
   *
   * The board has three kinds of undug ground and told them apart by the
   * veil's darkness alone: dug (none), read by the cascade (thin), unread
   * (full). Around a rabbit standing on a number that comes out as a ring of
   * tiles some of which are greyer than others for no stated reason — Paul,
   * 2026-09-17: "des cases autour du lapin qui sont grisees sans aucune raison
   * apparente". The reason is the whole game: a grey one may hide a bomb. So
   * the ring says it, in minesweeper's own word, on the tiles it lights and
   * nowhere else.
   */
  setUnknownMark(on: boolean): void {
    if (!on) {
      this.unknownMark?.destroy({ children: true });
      this.unknownMark = null;
      return;
    }
    if (this.unknownMark) return;
    const label = outlinedPixelText(0, 0, '?');
    label.face.tint = 0xd9dde6;
    label.group.alpha = 0.9;
    label.group.zIndex = 38;
    /**
     * Laid on the diamond like the counts, so the marks on a board read as one
     * family — but NOT multiplied, and keeping its ink ring.
     *
     * The difference is what the two are drawn on. A count is painted on
     * ground the player has opened, and multiply is what makes it belong to
     * that grass. A "?" sits on a LID: undug ground under the veil, which is
     * already darkened. Multiplying a pale glyph into a dark veil would leave
     * almost nothing, and the mark exists precisely to say a tile is unread.
     */
    label.group.skew.set(Tile.HINT_SKEW_X, Tile.HINT_SKEW_Y);
    label.group.scale.set(Tile.HINT_SCALE * 0.8 * Tile.HINT_SKEW_SCALE);
    if (this.hintLayer) {
      label.group.position.set(this.container.x, this.container.y);
      this.hintLayer.addChild(label.group);
    } else {
      this.container.addChild(label.group);
    }
    this.unknownMark = label.group;
  }

  /** A red X stands here: a bomb a player marked and the server confirmed. */
  flagged = false;
  private flagMark: Graphics | null = null;

  /**
   * Put the red X on this tile — the lid stays, the bomb stays under it.
   *
   * Drawn, not a sprite: two thick strokes with a dark edge, squashed to the
   * diamond so it lies ON the ground rather than standing on it. It has to
   * read at a glance from across the board as "not there", on grass and on
   * sand, which is the job the outlined numbers already do the same way.
   */
  setFlag(animate = true): void {
    if (this.flagged || this.revealed) return;
    this.flagged = true;
    const g = new Graphics();
    const r = HALF_H * 0.62;
    for (const [w, c] of [[7, 0x3a0d0d], [4, RISK_COLOR]] as const) {
      g.moveTo(-r, -r).lineTo(r, r).moveTo(r, -r).lineTo(-r, r)
        .stroke({ width: w, color: c, cap: 'round' });
    }
    // Twice as wide as tall: the diamond's own proportions.
    g.scale.set(animate ? 0 : 1.5, animate ? 0 : 0.75);
    // On the numbers' layer, for the numbers' reason: an X behind the pine on
    // the next cell is an X nobody reads. There it carries the tile's world
    // position itself.
    if (this.hintLayer) {
      g.position.set(this.container.x, this.container.y);
      g.zIndex = 39;
      this.hintLayer.addChild(g);
    } else {
      this.container.addChild(g);
    }
    this.flagMark = g;
    if (animate) gsap.to(g.scale, { x: 1.5, y: 0.75, duration: 0.3, ease: 'back.out(3)' });
  }

  private clearFlag(): void {
    this.flagMark?.destroy();
    this.flagMark = null;
    this.flagged = false;
  }

  /** Whether a chest is standing on this tile — a chest is never a bomb. */
  get hasChest(): boolean {
    return this.chestSprite !== null && this.chestSprite !== undefined;
  }

  /**
   * The cascade opened this tile's number WITHOUT digging it.
   *
   * The lid stays — the tile is still undug, still holds its content, still
   * costs a step — but it thins to say "read, not walked", and the count is
   * written on it. A zero writes nothing (a bare thinner lid is the zero, as
   * on dug ground). When the tile is later dug, `revealContent` keeps the
   * number and only clears the lid.
   */
  revealHint(adjacent: number): void {
    if (this.revealed || this.hinted) return;
    this.hinted = true;
    gsap.to(this.fog, { alpha: this.fog.alpha * HINTED_FOG_SHARE, duration: 0.25, ease: 'power2.out' });
    if (adjacent > 0) this.addHint(adjacent, true);
  }

  private addContentSprite(key: string): void {
    const tex = Assets.get(key);
    if (!tex) return;
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    // The bomb is drawn at the WIDTH the old 20px sprite had on a tile. The new
    // art is 27x36 with a longer fuse; at its native size it overhung the
    // diamond. Width, not height, so the fuse adds height and not bulk.
    if (key === Keys.BOMB_SMALL) sprite.scale.set(BOMB_TILE_W / tex.width);
    this.container.addChild(sprite);
    this.contentSprite = sprite;
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
    if (!(this.revealed || this.hinted) || !this.hintGroup) return;
    this.stopHintBob();
    this.hintGroup.destroy({ children: true });
    this.hintGroup = null;
    if (count > 0) this.addHint(count, false);
    // Redrawn under a rabbit: the new number goes straight back to hovering
    // over its head, not onto the tile it is covering.
    if (this.hintRaised) {
      if (this.hintGroup) {
        (this.hintGroup as Container).position.y = this.hintBaseY + Tile.HINT_RAISED_Y;
        this.startHintBob();
      } else {
        this.hintRaised = false;
      }
    }
  }

  private addHint(count: number, animate: boolean): void {
    // Outlined, not shadowed: the numbers ARE the game, and the classic ladder's
    // blue "1" on grass measured 1.2–1.6:1 behind a 30% shadow. The ring gives
    // every tint an edge on every ground (see outlinedPixelText).
    const label = outlinedPixelText(0, 0, String(count));
    label.face.tint = HINT_TINTS[Math.min(count, HINT_TINTS.length - 1)];
    label.group.zIndex = 40;

    /**
     * MULTIPLIED INTO THE GROUND, ring and all.
     *
     * Drawn normally a number sits ON the picture; multiplied it DARKENS the
     * picture, so the grass reads through it and the count belongs to the tile
     * it names. Per-renderable in Pixi v8 — setting it on the group does not
     * reach the labels — so every copy is told, the ring included: a
     * normal-blended ring around a multiplied face is the worst of both, an
     * opaque edge over ground the face is only tinting.
     */
    for (const child of label.group.children) child.blendMode = 'multiply';
    for (const copy of label.outline) copy.tint = Tile.HINT_RING_TINT;

    // Laid flat on the cell's diamond. Skew, not a matrix — see HINT_SKEW_X.
    label.group.skew.set(Tile.HINT_SKEW_X, Tile.HINT_SKEW_Y);
    if (this.hintLayer) {
      // On the shared layer the group carries the tile's world position
      // itself; raise/lower move it relative to that.
      this.hintBaseY = this.container.y;
      label.group.position.set(this.container.x, this.container.y);
      this.hintLayer.addChild(label.group);
    } else {
      this.hintBaseY = 0;
      this.container.addChild(label.group);
    }
    this.hintGroup = label.group;

    const scale = Tile.HINT_SCALE * Tile.HINT_SKEW_SCALE;
    if (animate) {
      label.group.scale.set(0);
      gsap.to(label.group.scale, { x: scale, y: scale, duration: 0.22, ease: 'back.out(2)' });
    } else {
      label.group.scale.set(scale);
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
   * What a bomb leaves behind: a HOLE.
   *
   * The explosion is over in half a second, and the tile has to keep saying
   * "a bomb went off here" long after — for the player who walked it, and for
   * the three others reading the same board. It used to be a skull, which
   * said "someone died here" about a run that a bomb does not end (one heart,
   * not the rabbit). A crater says what actually happened: the ground is
   * gone. Drawn as the tile's own diamond, near-black, with a thinner darker
   * one inside it sitting a pixel lower — the two shades are what make it
   * read as depth rather than as a tile painted black.
   */
  markBombSite(dug?: () => boolean): boolean {
    // The bomb sprite drawn by revealContent has done its job.
    if (this.contentSprite) {
      gsap.killTweensOf(this.contentSprite);
      this.contentSprite.destroy();
      this.contentSprite = null;
    }

    // The painted crater below is the FALLBACK. Where the terrain can swap the
    // cell's ground for the hand-painted pit it does that instead, because the
    // two diamonds are a good impression of a hole and the art is an actual
    // one: it is drawn in the island's own palette, sits in the cell's block,
    // and is opaque where the painted crater is translucent — a real pit
    // rather than a dark stain the grass shows through. The painted one stays
    // for every surface the art does not cover (the burrow, the farm) and for
    // a cell with no terrain block under it.
    if (dug?.()) return true;

    const hole = new Container();
    hole.zIndex = 39;   // above the tile, below a rabbit standing on it
    // The rim: the full diamond, the colour of burnt earth.
    hole.addChild(diamondFill(CRATER_RIM, CRATER_RIM_ALPHA));
    // The pit: smaller, black, and a touch lower — the far wall of the hole
    // catches no light, so the offset reads as the near edge overhanging it.
    const pit = diamondFill(CRATER_PIT, CRATER_PIT_ALPHA);
    pit.scale.set(pit.scale.x * CRATER_PIT_SCALE, pit.scale.y * CRATER_PIT_SCALE);
    pit.y += 1;
    hole.addChild(pit);
    this.container.addChild(hole);
    this.contentSprite = hole;

    // Fade in UNDER the blast rather than popping in after it: the explosion is
    // still playing over this tile, and a hole appearing on its last frame
    // reads as a second, separate event.
    hole.alpha = 0;
    gsap.to(hole, { alpha: 1, duration: 0.4, delay: 0.25 });
    return false;
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

  /**
   * A rabbit is standing here: lift the hint above its head.
   *
   * The number is the whole game and the rabbit's sprite covers it the
   * moment it lands, so the count rides up just over the rabbit's head
   * (HINT_RAISED_Y), hovers there, and comes back down when the rabbit
   * leaves. No-op without a hint, or already up.
   */
  raiseHint(): void {
    if (!this.hintGroup || this.hintRaised) return;
    this.hintRaised = true;
    gsap.killTweensOf(this.hintGroup.position);
    gsap.to(this.hintGroup.position, {
      y: this.hintBaseY + Tile.HINT_RAISED_Y,
      duration: 0.22,
      ease: 'power3.out',
      onComplete: () => this.startHintBob(),
    });
  }

  /** The rabbit left: the hint drops back onto its tile, with a small bounce. */
  lowerHint(): void {
    if (!this.hintGroup || !this.hintRaised) return;
    this.hintRaised = false;
    this.stopHintBob();
    gsap.killTweensOf(this.hintGroup.position);
    gsap.to(this.hintGroup.position, { y: this.hintBaseY, duration: 0.35, ease: 'bounce.out' });
  }

  /**
   * Levitate the lifted hint. On the PIVOT, not the position: raise and lower
   * own `position.y`, and a bob there would fight them (and be killed by
   * their `killTweensOf`). A positive pivot lifts the glyphs off their perch.
   */
  private startHintBob(): void {
    const group = this.hintGroup;
    if (!group || !this.hintRaised || this.hintBob) return;
    // Under reduced motion it still sits over the head, it just holds still.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    group.pivot.y = 0;
    this.hintBob = gsap.to(group.pivot, {
      y: Tile.HINT_BOB,
      duration: 0.8,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private stopHintBob(): void {
    this.hintBob?.kill();
    this.hintBob = null;
    if (this.hintGroup && !this.hintGroup.destroyed) this.hintGroup.pivot.y = 0;
  }

  private hintRaised = false;

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

  /**
   * The server refused a step onto this tile. Red where the tap's white flash
   * had promised a move: without it the promise was simply never kept, and a
   * refused step looked exactly like a dropped tap.
   */
  deny(): void {
    const red = diamondFill(0xff4d4d, 0.55);
    red.zIndex = 51;
    this.container.addChild(red);
    gsap.to(red, {
      alpha: 0,
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => {
        this.container.removeChild(red);
        red.destroy();
      },
    });
  }

  setHighlight(on: boolean, risky = false): void {
    const color = on && risky ? RISK_COLOR : HIGHLIGHT_COLOR;
    this.highlightGfx.tint = color;
    this.blinkGfx.tint = color;
    this.highlightGfx.visible = on;
    gsap.killTweensOf(this.blinkGfx);
    this.blinkGfx.alpha = 0;
    this.blinkGfx.visible = on;
    // A lit tile is a clickable one, so say so with the cursor too — on a
    // desktop the pointer is the affordance a player reads before the glow.
    // (A phone has no cursor and simply ignores this.)
    this.fog.cursor = on ? 'pointer' : 'default';
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
   * Put the round's chest on this tile — visible from the first frame (the
   * spec's "il le voit et choisit d'y aller"). It draws above the veil: the
   * veil lives in the cell's terrain block (see `mountVeil`), under everything
   * this container holds.
   * `tint` is the tier accent (chestConfig.CHEST_TIER_COLOR).
   */
  setChest(tint: number, drop = false, tier: string = 'bronze'): void {
    if (this.chestSprite) return;
    // Gated on the ATLAS FRAMES, which are the only thing that draws the chest
    // now. It used to be gated on a flat `treasure_chest.webp` that was merely
    // the fallback — so the sheet could be parsed and ready and the chest would
    // still refuse to appear if that one PNG had not loaded, and deleting the
    // PNG would have emptied every raid board silently. Checked here rather
    // than inside `buildChestSprite` so the glow, ring and shadow are never
    // laid down around a chest that is not coming.
    const idle = chestIdleFrames();
    if (!idle) return;
    const flair = CHEST_TIER_FLAIR[tier] ?? CHEST_TIER_FLAIR.bronze;

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

    const s = this.buildChestSprite(idle);
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
      // Outlined: plain tinted glyphs measured 1.8:1 (GOLD) and 2.3:1 (SILVER)
      // on grass — the word that says how much the chest is worth was the
      // hardest thing on the tile to read.
      const { group: label, face } = outlinedPixelText(0, -flair.beam - 12, tier.toUpperCase());
      // Sized with the box (CHEST_SCALE): at 1.6 the word was wider than
      // the tile and read from across the island where the chest itself was
      // the thing meant to.
      label.scale.set(1.1);
      face.tint = tint;
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
  /**
   * The chest, from the kit's atlas — the only source there is.
   *
   * There used to be a still `treasure_chest.webp` behind this as a fallback,
   * a flat box with no light on it. It went because a chest that never catches
   * the light reads as a sticker rather than an object (the long version is in
   * `loot-chest.tsx`), and because a fallback nobody ever saw was a second
   * chest to keep in step with the first. `setChest` will not call this
   * without the sheet.
   */
  private buildChestSprite(idle: Texture[]): Sprite {
    const anim = new AnimatedSprite(idle);
    anim.anchor.set(0.5, 0.8);
    anim.scale.set(CHEST_SCALE);
    anim.gotoAndStop(0); // idle = the closed box, still
    this.chestAnim = anim;
    this.scheduleChestShine();
    return anim;
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

  /**
   * Take the tier word off this chest, keeping everything else.
   *
   * For the TUTORIAL island alone, where an arrow is planted over the chest
   * (`fx/ChestPointer`) and the two land in the same place above the box. The
   * word is what gives way: on the first island there is exactly one chest and
   * it is always bronze, so "BRONZE" grades a prize against a ladder the
   * player has not been shown yet — while the arrow is saying the one thing
   * that island needs to say. Everywhere else the word stays, because there
   * the tier is a real decision about how far to walk.
   */
  hideChestTier(): void {
    if (this.chestLabelTween) { this.chestLabelTween.kill(); this.chestLabelTween = null; }
    this.chestLabel?.destroy({ children: true });
    this.chestLabel = null;
  }

  /** The chest was collected — pop it off the board. */
  clearChest(animate = true): void {
    const s = this.chestSprite;
    if (!s) return;
    this.chestSprite = null;
    this.stopChestTweens();
    for (const deco of [this.chestGlow, this.chestRing, this.chestShadow, this.chestBeam, this.chestLabel, ...this.chestMotes]) {
      // With children: the label is an outlined group of nine glyphs now.
      if (deco) gsap.to(deco, { alpha: 0, duration: 0.3, onComplete: () => deco.destroy({ children: true }) });
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
    // A hint on the shared layer is not this container's child either.
    if (this.hintGroup && this.hintGroup.parent !== this.container && !this.hintGroup.destroyed) {
      this.stopHintBob();
      gsap.killTweensOf(this.hintGroup.position);
      this.hintGroup.destroy({ children: true });
      this.hintGroup = null;
    }
    // The red X and the "?" live on that same shared layer, so destroying the
    // container leaves them standing too. Left behind, an X survives the
    // change of island and marks a tile of the NEXT run that nobody flagged;
    // when that tile is flagged for real, two X's overlap, offset by the two
    // islands' lifts. That is the "doubled X" of 2026-09-18.
    if (this.flagMark) gsap.killTweensOf(this.flagMark.scale);
    this.clearFlag();
    this.setUnknownMark(false);
    // A diamond mounted in a terrain block is not this container's child, so
    // destroying the container would leave it behind on the island. All three
    // mount now (see `mountVeil`), so all three have to be checked — the fog
    // alone was right only while it was the only one deported.
    for (const d of [this.fog, this.highlightGfx, this.blinkGfx]) {
      if (d.parent !== this.container && !d.destroyed) d.destroy();
    }
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
