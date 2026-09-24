/**
 * Your burrow, as a place rather than a list of cards.
 *
 * The screen has two jobs. It shows what you own — the field, the mound, what
 * grew while you were away — and it is where you PLACE TRAPS, which is the only
 * defence you get and the reason the layout is a board at all.
 *
 * A raider crosses this same ground (see game/burrow/board): they come in at
 * the entrance and walk towards the field, spending energy, and your traps
 * drain it. So the question this screen asks the owner is a spatial one —
 * which approach do I make expensive? — and it can only be asked on a map.
 *
 * ## The ground is GENERATED, and it is yours
 *
 * This screen used to draw one full-canvas painting with an invisible grid
 * calibrated over it, the same picture for every player in the game. The
 * ground is now tiles, cut from the owner's own seed (their player id) on the
 * same terrain the island uses — so two burrows are two different places, a
 * raider has to actually read the homestead they are crossing, and a cliff is
 * a real obstacle rather than a painted one.
 *
 * Everything on this screen therefore needs to know WHOSE burrow it is, which
 * is what `BurrowSceneData.seed` carries.
 */
import {
  Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, Polygon,
  type FederatedPointerEvent,
} from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { GAME_W, GAME_H } from '../Application';
import { CloudField } from '../fx/Clouds';
import { BirdFlock } from '../fx/Birds';
import { CarrotCrop } from '../entities/CarrotCrop';
import { getDiamondFill, getDiamondOutline, diamondScaleFor } from '../services/TileTextures';
import { shadowedPixelText } from '../ui/PixelText';
import { playUiSfx } from '../services/SoundManager';
import { PlayerRabbit } from '../entities/PlayerRabbit';
import { HomeRabbit } from '@/game/burrow/HomeRabbit';
import { DepthHole } from '../fx/DepthHole';
import { DEPTH_HOLE_LOOK } from '@/config/depthHoleLook';
import { FOG_COLOR, FOG_ALPHA, HIGHLIGHT_COLOR, HINT_TINTS } from '../entities/Tile';
import * as Keys from '@/config/assetKeys';
import { BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, burrowColRow } from '@/config/burrowConfig';
import {
  burrowCell, isTrappable, isDoorstep, entranceTile, walkableTiles, fieldTiles,
} from '@/game/burrow/board';
import { burrowTileScreen, burrowDepth } from '@/game/burrow/screen';
import { FenceView } from '@/game/burrow/FenceView';
import type { FenceSeg } from '@/game/burrow/fence';
import { RABBIT_SCALE } from '@/config/gridConfig';
import { electrocute } from '../fx/Electrocute';
import { createBurrowTerrain, type BurrowTerrainView, type BurrowArtPreview } from '@/game/burrow/BurrowTerrain';
import { MEADOW_LOOK } from '@/game/burrow/MeadowLook';
import {
  homeCam, boardCam, placeCam, panPlaceCam, zoomPlaceCam, clampPlaceCam, type BurrowCam, wallCam } from './burrowCamera';
import { PanZoomGestures, type Point } from '../input/PanZoomGestures';
import {
  GhostBomb, GloveHint, isTouchPrimary, nearestTo, prefersReducedMotion, type GloveTarget,
} from '../ui/PlacementHints';

/**
 * A diamond sprite sized for THIS board.
 *
 * The texture is baked at the island's tile size; the burrow's is smaller. Every
 * diamond on this screen goes through here, because one that skips it is drawn
 * a quarter too big and stops matching the ground under it — which is exactly
 * how the placement grid ended up unreadable.
 */
function burrowDiamond(): Sprite {
  const s = new Sprite(getDiamondOutline());
  s.anchor.set(0.5);
  const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
  s.scale.set(k.x, k.y);
  return s;
}

/**
 * The same diamond, SOLID.
 *
 * The outline is 30% white plus a 2px stroke, which reads beautifully against
 * open water and disappears completely against a sunlit meadow — and a raider
 * stands on grass, not on water. A steppable cell has to be found at a glance
 * on a board the player has never seen, so it gets a filled body instead of a
 * hairline. Placement mode learned this exact lesson already (see
 * `PLACEABLE_TINT`: "the first pass at 16% white simply vanished into the
 * grass").
 */
function burrowDiamondSolid(): Sprite {
  const s = new Sprite(getDiamondFill());
  s.anchor.set(0.5);
  const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
  s.scale.set(k.x, k.y);
  return s;
}

/** Placed traps read as YOURS — gold, like the crown and the carrot count. */
const TRAP_TINT = 0xffd45c;
/**
 * A rearming trap FILLS UP, like a glass.
 *
 * One bomb drawn twice: a dim copy for the part still to come, and a solid
 * copy underneath it clipped to a waterline that rises as the trap recharges.
 * The boundary between the two IS the progress bar — no second sprite, no
 * gauge hovering over the tile, and nothing to compare against.
 *
 * This replaced fading the whole sprite up together, which was readable but
 * ambiguous: a half-faded bomb could equally be a bomb drawn faint, and the
 * eye had to guess whether the value it saw was "half charged" or just "the
 * colour rearming traps are". A LINE has a position, and a position is read
 * as a level without being taught.
 */
const REARMING_ALPHA = 0.3;

/**
 * How near a fence the pointer must be to name it, in SCREEN pixels.
 *
 * A fence is a LINE, and a line has no area to hit-test, so the side under
 * the pointer is whichever span's posts are nearest (`FenceView.pick`). 28px
 * is a little over one cell's half-height at this board's zoom: close enough
 * that the two sides meeting at a corner are still told apart, wide enough
 * that a finger does not have to land on the rails themselves.
 */
const SIDE_GRAB = 28;


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

/**
 * THE DOORSTEP: the cells a raider crosses before a bomb may be under them
 * (`TRAPS.DOORSTEP` steps in from the entrance — see `game/burrow/cells`).
 *
 * Shown, not left dark. The first carve-out of the entrance was undone partly
 * because a cell that ignores a tap with nothing to say for itself reads as a
 * broken board; the rule only works if the defender can SEE where the fight
 * starts, and set the bombs behind it. So while placing the doorstep wears
 * its own colour, and a chevron hangs over the door itself — the same sprite
 * as the gold one over the garden, the other end of the same walk.
 *
 * ORANGE, because every other colour on this board already means something:
 * blue is "yours to mine", gold is a bomb (and the prize), red is the field
 * the raider is heading for, navy is "not read yet". Warm against the
 * navy fog so a raider reads it as ground they were given, not as sea.
 *
 * Two alphas: the placement diamond is an OUTLINE and needs more of it to be
 * seen on grass; the raid veil is a solid fill and the same alpha would paint
 * the doorstep louder than the goal itself.
 */
const DOOR_TINT = 0xff8a3d;
const DOORSTEP_ALPHA = 0.55;
const DOORSTEP_VEIL_ALPHA = 0.22;

/**
 * The free cell under the mouse, while placing.
 *
 * GOLD, the colour a placed trap's marker wears (`TRAP_TINT`), and not merely
 * a brighter blue: the hovered cell is showing what it will BECOME, and the
 * ghost bomb standing on it says the same thing. Blue is "you could", gold is
 * "this one is yours if you click".
 */
const HOVER_TINT = TRAP_TINT;
const HOVER_ALPHA = 0.85;
/**
 * A mined cell under the mouse: a click LIFTS this bomb.
 *
 * Warm red on the marker and the bomb raised off the ground. The two moves are
 * the whole sentence — red is "this undoes something", the rise is "it comes
 * out" — and neither can be mistaken for the gold preview on a free cell, which
 * is the one confusion that would bury a second bomb where the player meant to
 * dig one up.
 */
const LIFT_TINT = 0xff6b4a;
/** How far the bomb rises, in the cell's own px — clear, but it stays on its cell. */
const LIFT_PX = 5;

/**
 * A trap's bomb is anchored at its foot: this far down the art is the ground.
 * 0.78 on the first 20x23 bomb; the 27x36 art spends its top third on the
 * fuse, so the body's foot sits lower down the image.
 */
const BOMB_ANCHOR_Y = 0.86;
/**
 * The bomb's scale for a texture, off the CELL rather than the texture's own
 * pixels. Shared by the buried bomb and the hover ghost, so the preview is
 * exactly the size of what a click buries.
 */
function trapBombScale(tex: Texture): number {
  return (BURROW_HALF_W * 0.62) / tex.width;
}

// ── Raiding someone else's burrow ────────────────────────────────────────────
//
// The same board, read from the other side, and the reading is now the whole
// point. A raider sees clue NUMBERS and the steps they may take; they never
// see a trap until they spring it, which is the whole reason burying one is
// worth doing.
//
// ## The homestead is in full view; the NUMBERS are the secret
//
// The overlay is drawn over the defender's whole burrow — every tree, the
// cliffs, the door, the field. For a while the terrain was hidden and
// uncovered cell by cell instead (`BurrowTerrainView.reveal`), on the theory
// that the shape of generated ground was itself information a raider should
// pay for. It played terribly: a raider looked at three or four tiles adrift
// in open water, could not tell where the field was, which way the island
// ran, or why one step was a wall, and read the whole screen as broken.
//
// So the ground is shown and the CLUES are what a raider earns by walking.
// Where the traps are is the only real secret, the server never sends it, and
// a number is only drawn on a tile the raider has stood on or next to. Knowing
// where the garden is tells them where to go; it does not tell them what is
// buried on the way.

/** Seconds between blinks as the sweep travels round the raider — the
 *  island's own cadence (`SWEEP_STEP_SECONDS` there). */
const RAID_SWEEP_SECONDS = 0.25;
/** The island's hint pops in at this size; the raid's clue is the same glyph. */
const CLUE_SCALE = 1.4;

/**
 * How hard one wheel notch zooms while placing, and the trackpad's correction.
 *
 * The island's numbers, unchanged, because the gesture is the same gesture on
 * the same hardware — a notch that moved the island by 15% should not move the
 * burrow by some other amount. See `IslandScene` for the derivation.
 */
const WHEEL_ZOOM_PER_UNIT = 0.0015;
const TRACKPAD_PINCH_BOOST = 6;
/**
 * The carrot field, marked red from the first frame.
 *
 * A raid is a trip TO somewhere, and on a full map the garden reads as one
 * more patch of scenery: the raider could see the whole island and still not
 * know which corner ended the trip. So the field wears red instead of the
 * navy fog, always — the fog says "not read yet", this says "step here and
 * you have won", and the two must not be the same colour.
 *
 * It was the RING round the field that wore the red, with the field bare in
 * the middle: a fence around the prize. Played, that read backwards — the
 * red cells were the last ones a raider had to cross and survive, and the
 * win was the one patch NOT painted as the goal. The red is on the win now,
 * and the ring is ordinary ground: the defender's to mine, the raider's to
 * read, nothing about it announced.
 */
const GOAL_TINT = 0xff3b3b;
const GOAL_ALPHA = 0.5;

/**
 * THE GOLDEN ARROW, hanging over the garden.
 *
 * The red above says "this is the win" to a raider near enough to read the
 * cell; it says little to one who has just walked in the door and is looking
 * at a whole homestead behind trees and shelves. A marker in the AIR is read
 * from across the board, which is exactly where the question "which way?" is
 * asked.
 *
 * It is the hub's own nav arrow (`ARROW_URLS.down` from the shared kit, the
 * same chevron the cabinet carousel is flanked with), not a shape drawn here:
 * the two screens point with one sprite. Gold rather than the ring's red,
 * because gold is already what this game means by YOURS-TO-TAKE — the crown,
 * the carrot count, the step ring, the traps. Red is the ground the prize
 * stands on; gold is the prize.
 *
 * It bobs, because a still sprite over busy pixel grass reads as scenery.
 */
const GOAL_ARROW_TINT = 0xffd45c;
/** Arrow width as a share of the tile, so it follows `setBurrowTileSize`
 *  rather than pinning itself to a pixel count the tuner can move. */
const GOAL_ARROW_SCALE = 0.7;
/** How high the tip floats above the cell, in tile-halves: clear of the crop
 *  growing under it, close enough to still belong to that ground. */
const GOAL_ARROW_LIFT = 2.4;
/** The bob: distance in px and seconds for one leg of the round trip. */
const GOAL_ARROW_BOB = 5;
const GOAL_ARROW_BOB_SECONDS = 0.9;
/**
 * Past the depth of any cell on the board, so the arrow tops its own layer.
 *
 * Mirrors `dragSurface`'s -1e6 at the other end of the same layer: both are
 * siblings of the board that opt OUT of depth rather than taking a place in
 * it. This is not the depth ruler being broken — the arrow is not IN the
 * world (it is not mounted in a cell's block), so there is nothing for it to
 * sort against.
 */
const GOAL_ARROW_Z = 10000;
/**
 * The shadow under a hung arrow — see `hangArrow`. Black at a little under
 * half, so it darkens whatever the cell is (grass, sand, the doorstep's
 * orange) rather than painting it; `LIFTED` is what is left of its size and
 * alpha at the top of the bob.
 */
const ARROW_SHADOW_TINT = 0x000000;
const ARROW_SHADOW_ALPHA = 0.45;
const ARROW_SHADOW_LIFTED = 0.7;

/** A chevron in the air and its shadow on the cell — the two go up and down together. */
interface HungArrow {
  /** On `container`, above everything (`GOAL_ARROW_Z`). */
  group: Container;
  /** In the cell's terrain block, sorted with the ground. */
  shadow: Sprite;
}

/** One tile as a raider may see it. `clue` null means a smoke screen hides it. */
export interface RaidTile {
  tile: number;
  clue: number | null;
}

/** One cell of the raid board — the island's `Tile`, reduced to what a raid draws. */
interface RaidCell {
  /**
   * What the veil says: `fog` lifts as the raider is sent the tile, `goal`
   * is the field and stays red for the whole raid, `doorstep` is the ground
   * inside the door and stays orange.
   */
  veil: 'fog' | 'goal' | 'doorstep';
  /** The lid over the ground — navy fog, the goal's red, the doorstep's orange. */
  fog: Sprite;
  /** The gold outline on a tile they may step onto. */
  ring: Sprite;
  /** The gold flash the sweep runs round the raider. */
  blink: Sprite;
  /** The hint number, when the tile carries one. */
  clue: Container | null;
  clueCount: number | null;
}

export interface BurrowSceneData {
  /**
   * WHOSE burrow this is — the owner's player id, which is the seed their
   * ground is grown from (see `game/burrow/board`).
   *
   * Required, and deliberately not defaulted to something: a burrow drawn from
   * the wrong seed is a different homestead, so every trap the owner placed
   * would land on ground that does not exist. Callers that have no player yet
   * (the signed-out backdrop, a story) pass a fixed seed of their own and get
   * a consistent burrow to look at.
   */
  seed: string;
  /** Tiles that already hold a trap. */
  traps: number[];
  /** True while the owner is choosing where to put one. */
  placing: boolean;
  /** Planks standing on the potager's edge. */
  fences?: FenceSeg[];
  /**
   * Spans a plank may still go on — the SERVER's list, not the geometry's.
   *
   * The gate rule and the bag are the server's to enforce, so the board offers
   * exactly what the server would accept. Deriving it here from the seed would
   * put a second implementation of the gate rule on the client, which is the
   * drift the raid route's own note about `steps` warns against.
   */
  fenceOffers?: FenceSeg[];
  /**
   * True while the owner is choosing where a PLANK goes — a second placement
   * mode, kept apart from `placing` because the two pick different things.
   *
   * Never both: a board where a tap might bury a bomb or might build a wall is
   * a board where every tap is a guess. `setPlacing` and `setWalling` each
   * drop the other.
   */
  walling?: boolean;
  /** A span was tapped. The server still decides; this says what was asked. */
  onFence?(seg: FenceSeg): void;
  /**
   * A minable tile was tapped. `mined` says which way it goes: a bare tile
   * takes a bomb, a mined one gives it back.
   *
   * ONE callback rather than an onPlace and an onRemove, because the scene
   * already knows which tiles hold a bomb (it drew them) and the caller would
   * otherwise have to work that out a second time from its own copy of the
   * list. The server still decides — this only says what was asked for.
   */
  onToggle(tile: number, mined: boolean): void;
  /**
   * How full the garden is, 0..1 — `gardenReady / capacity`.
   *
   * Drives the crop growing in the field. Absent (or null) runs the decorative
   * loop instead, for a viewer with no garden of their own.
   */
  gardenProgress?: number | null;
  /**
   * The burrow's level, which picks the BUILDING standing on the ground.
   *
   * Absent means level 1 — the scene is shown before the burrow has loaded, and
   * to viewers with no burrow at all, and both want a picture rather than a
   * blank.
   */
  level?: number | null;
  /** Optional building art for previews on the real board. */
  artPreview?: BurrowArtPreview;
  /**
   * Milliseconds of shield left on the OWNER's burrow, or null for none.
   *
   * The sign belongs on the board rather than only in the side column: the
   * shield is a fact about the place, and the place is what the player is
   * looking at while they decide whether to go farm or dig in.
   */
  shieldMs?: number | null;
}

/** How opaque a cell's veil is, for what it says and whether the raider has been sent it. */
function veilAlpha(veil: RaidCell['veil'], seen: boolean): number {
  if (veil === 'goal') return GOAL_ALPHA;
  // Seen or not: the doorstep is ground the raider was GIVEN, and the
  // rule is public (a raider's client cuts the same doorstep from the same
  // seed). Fogging it would hide the one thing about the board that is
  // meant to be read from the door.
  if (veil === 'doorstep') return DOORSTEP_VEIL_ALPHA;
  return seen ? 0 : FOG_ALPHA;
}

export class BurrowScene implements Scene {
  container: Container;
  private clouds: CloudField | null = null;
  private birds: BirdFlock | null = null;
  private terrain: BurrowTerrainView | null = null;
  /**
   * How to word the shield badge — supplied by React, which knows the
   * language. Held rather than passed on every redraw, because `applyShield`
   * is also called from the scene's own lifecycle (a crossing, a level-up),
   * where there is nobody to hand it in again.
   */
  private shieldLabel: ((ms: number) => string) | undefined;
  private crop: CarrotCrop | null = null;
  private board = new Container();
  /** The potager's walls — its own layer, see `FenceView`. */
  private fenceView: FenceView | null = null;
  /** The span under the pointer while walling — the surbrillance. */
  private hoverSpan: FenceSeg | null = null;
  private trapSprites = new Map<number, Container>();
  /**
   * tile -> how charged it is, 0 (just sprung) to 1 (armed).
   *
   * A FRACTION rather than a flag, because the screen shows the climb: the
   * owner watching their burrow sees each bomb fill back up rather than
   * flicking from dead to alive at some invisible instant.
   */
  private trapCharge = new Map<number, number>();
  /** The bomb art, kept so a charge can be re-cropped from the FULL frame
   *  every time — cropping a crop would shrink the slice away. */
  private bombTexture: Texture | null = null;
  /** tile -> ms left before it is armed, as the server last said. `update`
   *  counts these down so the ramp moves between polls rather than in steps. */
  private trapRearmMsLeft = new Map<number, number>();
  /** tile -> the full rearm window, so a remaining time can be made a
   *  fraction. Kept per trap: the stagger means no two share a window. */
  private trapRearmTotalMs = new Map<number, number>();
  private hints: Sprite[] = [];
  /** tile -> its placement diamond. `tileOfHint` walks the grid; hover needs
   *  the other direction on every pointermove, so it gets a map. */
  private hintByTile = new Map<number, Sprite>();

  // ── Placement hints ──────────────────────────────────────────────────────
  //
  // A mouse gets a PREVIEW (the cell under it turns gold with a faint bomb on
  // it, or a mined cell turns red with its bomb lifted); a finger, which has
  // no hover to preview with, gets a GLOVE pressing a cell. See
  // `ui/PlacementHints` for why each device gets the one it does.

  /** The cell the mouse is over while placing, or -1. */
  private hoverTile = -1;
  /**
   * The cell the player just clicked, which shows no preview until the mouse
   * leaves it.
   *
   * Without this, burying a bomb would instantly turn the same cell red and
   * offer to lift it — the answer to the click would read as a question about
   * undoing it. Leaving the cell and coming back is a new intent.
   */
  private hoverMuted = -1;
  /** The cell the mouse button last went down on — see `onHintHover`. */
  private pressTile = -1;
  private ghost: GhostBomb | null = null;
  /** The placed bomb currently raised by a lift preview, kept by reference so
   *  its tweens can be killed even after the tile has left `trapSprites`. */
  private lifted: { tile: number; parts: Sprite[] } | null = null;
  private glove: GloveHint | null = null;
  /** The glove has done its job this placement session — the player tapped a
   *  cell, or it ran out of presses. Reset when placement closes. */
  private gloveDone = false;
  /** The ripples a glove press leaves on a cell, for teardown mid-animation. */
  private pressFx = new Set<Sprite>();
  /**
   * The raid board: one cell per walkable tile of the DEFENDER's ground,
   * built once per raid and updated on every step. Empty when at home.
   */
  private raidCells = new Map<number, RaidCell>();
  /** Whose ground the cells were built for — a different seed is a rebuild. */
  private raidCellsSeed: string | null = null;
  /** The gold chevron hanging over the garden — see `GOAL_ARROW_TINT`. */
  private goalArrow: HungArrow | null = null;
  /**
   * The orange chevron over the ENTRANCE — see `DOOR_TINT`. Built with the
   * board (it belongs to the ground, not to a raid) and shown whenever the
   * board is being read as a board: placing, or a raid on either side.
   */
  private doorArrow: HungArrow | null = null;
  /**
   * YOUR rabbit, pottering about the homestead between runs.
   *
   * Scenery, not an entity: it has no tile to defend and the server never
   * hears about it. See `HomeRabbit` for why the burrow wanted one.
   */
  private home: HomeRabbit | null = null;
  /**
   * The window through whatever is drawn over the rabbit — the island's own
   * `DepthHole`, on the same look, re-cut every frame in `update`.
   *
   * It only works because the rabbit is a SIBLING of the scenery: the trees,
   * the rocks and the house are deported into `container` (see
   * `createBurrowTerrain`'s `decoLayer`) and sorted by `burrowDepth`, and the
   * hole is a depth test on that one sort. The rabbit used to live in
   * `board`, which sits at zIndex 0 among them — behind every pine and behind
   * the house whatever cell it stood on, with nothing to punch through since
   * the cover was never its sibling. So both rabbits (`home` and `raider`)
   * now stand in `container` directly, as the island's do.
   */
  private hole = new DepthHole({ ...DEPTH_HOLE_LOOK });
  /**
   * Who lives here, as the page last said.
   *
   * Kept on the scene rather than only pushed at the rabbit, because the rabbit
   * is rebuilt whenever the ground is (`buildBoard`) — a name set once would be
   * lost the first time the owner levelled up.
   */
  private homeWho: { name: string; crowned: boolean } = { name: '', crowned: false };
  /** Set while the scene is being torn down, so `clearRaid` does not rebuild. */
  private dying = false;
  /** The raider: the island's own rabbit, kept across steps so it HOPS. */
  private raider: PlayerRabbit | null = null;
  /**
   * Timers the electrocution is waiting on.
   *
   * Held so `destroy` can cut them: the effect is a chain of awaits across more
   * than a second, and a scene torn down mid-shock would otherwise come back to
   * a raider that no longer exists.
   */
  private shockTimers = new Set<number>();
  private raiderAt = -1;
  /** The tiles currently lit as steppable, and the sweep running over them. */
  private raidLit: number[] = [];
  private raidSweep: gsap.core.Tween | null = null;
  private raidSteps = new Set<number>();
  private onRaidStep: ((tile: number) => void) | null = null;
  private raiding = false;
  /** Where the camera is now, so a re-entry does not re-tween to where it sits. */
  private cam: BurrowCam = homeCam();
  private onResize: (() => void) | null = null;
  /** Drag / pinch on the board while placing. Null outside placement. */
  private gestures: PanZoomGestures | null = null;
  /** The all-covering surface BEHIND the board that catches drags — see create. */
  private dragSurface: Container | null = null;
  private onWheel: ((e: WheelEvent) => void) | null = null;
  /**
   * True once the player has moved the placement camera themselves.
   *
   * `setPlacing` runs on every trap added or removed, and it asks `wantedCam`
   * for the shot — so without this flag, burying a trap would yank the board
   * back to the opening framing and lose the corner the player had just
   * dragged to. Cleared when placement ends, so the next visit opens centred.
   */
  private camMovedByPlayer = false;
  private data: BurrowSceneData = {
    seed: 'burrow', traps: [], placing: false, onToggle: () => {},
  };
  /**
   * The player's OWN burrow, kept apart from what is currently on screen.
   *
   * `data.seed` and `data.level` describe the ground being DRAWN, which during
   * a raid is the defender's homestead. These two are what to come home to
   * when the raid ends — without them, leaving a raid would leave the player
   * standing in the victim's garden.
   */
  private ownSeed = 'burrow';
  private ownLevel: number | null | undefined = null;

  constructor(private app: Application, _sceneManager: SceneManager) {
    this.container = new Container();
    this.container.sortableChildren = true;
    this.board.sortableChildren = true;
  }

  init(data?: unknown): void {
    if (data) this.data = data as BurrowSceneData;
    this.ownSeed = this.data.seed;
    this.ownLevel = this.data.level;
  }

  /**
   * Put someone's ground on screen: terrain, building and crop.
   *
   * Rebuilt rather than re-tinted, because a different seed is a different
   * island — a different coastline, different cliffs, a field in a different
   * corner. Cheap enough to do on the two ends of a raid (it is one terrain of
   * 361 cells and the sheets are already in Pixi's cache), and it happens
   * under the screen wipe that the raid already plays.
   */
  private async showGround(seed: string, level: number | null | undefined): Promise<void> {
    if (seed === this.data.seed && this.terrain) {
      this.terrain.setLevel(level);
      // setLevel re-parks the sign against the new roofline but does not know
      // whose ground this is; applyShield is what answers that.
      this.applyShield();
      return;
    }
    this.data.seed = seed;
    this.data.level = level;

    // Before the terrain goes: the ghost, the ripples and a lifted bomb all
    // live inside its blocks, and would be destroyed out from under their own
    // tweens.
    this.teardownPlacementHints();
    // THE TRAP SPRITES GO WITH THE TERRAIN, and so must the record of them.
    //
    // Every bomb is mounted INSIDE its cell's terrain block (`mountVeil`), so
    // destroying the terrain destroys the markers too — but `trapSprites` went
    // on holding the dead containers, and `addTrap` opens with a
    // `trapSprites.has(tile)` guard. So the ground came back and every re-add
    // was refused as already-drawn: the board returned bare while the panel
    // went on counting "3 bombs live" off the server's list, which was right
    // all along. Reported from production: bombs placed in DEFEND vanish the
    // moment the player leaves the mode and comes back.
    //
    // Cleared rather than re-parented because the blocks they hung in no
    // longer exist: what comes next is a fresh `addTrap` per tile, from
    // `data.traps` on the way home from a raid and from the server's list
    // through the page's sync effect. Killing the tweens first — a bomb caught
    // mid-pop or mid-fade would otherwise leave gsap ticking a destroyed
    // sprite, which is the same rule `destroy` follows below.
    for (const group of this.trapSprites.values()) gsap.killTweensOf(group);
    this.trapSprites.clear();
    this.trapCharge.clear();
    this.trapRearmMsLeft.clear();
    this.trapRearmTotalMs.clear();
    // The lift preview points at sprites that are about to stop existing.
    if (this.lifted) {
      gsap.killTweensOf(this.lifted.parts);
      this.lifted = null;
    }
    this.terrain?.destroy();
    this.terrain = null;
    this.fenceView?.destroy();
    this.fenceView = null;
    this.crop?.destroy();
    this.crop = null;
    for (const hint of this.hints) hint.destroy();
    this.hints = [];
    this.hintByTile.clear();

    await this.buildTerrain();
    this.buildCrop();
    this.buildBoard();
  }

  async create(): Promise<void> {
    await this.buildTerrain();
    this.buildCrop();
    // The same sky as the island, so the two screens are the same world.
    this.clouds = new CloudField(this.container, { width: GAME_W, height: GAME_H });
    // Le meme ciel que l'ile, donc les memes oiseaux : c'est en partie ce qui
    // fait que les deux ecrans se lisent comme un seul monde.
    this.birds = new BirdFlock(this.container, { width: GAME_W, height: GAME_H });

    this.container.addChild(this.board);
    this.buildBoard();
    // Land on the right framing rather than travelling to it: there is no
    // previous shot to move from on the scene's first frame.
    this.moveCamera(this.wantedCam(), true);
    // A rotation swaps the design space under us (see Application.resize), and
    // the pulled-back framing is solved against it — so the shot has to be
    // re-solved rather than kept, or a phone turned mid-placement would hold a
    // landscape camera over a portrait board.
    //
    // The sky is solved against the same numbers and has to move with the shot:
    // its bands are fractions of the design space, so a field left on the old
    // height parks its bottom bank hundreds of px below a taller portrait frame
    // and the bottom of the screen goes bare.
    this.onResize = () => {
      this.clouds?.resize(GAME_W, GAME_H);
      this.birds?.resize(GAME_W, GAME_H);
      this.moveCamera(this.wantedCam(), true);
    };
    window.addEventListener('resize', this.onResize);

    /* ── Drag and pinch the board while placing ──────────────────────────
       The board is drawn closer than it fits now (see `placeCam`), so the
       cells off the edge have to be reachable. The recogniser is the island's,
       unchanged: it is the piece that tells a tap from a drag, which matters
       more here than there — a tile's own `pointertap` fires at the end of a
       drag too, so without it, panning across the board would bury a trap
       wherever the finger happened to stop.

       Bound on the CONTAINER, not a tile: a drag that starts on the sea
       between two diamonds is still a drag. Each hint keeps its own handler
       and sees the press first, then it bubbles up to here.

       WHY A SURFACE OF ITS OWN, and not the container.
       The island puts an all-covering `hitArea` on its scene container,
       because its tiles carry no handlers at all: it resolves a tap from
       COORDINATES (`terrainTileAt`). The burrow is built the other way round
       on purpose — every hint owns a polygon hit area and its own
       `pointertap`, and `burrow/screen.ts` says at `burrowTileAt` why: with
       the diamonds answering, there is only ever ONE projection to keep in
       step with the drawing.

       So the island's trick does not port. Measured, both halves of it fail:
       a covering `hitArea` on the container swallows the presses before any
       diamond sees them (placement goes dead — no `pointerdown` on the hint,
       no trap, no error), and `eventMode: 'passive'` — children only — gives
       the tiles back but leaves the container deaf, so a drag moves nothing.

       The surface below is the shape that satisfies both. It is added FIRST,
       so it sits under every diamond: Pixi hit-tests front to back, so a
       press over a cell finds the hint and a press over sea falls through to
       this. It covers everything, so a drag can start anywhere; it is behind
       everything, so it never takes a tap that a cell wanted. */
    this.dragSurface = new Container();
    this.dragSurface.eventMode = 'static';
    this.dragSurface.hitArea = { contains: () => true };
    // The container SORTS its children (`sortableChildren`), so the index this
    // is inserted at decides nothing — `zIndex` does. Far below any tile's
    // depth (`burrowDepth`), so the surface is genuinely behind the board and
    // every diamond is hit-tested before it.
    this.dragSurface.zIndex = -1e6;
    this.container.addChild(this.dragSurface);
    // A PRESS ON A CELL REACHES THIS TOO — see the hint's own `pointerdown`,
    // which hands it over with `press`. The surface is a SIBLING of the board,
    // and Pixi bubbles an event up through the target's ancestors only, so a
    // drag started on a diamond never reached a recogniser bound here: only a
    // press on open sea panned. Binding on the scene container instead does not
    // work (measured): a `passive` container emits nothing, and a `static` one
    // hit-tests its sprites by bounds — the trees trap every tap (see above).
    this.gestures = new PanZoomGestures(
      this.dragSurface,
      (g) => this.designPoint(g),
      {
        onPan: (dx, dy) => {
          if (!this.canMoveCam()) return;
          // A drag is not a click: the preview of what a click would do goes
          // until the button is up again (see `onHintHover`).
          this.clearHover();
          this.setPlaceCam(panPlaceCam(this.cam, dx, dy, this.data.seed));
        },
        onPinch: (factor, at) => {
          if (!this.canMoveCam()) return;
          this.clearHover();
          this.setPlaceCam(zoomPlaceCam(this.cam, factor, at, this.data.seed));
        },
        // Taps stay with the tiles' own `pointertap` handlers, which know
        // which tile they are. This one only has a point.
        onTap: () => {},
      },
    );
    this.gestures.attach();

    // The wheel is bound on the DOM rather than through Pixi, whose own wheel
    // listener is passive: a trackpad pinch (a wheel event with `ctrlKey`)
    // has to be `preventDefault`ed or the browser zooms the page instead.
    const canvas = this.app.canvas as HTMLCanvasElement;
    this.onWheel = (e: WheelEvent) => {
      if (!this.canMoveCam()) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const at = this.designPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      // A `deltaMode` of lines (Firefox with a mouse) reports ~3 per notch
      // where pixels report ~100; normalise so a notch is a notch.
      const units = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaY;
      const rate = WHEEL_ZOOM_PER_UNIT * (e.ctrlKey ? TRACKPAD_PINCH_BOOST : 1);
      this.setPlaceCam(zoomPlaceCam(this.cam, Math.exp(-units * rate), at, this.data.seed));
    };
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.setPlacing(this.data.placing);
    for (const tile of this.data.traps) this.addTrap(tile, false);
  }

  /**
   * The ground: the owner's own terrain, drawn from their seed.
   *
   * Awaited before anything else in `create` — the board, the crop and the
   * traps are all positioned against tiles, and building them over a terrain
   * that has not decoded yet would put them on an empty frame.
   */
  private async buildTerrain(): Promise<void> {
    this.terrain = await createBurrowTerrain(
      this.container, this.data.seed, this.data.level,
      new URLSearchParams(window.location.search).get('terrain') === 'meadow' ? MEADOW_LOOK : undefined,
      this.data.artPreview,
    );
    // A terrain built fresh knows nothing of a shield that was already up —
    // re-entering the scene, or coming home from a raid, rebuilds the ground.
    this.applyShield();
  }

  /**
   * Hang the shield sign, but only over the player's OWN homestead.
   *
   * During a raid the ground on screen is the defender's, and their shield is
   * none of the attacker's business — a raid only happens because there was no
   * shield to stop it, so a badge there would be a plain contradiction.
   */
  private applyShield(): void {
    const own = this.data.seed === this.ownSeed;
    this.terrain?.setShield(own ? this.data.shieldMs ?? null : null, this.shieldLabel);
  }

  /** The shield went up, ticked down, or ran out. */
  setShield(ms: number | null, label?: (ms: number) => string): void {
    this.data.shieldMs = ms;
    this.shieldLabel = label ?? this.shieldLabel;
    this.applyShield();
  }

  /**
   * The burrow was upgraded — show the level's building, and the bigger garden.
   *
   * The ground, the board and the traps all stay exactly where they are: the
   * level picks which building stands on the burrow's cell, so that half of an
   * upgrade is one texture swap rather than a re-drawn homestead. (It used to
   * be a whole new full-canvas painting, which is why every level's art had to
   * be pre-aligned with every other level's.)
   *
   * The CROP is the exception, because a bigger burrow holds more carrots and
   * therefore grows more of them — see `plantsPerCell`. Re-sowing it is what
   * makes the upgrade visible in the field and not only on the building, and
   * it is cheap: a couple of dozen sprites on ground that is already drawn.
   * The seed is unchanged, so the plants that were already there come back in
   * the same places with the new ones filled in between.
   */
  setLevel(level: number | null | undefined): void {
    this.ownLevel = level;
    // Only touches the screen when the player's OWN ground is up: an upgrade
    // that landed mid-raid must not swap the victim's hut for the raider's
    // castle.
    if (this.data.seed !== this.ownSeed) return;
    const grew = level !== this.data.level;
    // Louder than a swap: the building it grew INTO announces itself. Only
    // upward — a level read for the first time (null before) is not news.
    const celebrate = grew && typeof level === 'number' && typeof this.data.level === 'number' && level > this.data.level;
    this.data.level = level;
    this.terrain?.setLevel(level);
    if (grew && this.crop) this.resowCrop();
    if (celebrate) this.terrain?.celebrateLevel();
  }

  /**
   * Sow the field again at the current level, keeping what is on screen.
   *
   * A bare re-build would clear the field and regrow it from nothing, which is
   * the picture `harvestGarden` uses to say "your carrots have been collected"
   * — exactly the wrong thing to show someone who just spent carrots on an
   * upgrade. So the fullness is carried across: the field the player was
   * looking at is still standing, with more plants in it.
   */
  private resowCrop(): void {
    const progress = this.data.gardenProgress ?? null;
    this.crop?.destroy();
    this.buildCrop();
    this.crop?.setProgress(progress);
  }

  /**
   * The crop growing in the field.
   *
   * Sown on the FIELD TILES the owner's seed chose — see `CarrotCrop`. There
   * is no painted soil to line the plants up with any more, which is the point:
   * the furrows and the plants are now the same set of cells.
   *
   * Sown at the DEFENDER's level, `data.level`, rather than the viewer's: this
   * is a picture of the burrow on screen, and during a raid that is somebody
   * else's. `setLevel` re-sows it when the level changes.
   */
  private buildCrop(): void {
    const sheet = Texture.from(Keys.CARROT_GROWTH);
    this.crop = new CarrotCrop(this.container, sheet, this.data.seed, this.data.level);
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
    // THE WALLS COME BACK WITH THE GROUND, for the reason the trap sprites do
    // (see `showGround`): every fence sprite is mounted inside its cell's
    // terrain block, so destroying the terrain destroys them, and a view left
    // holding the dead sprites would restyle corpses. Rebuilt from the same
    // perimeter walk each time — it is a pure function of the seed.
    this.fenceView?.destroy();
    this.fenceView = new FenceView({
      seed: this.data.seed,
      mount: (tile, holder, z) => this.terrain?.mountVeil(tile, holder, z) ?? false,
      fallback: this.board,
      // The targets answer their own presses — see `FenceViewOptions.onTap`.
      // The same three guards the hint path applies: only while walling, not
      // at the end of a drag, and the press feeds the pan recogniser.
      onTap: (seg) => {
        if (!this.data.walling || this.raiding) return;
        if (this.gestures?.didDrag) return;
        this.data.onFence?.(seg);
      },
      onHover: (seg) => {
        if (!this.data.walling || this.raiding) return;
        if (this.gestures?.active && this.gestures.didDrag) seg = null;
        this.hoverSpan = seg;
        this.fenceView?.setHovered(seg);
      },
      onPress: (e) => this.gestures?.press(e),
    });
    this.syncFences();
    // Your rabbit comes back with the ground it stands on. `buildBoard` runs
    // on first paint AND on every `showGround` (a level-up, or crossing to
    // someone else's plot), and the old rabbit's cells no longer exist by
    // then — so it is rebuilt rather than kept.
    this.home?.destroy();
    this.home = null;
    // Only on YOUR OWN homestead. The burrow doubles as the raid board and as
    // the view of a plot you are attacking, and a rabbit wandering peacefully
    // around a farm you are raiding would read as a defender who is not there.
    // Not while a raid is on this board: the burrow doubles as the view of a
    // plot being attacked, and a rabbit pottering about peacefully on it would
    // read as a defender who is not really there. `setRaid` clears it, and
    // `clearRaid` puts it back.
    if (this.raidCellsSeed === null) {
      this.home = new HomeRabbit(this.container, this.data.seed);
      this.applyHomeWho();
    }

    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(this.data.seed, i) === 'blocked') continue;

      const { x, y } = burrowTileScreen(this.data.seed, i);
      // Outline rather than fill: an outlined diamond reads as a CELL you can
      // pick, where a flat wash just tinted the artwork underneath.
      const hint = burrowDiamond();
      hint.position.set(x, y);
      hint.zIndex = burrowDepth(this.data.seed, i);
      hint.tint = PLACEABLE_TINT;
      hint.alpha = 0;
      hint.visible = false;
      /**
       * The DIAMOND is what the pointer sees — the farm's arrangement, down to
       * the polygon, so both boards answer "which tile is under the pointer"
       * the same way and neither can drift from the other.
       *
       * The hit area is the real diamond rather than the sprite's bounding
       * BOX. A box overlaps its four diagonal neighbours, so z-order decided
       * which cell replied instead of the pointer; on terraced ground that
       * made every raised cell answer for the one a row behind it. Expressed
       * in the sprite's own un-scaled space, since the texture is baked at the
       * island's size and scaled down to this board's (`diamondScaleFor`).
       *
       * Sorting does the rest: mounted in its terrain block (below), a raised
       * diamond is tested before the lower one it covers, exactly as it is
       * drawn — so the answer matches the picture without any second
       * projection to keep in step.
       *
       * The FULL diamond, not the inset one the texture draws: the hairline
       * between two cells belongs to one of them rather than to whatever shows
       * through it.
       */
      const hw = BURROW_HALF_W / hint.scale.x;
      const hh = BURROW_HALF_H / hint.scale.y;
      // Named so a hit test says WHICH cell answered rather than 'Sprite' —
      // the island's veils carry the same kind of label for the same reason.
      hint.label = `burrow-hint-${i}`;
      hint.eventMode = 'static';
      hint.hitArea = new Polygon([0, -hh, hw, 0, 0, hh, -hw, 0]);
      hint.on('pointertap', (e: FederatedPointerEvent) => {
        // WALLING gets the tap first: the two modes are exclusive, and the
        // diamonds are the only thing on this board with a hit area, so a tap
        // meant for a plank arrives here. Which SPAN it named is decided by
        // distance to the edges rather than by which cell answered — a plank
        // sits on the line between two cells, so the cell under the finger is
        // a poor guide to which edge was meant (see `FenceView.pick`).
        if (this.data.walling) {
          if (this.gestures?.didDrag) return;
          const seg = this.pickSpan(e);
          if (seg) this.data.onFence?.(seg);
          return;
        }
        if (!this.data.placing || !isTrappable(this.data.seed, i)) return;
        // Pixi fires `pointertap` at the end of a DRAG as readily as after a
        // tap, and the board is panned by dragging across exactly these
        // sprites — so without this, sliding the board would bury a trap on
        // whichever cell the finger stopped over.
        if (this.gestures?.didDrag) return;
        // The player has done the thing the glove was showing: it goes, and
        // does not come back this session.
        this.dismissGlove();
        // The preview answered its question; the real bomb (or its absence)
        // is about to replace it. Muted until the mouse leaves — see
        // `hoverMuted`.
        this.hoverMuted = i;
        this.clearHover();
        this.data.onToggle(i, this.trapSprites.has(i));
      });
      // Hover, for a mouse only — see `onHintHover`. `pointermove` as well as
      // `pointerover` so the preview comes back after a drag ends over a cell,
      // where no fresh `pointerover` fires.
      // The press also starts a possible DRAG: the recogniser listens on the
      // drag surface behind the board, which a press on a cell never reaches
      // by bubbling. Moves arrive on the surface anyway (`globalpointermove`),
      // and the release is swept from the DOM — so this one hand-over is what
      // lets a drag started on the board itself pan it.
      hint.on('pointerdown', (e: FederatedPointerEvent) => {
        this.pressTile = i;
        this.gestures?.press(e);
      });
      hint.on('pointerover', (e: FederatedPointerEvent) => this.onHintHover(i, e));
      hint.on('pointermove', (e: FederatedPointerEvent) => this.onHintHover(i, e));
      hint.on('pointerout', () => this.onHintOut(i));
      // THE SURBRILLANCE follows the pointer across cells, so it is wired to
      // the same three events. Unlike the trap ghost it is NOT mouse-only: a
      // fence is picked by proximity to a line, so a finger sliding towards
      // one wants to see which side it has landed on before it lifts.
      hint.on('pointerover', (e: FederatedPointerEvent) => this.onSideHover(e));
      hint.on('pointermove', (e: FederatedPointerEvent) => this.onSideHover(e));
      hint.on('pointerout', () => this.onSideOut());
      this.hintByTile.set(i, hint);
      // Into the cell's own terrain block when the ground will take it, so a
      // raised cell's diamond is covered by the grass of the cell in front
      // instead of lapping over it. The farm solved the identical problem this
      // way (`IsoIslandView.mountVeil`); the board keeps the sprite either
      // way, so `setPlacing` and `tileOfHint` are unaffected by which parent
      // won. Falls back to the flat board when there is no block.
      if (!this.terrain?.mountVeil(i, hint)) this.board.addChild(hint);
      this.hints.push(hint);
    }

    // The door is a fact about THIS ground, so its marker is rebuilt with the
    // board (every `showGround` lands here) rather than with a raid.
    this.buildDoorArrow();
  }

  /**
   * Enter or leave placement mode.
   *
   * Outside it the board is invisible: this screen is a picture of your home,
   * and a permanent grid over it would turn a place into a spreadsheet. The
   * grid appears exactly when it is the thing being decided.
   */
  setPlacing(placing: boolean): void {
    // Leaving placement forgets the player's framing, so the next visit opens
    // on the centred shot rather than on a corner they dragged to minutes ago.
    if (!placing) this.camMovedByPlayer = false;
    this.data.placing = placing;
    this.moveCamera(this.wantedCam());
    this.hints.forEach((hint, n) => {
      const tile = this.tileOfHint(n);
      const usable = placing && isTrappable(this.data.seed, tile);
      // The doorstep's diamonds stay UP while placing, though nothing can be
      // buried under them: they are what says "the raider walks in here" —
      // and they still take a press, so a drag that starts on one pans the
      // board like a drag from anywhere else. The tap itself is refused by
      // the handler (`isTrappable`).
      const doorstep = placing && isDoorstep(this.data.seed, tile);
      // A mined tile keeps its diamond — tapping it lifts the bomb — but the
      // diamond is drawn at alpha 0, because its own gold marker already says
      // the cell is taken and a blue outline under it would read as "free to
      // mine" on the one cell that is not.
      //
      // Invisible, NOT hidden: `visible = false` takes a sprite out of hit
      // testing, and this is the one cell that most needs to answer a tap. The
      // farm relies on the same distinction for a dug tile (see `Tile`).
      /*
       * VISIBLE ALSO MEANS CLICKABLE, and walling needs the clicks.
       *
       * `visible = false` takes a sprite out of hit testing (the note above
       * says so for the mined cell), and these diamonds are the only thing on
       * this board with a hit area — a fence tap has nothing else to land on.
       * So while WALLING they stay in the tree, at alpha 0: no grid is drawn
       * over the garden, and the pointer still reaches `pickSide`.
       *
       * `styleHint` is what puts them at alpha 0 there; this only decides
       * whether they exist to be hit.
       */
      hint.visible = usable || doorstep || !!this.data.walling;
      hint.cursor = usable ? 'pointer' : 'default';
      this.styleHint(tile, hint, 0.2);
    });
    this.syncDoorArrow();
    // Runs on every trap added or removed, so this is also where a preview is
    // kept honest: a bomb that landed under the mouse from elsewhere turns the
    // ghost into a lift, and leaving placement takes both away.
    if (!placing || this.raiding) {
      this.clearHover();
      this.hoverMuted = -1;
    }
    this.syncHover();
    this.syncGlove(placing);
  }

  /**
   * Enter or leave WALLING — choosing which side of the potager to close.
   *
   * A second mode beside `setPlacing`, and each drops the other: a board where
   * a tap might bury a bomb or might build a wall is a board where every tap
   * is a guess. The trap grid comes down when the walls go up, so what is on
   * screen always says which question is being asked.
   */
  setWalling(walling: boolean): void {
    this.data.walling = walling;
    // Entering walling DROPS placement, and leaves nothing of it behind.
    //
    // `setPlacing(false)` is what takes the trap grid down, hides the ghost
    // bomb and clears the hovered cell — without it the last cell the mouse
    // rested on kept its gold marker and its raised bomb, so pressing FENCE
    // left a trap preview lit on a board that was no longer about traps. It
    // runs AFTER `data.walling` is set so the camera it asks for is already
    // the walling shot, not the home one.
    if (walling) {
      /*
       * Placement is dropped BY HAND, not through `setPlacing(false)`.
       *
       * That call fires its own `moveCamera`, so entering walling ran two
       * camera solves back to back — and since it also resets
       * `camMovedByPlayer`, the pair could settle on the home shot with the
       * fence mode live underneath it. The board stayed exactly where it was
       * and only the chrome changed. Clearing the pieces of placement state
       * directly keeps exactly ONE camera move here, at the end of this
       * method, after `data.walling` is already true.
       */
      this.data.placing = false;
      this.clearHover();
      this.hoverMuted = -1;
      this.ghost?.hide();
      this.syncGlove(false);
      this.syncDoorArrow();
    }
    if (!walling) this.hoverSpan = null;
    // The diamonds have to be re-decided either way: entering, they become
    // invisible hit areas for the side picker; leaving, they go back to
    // whatever placement says. `setPlacing(false)` above does this on the way
    // IN, but only when placement was actually on — so it is done here for the
    // other three cases rather than relied upon.
    this.hints.forEach((hint, n) => {
      const tile = this.tileOfHint(n);
      hint.visible = hint.visible || walling;
      this.styleHint(tile, hint, 0.2);
      if (!walling && !this.data.placing) hint.visible = false;
    });
    this.fenceView?.setPlacing(walling && !this.raiding);
    this.fenceView?.setHovered(null);
    // Walling reads the potager, which the pulled-back shot does not fill —
    // the same reason placement has its own framing.
    this.moveCamera(this.wantedCam());
  }

  /** What the server says is built, and what it would still accept. */
  setFences(built: FenceSeg[], offers: FenceSeg[]): void {
    this.data.fences = built;
    this.data.fenceOffers = offers;
    this.syncFences();
  }

  /**
   * Which side the pointer is nearest, in BOARD space.
   *
   * The event's global coordinates are converted through the board's own
   * transform rather than read off the sprite that fired: the camera pans and
   * zooms this container, and the fence spans were positioned in its space.
   */
  private pickSpan(e: FederatedPointerEvent): FenceSeg | null {
    if (!this.fenceView) return null;
    const local = this.board.toLocal(e.global);
    // The tolerance is in BOARD units, so it must not shrink as the camera
    // zooms in — it is divided by the scale so the grab radius stays the same
    // number of SCREEN pixels at every zoom.
    // The CAMERA scales `this.container`; the board inside it stays at 1. So
    // the divisor is the container's scale, or the radius would never adapt.
    return this.fenceView.pick(local.x, local.y, SIDE_GRAB / (this.container.scale.x || 1));
  }

  /** The pointer moved while walling: light the side it would build. */
  private onSideHover(e: FederatedPointerEvent): void {
    if (!this.data.walling || this.raiding) return;
    // Mid-drag the board slides under a still pointer, and a highlight walking
    // from side to side says "tap" while the player is panning — the same
    // reason `onHintHover` bails here.
    if (this.gestures?.active && this.gestures.didDrag) {
      this.onSideOut();
      return;
    }
    const seg = this.pickSpan(e);
    const same = seg === this.hoverSpan
      || (!!seg && !!this.hoverSpan && seg.tile === this.hoverSpan.tile && seg.side === this.hoverSpan.side);
    if (same) return;
    this.hoverSpan = seg;
    this.fenceView?.setHovered(seg);
  }

  private onSideOut(): void {
    if (this.hoverSpan === null) return;
    this.hoverSpan = null;
    this.fenceView?.setHovered(null);
  }

  /** Push the current fence facts into the layer that draws them. */
  private syncFences(): void {
    this.fenceView?.setState(this.data.fences ?? [], this.data.fenceOffers ?? []);
    this.fenceView?.setPlacing(!!this.data.walling && !this.raiding);
  }

  /**
   * One diamond's tint and alpha, from the state it is in. The only place that
   * decides it, so `setPlacing` re-running on every trap cannot wipe a hover
   * highlight and a hover cannot outlive the state that justified it.
   */
  private styleHint(tile: number, hint: Sprite, duration: number): void {
    const usable = this.data.placing && !this.raiding && isTrappable(this.data.seed, tile);
    // The doorstep wears orange while placing, and steps aside once a raid is
    // on: the raid veils paint it then (see `buildRaidCells`), and an outline
    // under a fill of the same colour would only muddy it.
    const doorstep = this.data.placing && !this.raiding && isDoorstep(this.data.seed, tile);
    // A mined tile's diamond stays at alpha 0 — its own marker shows it, and
    // the lift preview tints that marker (see `paintTrap`).
    const mined = this.trapSprites.has(tile);
    const hovered = usable && !mined && tile === this.hoverTile;
    hint.tint = hovered ? HOVER_TINT : doorstep ? DOOR_TINT : PLACEABLE_TINT;
    gsap.killTweensOf(hint);
    // WALLING DRAWS NO GRID. The diamonds are only in the tree there to carry
    // the taps (see `setPlacing`), and a blue placement grid laid over the
    // potager would say "bury a bomb" on the one screen that is asking which
    // SIDE to close.
    const alpha = this.data.walling ? 0
      : doorstep ? DOORSTEP_ALPHA
        : !usable || mined ? 0 : hovered ? HOVER_ALPHA : PLACEABLE_ALPHA;
    if (duration <= 0) hint.alpha = alpha;
    else gsap.to(hint, { alpha, duration });
  }

  /**
   * The mouse is over a placement cell.
   *
   * MOUSE only, decided per event rather than per device: a touch laptop's
   * finger sends `pointerover` too, on the way to a tap, and a ghost flashed up
   * under a finger that is already committing would be noise. A mouse is the
   * pointer that can look before it clicks, so it is the one that gets shown
   * what the click will do.
   */
  private onHintHover(tile: number, e: FederatedPointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    if (!this.data.placing || this.raiding || !isTrappable(this.data.seed, tile)) {
      this.clearHover();
      return;
    }
    // Mid-drag the board is sliding under a still pointer, and a preview
    // flickering across every cell it passes says "click" while the player is
    // panning.
    if (this.gestures?.active && this.gestures.didDrag) {
      this.clearHover();
      return;
    }
    // The button is held and the pointer has left the cell it went down on.
    // A press that starts ON a diamond never reaches the drag surface (it is
    // the board's sibling, not its parent), so the recogniser above does not
    // see this drag — but Pixi will not fire `pointertap` on a different cell
    // either, so releasing here does nothing and a ghost would promise a bomb
    // that never comes. Measured: without this the ghost walked cell to cell
    // under a held button.
    if ((e.buttons & 1) !== 0 && tile !== this.pressTile) {
      this.clearHover();
      return;
    }
    if (tile === this.hoverMuted || tile === this.hoverTile) return;
    const was = this.hoverTile;
    this.hoverTile = tile;
    // Moving straight from one cell to the next: the old one drops back in
    // the same frame the new one lights, so two cells are never gold at once.
    if (was >= 0) this.restyleHint(was);
    this.restyleHint(tile);
    this.syncHover();
  }

  private onHintOut(tile: number): void {
    if (this.hoverMuted === tile) this.hoverMuted = -1;
    if (this.hoverTile === tile) this.clearHover();
  }

  private restyleHint(tile: number): void {
    const hint = this.hintByTile.get(tile);
    if (hint && !hint.destroyed) this.styleHint(tile, hint, 0.1);
  }

  /** No cell is hovered any more: back to the plain grid. */
  private clearHover(): void {
    if (this.hoverTile < 0 && !this.lifted && !this.ghost?.holder.visible) return;
    const was = this.hoverTile;
    this.hoverTile = -1;
    if (was >= 0) this.restyleHint(was);
    this.syncHover();
  }

  /**
   * Make the ghost and the lift match `hoverTile`. Idempotent — it is run from
   * pointer events, from `setPlacing` and from teardown alike.
   */
  private syncHover(): void {
    const tile = this.hoverTile;
    const active = tile >= 0 && this.data.placing && !this.raiding;
    const mined = active && this.trapSprites.has(tile);

    // A free cell: the ghost of the bomb a click would bury.
    if (active && !mined) {
      const ghost = this.ensureGhost();
      ghost?.showOn(tile, (holder) => {
        // Through the SAME call a real trap is mounted with, at the same depth
        // in the cell — so the preview and the bomb that replaces it share a
        // position to the pixel (see `addTrap` on why that matters).
        if (!this.terrain?.mountVeil(tile, holder, 3)) {
          const { x, y } = burrowTileScreen(this.data.seed, tile);
          holder.position.set(x, y);
          holder.zIndex = burrowDepth(this.data.seed, tile) + 0.5;
          this.board.addChild(holder);
        }
      });
    } else {
      this.ghost?.hide();
    }

    // A mined cell: its bomb rises, its marker goes red.
    const liftWanted = mined ? tile : -1;
    if ((this.lifted?.tile ?? -1) !== liftWanted) {
      this.lowerLifted();
      if (liftWanted >= 0) this.raiseTrap(liftWanted);
    }
  }

  /** The ghost, built on first use — a touch player never needs one. */
  private ensureGhost(): GhostBomb | null {
    if (this.ghost && !this.ghost.holder.destroyed) return this.ghost;
    const tex = Assets.get<Texture>(Keys.BOMB_SMALL);
    if (!tex) return null;
    this.ghost = new GhostBomb(tex, trapBombScale(tex), BOMB_ANCHOR_Y);
    return this.ghost;
  }

  /** The lift preview on a placed trap: raised, and a slow breath while held. */
  private raiseTrap(tile: number): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;
    // The bomb and its charge crop move together; the marker stays on the
    // ground, which is what makes the bomb read as coming OUT of the cell.
    const parts = group.children.slice(1).filter((c): c is Sprite => c instanceof Sprite);
    this.lifted = { tile, parts };
    this.paintTrap(tile);
    gsap.killTweensOf(parts);
    const still = prefersReducedMotion();
    gsap.to(parts, {
      y: -LIFT_PX,
      duration: still ? 0 : 0.14,
      ease: 'power2.out',
      onComplete: () => {
        if (still || this.lifted?.tile !== tile) return;
        gsap.to(parts, { y: -LIFT_PX - 2, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      },
    });
  }

  private lowerLifted(): void {
    const lifted = this.lifted;
    if (!lifted) return;
    this.lifted = null;
    gsap.killTweensOf(lifted.parts);
    const alive = lifted.parts.filter((p) => !p.destroyed);
    if (alive.length) gsap.to(alive, { y: 0, duration: 0.12, ease: 'power2.in' });
    this.paintTrap(lifted.tile);
  }

  /**
   * Start the glove when a finger-first player opens placement, and stop it
   * the moment placement is no longer the job.
   *
   * `setPlacing(true)` re-runs on every trap added or removed, so starting is
   * guarded: one glove per session, never a second over the first, and never
   * again once the player has tapped a cell.
   */
  private syncGlove(placing: boolean): void {
    if (!placing || this.raiding) {
      this.stopGlove();
      // Closing placement is the end of the session; the next visit teaches
      // again only if the player never tapped — a raid is not a closing.
      if (!placing && !this.raiding) this.gloveDone = false;
      return;
    }
    if (this.glove || this.gloveDone || !isTouchPrimary()) return;
    const tex = Assets.get<Texture>(Keys.HAND_POINTER);
    if (!tex) return;
    this.glove = new GloveHint(this.container, tex, {
      pickTarget: () => this.gloveTarget(),
      onPress: (tile) => this.pressRipple(tile),
      scale: () => this.gloveScale(),
      onDone: () => {
        this.gloveDone = true;
        this.stopGlove();
      },
    });
  }

  /** The player tapped a cell: the glove has taught what it came to teach. */
  private dismissGlove(): void {
    this.gloveDone = true;
    this.stopGlove();
  }

  private stopGlove(): void {
    this.glove?.destroy();
    this.glove = null;
    for (const fx of this.pressFx) {
      gsap.killTweensOf(fx);
      gsap.killTweensOf(fx.scale);
      if (!fx.destroyed) fx.destroy();
    }
    this.pressFx.clear();
  }

  /**
   * The free cell nearest the middle of the SCREEN, in the scene container's
   * space (the glove's parent).
   *
   * Measured on screen rather than on the board because the player may have
   * panned: the middle of the board can be off the edge, and a hint pressed
   * where nobody is looking teaches nothing. Only cells actually on screen are
   * candidates, with a margin so the hand is never cut by the edge.
   */
  private gloveTarget(): GloveTarget | null {
    const screen = this.app.screen;
    const margin = 40;
    const cells: Array<{ tile: number; x: number; y: number }> = [];
    for (const [tile, hint] of this.hintByTile) {
      if (hint.destroyed || !hint.visible || this.trapSprites.has(tile)) continue;
      if (!isTrappable(this.data.seed, tile)) continue;
      const g = hint.getGlobalPosition();
      if (g.x < margin || g.y < margin || g.x > screen.width - margin || g.y > screen.height - margin) continue;
      cells.push({ tile, x: g.x, y: g.y });
    }
    const best = nearestTo(cells, { x: screen.width / 2, y: screen.height / 2 });
    if (!best) return null;
    const local = this.container.toLocal({ x: best.x, y: best.y });
    return { tile: best.tile, x: local.x, y: local.y };
  }

  /**
   * The glove's scale in the scene container, so each art pixel is a WHOLE
   * number of screen pixels whatever the camera's zoom — 3 on a roomy screen,
   * 2 on a landscape phone, where a hand three times its art would cover the
   * cells around the one it presses.
   */
  private gloveScale(): number {
    const world = Math.abs(this.container.worldTransform.a) || 1;
    const px = this.app.screen.height < 600 ? 2 : 3;
    return px / world;
  }

  /**
   * What a glove press does to the cell: a gold ring spreading out of it, and
   * the diamond flashing gold underneath — the colour the cell turns when a
   * bomb is really buried there.
   */
  private pressRipple(tile: number): void {
    if (!this.data.placing || this.raiding) return;
    const ring = burrowDiamond();
    ring.tint = HOVER_TINT;
    const flash = burrowDiamondSolid();
    flash.tint = HOVER_TINT;
    for (const [fx, z] of [[flash, 3], [ring, 4]] as const) {
      fx.eventMode = 'none';
      if (!this.terrain?.mountVeil(tile, fx, z)) {
        const { x, y } = burrowTileScreen(this.data.seed, tile);
        fx.position.set(x, y);
        fx.zIndex = burrowDepth(this.data.seed, tile) + z / 10;
        this.board.addChild(fx);
      }
      this.pressFx.add(fx);
    }
    const done = (fx: Sprite) => () => {
      this.pressFx.delete(fx);
      if (!fx.destroyed) fx.destroy();
    };
    // Relative to the diamond's own scale — it is pre-sized to the burrow's
    // cell, see `springTrap`.
    gsap.to(ring.scale, { x: ring.scale.x * 1.7, y: ring.scale.y * 1.7, duration: 0.55, ease: 'power2.out' });
    gsap.fromTo(ring, { alpha: 0.95 }, { alpha: 0, duration: 0.55, ease: 'power1.in', onComplete: done(ring) });
    gsap.fromTo(flash, { alpha: 0.5 }, { alpha: 0, duration: 0.4, ease: 'power1.out', onComplete: done(flash) });
  }

  /** Every placement hint off the board — before the ground goes, and on destroy. */
  private teardownPlacementHints(): void {
    this.hoverTile = -1;
    this.hoverMuted = -1;
    if (this.lifted) {
      gsap.killTweensOf(this.lifted.parts);
      this.lifted = null;
    }
    this.ghost?.destroy();
    this.ghost = null;
    this.stopGlove();
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
    this.birds?.counterCamera(
      this.container.scale.x, this.container.position.x, this.container.position.y,
    );
  }

  /**
   * The framing this screen's current job wants.
   *
   * Placing and raiding are the same request — show me the whole board — so
   * they share one answer rather than each nudging the camera their own way and
   * fighting when a raid begins while the grid is still up.
   *
   * A raid briefly had its own close shot that followed the raider, because the
   * defender's ground was hidden and a fit of a hidden board framed empty sea.
   * The ground is drawn in full again (see the raid note above), so the fit is
   * the right shot: the raider is choosing a route across a homestead, and a
   * route needs the whole homestead in frame.
   */
  /**
   * Whether the player may pan and pinch right now.
   *
   * Placing traps and RAIDING both qualify. A raid used to be excluded, on the
   * grounds that a route needs the whole homestead in frame — true of the
   * opening shot, which is still the fit (see `wantedCam`), and not true of
   * what happens on it: a trap going off, or the burrow's lightning answering
   * back, are small events on a board drawn small, and the player could not
   * lean in to watch them. They can now; the floor on the zoom is that same fit
   * (`placeZoomLimits` takes its `min` from `boardCam`), so leaning in never
   * costs them the overview they were given.
   */
  private canMoveCam(): boolean {
    return this.raiding || this.data.placing;
  }

  private wantedCam(): BurrowCam {
    // A RAID OPENS on the fit: the raider is choosing a route across ground
    // they do not own, and a route needs the whole homestead in frame. But the
    // shot is theirs to change from there — `setRaid` runs on every single
    // step, so re-solving the fit here would snatch the board back the moment
    // they leaned in, exactly as it would between two buried traps below.
    if (this.raiding) {
      return this.camMovedByPlayer
        ? clampPlaceCam(this.cam, this.data.seed)
        : boardCam(this.data.seed);
    }
    // WALLING TAKES THE SAME SHOT AS PLACING. Both are decisions made ON the
    // board — one about a cell, one about a side of the potager — and neither
    // can be made from the home framing, which crops the field out entirely.
    // Left out of this test at first, and the result was a fence mode that
    // ghosted the spans correctly off-screen: the row lit up and the garden
    // never came into view. Paul, 2026-09-21: "je click sur fence et j'ai
    // toujours la bom en surbrillance".
    if (this.data.placing || this.data.walling) {
      // Once the player has dragged or pinched, their framing is the right
      // one — `setPlacing` runs again on every trap buried, and re-solving the
      // shot there would snatch the board back from under them.
      if (this.camMovedByPlayer) return clampPlaceCam(this.cam, this.data.seed);
      // Same zoom, different subject: placement is about the whole board,
      // walling is about the potager — see `wallCam`.
      return this.data.walling ? wallCam(this.data.seed) : placeCam(this.data.seed);
    }
    return homeCam(this.data.seed);
  }

  /**
   * Renderer px -> design px, through the root that fits the design space to
   * the window — the space the camera's arithmetic lives in. Before the scene
   * is mounted there is no root and the point is already in design px, which
   * is what a story sees.
   */
  private designPoint(g: Point): Point {
    const root = this.container.parent;
    if (!root) return { x: g.x, y: g.y };
    const p = root.toLocal(g);
    return { x: p.x, y: p.y };
  }

  /** Apply a camera the PLAYER moved: no tween, and remember they moved it. */
  private setPlaceCam(to: BurrowCam): void {
    if (!this.canMoveCam()) return;
    this.camMovedByPlayer = true;
    this.cam = to;
    // Set directly rather than through `moveCamera`: a drag is continuous and
    // a half-second ease on every pointermove would lag the finger.
    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.scale);
    this.container.position.set(to.x, to.y);
    this.container.scale.set(to.scale);
    this.pinSky();
  }

  /** The board skips blocked tiles, so hint order is not tile order. */
  private tileOfHint(n: number): number {
    let seen = 0;
    for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
      if (burrowCell(this.data.seed, i) === 'blocked') continue;
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
  addTrap(tile: number, animate = true, armed = true): void {
    if (this.trapSprites.has(tile)) return;

    const group = new Container();
    group.sortableChildren = true;

    // Painted by `paintTrap` once the bomb is in the group: how a trap looks
    // is one function of its rearm progress, so the mount path and the frame
    // that follows it cannot disagree about what 40% charged looks like.
    const marker = burrowDiamond();
    group.addChild(marker);

    // The bomb itself, the same art the island reveals under a dug tile — one
    // buried bomb, one picture of a bomb, wherever the player meets it. It
    // stood as a small cross of stakes before, which read as a marker ON the
    // ground rather than as the thing that is buried in it.
    //
    // Sat on the diamond rather than centred in it: the sprite is anchored at
    // its foot so the bomb RESTS on the cell the way the rabbit and the crops
    // do, instead of floating through the tile it is buried under.
    const bombTex = Assets.get<Texture>(Keys.BOMB_SMALL);
    if (bombTex) {
      // Scaled off the cell, not off the texture's own pixels: the tile size is
      // a tuning knob (`setBurrowTileSize`), and a sprite pinned to a pixel
      // count stops matching the ground the moment that slider moves.
      const k = trapBombScale(bombTex);

      // THE BOMB, TWICE. The dim copy is what has not charged yet; the solid
      // one is clipped to a waterline that rises as it does. Same texture,
      // same anchor, same scale — so the two line up exactly and the only
      // thing the eye sees is the boundary between them.
      const bomb = new Sprite(bombTex);
      bomb.anchor.set(0.5, BOMB_ANCHOR_Y);
      bomb.scale.set(k);
      group.addChild(bomb);

      this.bombTexture = bombTex;
      const filled = new Sprite(bombTex);
      filled.anchor.set(0.5, BOMB_ANCHOR_Y);
      filled.scale.set(k);
      // NO MASK. The filled copy shows a CROP of the texture instead: its
      // frame is narrowed to the bottom `t` of the art and the sprite is
      // re-anchored to keep that slice sitting where it belongs.
      //
      // Two attempts with a Graphics mask failed for the same underlying
      // reason — a display object used as a mask is pulled out of the render
      // pass, so as a child of the group it never received a transform and
      // measured zero on the canvas (clipping nothing), and as a child of the
      // masked sprite it collapsed that sprite's own bounds instead. Cropping
      // the texture needs no second display object at all, which is both
      // simpler and impossible to get wrong this way.
      group.addChild(filled);
    }

    // Transparent to the pointer, so the tap falls through to the cell's own
    // diamond underneath — which is what lifts the bomb. The marker is drawn
    // OVER that diamond, so without this it would swallow every tap meant for
    // the one cell that most needs to answer them.
    group.eventMode = 'none';
    group.label = `burrow-trap-${tile}`;

    // Into the cell's terrain block, through the SAME call that placed the
    // diamond under it — at a higher zIndex so it draws over it.
    //
    // Positioned by hand against `burrowTileScreen` before, which is a
    // different space from the one `mountVeil` puts the diamond in: the
    // markers came out sitting a few pixels above the grid that placed them,
    // so a bomb appeared to be buried between two cells. One cell, one call,
    // one answer — the marker cannot drift from the diamond it covers because
    // neither is positioned independently any more.
    if (!this.terrain?.mountVeil(tile, group, 3)) {
      const { x, y } = burrowTileScreen(this.data.seed, tile);
      group.position.set(x, y);
      group.zIndex = burrowDepth(this.data.seed, tile) + 0.5;
      this.board.addChild(group);
    }
    this.trapSprites.set(tile, group);
    // An armed trap has no ramp to climb. One that is rearming starts at the
    // floor and is driven up by `update` until the server confirms it is back.
    this.trapCharge.set(tile, armed ? 1 : 0);
    this.paintTrap(tile);
    // Remember it on the DATA too, not just as a sprite. A raid tears the
    // ground down and rebuilds it (`showGround`), and what comes back is
    // redrawn from `data.traps` — which was only ever the list handed in at
    // mount (empty), so every bomb placed during a session vanished off the
    // board the moment the player raided someone and came home. They were
    // still in the database; the screen simply stopped showing them.
    if (!this.data.traps.includes(tile)) this.data.traps = [...this.data.traps, tile];

    if (animate) {
      group.scale.set(0);
      gsap.to(group.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2)' });
      // Dust off the ground as it goes in: a bomb BURIED, not a marker placed.
      this.dustPuff(group);
    }
    // The tile it sits on is no longer placeable.
    this.setPlacing(this.data.placing);
  }

  /**
   * A puff of dust out of a cell — the sound of digging, drawn.
   *
   * Six small discs thrown up and out, fading as they fall. Added to the
   * group so they ride whatever positioned it (the terrain block or the
   * board); `zIndex` keeps them over the bomb they are announcing.
   */
  private dustPuff(at: Container): void {
    for (let i = 0; i < 6; i++) {
      const puff = new Graphics().circle(0, 0, 2 + Math.random() * 2).fill({ color: 0xc9b48a, alpha: 0.85 });
      puff.zIndex = 5;
      puff.position.set(0, -2);
      at.addChild(puff);
      const dx = (i / 5 - 0.5) * 26 + (Math.random() - 0.5) * 6;
      const tl = gsap.timeline({ onComplete: () => puff.destroy() });
      tl.to(puff, { x: dx, duration: 0.42, ease: 'power1.out' }, 0);
      tl.to(puff, { y: -12 - Math.random() * 8, duration: 0.18, ease: 'power2.out' }, 0);
      tl.to(puff, { y: 2, duration: 0.24, ease: 'power1.in' }, 0.18);
      tl.to(puff, { alpha: 0, duration: 0.2 }, 0.22);
    }
  }

  // ── Raiding ───────────────────────────────────────────────────────────────
  //
  // The same ground, read from the attacker's side. The scene is told WHAT to
  // draw and never works anything out: the server decides which tiles a raider
  // may see, what their numbers are, and where they may step. That split is the
  // whole security model of a raid — a client that computed its own view could
  // simply compute the trap positions too.
  //
  // ## Drawn the way the island is, on purpose
  //
  // A raid used to have a reading of its own: tinted lozenges for "seen",
  // "walked" and "may step", numbers in a colour ladder of its own, a smaller
  // rabbit. The player had learned the island's board — a navy veil over
  // ground they had not dug, a gold ring that sweeps round the rabbit, a hint
  // that pops in when a tile is cleared — and then met a second grammar on the
  // same tiles and could not read it: the lozenges vanished into the grass,
  // the ring did not look like the ring. So this is the island's `Tile`, cell
  // for cell: the same fog, the same gold, the same hint ladder, the same
  // rabbit at the same size, hopping the same way.

  /**
   * Draw a raid in progress, or clear it with `null`.
   *
   * Called on every step rather than diffed, because a step changes what is
   * visible, what is steppable and where the raider stands all at once, and
   * three separate updates would show a frame of the board disagreeing with
   * itself. The cells themselves persist across calls, so a reveal FADES and
   * the raider HOPS instead of everything being torn down and put back.
   *
   * A raid also changes WHOSE ground this is. The defender's burrow is a
   * different homestead grown from their own id, so the scene swaps its
   * terrain for theirs on the way in and back to the player's own on the way
   * out — see `showGround`. Without that the raider would be walking the
   * server's tile indices across a picture of their own garden, and every
   * clue, step and wall would land on the wrong cell.
   */
  async setRaid(state: {
    view: RaidTile[];
    /** Where the raider stands. */
    at: number;
    /** Tiles they may step onto — the server's list, not ours. */
    steps: number[];
    /** Whose burrow is being crossed — their id, which seeds their ground. */
    seed: string;
    /** The defender's burrow level, which picks their building. */
    level?: number | null;
    onStep(tile: number): void;
  } | null): Promise<void> {
    if (!state) {
      this.clearRaid();
      // Back to being a home: the player's own ground, their own traps, and
      // the camera comes back in with them (setPlacing reframes).
      await this.showGround(this.ownSeed, this.ownLevel);
      // Your own burrow holds no secrets from you: the whole homestead back,
      // garden included.
      this.terrain?.reveal(null);
      this.crop?.revealOnly(null);
      for (const tile of this.data.traps) this.addTrap(tile, false);
      this.setPlacing(this.data.placing);
      return;
    }

    // A different burrow is a different terrain, and the cells live INSIDE
    // its blocks — they go down with it. Dropped here, before the ground is
    // swapped, so nothing is destroyed twice.
    if (this.raidCellsSeed !== state.seed) this.clearRaid();
    await this.showGround(state.seed, state.level);

    // The whole homestead, garden included — the veils, not the terrain, are
    // what say "not dug yet". A terrain that survives (raiding the same burrow
    // twice) may still carry an earlier reveal, so it is put back explicitly.
    this.terrain?.reveal(null);
    this.crop?.revealOnly(null);

    // A raider must not see the OWNER's traps. They are hidden rather than
    // never drawn, because the same scene serves both sides and the owner may
    // have been looking at their own burrow a moment ago. The owner DOES see
    // them — they are the defence being aimed, and a defender who cannot tell
    // which cells are already mined is burying bombs blind.
    for (const group of this.trapSprites.values()) group.visible = this.defending;
    // Set before setPlacing: it reframes, and a raid wants the pulled-back
    // board — without this the camera would fly home and straight back out.
    this.raiding = true;
    // The grid comes down for a RAIDER, who has no business burying anything
    // on somebody else's ground. A DEFENDER keeps it: mining a cell ahead of
    // the rabbit crossing their homestead is half of the defence, and taking
    // the grid away the moment a raid began left them nothing to do but watch.
    if (!this.defending) this.setPlacing(false);
    // The door marker stays up for both sides whatever the grid does.
    this.syncDoorArrow();

    const fresh = this.raidCellsSeed !== state.seed;
    if (fresh) this.buildRaidCells(state.seed);
    this.onRaidStep = state.onStep;

    // Fog: lifted off every tile the raider has been sent, left on the rest.
    // Faded, as the island fades a dig, except on the first frame — a board
    // that fades in its whole starting patch reads as loading, not as seen.
    const seen = new Map(state.view.map((v) => [v.tile, v.clue]));
    for (const [tile, cell] of this.raidCells) {
      const target = veilAlpha(cell.veil, seen.has(tile));
      gsap.killTweensOf(cell.fog);
      if (fresh || cell.fog.alpha === target) cell.fog.alpha = target;
      else gsap.to(cell.fog, { alpha: target, duration: 0.25, ease: 'power2.out' });
      this.setClue(cell, seen.get(tile) ?? null, !fresh);
    }

    // The raider: the island's rabbit, hopping from where it was to where the
    // server says it now is. Dropped in from above on arrival, as on the farm.
    if (!this.raider) {
      this.raider = this.buildRaider(state.seed, state.at);
      // In `container`, beside the scenery, not in `board`: see `hole`.
      this.container.addChild(this.raider.container);
      this.raider.playSpawnDrop();
    } else if (state.at !== this.raiderAt) {
      this.raider.cancelMove();
      this.raider.moveTo(state.at);
    }
    this.raiderAt = state.at;

    // The ring: the tiles a tap will be accepted on, lit and swept exactly as
    // the island lights and sweeps the eight around its rabbit. A finished
    // raid sends none, and the ring goes dark.
    this.lightSteps(state.steps, state.at);
  }

  /**
   * One veil per walkable tile of the defender's ground, the island's `Tile`
   * in miniature: fog, ring and blink, all mounted in the cell's own terrain
   * block so they sort with the ground rather than lapping over the cell
   * behind (see `Tile.mountVeil` for the double-dark wedge this avoids).
   */
  /**
   * Name the rabbit standing on this homestead, and say whether it wears the
   * season's crown.
   *
   * Pushed from the page rather than taken from `BurrowSceneData`: both facts
   * arrive AFTER the scene is built (the name from the player row, the crown
   * from the leaderboard poll) and both change while it is on screen — a
   * rename, or somebody taking the lead off you.
   */
  setHomePlayer(name: string, crowned: boolean): void {
    this.homeWho = { name, crowned };
    this.applyHomeWho();
  }

  private applyHomeWho(): void {
    // Your own homestead, so the name is always in the "me" ink.
    this.home?.setName(this.homeWho.name, true);
    this.home?.setCrowned(this.homeWho.crowned);
  }

  private buildRaidCells(seed: string): void {
    this.raidCellsSeed = seed;
    // The board becomes a raid board: your idle rabbit steps off it, or it
    // would be wandering about underneath somebody's attack.
    this.home?.destroy();
    this.home = null;
    const hit = () => {
      // The diamond is scaled to the burrow's tile; the hit polygon is in the
      // sprite's own space, so it is scaled back — see `buildBoard`.
      const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
      return new Polygon([
        0, -BURROW_HALF_H / k.y,
        BURROW_HALF_W / k.x, 0,
        0, BURROW_HALF_H / k.y,
        -BURROW_HALF_W / k.x, 0,
      ]);
    };
    // The field — see `GOAL_TINT`.
    const field = new Set(fieldTiles(seed));
    for (const tile of walkableTiles(seed)) {
      // The two ends of the walk wear their own colours from the first frame:
      // red on the field (the win), orange on the doorstep (the steps the
      // raider was given). Everything between is fog.
      const veil = field.has(tile) ? 'goal'
        : isDoorstep(seed, tile) ? 'doorstep'
        : 'fog';
      const fog = burrowDiamondSolid();
      fog.tint = veil === 'goal' ? GOAL_TINT : veil === 'doorstep' ? DOOR_TINT : FOG_COLOR;
      fog.alpha = veilAlpha(veil, false);
      // The VEIL is what the pointer sees, as on the island: it sorts with
      // the ground, so a raised tile's veil answers before the lower one it
      // covers. Interactive whether or not it is lit — the hit test does not
      // read alpha — and the handler checks the ring, so a tap on dark ground
      // is silently nothing rather than a refused request.
      // Interactive for the RAIDER, who steps by tapping these; transparent
      // for the DEFENDER, who is not walking anywhere. The veil covers every
      // walkable cell and is mounted over the placement diamonds, so leaving
      // it static on the defender's screen swallowed every attempt to bury a
      // bomb while a raid was on — the one moment they most need to.
      fog.eventMode = this.defending ? 'none' : 'static';
      fog.label = `raid-step-${tile}`;
      fog.hitArea = hit();
      fog.on('pointerdown', () => {
        if (this.raidSteps.has(tile)) this.onRaidStep?.(tile);
      });

      const ring = burrowDiamond();
      ring.tint = HIGHLIGHT_COLOR;
      ring.visible = false;

      const blink = burrowDiamondSolid();
      blink.tint = HIGHLIGHT_COLOR;
      blink.visible = false;
      blink.alpha = 0;

      // Local depths as `Tile.mountVeil` assigns them: fog 2, ring 4, blink
      // 5 — and the clue above all three (see `setClue`).
      const { x, y } = burrowTileScreen(seed, tile);
      for (const [sprite, z] of [[fog, 2], [ring, 4], [blink, 5]] as const) {
        if (this.terrain?.mountVeil(tile, sprite, z)) continue;
        sprite.position.set(x, y);
        sprite.zIndex = burrowDepth(seed, tile) + z / 10;
        this.board.addChild(sprite);
      }
      this.raidCells.set(tile, { veil, fog, ring, blink, clue: null, clueCount: null });
    }

    this.buildGoalArrow(seed, field);
  }

  /**
   * Hang the gold arrow over the middle of the garden.
   *
   * ONE arrow over one cell, not a marker on each of the twelve: the field is
   * a patch, and a dozen chevrons over a dozen cells would read as twelve
   * separate objectives rather than one place. The cell it picks is the one
   * CLOSEST TO THE PATCH'S CENTRE (by iso screen position, which is what the
   * player actually sees) rather than the first tile in the list — the field
   * is grown from a seed and its tiles arrive in generation order, so the
   * first one is an arbitrary corner and the arrow would sit off to one side
   * of the thing it names.
   *
   * ABOVE THE TERRAIN, not inside the cell's block — the one mark on this
   * board that is deliberately exempt from the depth ruler.
   *
   * The first cut mounted it through `mountVeil` like every other overlay, so
   * it sorted correctly against the ground and everything standing on it. That
   * is exactly what broke it: on two of the five story seeds the garden's
   * centre cell sits behind a pine or under the cliff by the house, and a tree
   * reaches ~280px above its cell where the arrow floats ~24px. No lift wins
   * that — the arrow was simply swallowed, and a signpost you cannot see is
   * not a signpost.
   *
   * So it goes on `container` as a SIBLING of the board and the terrain, with
   * a zIndex far above either — the exact mirror of `dragSurface`, which sits
   * on the same layer at -1e6 to stay behind everything. Adding it to `board`
   * is not enough and was the first attempt: `container.sortableChildren` is
   * on, so the board and the terrain are sorted against each other and a high
   * zIndex INSIDE the board only wins among the board's own children.
   *
   * A raider is not looking THROUGH the world at the arrow; the arrow is a
   * mark ON the picture, like the clue numbers, and occluding it would be as
   * wrong as occluding those. It stays anchored to the garden's cell in the
   * same projection, so it still points at real ground — it just refuses to be
   * hidden by what grows in front of it.
   */
  private buildGoalArrow(seed: string, field: ReadonlySet<number>): void {
    this.dropArrow(this.goalArrow);
    this.goalArrow = null;
    if (field.size === 0) return;

    // The patch's centre in screen space, then the real cell nearest to it —
    // the centre of a seed-cut field is not itself guaranteed to BE a field
    // cell (an L-shaped patch's centre falls outside it).
    const tiles = [...field];
    const points = tiles.map((t) => burrowTileScreen(seed, t));
    const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
    const cy = points.reduce((a, p) => a + p.y, 0) / points.length;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });

    this.goalArrow = this.hangArrow(seed, tiles[best], GOAL_ARROW_TINT, 'raid-goal-arrow');
  }

  /**
   * The orange chevron over the ENTRANCE — the other end of the walk the gold
   * one names, for both sides of it.
   *
   * For the DEFENDER it is the answer to "where do they come in?", which is
   * the first thing a defence is built around and which the ground alone
   * never said (the entrance is a plain tile of grass, picked by the seed).
   * For the RAIDER it names where they started once they have walked away
   * from it, and with the doorstep tint under it says how far the free ground
   * runs. Built with the board — see `buildBoard` — and shown only while the
   * board is being read as one (`syncDoorArrow`): at rest this screen is a
   * picture of a home, and a home does not need its door pointed out.
   */
  private buildDoorArrow(): void {
    this.dropDoorArrow();
    const seed = this.data.seed;
    this.doorArrow = this.hangArrow(seed, entranceTile(seed), DOOR_TINT, 'burrow-door-arrow');
    this.syncDoorArrow();
  }

  /** Shown while placing, and through a raid on either side. */
  private syncDoorArrow(): void {
    if (!this.doorArrow) return;
    const shown = this.data.placing || this.raiding;
    this.doorArrow.group.visible = shown;
    this.doorArrow.shadow.visible = shown;
  }

  private dropDoorArrow(): void {
    this.dropArrow(this.doorArrow);
    this.doorArrow = null;
  }

  /** Take a hung arrow down: the bob and the breath are endless tweens,
   *  killed by hand or gsap goes on ticking a destroyed sprite. */
  private dropArrow(hung: HungArrow | null): void {
    if (!hung) return;
    for (const child of hung.group.children) gsap.killTweensOf(child);
    hung.group.destroy({ children: true });
    gsap.killTweensOf(hung.shadow);
    gsap.killTweensOf(hung.shadow.scale);
    // The shadow lives in the cell's terrain block, which may already have
    // gone down with the ground (`showGround` destroys the terrain first).
    if (!hung.shadow.destroyed) hung.shadow.destroy();
  }

  /**
   * Hang a bobbing chevron over one cell, above everything — the one kind of
   * mark on this board that is exempt from the depth ruler (see
   * `buildGoalArrow` for why) — and lay its SHADOW on the cell itself.
   *
   * The shadow is what says WHICH cell. An arrow floating two tiles up over
   * busy pixel grass points at a region, not a tile: with the bob it drifts,
   * and the eye has nothing on the ground to land on. So a dark diamond sits
   * on the cell, mounted in the cell's own terrain block (`mountVeil`) so it
   * sorts with the ground like every other veil — a tree standing in front
   * of the cell covers it, as it should, where the arrow above refuses to be
   * covered. It breathes against the bob: smaller and fainter as the arrow
   * rises, as a shadow does under a thing lifting away from the ground.
   *
   * Returns null before the kit's arrow is loaded.
   */
  private hangArrow(seed: string, tile: number, tint: number, label: string): HungArrow | null {
    const texture = Assets.get<Texture>(Keys.ARROW_DOWN);
    if (!texture) return null;

    const shadow = burrowDiamondSolid();
    shadow.tint = ARROW_SHADOW_TINT;
    shadow.alpha = ARROW_SHADOW_ALPHA;
    shadow.eventMode = 'none';
    shadow.label = `${label}-shadow`;
    // Local depth 3 in the block: over the fog (2), under the step ring (4)
    // — see `buildRaidCells` for the ladder.
    if (!this.terrain?.mountVeil(tile, shadow, 3)) {
      const at = burrowTileScreen(seed, tile);
      shadow.position.set(at.x, at.y);
      shadow.zIndex = burrowDepth(seed, tile) + 0.3;
      this.board.addChild(shadow);
    }
    const rest = { x: shadow.scale.x, y: shadow.scale.y };
    gsap.to(shadow.scale, {
      x: rest.x * ARROW_SHADOW_LIFTED, y: rest.y * ARROW_SHADOW_LIFTED,
      duration: GOAL_ARROW_BOB_SECONDS, ease: 'sine.inOut', repeat: -1, yoyo: true,
    });
    gsap.to(shadow, {
      alpha: ARROW_SHADOW_ALPHA * ARROW_SHADOW_LIFTED,
      duration: GOAL_ARROW_BOB_SECONDS, ease: 'sine.inOut', repeat: -1, yoyo: true,
    });

    const group = new Container();
    // Transparent to the pointer: the cells under an arrow are tappable (a
    // field cell ends the raid, a doorstep cell is a step), and an arrow that
    // swallowed the tap would make the marker for a place the one thing
    // standing between the player and it.
    group.eventMode = 'none';
    group.label = label;

    const arrow = new Sprite(texture);
    // Anchored at its TIP, which is what the arrow is actually pointing with:
    // anchored centrally the bob would swing the tip through the crop, and a
    // taller arrow would point at a different cell than a shorter one.
    arrow.anchor.set(0.5, 1);
    // Scaled off the tile, not the texture's pixels — `setBurrowTileSize` is a
    // live tuning knob, and a sprite pinned to a pixel count stops matching
    // the ground the moment it moves.
    arrow.scale.set((BURROW_HALF_W * GOAL_ARROW_SCALE) / texture.width);
    arrow.tint = tint;
    arrow.y = -BURROW_HALF_H * GOAL_ARROW_LIFT;
    group.addChild(arrow);

    // Over the terrain entirely. Positioned in the same projection the cells
    // use — and therefore in the BOARD's space, which is the board's own
    // position and scale away from the container's. The board is not offset or
    // scaled relative to the container (both are moved as one by the camera,
    // which drives `container`), so the coordinates carry across unchanged.
    const { x, y } = burrowTileScreen(seed, tile);
    group.position.set(x, y);
    group.zIndex = GOAL_ARROW_Z;
    this.container.addChild(group);

    // The bob, on the SPRITE rather than the group, so the group's origin
    // stays pinned to the cell and only the chevron rides up and down.
    gsap.to(arrow, {
      y: arrow.y - GOAL_ARROW_BOB,
      duration: GOAL_ARROW_BOB_SECONDS,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });
    return { group, shadow };
  }

  /**
   * The number on a cleared tile — the island's hint, glyph for glyph: the
   * same shadowed face, the same minesweeper colour ladder, the same pop-in.
   * A zero is drawn as nothing, as minesweeper does, and a smoke screen (`null`)
   * likewise: the eye goes to the tiles that carry danger.
   */
  private setClue(cell: RaidCell, count: number | null, animate: boolean): void {
    const wanted = count !== null && count > 0 ? count : null;
    if (cell.clueCount === wanted) return;
    cell.clue?.destroy({ children: true });
    cell.clue = null;
    cell.clueCount = wanted;
    if (wanted === null) return;

    const label = shadowedPixelText(0, 0, String(wanted));
    label.face.tint = HINT_TINTS[Math.min(wanted, HINT_TINTS.length - 1)];
    // Above the ring and the blink in the cell's block. Mounted there rather
    // than on the flat board so it is read against the cell it belongs to
    // once the terrain sorts (`mountVeil` positions it by the block's own
    // projection).
    const tile = [...this.raidCells].find(([, c]) => c === cell)?.[0];
    if (tile === undefined || !this.terrain?.mountVeil(tile, label.group, 6)) {
      this.board.addChild(label.group);
    }
    cell.clue = label.group;
    if (animate) {
      label.group.scale.set(0);
      gsap.to(label.group.scale, { x: CLUE_SCALE, y: CLUE_SCALE, duration: 0.22, ease: 'back.out(2)' });
    } else {
      label.group.scale.set(CLUE_SCALE);
    }
  }

  /**
   * Light the tiles a tap will be accepted on, and sweep the blink round the
   * raider — `IslandScene.refreshReachable` and `startSweep`, on this board.
   */
  private lightSteps(steps: number[], at: number): void {
    this.darkenSteps();
    this.raidSteps = new Set(steps);
    for (const tile of steps) {
      const cell = this.raidCells.get(tile);
      if (!cell) continue;
      cell.ring.visible = true;
      cell.blink.visible = true;
      cell.blink.alpha = 0;
      cell.fog.cursor = 'pointer';
      this.raidLit.push(tile);
    }
    if (this.raidLit.length === 0) return;

    // Sorted by ANGLE from the raider, so the blink travels in a circle
    // rather than in index order.
    const { col: rc, row: rr } = burrowColRow(at);
    const ring = [...this.raidLit].sort((a, b) => {
      const p = burrowColRow(a);
      const q = burrowColRow(b);
      return Math.atan2(p.row - rr, p.col - rc) - Math.atan2(q.row - rr, q.col - rc);
    });
    let step = 0;
    const tick = () => {
      const cell = this.raidCells.get(ring[step % ring.length]);
      if (cell) {
        gsap.killTweensOf(cell.blink);
        cell.blink.alpha = 1;
        gsap.to(cell.blink, { alpha: 0, duration: 1, ease: 'sine.out' });
      }
      step++;
      this.raidSweep = gsap.delayedCall(RAID_SWEEP_SECONDS, tick);
    };
    tick();
  }

  private darkenSteps(): void {
    this.raidSweep?.kill();
    this.raidSweep = null;
    for (const tile of this.raidLit) {
      const cell = this.raidCells.get(tile);
      if (!cell) continue;
      cell.ring.visible = false;
      gsap.killTweensOf(cell.blink);
      cell.blink.visible = false;
      cell.blink.alpha = 0;
      cell.fog.cursor = 'default';
    }
    this.raidLit = [];
    this.raidSteps = new Set();
  }

  /**
   * The attacker: the island's own rabbit, on the burrow's lattice.
   *
   * The same class the farm spawns, handed this board's projection and depth
   * so its hops land on the defender's terraces — one player, one character,
   * two screens. Sorted half a cell in front of the tile it stands on, as the
   * island sorts it.
   */
  private buildRaider(seed: string, at: number): PlayerRabbit {
    const raider = new PlayerRabbit(at, Keys.BUNNY_WHITE, '', {
      at: (tile) => burrowTileScreen(seed, tile),
      depth: (tile) => burrowDepth(seed, tile) + 0.6,
    });

    /* THE RAIDER IS A TARGET.
     *
     * The defender can strike whoever is crossing their ground by tapping
     * them, so the rabbit itself has to be pressable. Two things make that
     * work on this board:
     *
     *   - a `hitArea` rather than the sprite's bounds. The rabbit's frame is
     *     32x32 with the animal drawn low in it, so bounds would hand a third
     *     of the target to empty air above its ears — and, worse, that empty
     *     air overlaps the cell behind, whose own veil is pressable.
     *   - the press is REPORTED, not acted on: `onRaiderTap` is set by whoever
     *     owns the rules (the page, or a story), because whether a strike is
     *     allowed — what it costs, how often — is not the board's to decide.
     */
    // Sized to the ANIMAL, from the sheet: the bunny frames draw a 14x14 body
    // low in a 32x32 cell, so the target is that body at `RABBIT_SCALE` and no
    // more. An earlier box a whole tile tall swallowed the cell the rabbit
    // stands on — and the defender's own step taps with it, since the raider
    // sits on top of a tile that is itself pressable.
    const w = 14 * RABBIT_SCALE;
    const h = 14 * RABBIT_SCALE;
    // Anchored like the sprite above it (feet at the origin, art rising from
    // there), so the box sits on the body rather than floating over its head.
    raider.container.hitArea = new Rectangle(-w / 2, -h, w, h);
    raider.container.on('pointertap', () => {
      // A drag that happens to end on the rabbit is a camera move, not a tap —
      // the same test the placement diamonds make on their own `pointertap`.
      if (this.gestures?.didDrag) return;
      this.onRaiderTap?.(this.raiderAt);
    });
    // Only a DEFENDER can press it. The rabbit stands on a tile that is itself
    // pressable — it is how the raider takes their next step — and a sprite on
    // top of that tile takes the press first. So on a client with no strike
    // wired up the rabbit is transparent to the pointer, and the step
    // underneath keeps working; `setRaiderTap` is what turns it on.
    //
    // Passed the container rather than read off `this.raider`, which the caller
    // has not assigned yet: this runs while the rabbit is still being built.
    this.applyRaiderTargetable(raider.container);
    return raider;
  }

  /**
   * Called when the defender taps the rabbit crossing their ground.
   *
   * Set by the owner of the rules rather than acted on here — see
   * `buildRaider`. Null means taps are ignored, which is what a raider's own
   * client wants: they are not allowed to strike themselves.
   */
  onRaiderTap: ((tile: number) => void) | null = null;

  /**
   * Whether the rabbit takes pointer presses at all.
   *
   * Off unless a strike is actually wired up — see the note in `buildRaider`:
   * a targetable rabbit eats the press meant for the tile it is standing on,
   * which on the raider's own screen is the step they were trying to take.
   */
  private applyRaiderTargetable(container?: Container): void {
    const target = container ?? this.raider?.container;
    if (!target || target.destroyed) return;
    const on = this.onRaiderTap !== null;
    target.eventMode = on ? 'static' : 'none';
    target.cursor = on ? 'pointer' : 'default';
  }

  /**
   * Say who is watching: a defender (who may strike the raider) or the raider
   * themselves. Re-applied to the rabbit currently on the board, so it can be
   * set before or after a raid begins.
   */
  setRaiderTap(handler: ((tile: number) => void) | null): void {
    this.onRaiderTap = handler;
    this.applyRaiderTargetable();
  }

  /**
   * Replace what a press on a placement cell does.
   *
   * The handler normally arrives with the scene's init data, which is right
   * for the burrow screen: it is built once and the page owns it for its whole
   * life. A DEFENCE is different — the rules change while the board is up (a
   * raid begins, bombs run out, the cell the raider has already crossed stops
   * being a legal place to bury one), and the owner of those rules is not
   * necessarily the code that started the scene.
   */
  setToggleHandler(handler: (tile: number, mined: boolean) => void): void {
    this.data.onToggle = handler;
  }

  /**
   * Whose side this screen is on while a raid runs.
   *
   * A raid is watched from two chairs and they want opposite things. The
   * RAIDER gets the board a route is read from: no grid, no traps in sight,
   * fog over what they have not walked. The DEFENDER is at home — they may
   * bury a bomb ahead of the rabbit and call the lightning down on it, so the
   * placement grid stays up and the raid is something they act on rather than
   * something they watch.
   *
   * Set before `setRaid`, which is where the grid is decided.
   */
  setDefending(defending: boolean): void {
    this.defending = defending;
    // The veils are built once per raid, so a screen that declares itself late
    // (or changes sides) has to have them re-flagged — see the note where they
    // are created.
    for (const cell of this.raidCells.values()) {
      cell.fog.eventMode = defending ? 'none' : 'static';
    }
  }

  /** See `setDefending`. Raider's view unless told otherwise. */
  private defending = false;

  /**
   * The raid is over, and the board says so before the trip home.
   *
   * Won: the rabbit dances on the field. Lost: it collapses where its energy
   * ran out, as it does on the island. Either way the ring goes dark — there
   * is nowhere left to step — and the page takes the player home a couple of
   * seconds later (see `RAID_OVER_MS` there).
   */
  finishRaid(succeeded: boolean): void {
    this.darkenSteps();
    if (succeeded) this.raider?.celebrate();
    else this.raider?.playExhausted();
  }

  /**
   * A trap went off under the raider.
   *
   * Its own call rather than something inferred from the next `setRaid`,
   * because springing a trap is the moment the raid turns and it has to be felt
   * — a board that simply redrew one tile darker would not register. The
   * rabbit takes the hit the way it takes a bomb on the island.
   */
  springTrap(tile: number): void {
    // Flinch and RECOVER. `playDamage` alone leaves the rabbit on the last
    // frame of the `damage` row, and its last three frames are empty — so a
    // raider that survived a trap simply vanished from the tile it was still
    // standing on, and the next step hopped an invisible rabbit. (The
    // electrocution ends on `playDeath` instead, which holds a full frame.)
    this.raider?.playDamage();
    this.raider?.recoverFromDamage();
    // It went off silently: the moment a raid turns was the one blast in the
    // game with no bang. The island's bomb sound, so a trap reads as a bomb.
    playUiSfx('explosion');
    const { x, y } = burrowTileScreen(this.data.seed, tile);
    const blast = burrowDiamond();
    blast.position.set(x, y);
    blast.zIndex = burrowDepth(this.data.seed, tile) + 1;
    blast.tint = 0xff6b6b;
    this.board.addChild(blast);
    // Relative to the tile's own scale, not an absolute 2.2: the diamond is
    // pre-scaled to burrow size now, and an absolute target would snap it back
    // to the island's tile on the first frame of the blast.
    gsap.to(blast.scale, {
      x: blast.scale.x * 2.2,
      y: blast.scale.y * 2.2,
      duration: 0.45,
      ease: 'power2.out',
    });
    gsap.to(blast, {
      alpha: 0,
      duration: 0.45,
      onComplete: () => blast.destroy(),
    });
  }

  /**
   * The burrow answers back: a bolt lands on the raider and holds them in it.
   *
   * The effect itself — bolt, flickering pose, rattle, the drop — is
   * `fx/Electrocute`, shared with the island so a rabbit struck on either board
   * is struck the same way. What this knows is only where the raider stands on
   * THIS ground and how a bolt sorts against it: the tile's screen position on
   * terraced ground, and the board's depth ruler.
   *
   * Always FATAL here: the current is what ends the raid, and a raider that
   * shrugged off a lightning bolt would make the bolt look harmless.
   *
   * Resolves when the body has dropped, so a caller can finish the raid on it.
   */
  async electrocuteRaider(ms = 1400): Promise<void> {
    const raider = this.raider;
    if (!raider) return;
    const tile = this.raiderAt;
    const { x, y } = burrowTileScreen(this.data.seed, tile);
    await electrocute({
      rabbit: raider,
      x,
      y,
      layer: this.board,
      boltDepth: burrowDepth(this.data.seed, tile) + 2,
      holdMs: ms,
      fatal: true,
      timers: this.shockTimers,
      // The raider can be gone by the time an await returns — a raid that
      // ended, or a scene torn down under it.
      alive: () => this.raider === raider,
    });
  }

  /**
   * Cut the electrocution's pending waits.
   *
   * The effect is a chain of awaits across more than a second, so one left
   * running past a teardown would wake to a raider that no longer exists.
   */
  private clearShock(): void {
    for (const t of this.shockTimers) window.clearTimeout(t);
    this.shockTimers.clear();
  }

  /** Tear the raid overlay down. */
  private clearRaid(): void {
    this.darkenSteps();
    for (const cell of this.raidCells.values()) {
      for (const s of [cell.fog, cell.ring, cell.blink]) { gsap.killTweensOf(s); s.destroy(); }
      if (cell.clue) { gsap.killTweensOf(cell.clue.scale); cell.clue.destroy({ children: true }); }
    }
    this.raidCells.clear();
    // The bob is an endless tween, so it has to be killed by hand — the group
    // going down would otherwise leave gsap ticking a destroyed sprite.
    this.dropArrow(this.goalArrow);
    this.goalArrow = null;
    this.raidCellsSeed = null;
    this.onRaidStep = null;
    if (this.raider) {
      this.raider.cancelMove();
      this.raider.destroy();
      this.raider = null;
    }
    this.raiderAt = -1;
    if (this.raiding) {
      for (const group of this.trapSprites.values()) group.visible = true;
      this.raiding = false;
      // As leaving placement does: the framing the raider leaned in with is
      // theirs for that raid only, and the homestead behind it is somebody's
      // home again — it opens on its own shot, not on a corner of a board the
      // player was peering at.
      this.camMovedByPlayer = false;
    }
    // Back to what placement alone decides — see `syncDoorArrow`.
    this.syncDoorArrow();
    // The raid is over and this is somebody's home again.
    if (!this.home && !this.dying && !this.container.destroyed) {
      this.home = new HomeRabbit(this.container, this.data.seed);
      this.applyHomeWho();
    }
  }

  /**
   * A trap came back up, or went down.
   *
   * Repaints in place rather than tearing the sprite down and building it
   * again: the marker is the SAME trap on the same tile either way, and a
   * remove/add pair would pop it off the board and back for what is really a
   * change of state. The pop is reserved for a trap the owner actually placed.
   */
  setTrapArmed(tile: number, armed: boolean): void {
    this.setTrapRearm(tile, armed ? null : { msLeft: 0, totalMs: 0 });
  }

  /**
   * Where a trap is on its way back, as the SERVER sees it.
   *
   * `null` means armed. Otherwise `msLeft` is what is left of `totalMs`, and
   * the ramp is drawn from their ratio — so a trap two thirds charged looks
   * two thirds charged on every client, however long ago it was sprung.
   *
   * The server is the authority on the CLOCK; the scene only interpolates
   * between polls. Deriving the fraction here from a local timestamp would
   * drift on a sleeping tab and show a bomb as armed while the server still
   * refuses to spring it.
   */
  setTrapRearm(tile: number, rearm: { msLeft: number; totalMs: number } | null): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;

    if (!rearm || rearm.msLeft <= 0) {
      const was = this.trapCharge.get(tile) ?? 1;
      this.trapCharge.set(tile, 1);
      this.trapRearmMsLeft.delete(tile);
      this.trapRearmTotalMs.delete(tile);
      this.paintTrap(tile);
      // The moment it comes back gets the placement's own bounce: the owner
      // sees the burrow heal rather than merely finding it healed. Only on the
      // TRANSITION, or every poll would make an armed board twitch.
      if (was < 1) {
        gsap.fromTo(group.scale, { x: 1.18, y: 1.18 }, {
          x: 1, y: 1, duration: 0.4, ease: 'back.out(2)',
        });
      }
      return;
    }

    const total = Math.max(1, rearm.totalMs || rearm.msLeft);
    this.trapRearmMsLeft.set(tile, rearm.msLeft);
    this.trapRearmTotalMs.set(tile, total);
    this.trapCharge.set(tile, Math.max(0, Math.min(1, 1 - rearm.msLeft / total)));
    this.paintTrap(tile);
  }

  /**
   * Draw one trap at its current charge.
   *
   * The single place that turns a fraction into pixels, so the mount path, the
   * per-frame ramp and a server correction all render the same way. Tint and
   * alpha both ride the ramp: colour carries "is this dangerous", alpha
   * carries "how far along", and moving them together is what makes the climb
   * legible without a second sprite to compare against.
   */
  private paintTrap(tile: number): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;
    const t = Math.max(0, Math.min(1, this.trapCharge.get(tile) ?? 1));
    const [marker, bomb, filled] = group.children as [
      Sprite, Sprite | undefined, Sprite | undefined,
    ];

    // The tile under it stays gold and simply dims — the ground is still
    // MINED at any charge, which is what the marker has always said.
    // The tile stays clearly MINED at any charge — it is still the owner's
    // ground and nothing else can be buried there. The dimming is slight on
    // purpose: the marker says "mined", the waterline says "how ready", and
    // fading the marker hard made a rearming trap disappear into the grass,
    // which is the failure this whole treatment exists to avoid.
    if (marker) {
      // Red while the mouse offers to lift it (see `LIFT_TINT`). Decided here,
      // not by whoever started the preview: a rearming trap is repainted every
      // frame by `advanceRearm`, and a tint set anywhere else would be gold
      // again one frame later.
      const lifting = this.lifted?.tile === tile;
      marker.tint = lifting ? LIFT_TINT : TRAP_TINT;
      marker.alpha = lifting ? 0.95 : 0.55 + 0.2 * t;
    }
    if (bomb) bomb.alpha = REARMING_ALPHA;

    if (!filled) return;

    // The waterline, as a CROP of the texture rather than a mask.
    //
    // The slice is the bottom `t` of the art. Re-anchoring by the same
    // fraction is what keeps it in place: a sprite showing the bottom third
    // must be anchored a third of the way up its own (now shorter) frame, or
    // the crop would slide down the tile as it grew.
    const src = this.bombTexture;
    if (!src) return;
    filled.visible = t > 0;
    if (t <= 0) return;

    const full = src.frame;
    const sliceH = Math.max(1, Math.round(full.height * t));
    const top = full.y + (full.height - sliceH);
    filled.texture = new Texture({
      source: src.source,
      frame: new Rectangle(full.x, top, full.width, sliceH),
    });
    // The bomb sits at (0.5, 0.78) of the WHOLE art. Measured from the bottom
    // of the crop, that same point is this far up the slice.
    const anchorFromBottom = (1 - 0.78) * full.height;
    filled.anchor.set(0.5, 1 - anchorFromBottom / sliceH);
  }

  /** A trap was sprung or removed. */
  removeTrap(tile: number): void {
    const group = this.trapSprites.get(tile);
    if (!group) return;
    this.trapSprites.delete(tile);
    this.trapCharge.delete(tile);
    this.trapRearmMsLeft.delete(tile);
    this.trapRearmTotalMs.delete(tile);
    // ...and off the data, or a raid would bring back a bomb that was lifted.
    this.data.traps = this.data.traps.filter((t) => t !== tile);
    // A lift preview still breathing on this bomb would tween sprites the fade
    // below is about to destroy.
    if (this.lifted?.tile === tile) {
      gsap.killTweensOf(this.lifted.parts);
      this.lifted = null;
    }
    gsap.to(group, {
      alpha: 0,
      duration: 0.25,
      onComplete: () => group.destroy({ children: true }),
    });
    this.setPlacing(this.data.placing);
  }

  update(deltaTime: number): void {
    const ms = deltaTime * (1000 / 60);
    this.advanceRearm(ms);
    this.clouds?.update(ms);
    this.birds?.update(ms);
    this.crop?.update(ms);
    // The terrain sways: the same wind that crosses the island crosses the
    // homestead, which is half of what makes the two read as one world.
    this.terrain?.update(ms);

    // The window over the rabbit, re-cut every frame rather than per step:
    // a hop tweens the container between cells, and a hole placed on arrival
    // would sit a cell behind for the length of the hop. During a raid the
    // raider is the one crossing the scenery; at home it is your own rabbit.
    const subject = this.raider ?? this.home?.rabbit ?? null;
    if (subject && !subject.container.destroyed) {
      this.hole.update(this.container, subject.container.zIndex, DepthHole.centreOf(subject), this.app.renderer);
    } else {
      this.hole.clear();
    }
  }

  /**
   * Walk every rearming trap forward by one frame.
   *
   * Between polls, which is what makes the opacity a RAMP rather than a
   * staircase — the burrow poll is seconds apart and a bomb that stepped
   * three times over an hour would read as a glitch, not as recharging.
   *
   * It only ever moves the bar UP to just short of full: the server owns the
   * moment a trap is armed again, and a client that finished the job itself
   * would show a live bomb on a tile the server still lets a raider cross.
   */
  private advanceRearm(ms: number): void {
    if (this.trapRearmMsLeft.size === 0) return;
    for (const [tile, left] of this.trapRearmMsLeft) {
      const total = this.trapRearmTotalMs.get(tile) ?? 0;
      if (total <= 0) continue;
      const next = Math.max(0, left - ms);
      this.trapRearmMsLeft.set(tile, next);
      // Capped just under 1 — the last sliver is the server's to grant.
      const charge = Math.min(0.98, 1 - next / total);
      if (Math.abs(charge - (this.trapCharge.get(tile) ?? 0)) < 0.002) continue;
      this.trapCharge.set(tile, charge);
      this.paintTrap(tile);
    }
  }

  destroy(): void {
    this.teardownPlacementHints();
    // BEFORE `clearRaid`, which puts an idle rabbit back on a board that is
    // about to be torn down — and a fresh one built here would outlive the
    // scene, ticking its own timer against a destroyed container.
    this.dying = true;
    // Before the rabbits go: the filter is taken off the scenery here, and
    // `clear` skips destroyed children rather than touching them.
    this.hole.destroy();
    this.clearShock();
    this.clearRaid();
    this.home?.destroy();
    this.home = null;
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = null;
    }
    this.gestures?.destroy();
    this.gestures = null;
    this.dragSurface = null;
    if (this.onWheel) {
      (this.app.canvas as HTMLCanvasElement).removeEventListener('wheel', this.onWheel);
      this.onWheel = null;
    }
    // The camera tweens the container itself, which is about to go.
    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.scale);
    this.clouds?.destroy();
    this.birds?.destroy();
    for (const g of this.trapSprites.values()) gsap.killTweensOf(g);
    this.trapSprites.clear();
    for (const h of this.hints) gsap.killTweensOf(h);
    this.hints = [];
    this.dropDoorArrow();
    this.crop?.destroy();
    this.terrain?.destroy();
    this.container.destroy({ children: true });
  }
}
