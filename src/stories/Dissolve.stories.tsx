/**
 * Walking BEHIND something, and still being visible.
 *
 * The island is drawn with a painter's algorithm: a tree nearer the camera is
 * drawn after the rabbit, so it covers it. That is correct and it is also the
 * problem — a pine is three cells tall and a rabbit is one, so standing north
 * of a trunk means standing INSIDE it, and the player loses the only sprite
 * they are steering. `blocking.ts` already answers this by dropping the tree's
 * alpha to `fadeTo`, and the answer works.
 *
 * It just does not look like this game. Lowering opacity is a photographic
 * move: every pixel of the tree goes equally milky and the grass shows through
 * everywhere at once, which is a thing pixels cannot do — a pixel is either
 * drawn or it is not. This story is the A/B for the other answer: keep the
 * pixels binary and REMOVE some of them on an ordered dither, so the tree
 * opens a stipple window over the player and stays fully solid everywhere else
 * (`DissolveFilter`).
 *
 * ## Why this has to be a story
 *
 * Every way it can fail is an eye failure that no test catches:
 *
 *   - the dither can be sampled in TEXTURE space, which glues the pattern to
 *     the sprite: it then scales with the tree and a tree at `decoScale` 0.4
 *     carries a smeared two-pixel checker that reads as a compression
 *     artefact. Screen space keeps the dots square. `stickyPattern` turns the
 *     bug on so you can see the difference rather than take it on faith.
 *   - the dot can be too fine. At 1 device pixel the stipple is smaller than
 *     an art pixel, and on a moving sprite it shimmers instead of reading as
 *     holes punched through it.
 *   - a flat dissolve over the whole sprite reads as damage, not as
 *     transparency — a moth-eaten tree. The hole has to be local to the
 *     player, which is what `holeRadius` is.
 *   - and the hole has to TRACK. `gl_FragCoord` counts from the bottom-left in
 *     device pixels while the rabbit is at a CSS-pixel point from the top-left,
 *     and getting either conversion wrong leaves a hole that drifts the wrong
 *     way as the rabbit walks. The rabbit here walks a long diagonal on a loop
 *     precisely so that a mistracking hole is obvious within one pass.
 *
 * ## What to look for
 *
 * Flip `mode` between `dither` and `alpha` while the rabbit is mid-trunk. Both
 * show the rabbit. Ask which one still looks like the same game as the tile it
 * is standing on.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Sprite } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { DissolveFilter } from '@/game/fx/DissolveFilter';
import { IsoIslandView, loadIslandTileset, type IslandTileset } from '@/game/island';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { HALF_W, HALF_H } from '@/config/gridConfig';
import { levelTierAt, spawnTile, terrainFor, TIER_LIFT } from '@/lib/game/terrainBoard';

const WIDTH = 960;
const HEIGHT = 540;
const SEA = '#1eaac4';

/**
 * A seed whose island has both of the things being tested: tall trees to walk
 * behind, and a plateau whose cliff face the walk passes under.
 */
const SEED = 'harbour-9';

/** Seconds for the rabbit to cross the board once, one way. */
const WALK_SECONDS = 7;

interface Args {
  /** `dither` is the new effect, `alpha` the fade that ships today. */
  mode: 'dither' | 'alpha' | 'none';
  /** Share of pixels removed at full dissolve, 0..1. */
  amount: number;
  /** Device pixels per dither dot. */
  pixelSize: number;
  /** Radius of the dissolved window around the rabbit, in CSS px. 0 = whole sprite. */
  holeRadius: number;
  /** How far past the radius the effect fades out. */
  holeFeather: number;
  /** How strongly the surviving pixels at the rim are tinted. */
  edgeStrength: number;
  /** Rim colour. */
  edgeColor: string;
  /** The alpha the `alpha` arm fades to — the game's current `fadeTo` for a tree. */
  fadeTo: number;
  /**
   * Sample the dither in TEXTURE space instead of screen space — the bug, kept
   * as a control so the fix is visible rather than asserted.
   */
  stickyPattern: boolean;
  /** Freeze the rabbit mid-trunk instead of walking it. */
  freeze: boolean;
  /**
   * Where the frozen rabbit stands along its walk, 0..1.
   *
   * The default is not the middle, and picking it took looking rather than
   * arithmetic: a cell the rule calls "hidden" is not always one the eye does.
   *
   * 0.57 is row 9 — the cell at the foot of the shelf, with its cliff face
   * between the rabbit and the camera. That is the frame worth opening on.
   */
  freezeAt: number;
  /** How large the terrain's scenery is drawn. */
  decoScale: number;
  /**
   * Height of one terrain tier, in px.
   *
   * A control rather than the game's constant, because the constant is the
   * finding here. `TIER_LIFT` is 18 and a rabbit is about 24 tall, so a
   * one-tier cliff is SHORTER THAN THE PLAYER: standing at the foot of a
   * plateau, the rabbit's head and ears clear the rock and there is nothing
   * for a dissolve to open. The effect fires correctly and shows almost
   * nothing, which reads as a broken filter and is really a scale problem.
   *
   * Raise it to ~34 and the cliff becomes a wall that genuinely covers the
   * player, which is the case worth judging the effect on. Whether the GAME
   * should lift its tiers that far is a separate question — it changes how the
   * whole island reads — and this control is what makes it askable.
   */
  tierLiftPx: number;
}

/**
 * The cells the rabbit walks between.
 *
 * Chosen against THIS seed's actual terrain rather than as a scenic diagonal,
 * and chosen for the ROCK. `harbour-9` carries a tier-2 shelf around (11,10)
 * and (10,11), and column 10 walks straight down past its western foot: at
 * row 9 the rabbit stands on tier-1 ground with that shelf's cliff face
 * between it and the camera. That is the case this story was asked for and
 * the one the shipped fade never handled at all — `fadeBehind` only ever
 * looked at trees and livestock, so the rock simply swallowed the player.
 *
 * Which cell that is was found by asking the projection (see `facesHiding`),
 * not by picking a likely-looking spot on the tier map: a cell with higher
 * ground beside it is not necessarily a cell whose rabbit is COVERED, and two
 * plausible guesses at the offsets produced stories where the effect fired on
 * rock nowhere near the player.
 *
 * Down a column rather than along the x+y diagonal because the diagonal keeps
 * the rabbit on one depth band, where it never goes behind anything at all.
 */
const WALK_FROM = { col: 10, row: 5 };
const WALK_TO = { col: 10, row: 12 };

function Scene(args: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        await loadAllAssets();
        await loadIslandTileset();
      }}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        let tileset: IslandTileset | null = null;
        // `loadIslandTileset` caches, so this resolves on the same frame.
        let island: IsoIslandView | null = null;
        let rabbit: PlayerRabbit | null = null;
        const cleanups: Array<() => void> = [];
        let disposed = false;

        void loadIslandTileset().then((ts) => {
          if (disposed) return;
          tileset = ts;
          const { map, placements } = terrainFor(SEED);

          // One sorted world, terrain and rabbit as SIBLINGS.
          //
          // This is the arrangement the real screen uses (see `decoLayer` in
          // `IsoIslandView`): the rabbit has to be able to sort between the
          // trees rather than land wholly in front of or behind all of them,
          // and only siblings in one sorted container can do that. Parenting
          // the rabbit over the island's view would put it in front of every
          // tree on the map, at which point there is no occlusion to dissolve
          // and the story would be showing nothing.
          const world = new Container();
          world.sortableChildren = true;
          stage.addChild(world);
          cleanups.push(() => world.destroy({ children: true }));

          island = new IsoIslandView({
            map,
            tileset,
            metrics: { w: HALF_W * 2, h: HALF_H * 2, z: args.tierLiftPx },
            placements,
            decoScale: args.decoScale,
            decoLayer: world,
          });

          // The terrain draws itself inside its own box, offset by its origin
          // so nothing lands at a negative coordinate. The rabbit below is
          // placed by RAW projection instead — so cancelling that origin out
          // is what puts the two in one coordinate space, and skipping it is
          // what left the first screenshot of this story showing a rabbit
          // alone at sea with the island in the far corner.
          island.view.position.set(-island.originX, -island.originY);
          // The deported trees live in `world`, not under `view`, so they have
          // to be told about that shift themselves.
          island.placeDeco(-island.originX, -island.originY);
          world.addChild(island.view);

          rabbit = new PlayerRabbit(spawnTile(SEED), undefined, SEED);
          world.addChild(rabbit.container);

          // Frame the WALK, not the island: put the middle of the rabbit's
          // path at the middle of the canvas. Framing the island's box instead
          // centres a lot of empty sea, because the walk is a diagonal across
          // the middle rather than the whole map.
          const midCol = (WALK_FROM.col + WALK_TO.col) / 2;
          const midRow = (WALK_FROM.row + WALK_TO.row) / 2;
          world.position.set(
            WIDTH / 2 - (midCol - midRow) * HALF_W,
            HEIGHT / 2 - (midCol + midRow) * HALF_H,
          );

          cleanups.push(() => {
            island?.destroy();
            rabbit?.destroy();
          });
        });

        // One filter per sprite that can hide the rabbit.
        //
        // Not one filter shared across all of them: a Pixi filter carries its
        // own uniforms, and the dissolve amount is per-tree — the pine the
        // rabbit is inside dissolves, the one two cells over does not. Sharing
        // would make the whole forest open at once, which is the alpha fade's
        // failure mode with extra steps.
        const filters = new Map<Sprite, DissolveFilter>();

        const filterFor = (sprite: Sprite): DissolveFilter => {
          let f = filters.get(sprite);
          if (!f) {
            f = new DissolveFilter({
              pixelSize: args.pixelSize,
              holeRadius: args.holeRadius,
              holeFeather: args.holeFeather,
              edgeStrength: args.edgeStrength,
              edgeColor: parseInt(args.edgeColor.replace('#', ''), 16),
              sticky: args.stickyPattern,
            });
            f.setResolution(app.renderer.resolution);
            // Only the sticky arm reads this — it is what makes the bug's
            // pattern scale with the sprite, which is the thing being shown.
            f.setSpriteSize(sprite.texture.width, sprite.texture.height);
            filters.set(sprite, f);
          }
          return f;
        };

        let elapsed = 0;
        /**
         * The cliff faces dissolved on the previous frame.
         *
         * Occupants are all visited every frame, so one that stops hiding the
         * rabbit is restored on the same pass. The faces are not: `facesHiding`
         * only returns the ones in the way NOW, so without remembering the last
         * set, every slab the rabbit walks past would keep its hole and the
         * plateau would end the walk full of them.
         */
        let lastRock: Sprite[] = [];

        const tick = (t: { deltaMS: number }) => {
          if (!island || !rabbit) return;
          island.update(t.deltaMS);
          elapsed += t.deltaMS;

          // Where the rabbit is along its walk, as a triangle wave: out and
          // back, so one loop passes behind the same trees from both sides.
          // Walking one way and teleporting back would hide the half of the
          // failure where the rabbit LEAVES a trunk.
          const phase = args.freeze
            ? args.freezeAt
            : triangle((elapsed / 1000) / WALK_SECONDS);
          const col = WALK_FROM.col + (WALK_TO.col - WALK_FROM.col) * phase;
          const row = WALK_FROM.row + (WALK_TO.row - WALK_FROM.row) * phase;

          // Placed directly rather than through `moveTo`: that animates a hop
          // between whole tiles, and what this story needs is a continuous
          // sweep so the dissolve is seen opening and closing rather than
          // snapping once per tile.
          //
          // The HEIGHT is smoothed, and that is not cosmetic here. Reading the
          // tier of the rounded cell makes the lift a step function: the
          // rabbit teleports a whole TIER_LIFT the instant it crosses the
          // halfway line of a cell, so walking towards a plateau it jumps to
          // the top instead of walking up to the wall. That hop is also the
          // thing that hides the effect this story is about — the rabbit is
          // never AT the foot of the cliff long enough to be behind it.
          //
          // Smoothed by sampling the tier either side of the fractional
          // position and blending, so the climb happens across the cell rather
          // than at one line inside it.
          const tier = sampleTier(col, row);
          rabbit.container.position.set(
            (col - row) * HALF_W,
            (col + row) * HALF_H - tier * args.tierLiftPx,
          );
          // Depth still uses the ROUNDED cell: sorting is per-cell, and a
          // fractional depth would make the rabbit swap in front of and behind
          // the same sprite mid-cell.
          rabbit.container.zIndex =
            (Math.round(col) + Math.round(row)) * 16 + Math.round(tier) + 8;

          // The rabbit's position on the CANVAS, which is what the shader's
          // hole needs — `gl_FragCoord` knows nothing about containers. Taken
          // from the sprite's global transform rather than recomputed, so a
          // camera move can never put the hole somewhere the rabbit is not.
          const global = rabbit.container.getGlobalPosition();

          // Trees and livestock, plus the ROCK — see `facesHiding`. The cliff
          // is the case the fade never covered and the one this story was
          // asked for: a rabbit at the foot of a plateau walks behind a wall
          // of it.
          const rock = island.facesHiding(Math.round(col), Math.round(row));
          const rockSet = new Set(rock);
          for (const sprite of lastRock) {
            // Faces left behind as the rabbit walks on have to be put back, or
            // the island keeps a trail of holes in it.
            if (!rockSet.has(sprite)) { sprite.alpha = 1; sprite.filters = []; }
          }
          lastRock = rock;

          const targets = [
            ...occluders(island, col, row),
            ...rock.map((sprite) => ({ sprite, hides: true })),
          ];

          for (const { sprite, hides } of targets) {
            if (args.mode === 'none') {
              sprite.alpha = 1;
              sprite.filters = [];
              continue;
            }

            if (args.mode === 'alpha') {
              // The arm that ships today.
              sprite.filters = [];
              sprite.alpha = hides ? args.fadeTo : 1;
              continue;
            }

            sprite.alpha = 1;
            const f = filterFor(sprite);
            f.amount = hides ? args.amount : 0;
            if (hides) {
              f.pointAtCanvas(global.x, global.y - 12, app.renderer.screen.height);
              sprite.filters = [f];
            } else {
              // Dropped rather than left at amount 0: a filter is a render
              // pass per sprite, and leaving one on forty trees to do nothing
              // is forty passes a frame for no picture.
              sprite.filters = [];
            }
          }
        };

        app.ticker.add(tick);
        cleanups.push(() => {
          app.ticker.remove(tick);
          for (const f of filters.values()) f.destroy();
          filters.clear();
        });

        return () => {
          disposed = true;
          cleanups.forEach((fn) => fn());
        };
      }}
    />
  );
}

/**
 * The things standing near enough to the rabbit to be hiding it.
 *
 * The same span `IsoIslandView.fadeBehind` uses — the cell one step nearer the
 * camera plus the two beside it, which is what a sprite three cells tall
 * actually covers. Reused rather than reinvented so that this story is judging
 * the EFFECT and not a second, subtly different idea of "behind".
 */
function occluders(
  island: IsoIslandView,
  rabbitX: number,
  rabbitY: number,
): Array<{ sprite: Sprite; hides: boolean }> {
  const out: Array<{ sprite: Sprite; hides: boolean }> = [];
  const rx = Math.round(rabbitX);
  const ry = Math.round(rabbitY);
  for (const occupant of island.occupants()) {
    const sprite = island.spriteFor(occupant.id);
    if (!sprite) continue;
    const hides =
      occupant.y >= ry &&
      occupant.y <= ry + 2 &&
      Math.abs(occupant.x - rx) <= 1 &&
      !(occupant.x === rx && occupant.y === ry);
    out.push({ sprite, hides });
  }
  return out;
}

/**
 * The terrain's tier at a FRACTIONAL cell, blended across the boundary.
 *
 * `levelTierAt` answers per whole cell, which is right for the board and wrong
 * for a sprite moving continuously over it: taken at the rounded cell, the
 * rabbit's height is a staircase whose steps land in the middles of cells, so
 * approaching a plateau it snaps a full tier upward while still a half-cell
 * short of the wall. On screen that is a jump onto the clifftop, and it skips
 * the moment this story exists to show — the rabbit at the FOOT of the rock,
 * behind it.
 *
 * Blending the two cells the position falls between turns the step into a
 * ramp. Not physically how a rabbit climbs a cliff, but this is a story about
 * what the rock does to the sprite behind it, and a smooth approach is what
 * lets that be seen at all.
 */
function sampleTier(col: number, row: number): number {
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const fc = col - c0;
  const fr = row - r0;
  const t00 = levelTierAt(SEED, c0, r0);
  const t10 = levelTierAt(SEED, c0 + 1, r0);
  const t01 = levelTierAt(SEED, c0, r0 + 1);
  const t11 = levelTierAt(SEED, c0 + 1, r0 + 1);
  return (
    t00 * (1 - fc) * (1 - fr) +
    t10 * fc * (1 - fr) +
    t01 * (1 - fc) * fr +
    t11 * fc * fr
  );
}

/** 0 → 1 → 0 over one unit of `t`, so the walk goes out and comes back. */
function triangle(t: number): number {
  const f = ((t % 1) + 1) % 1;
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

const meta: Meta<Args> = {
  title: 'FX/Dissolve behind cover',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    mode: 'dither',
    // Tuned by looking, not by taste, and the ROCK is what set these rather
    // than the trees. A 70px window is right for a pine seen face-on and far
    // too wide for a cliff: a wall is seen edge-on, so a disc that size eats
    // the whole shelf and the island opens onto the sea. 30 with a short
    // feather keeps the hole to roughly the rabbit's own footprint, which is
    // all it ever needed to be.
    //
    // The amount goes UP as the radius comes down: within a window this tight
    // a half-dissolved slab still hides the player, and there is no longer a
    // large area for a high share to visibly erase.
    amount: 0.9,
    pixelSize: 3,
    holeRadius: 30,
    holeFeather: 14,
    edgeStrength: 0.45,
    edgeColor: '#fff0b0',
    fadeTo: 0.45,
    stickyPattern: false,
    freeze: false,
    freezeAt: 0.57,
    decoScale: 0.4,
    tierLiftPx: 34,
  },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['dither', 'alpha', 'none'],
      description: 'dither = the new effect, alpha = what ships today, none = no help at all',
    },
    amount: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    pixelSize: { control: { type: 'range', min: 1, max: 8, step: 1 } },
    holeRadius: { control: { type: 'range', min: 0, max: 160, step: 2 } },
    holeFeather: { control: { type: 'range', min: 0, max: 120, step: 2 } },
    edgeStrength: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    edgeColor: { control: 'color' },
    fadeTo: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    freezeAt: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    decoScale: { control: { type: 'range', min: 0.2, max: 1, step: 0.05 } },
    tierLiftPx: {
      control: { type: 'range', min: 12, max: 48, step: 2 },
      description: `the game ships ${TIER_LIFT}, which is shorter than the rabbit`,
    },
  },
};

export default meta;
type Story = StoryObj<Args>;

/** The effect as proposed: a stipple window that follows the player. */
export const Dithered: Story = {};

/**
 * What ships today, for the same walk.
 *
 * Not a worse picture on its own terms — the rabbit IS visible. The question
 * this arm exists to ask is whether a uniformly milky tree belongs on a board
 * whose every other pixel is opaque.
 */
export const FlatAlpha: Story = { args: { mode: 'alpha' } };

/**
 * No help at all — the bug both of the others fix.
 *
 * Worth a look before judging how strong the effect should be: the rabbit
 * disappears into the trunk completely, and a player mid-run has no idea where
 * they are.
 */
export const Unassisted: Story = { args: { mode: 'none' } };

/**
 * The whole sprite dissolves, with no window.
 *
 * `holeRadius` 0. This is the simplest version of the idea and the one to
 * compare the window against: it reads as a tree made of holes rather than as
 * a tree being looked through, which is why the hole exists.
 */
export const WholeSprite: Story = { args: { holeRadius: 0, amount: 0.55 } };

/**
 * Frozen mid-trunk, for judging the pattern itself.
 *
 * Movement hides a lot: a shimmering dither reads as "texture" while it slides
 * and as a mistake the moment it stops. Park the rabbit inside a pine and take
 * `pixelSize` from 1 to 6 here — 1 is finer than an art pixel and fights the
 * sprite it is cut into.
 */
export const Frozen: Story = { args: { freeze: true, freezeAt: 0.57 } };

/**
 * The pattern sampled in TEXTURE space — the bug the screen-space sampling
 * exists to avoid.
 *
 * Same everything else. The dots are now the TREE's pixels rather than the
 * screen's, so a tree drawn at `decoScale` 0.4 carries a dither squashed to
 * under half a screen pixel per dot, and what should read as a stipple reads
 * as a smear. Take `decoScale` up towards 1 here and watch the pattern grow
 * with the sprite, which is the tell.
 */
export const StuckToTheSprite: Story = {
  args: { stickyPattern: true, freeze: true, freezeAt: 0.57 },
};
