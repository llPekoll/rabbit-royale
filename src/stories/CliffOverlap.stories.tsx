/**
 * ONE cliff edge, big enough to count pixels on.
 *
 * The overlap along every shelf is invisible at board scale — a diamond drawn
 * a few pixels too low still looks like a diamond, which is how it shipped.
 * This story does nothing but zoom: it finds a cliff, centres it, and scales
 * it up so the seam between the face and the tile behind it is something you
 * can actually look at.
 *
 * ## What is actually wrong
 *
 * Two numbers that have to agree and do not:
 *
 *   TIER_LIFT      18   how far one tier lifts a tile, in BOARD pixels
 *   FACE_SOLID_H   32   how tall the solid rock of a face draws, in SHEET
 *                       pixels — and faces are stamped UNSCALED
 *
 * `iso.ts` says the rule outright: "`z` is 32 rather than a rounder number
 * because that is how tall the solid part of the pack's cliff face actually
 * draws. Lift a tier by less and the face overshoots, leaving a band of rock
 * hanging below the shelf it belongs to." That is exactly the state the board
 * is in — lifting 18 against a face that draws 32 overshoots by 14px per tier,
 * on every cliff in the game.
 *
 * The isometric workbench (`ISO_TILE`) gets this right at w 64 / h 32 / z 32.
 * The BOARD halves the diamond to 44x24 for the art, and `z` was set to 18
 * without the face art being re-cut to match.
 *
 * ## What the sliders are for
 *
 * `lift` is the knob. Slide it and watch the seam: too low and rock hangs
 * below the shelf, too high and you see through the gap between tiers. The
 * readout names the overshoot in pixels so the answer is a number rather than
 * an impression.
 *
 * NOTHING is changed in the shipped constants by this story — it only sets
 * them for its own canvas. Whatever number wins here has to be written into
 * BOTH `gridConfig.TIER_LIFT` and `burrowConfig.BURROW_TIER_LIFT`, which are
 * deliberately equal: the two boards stamp the same face art, so a lift they
 * disagreed on would give one screen a gap and the other an overhang.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { IsoIslandView, loadIslandTileset, isoProject } from '@/game/island';
import { terrainFor } from '@/lib/game/terrainBoard';
import { levelAt } from '@/game/island/generate';

/** The solid-rock height of a face tile, as `IsoIslandView` measures it. */
const FACE_SOLID_H = 32;

interface Args {
  /** Which island. Changes where the cliffs are, and how deep they drop. */
  seed: string;
  /**
   * How far one tier lifts a tile, in board pixels.
   *
   * The shipped board uses 18. The face art draws 32 tall and is stamped
   * unscaled, so 18 leaves 14px of rock hanging below each shelf.
   */
  lift: number;
  /** The cell's width. Height follows the 2:1 isometric angle. */
  tileW: number;
  /** How far in to zoom. Past ~3x on a 44px tile the frame is inside a single
   *  cell and the cliff leaves the picture entirely. */
  zoom: number;
  /** Draw a ruler at the seam: the lift, and the face's solid height. */
  ruler: boolean;
}

export default {
  title: 'Island/Cliff overlap',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'One cliff, zoomed. The seam between a shelf and the tile behind it is '
          + 'where TIER_LIFT (18) and FACE_SOLID_H (32) disagree. Slide `lift` until '
          + 'the rock neither hangs below the shelf nor opens a gap.',
      },
    },
  },
  args: { seed: 'player-1', lift: 18, tileW: 44, zoom: 2.5, ruler: true },
  argTypes: {
    seed: { control: 'select', options: ['player-1', 'player-2', 'player-3', 'seed-4', 'seed-5'] },
    lift: { control: { type: 'range', min: 8, max: 44, step: 1 } },
    tileW: { control: { type: 'range', min: 32, max: 96, step: 4 } },
    zoom: { control: { type: 'range', min: 1, max: 6, step: 0.25 } },
  },
} satisfies Meta<Args>;

type Story = StoryObj<Args>;

/**
 * The steepest drop on the map, which is the one worth looking at.
 *
 * A one-tier step shows the fault least — the baked tile already carries one
 * tier of side, so nothing is stamped and only the lift is visible. A two-tier
 * drop stamps a real face and is where rock actually hangs.
 */
function findCliff(seed: string) {
  const { map } = terrainFor(seed);
  let best = { x: 0, y: 0, drop: 0, tier: 0 };
  for (let y = 0; y < map.height - 1; y++) {
    for (let x = 0; x < map.width; x++) {
      const here = levelAt(map, x, y);
      if (here <= 0) continue;
      // Downhill towards the camera: that face is the one drawn facing us.
      const below = levelAt(map, x, y + 1);
      const drop = here - below;
      // Prefer the deepest, and among equals prefer one further from the edge
      // so the frame has island on both sides rather than sea.
      const central = Math.min(x, map.width - x) + Math.min(y, map.height - y);
      const bestCentral = Math.min(best.x, map.width - best.x)
        + Math.min(best.y, map.height - best.y);
      if (below > 0 && (drop > best.drop || (drop === best.drop && central > bestCentral))) {
        best = { x, y, drop, tier: here };
      }
    }
  }
  return { map, ...best };
}

export const CliffOverlap: Story = {
  render: (args) => <CliffView {...args} />,
};

function CliffView({ seed, lift, tileW, zoom, ruler }: Args) {
  const cliff = findCliff(seed);
  const tileH = Math.round(tileW * 24 / 44);
  const overshoot = FACE_SOLID_H - lift;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <PixiStage
        key={`${seed}:${lift}:${tileW}:${zoom}:${ruler}`}
        width={720}
        height={420}
        background="#0d1b12"
        prepare={loadAllAssets}
        setup={(stage) => {
          const world = new Container();
          stage.addChild(world);

          let view: IsoIslandView | null = null;
          void loadIslandTileset().then((tileset) => {
            const { map, placements } = terrainFor(seed);
            // The real scenery, not a bare heightmap: a tree standing at the
            // lip of a shelf is part of how the overlap reads, and a story
            // that left it out would be showing a cleaner cliff than ships.
            const metrics = { w: tileW, h: tileH, z: lift };
            const island = new IsoIslandView({ map, tileset, metrics, placements });
            view = island;
            world.addChild(island.view);

            // Centre the cliff, then zoom about that point.
            //
            // The +origin is the part that is easy to get wrong, and both
            // earlier versions of this story did: `isoProject` answers in the
            // island's own coordinates, where the map's top-left corner can be
            // negative, and `isoBounds` shifts everything by `originX/originY`
            // to put the box at 0,0. That shift lives on a container INSIDE
            // `view`, so neither `view.x` nor `view.toGlobal` sees it — read
            // straight off the view, the frame lands in the open sea.
            const local = isoProject(cliff.x + 0.5, cliff.y + 0.5, cliff.tier, metrics);
            const at = { x: local.x + island.originX, y: local.y + island.originY };
            world.scale.set(zoom);
            world.position.set(360 - at.x * zoom, 210 - at.y * zoom);

            if (ruler) {
              // Two bars at the seam, in WORLD pixels so the zoom magnifies
              // them with the art: how far the tier lifted, and how much rock
              // the face actually draws. When they differ, the difference IS
              // the band of rock hanging below the shelf.
              const g = new Graphics();
              const rx = at.x + tileW * 0.55;
              const ry = at.y;
              g.rect(rx, ry, 2, lift).fill({ color: 0x4dff88, alpha: 0.9 });
              g.rect(rx + 4, ry, 2, FACE_SOLID_H).fill({ color: 0xff4d4d, alpha: 0.9 });
              g.zIndex = 99_999;
              island.view.addChild(g);
            }
          });

          return () => view?.destroy();
        }}
      />

      <div style={{
        font: '12px ui-monospace, monospace', color: '#cfe6d8',
        background: '#0d1b12', border: '1px solid #1f3a29', borderRadius: 6,
        padding: 10, display: 'grid', gap: 6, maxWidth: 720,
      }}>
        <div>
          cliff at ({cliff.x}, {cliff.y}) &middot; drops {cliff.drop} tier{cliff.drop > 1 ? 's' : ''} from tier {cliff.tier}
        </div>
        <div>
          <span style={{ color: '#4dff88' }}>green bar</span> = lift {lift}px &middot;{' '}
          <span style={{ color: '#ff4d4d' }}>red bar</span> = face draws {FACE_SOLID_H}px
        </div>
        <div style={{ color: overshoot === 0 ? '#4dff88' : '#ffd45c' }}>
          {overshoot === 0
            ? 'matched — the face fills exactly the gap the lift opens'
            : overshoot > 0
              ? `${overshoot}px of rock hangs below each shelf (face overshoots the lift)`
              : `${-overshoot}px gap under each shelf (lift outruns the face)`}
        </div>
        <div style={{ color: '#8fa89a' }}>
          Faces are stamped UNSCALED (see IsoIslandView.stamp), so FACE_SOLID_H is
          screen pixels regardless of tile width — changing tileW does not change it.
        </div>
      </div>
    </div>
  );
}
