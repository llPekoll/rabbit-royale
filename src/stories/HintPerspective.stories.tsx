/**
 * THE NUMBERS, LAID ON THE GROUND — perspective and multiply, side by side.
 *
 * Paul, 2026-09-18, on a screenshot of a live run: "tout les nombres c'est
 * hyper messy". The board was a field of upright blue 1's floating over
 * grass, each one with its own black ring, none of them belonging to the tile
 * it names. Two ideas to test, and they are independent:
 *
 *   - PERSPECTIVE. The glyph is axis-aligned today, the same way every sprite
 *     in the pack is (see island/iso.ts: the projection moves tiles, it never
 *     rotates their pixels). Laying the number ON its diamond instead makes it
 *     read as painted on the ground rather than as a HUD marker parked over
 *     it. The cost is the pixel grid: the iso matrix is not axis-aligned, so
 *     the glyph's own pixels stop landing on whole screen pixels.
 *
 *   - MULTIPLY. Drawn normally, a number sits ON the picture. Multiplied, it
 *     DARKENS the picture — the grass reads through it and the glyph belongs
 *     to the tile. The cost is the colour ladder: multiply can only darken, so
 *     white (0xffffff, the 0/8 tint) becomes invisible and the outline ring
 *     (near-black) turns whatever it touches to near-black.
 *
 * Both knobs are here at once, with the live board's own `Tile` drawing the
 * hints, so the question "does it actually read better" has a picture instead
 * of an argument. `compare: true` splits the board in half — current style on
 * the left, the knobs on the right — which is the only honest way to judge a
 * legibility change.
 *
 * Nothing here is wired into the game yet. When a combination wins, it moves
 * into `Tile.addHint`.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Matrix } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { IsoIslandView, loadIslandTileset, isoProject, generateIsland, type IslandTileset } from '@/game/island';
import { Tile } from '@/game/entities/Tile';
import { HALF_W, HALF_H, ISO_ORIGIN_X, ISO_ORIGIN_Y, tilePos, toIndex } from '@/config/gridConfig';
import { TIER_LIFT } from '@/lib/game/terrainBoard';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';

const WIDTH = 960;
const HEIGHT = 560;

/**
 * How the glyph sits on its tile.
 *
 *   upright — what ships: axis-aligned, pixel-perfect, floating.
 *   ground  — laid flat on the diamond, as if painted on the grass. The full
 *             iso matrix: the number leans with the lattice.
 *   tilted  — the middle road. Squashed vertically like the ground is, but
 *             NOT sheared, so the glyph stays upright and readable while
 *             sharing the ground's foreshortening. This is what most iso
 *             games actually do with their floor decals' text.
 */
type Lay = 'upright' | 'ground' | 'tilted';

/** The shipped ring: the kit's ink, near-black (see `outlinedPixelText`). */
const RING_INK = 0x0c0a12;
/**
 * The pale ring, for multiply. Not pure white: at 0xffffff the ring is exactly
 * the identity and vanishes, so the glyph loses its edge on light ground
 * (sand, the dug tiles' pale dirt). A touch under white leaves a whisper of
 * darkening that still separates it.
 */
const RING_LIGHT = 0xf2f4ff;

/**
 * The iso matrix for a flat decal, at scale `s`, about the point (tx, ty).
 *
 * Straight out of `isoProject`: a unit step in x goes (+HALF_W, +HALF_H) on
 * screen and a unit step in y goes (-HALF_W, +HALF_H). Pixi's Matrix is
 * (a, b, c, d, tx, ty) with a/b the image of x and c/d the image of y, so the
 * projection IS the matrix. Divided by HALF_W so `s` still means "glyph
 * cells", not "tiles".
 *
 * THE TRANSLATION HAS TO GO IN. `setFromMatrix` replaces the whole transform,
 * position included — the first cut passed (0, 0) and every number on the
 * board teleported to the origin, which reads as "the perspective mode draws
 * nothing" rather than as "they are all stacked in the sea". On the shared
 * hint layer the group's x/y IS its world position, so it is carried through.
 */
function groundMatrix(s: number, tx: number, ty: number): Matrix {
  const k = s / HALF_W;
  return new Matrix(k * HALF_W, k * HALF_H, -k * HALF_W, k * HALF_H, tx, ty);
}

interface Args {
  lay: Lay;
  /** Multiply the glyphs into the ground instead of drawing them over it. */
  multiply: boolean;
  /**
   * The ring around each glyph.
   *
   *   ink   — what ships: near-black, eight copies, drawn normally.
   *   light — a PALE ring. Under multiply a dark ring is a disaster (it was
   *           the first cut: near-black times grass is near-black, so every
   *           number came out as a black lozenge with a coloured scratch in
   *           it). White multiplied is the identity — it leaves the ground
   *           untouched — so a pale ring under a multiplied face reads as a
   *           halo of UNDARKENED grass, which is the separation the dark ring
   *           was there to give.
   *   none  — the face alone, tinting bare ground.
   */
  outline: 'ink' | 'light' | 'none';
  /** Glyph size, as a multiple of the 8px cell. Ships at 1.2. */
  scale: number;
  /** Face opacity. Multiply at full strength is very heavy on dark ground. */
  alpha: number;
  /** Current style on the left half, the knobs on the right. */
  compare: boolean;
  seed: string;
  /** How much of the board is dug (and therefore numbered). */
  dug: number;
  zoom: number;
}

const meta: Meta<Args> = {
  title: 'Island/HintPerspective',
  parameters: {
    docs: {
      description: {
        component:
          'The minesweeper numbers laid on the ground and/or multiplied into ' +
          'it, against the upright numbers the game ships. Split-screen by ' +
          'default: left is today, right is the knobs.',
      },
    },
  },
  args: {
    // Settled by eye on 2026-09-18: laid flat on the diamond, multiplied into
    // the ground, with the pale ring. Paul, on a shot of it: "ca c'est trop
    // bien". The upright numbers it replaces are still one radio away, and
    // `compare` puts them side by side.
    lay: 'ground',
    multiply: true,
    outline: 'light',
    scale: 1.2,
    alpha: 1,
    compare: true,
    seed: 'messy',
    dug: 0.75,
    zoom: 2,
  },
  argTypes: {
    lay: { control: 'inline-radio', options: ['upright', 'ground', 'tilted'] },
    outline: { control: 'inline-radio', options: ['ink', 'light', 'none'] },
    scale: { control: { type: 'range', min: 0.6, max: 2.4, step: 0.1 } },
    alpha: { control: { type: 'range', min: 0.2, max: 1, step: 0.05 } },
    dug: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    zoom: { control: { type: 'range', min: 1, max: 4, step: 0.25 } },
  },
  render: (args) => (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background="#1eaac4"
      prepare={loadAllAssets}
      setup={(stage, app) => {
        const cleanups: Array<() => void> = [];

        (async () => {
          const tileset: IslandTileset = await loadIslandTileset();
          if (!app.renderer) return;
          initTileTextures(app.renderer);

          const size = 12;
          const map = generateIsland({ seed: args.seed, width: size, height: size, tiers: 3 });

          const world = new Container();
          world.sortableChildren = true;
          world.scale.set(args.zoom);
          const mid = tilePos(toIndex(Math.floor(size / 2), Math.floor(size / 2)));
          world.position.set(WIDTH / 2 - mid.x * args.zoom, HEIGHT / 2 - mid.y * args.zoom);
          stage.addChild(world);

          const island = new IsoIslandView({
            map,
            tileset,
            metrics: { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT },
            sea: false,
            deco: true,
            inhabitedShare: 0.12,
            decoLayer: world,
            decoShadows: true,
          });
          const origin = isoProject(0.5, 0.5, 0, { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT });
          island.view.position.set(
            ISO_ORIGIN_X - origin.x - island.originX,
            ISO_ORIGIN_Y - origin.y - island.originY,
          );
          island.placeDeco(island.view.position.x, island.view.position.y);
          island.view.zIndex = -10;
          world.addChild(island.view);

          /**
           * The shared hint layer, exactly as `IslandScene` builds it: the
           * numbers sort above every rabbit and every tree rather than with
           * the tile that owns them. Restyling them must not change that, so
           * the story restyles them WHERE THEY LIVE.
           */
          const hintLayer = new Container();
          hintLayer.zIndex = 1_000_000;
          hintLayer.sortableChildren = false;
          world.addChild(hintLayer);

          // A deterministic pseudo-random, so a screenshot is reproducible and
          // two runs of the same seed are the same board.
          let rng = 0;
          for (let i = 0; i < args.seed.length; i++) rng = (rng * 31 + args.seed.charCodeAt(i)) >>> 0;
          const rand = () => {
            rng = (rng * 1664525 + 1013904223) >>> 0;
            return rng / 0x1_0000_0000;
          };

          const tiles: Tile[] = [];
          for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
              const tier = map.level[y * map.width + x];
              if (tier === 0) continue;
              const index = toIndex(x, y);
              const tile = new Tile(index, undefined, tier * TIER_LIFT, tier, hintLayer);
              tiles.push(tile);
              world.addChild(tile.container);
              tile.mountVeil((veil) => island.mountVeil(x, y, veil));
              if (rand() < args.dug) {
                // 1..5 covers the ladder the eye actually meets on a board;
                // higher counts exist but are rare enough that judging the
                // style on them would be judging the exception.
                tile.revealContent('empty', 1 + Math.floor(rand() * 5), false);
              }
              cleanups.push(() => tile.destroy());
            }
          }

          /**
           * Restyle the hints in place.
           *
           * Reaching into the layer rather than into each `Tile` is deliberate:
           * the groups are the tile's private business, but they all land here,
           * and the point of the story is to try styles WITHOUT forking
           * `Tile.addHint` before one has been chosen. Each group is
           * `outlinedPixelText`'s: eight outline copies, then the face.
           *
           * The split uses the group's own x against the board's centre, which
           * is where `compare` gets its seam — screen space, so the seam is a
           * vertical line and not a diagonal of the lattice.
           */
          for (const group of hintLayer.children as Container[]) {
            const untouched = args.compare && group.x < mid.x;
            const face = group.children[group.children.length - 1];
            const ring = group.children.slice(0, group.children.length - 1);

            if (untouched) {
              for (const copy of ring) copy.visible = true;
              continue;
            }
            for (const copy of ring) {
              copy.visible = args.outline !== 'none';
              // White is multiply's identity, so a pale ring under a
              // multiplied face darkens nothing and reads as clean ground
              // around the glyph rather than as a black lozenge.
              copy.tint = args.outline === 'light' ? RING_LIGHT : RING_INK;
            }

            const lay = args.lay;
            if (lay === 'upright') {
              group.scale.set(args.scale);
            } else if (lay === 'ground') {
              // The full projection: the glyph lies in the lattice's plane.
              group.setFromMatrix(groundMatrix(args.scale, group.x, group.y));
            } else {
              // Foreshortened only — the ground's y-squash without its shear,
              // so the glyph keeps its upright stance.
              group.scale.set(args.scale, (args.scale * HALF_H) / HALF_W);
            }

            face.alpha = args.alpha;
            if (args.multiply) {
              // Per-renderable in Pixi v8: setting it on the group does NOT
              // reach the labels, so every copy gets it. The ring included —
              // a normal-blended ring around a multiplied face is the worst of
              // both, an opaque edge over ground the face is only tinting.
              for (const child of group.children) child.blendMode = 'multiply';
            }
          }

          const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
          app.ticker.add(ticker);
          cleanups.unshift(() => {
            app.ticker.remove(ticker);
            island.destroy();
            world.destroy({ children: true });
          });
        })();

        return () => { for (const fn of cleanups.reverse()) fn(); };
      }}
    />
  ),
};

export default meta;
type Story = StoryObj<Args>;

/** The knobs, against today's numbers on the left half. */
export const Compare: Story = {};

/** Laid flat on the diamond, no split — the full commitment. */
export const Ground: Story = {
  args: { lay: 'ground', compare: false, multiply: true, outline: 'light' },
};

/** Multiply alone, glyphs still upright: does the blend carry it by itself? */
export const MultiplyOnly: Story = {
  args: { lay: 'upright', compare: false, multiply: true, outline: 'light' },
};

/** Perspective alone, normal blend: does the lean carry it by itself? */
export const PerspectiveOnly: Story = {
  args: { lay: 'tilted', compare: false, multiply: false, outline: 'ink' },
};

/** What ships today, for the record. */
export const Today: Story = {
  args: { lay: 'upright', compare: false, multiply: false, outline: 'ink', scale: 1.2 },
};

/**
 * Multiply with the SHIPPED black ring — kept as a story because it is the
 * obvious first thing to try and it is a trap: the ring multiplies the ground
 * to near-black and the board fills with dark lozenges. Here so nobody has to
 * rediscover it.
 */
export const MultiplyWithInkRing: Story = {
  args: { lay: 'upright', compare: false, multiply: true, outline: 'ink' },
};
