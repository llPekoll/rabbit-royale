/**
 * The island AS the board — every land tile is a cell you can stand on.
 *
 * The step before this one laid a flat 16x16 grid over the terrain and the two
 * ignored each other: a cliff was a picture of a wall, and a soldier was a
 * sprite you walked through. Here the terrain IS the board. The sea is
 * off-board, a cliff of more than one tier cannot be climbed, a soldier is a
 * wall, and a sheep is a wall that wanders — so a route it blocks can open if
 * you wait.
 *
 * Click a lit tile to walk. That is the whole interaction, and it is enough,
 * because what is under review is not the controls:
 *
 *   - is the reachable ring READABLE without a fog layer over everything?
 *   - does a cliff refuse a climb where the art says it should?
 *   - can a flock actually box the rabbit in, and does waiting free it?
 *   - does an island ever deal a cell you cannot reach at all?
 *
 * The last one is the reason `test/island-board.test.ts` exists: it floods
 * every seed and asserts the island is one connected board, because "one
 * island in forty splits in half" is not something eyes find. What eyes are
 * for is everything above it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IslandBoard,
  IsoIslandView,
  levelAt,
  loadIslandTileset,
  isoProject,
  type IslandTileset,
} from '@/game/island';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { HALF_W, HALF_H } from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;
const SEA = '#1eaac4';

/** How often the flock takes a step, in milliseconds. */
const WANDER_MS = 900;

interface Args {
  seed: string;
  size: number;
  tiers: number;
  land: number;
  rise: number;
  raggedness: number;
  tileZ: number;
  /** Share of the land given to sheep and soldiers. */
  inhabitedShare: number;
  /** Let the flock wander. Off freezes the island, obstacles included. */
  wander: boolean;
  /** Scenery. Off is the bare board, for judging the ring against grass. */
  deco: boolean;
}

function Scene(args: Args) {
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        await loadAllAssets();
        tileset = await loadIslandTileset();
      }}
      setup={(stage, app) => {
        if (!tileset) return;

        const map = generateIsland({
          seed: args.seed,
          width: args.size,
          height: args.size,
          tiers: args.tiers,
          land: args.land,
          rise: args.rise,
          raggedness: args.raggedness,
        });

        const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: args.tileZ };
        const island = new IsoIslandView({
          map,
          tileset,
          metrics,
          deco: args.deco,
          decoScale: 0.4,
          inhabitedShare: args.inhabitedShare,
        });

        // Fit the whole island: the board is only judgeable whole.
        const scale = Math.min(WIDTH / island.width, HEIGHT / island.height);
        island.view.scale.set(scale);
        island.view.position.set(
          (WIDTH - island.width * scale) / 2,
          (HEIGHT - island.height * scale) / 2,
        );
        stage.addChild(island.view);

        // The view's inhabitants ARE the board's obstacles — the same objects,
        // so a sheep the board walks is already moved as far as the view is
        // concerned, and `syncOccupants` only has to catch its sprite up.
        const board = new IslandBoard(map, island.occupants());

        /** Where a cell's centre lands inside the island's own container. */
        const at = (x: number, y: number) => {
          const p = isoProject(x + 0.5, y + 0.5, levelAt(map, x, y), metrics);
          return { x: p.x + island.originX, y: p.y + island.originY };
        };

        // Everything below lives INSIDE the island's container, so it inherits
        // the fit scale above rather than having to repeat it.
        const overlay = new Container();
        overlay.zIndex = 1e6;
        island.view.addChild(overlay);
        island.view.sortableChildren = true;

        let rabbitCell = pickSpawn(board, map);
        const rabbit = new PlayerRabbit(0);
        rabbit.container.zIndex = 1e6 + 1;
        island.view.addChild(rabbit.container);

        const place = () => {
          const p = at(rabbitCell.x, rabbitCell.y);
          rabbit.container.position.set(p.x, p.y);
          // Anything tall standing between the rabbit and the camera goes
          // see-through, so the player is never lost inside a pine.
          island.fadeBehind(rabbitCell.x, rabbitCell.y);
        };
        place();

        /**
         * The reachable ring.
         *
         * Diamonds rather than a fog over everything else: the terrain is the
         * thing being shown off, and veiling an entire island to point at eight
         * cells hides more than it explains. Drawn fresh each move — eight
         * sprites is nothing, and a pool would outlive the cells it named.
         *
         * Drawn ABOVE the scenery on purpose. Sorted by its own cell it would
         * be correct and useless: a tree one row nearer covers the tile behind
         * it, so the ring would vanish exactly where the island is busiest and
         * the player most needs to see where they may go. A movement affordance
         * is UI, and UI wins over depth.
         */
        const drawRing = () => {
          overlay.removeChildren().forEach((c) => c.destroy());
          for (const cell of board.stepsFrom(rabbitCell.x, rabbitCell.y)) {
            const p = at(cell.x, cell.y);
            const g = new Graphics()
              .poly([0, -HALF_H, HALF_W, 0, 0, HALF_H, -HALF_W, 0])
              .fill({ color: 0xffd700, alpha: 0.28 })
              .poly([0, -HALF_H, HALF_W, 0, 0, HALF_H, -HALF_W, 0])
              .stroke({ color: 0xffd700, width: 1.5, alpha: 0.9 });
            g.position.set(p.x, p.y);
            g.eventMode = 'static';
            g.cursor = 'pointer';
            g.on('pointertap', () => {
              rabbitCell = { x: cell.x, y: cell.y };
              place();
              drawRing();
            });
            overlay.addChild(g);
          }
        };
        drawRing();

        // The flock, on its own clock rather than per frame: sheep that stepped
        // every tick would teleport, and the point of a moving obstacle is that
        // a player can watch it and plan around it.
        let sinceWander = 0;
        const ticker = (t: { deltaMS: number }) => {
          island.update(t.deltaMS);
          if (!args.wander) return;
          sinceWander += t.deltaMS;
          if (sinceWander < WANDER_MS) return;
          sinceWander = 0;
          if (board.wander().length) {
            island.syncOccupants();
            // A sheep may have stepped into or out of the ring.
            drawRing();
          }
        };
        app.ticker.add(ticker);

        return () => {
          app.ticker.remove(ticker);
          island.destroy();
        };
      }}
    />
  );
}

/** A free land cell near the middle, so the rabbit starts somewhere sensible. */
function pickSpawn(board: IslandBoard, map: ReturnType<typeof generateIsland>) {
  const mid = { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
  let best = { x: mid.x, y: mid.y };
  let bestDist = Infinity;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!board.isWalkable(x, y)) continue;
      const d = Math.abs(x - mid.x) + Math.abs(y - mid.y);
      if (d < bestDist) { bestDist = d; best = { x, y }; }
    }
  }
  return best;
}

const meta: Meta<Args> = {
  title: 'Island/Playable board',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'harbour-9',
    size: 22,
    tiers: 3,
    land: 0.55,
    rise: 0.45,
    raggedness: 0.35,
    tileZ: 24,
    inhabitedShare: 0.025,
    wander: true,
    deco: true,
  },
  argTypes: {
    seed: { control: 'text' },
    size: { control: { type: 'range', min: 10, max: 40, step: 1 } },
    tiers: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    land: { control: { type: 'range', min: 0.3, max: 0.95, step: 0.01 } },
    rise: { control: { type: 'range', min: 0.1, max: 0.9, step: 0.01 } },
    raggedness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    tileZ: { control: { type: 'range', min: 0, max: 48, step: 2 } },
    inhabitedShare: { control: { type: 'range', min: 0, max: 0.2, step: 0.005 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Click a lit tile to walk. Three tiers, a small flock, scenery on. */
export const Default: Story = {};

/**
 * A crowded island: enough livestock to actually box a rabbit in.
 *
 * This is where the moving obstacle earns itself. Walk into a corner of the
 * flock and the ring goes dark; wait, and a sheep drifts off the cell that was
 * blocking you. A soldier in the same spot would never let go, which is the
 * difference the two kinds exist to draw.
 */
export const Crowded: Story = { args: { inhabitedShare: 0.12 } };

/**
 * Steep terrain: five tiers on a small island, so cliffs are everywhere.
 *
 * The climb rule is one tier per step, so a shelf two levels up refuses the
 * step even though its tile is right there. Worth walking a plateau's edge to
 * feel where the board says no and the picture agrees.
 */
export const Cliffs: Story = { args: { tiers: 5, size: 18, rise: 0.6, tileZ: 32 } };

/** Flat ground: no climbs at all, so only livestock and the shore constrain. */
export const Flat: Story = { args: { tiers: 1, tileZ: 0 } };

/** The flock frozen. Every obstacle is permanent — the island as a puzzle. */
export const NoWander: Story = { args: { wander: false, inhabitedShare: 0.1 } };

/** Bare board: no trees or props, so the ring is judged against grass alone. */
export const BareBoard: Story = { args: { deco: false } };

/** A big island, to see whether a board this size still reads at one glance. */
export const Large: Story = { args: { size: 34, land: 0.6 } };
