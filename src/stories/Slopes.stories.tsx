/**
 * Three ways of joining one terrain tier to the next, on the game's own grid.
 *
 * Today every terrace edge is a STEP: the baked tile hangs a band of rock
 * under its two visible edges and the lower neighbour meets it. The game lets
 * a rabbit walk straight up that step, so the art says "wall" where the rules
 * say "path". `edge` picks the join:
 *
 *   cliff   what ships — the rock band, `TIER_LIFT` tall.
 *   bevel   the band replaced by grass sloping down from the edge. Same
 *           geometry, every cell stays flat, only the face changes colour.
 *   ramp    heights on the VERTICES: the low cell beside a plateau is warped
 *           up to meet it, the plateau stays flat, and only the coast keeps
 *           rock. See `game/island/slopes.ts`.
 *
 * Both alternatives are built at load time from the shipped sheets, so the
 * retouched palettes carry through and nothing is baked until one is chosen.
 *
 * `tileZ` is the lift per tier. The cliff arm only closes at 6 (the band is
 * baked at that height); the other two follow the slider, which is the point:
 * the lift came down to 6 because a taller step read as a wall, and a slope
 * may be able to take it back up.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Sprite } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  generateIsland,
  IslandBoard,
  IsoIslandView,
  levelAt,
  loadIslandTileset,
  isoProject,
  ELEVATION_SURFACE_ROW,
  type IslandTileset,
} from '@/game/island';
import { bevelSet, cornerLifts, meanLift, rampOverlay } from '@/game/island/slopes';
import { HALF_W, HALF_H, TIER_LIFT } from '@/config/gridConfig';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { FOG_COLOR, FOG_ALPHA, HIGHLIGHT_COLOR } from '@/game/entities/Tile';
import { initTileTextures, getDiamondFill, getDiamondOutline } from '@/game/services/TileTextures';

const SEA = '#1eaac4';
const WIDTH = 960;
const HEIGHT = 540;

type Edge = 'cliff' | 'bevel' | 'ramp';

interface Args {
  edge: Edge;
  seed: string;
  width: number;
  height: number;
  tiers: number;
  land: number;
  rise: number;
  raggedness: number;
  tileZ: number;
  deco: boolean;
  grass: boolean;
  /** Zoom on the island; 0 fits it to the frame. */
  zoom: number;
  /** Shift the view, in screen px, to bring an edge under the lens. */
  panX: number;
  panY: number;
  /** The game's board on top: a rabbit, its reachable ring, click to walk. */
  board: boolean;
  /** The game's lid over every cell not yet walked. */
  fog: boolean;
}

/** Share of the lid a cell in the ring keeps — same as `Island/Playable board`. */
const RING_FOG_SHARE = 0.45;

/** The game's own diamond texture, so lids and ring match the real board. */
function diamond(color: number, alpha: number, outline = false): Sprite {
  const s = new Sprite(outline ? getDiamondOutline() : getDiamondFill());
  s.anchor.set(0.5);
  s.tint = color;
  s.alpha = alpha;
  return s;
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

/**
 * The shipped tileset with every ground tile bevelled: the five palettes,
 * the flat sets, and the elevation sheet's surface rows (the rock rim drawn
 * under a plateau's grass, which carries the same band).
 */
function bevelTileset(base: IslandTileset, lift: number): IslandTileset {
  const elevation = base.elevation.map((line) => line.slice());
  for (const row of Object.values(ELEVATION_SURFACE_ROW)) {
    elevation[row] = bevelSet([base.elevation[row]], lift)[0];
  }
  return {
    ...base,
    tierGrass: base.tierGrass.map((set) => bevelSet(set, lift)),
    flat: {
      grass: bevelSet(base.flat.grass, lift),
      sand: bevelSet(base.flat.sand, lift),
    },
    elevation,
  };
}

function Scene(args: Args) {
  const { edge, seed, width, height, tiers, land, rise, raggedness, tileZ, deco, grass, zoom, panX, panY } = args;
  const withBoard = args.board;
  const withFog = args.board && args.fog;
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        if (withBoard) await loadAllAssets();
        const base = await loadIslandTileset();
        tileset = edge === 'bevel' ? bevelTileset(base, tileZ) : base;
      }}
      setup={(stage, app) => {
        if (!tileset) return;
        if (withBoard) initTileTextures(app.renderer);
        const map = generateIsland({ seed, width, height, tiers, land, rise, raggedness });
        const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: tileZ };
        const island = new IsoIslandView({
          map,
          tileset,
          ground: 'tiered',
          deco,
          grass,
          sea: false,
          foam: false,
          decoShadows: false,
          decoScale: 0.4,
          slopes: edge === 'ramp',
          metrics,
        });
        stage.addChild(island.view);

        if (withBoard) {
          // The board, as `Island/Playable board` mounts it: lids inside the
          // terrain blocks, the ring in an overlay above the scenery, a rabbit
          // that walks where you click.
          const board = new IslandBoard(map, island.occupants());
          /** A cell's centre inside the island's container, at its tier. */
          const at = (x: number, y: number, onSurface = false) => {
            const tier = levelAt(map, x, y)
              + (onSurface && edge === 'ramp' ? meanLift(cornerLifts(map, x, y)) : 0);
            const p = isoProject(x + 0.5, y + 0.5, tier, metrics);
            return { x: p.x + island.originX, y: p.y + island.originY };
          };
          /**
           * A lid or a ring diamond, warped onto the cell's ramp: the lift is
           * in the pixels, and the sprite sits at the cell's flat centre like
           * the flat one did. A flat cell gets the plain texture back.
           */
          const flatPixels = new Map<number, HTMLCanvasElement>();
          const onRamp = (sprite: Sprite, x: number, y: number) => {
            if (edge !== 'ramp') return sprite;
            const lifts = cornerLifts(map, x, y);
            if (!(lifts[0] || lifts[1] || lifts[2] || lifts[3])) return sprite;
            let pixels = flatPixels.get(sprite.texture.uid);
            if (!pixels) {
              pixels = app.renderer.extract.canvas(sprite.texture) as HTMLCanvasElement;
              flatPixels.set(sprite.texture.uid, pixels);
            }
            const warped = rampOverlay(sprite.texture, pixels, lifts, tileZ, { w: metrics.w, h: metrics.h });
            sprite.texture = warped.texture;
            sprite.anchor.set(0.5, warped.anchorY);
            return sprite;
          };
          const overlay = new Container();
          overlay.zIndex = 1e6;
          island.view.addChild(overlay);
          island.view.sortableChildren = true;

          let rabbitCell = pickSpawn(board, map);
          const rabbit = new PlayerRabbit(0);
          rabbit.container.zIndex = 1e6 + 1;
          island.view.addChild(rabbit.container);

          const lids = new Map<string, Sprite>();
          const walked = new Set<string>();
          if (withFog) {
            for (let y = 0; y < map.height; y++) {
              for (let x = 0; x < map.width; x++) {
                if (levelAt(map, x, y) === 0) continue;
                const lid = onRamp(diamond(FOG_COLOR, FOG_ALPHA), x, y);
                if (island.mountVeil(x, y, lid, 2)) lids.set(`${x},${y}`, lid);
              }
            }
          }
          const shadeFog = (ring: Iterable<{ x: number; y: number }>) => {
            if (!lids.size) return;
            const offered = new Set<string>();
            for (const c of ring) offered.add(`${c.x},${c.y}`);
            for (const [k, lid] of lids) {
              lid.alpha = FOG_ALPHA * (walked.has(k) ? 0 : offered.has(k) ? RING_FOG_SHARE : 1);
            }
          };
          const place = () => {
            const p = at(rabbitCell.x, rabbitCell.y, true);
            rabbit.container.position.set(p.x, p.y);
            walked.add(`${rabbitCell.x},${rabbitCell.y}`);
          };
          place();
          const drawRing = () => {
            overlay.removeChildren().forEach((c) => c.destroy());
            const steps = board.stepsFrom(rabbitCell.x, rabbitCell.y);
            shadeFog(steps);
            for (const cell of steps) {
              const p = at(cell.x, cell.y);
              const g = onRamp(diamond(HIGHLIGHT_COLOR, 1, true), cell.x, cell.y);
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
        }

        const fit = Math.min(WIDTH / island.width, HEIGHT / island.height);
        const scale = zoom > 0 ? zoom : fit;
        island.view.scale.set(scale);
        island.view.position.set(
          (WIDTH - island.width * scale) / 2 + panX,
          (HEIGHT - island.height * scale) / 2 + panY,
        );

        const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
        app.ticker.add(ticker);
        return () => {
          app.ticker.remove(ticker);
          island.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Slopes',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    edge: 'ramp',
    seed: 'harbour-9',
    width: 24,
    height: 20,
    tiers: 3,
    land: 0.46,
    rise: 0.55,
    raggedness: 0.4,
    tileZ: TIER_LIFT,
    deco: true,
    grass: true,
    zoom: 1.75,
    panX: -160,
    panY: -60,
    board: true,
    fog: true,
  },
  argTypes: {
    edge: {
      control: 'inline-radio',
      options: ['cliff', 'bevel', 'ramp'],
      description: 'cliff = what ships, bevel = grass over the step, ramp = true slope.',
    },
    seed: { control: 'text' },
    width: { control: { type: 'range', min: 8, max: 40, step: 1 } },
    height: { control: { type: 'range', min: 8, max: 40, step: 1 } },
    tiers: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    land: { control: { type: 'range', min: 0.15, max: 0.85, step: 0.01 } },
    rise: { control: { type: 'range', min: 0.1, max: 0.9, step: 0.01 } },
    raggedness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    tileZ: {
      control: { type: 'range', min: 0, max: 18, step: 1 },
      description: 'Lift per tier, px. The cliff arm only closes at 6.',
    },
    zoom: { control: { type: 'range', min: 0, max: 4, step: 0.25 } },
    panX: { control: { type: 'range', min: -1500, max: 1500, step: 10 } },
    panY: { control: { type: 'range', min: -1500, max: 1500, step: 10 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** What ships today: a rock step at every tier boundary. */
export const Cliff: Story = { args: { edge: 'cliff' } };

/** The step's face painted as grass. Same geometry as `Cliff`. */
export const Bevel: Story = { args: { edge: 'bevel' } };

/** True ramps on the low side of every plateau. */
export const Ramp: Story = { args: { edge: 'ramp' } };

/** The ramps with the lift doubled — a slope can carry more height than a step. */
export const RampTall: Story = { args: { edge: 'ramp', tileZ: 12 } };

/** The bevel at the same taller lift, for the same comparison. */
export const BevelTall: Story = { args: { edge: 'bevel', tileZ: 12 } };
