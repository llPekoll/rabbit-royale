import type { Meta, StoryObj } from '@storybook/react-vite';
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createBurrowTerrain, type BurrowTerrainView } from '@/game/burrow/BurrowTerrain';
import { CarrotCrop } from '@/game/entities/CarrotCrop';
import { burrowFor, burrowColRow, burrowTier } from '@/game/burrow/board';
import { burrowTileScreen } from '@/game/burrow/screen';
import { BURROW_HALF_W, BURROW_HALF_H } from '@/config/burrowConfig';
import {
  FENCE_FOOT, FENCE_SPAN, FENCE_TEXTURE, type FenceSide,
} from '@/game/burrow/fence';

// The geometry now lives in `game/burrow/fence`, which is what the real board
// and the server's refusal both read. The story imports it rather than keeping
// the copy it was prototyped with: two walks of the same perimeter would drift
// on the first change, and one of the two would be the one that ships.
const FENCE = FENCE_TEXTURE;
type Side = FenceSide;
type Point = { x: number; y: number };
interface Edge { a: Point; b: Point; side: Side; tier: number; }
interface Args {
  view: 'garden' | 'modules';
  seed: string;
  entrance: Side | 'closed';
  fence: boolean;
  zoom: number;
  garden: number;
  level: number;
  wholeIsland: boolean;
  columns: number;
  rows: number;
}

// The module is placed by its two post feet, not its transparent image bounds.
// Mirroring changes the diagonal; never rotate the bitmap (posts stay upright).
// v2 is 192×128, exactly 1/8 of v1. Keep fractional source coordinates so
// reducing the bitmap does not change the fence's footprint or its joins.
const FOOT = FENCE_FOOT;
const SPAN = FENCE_SPAN;
function segment(parent: Container, a: Point, b: Point, depth: number) {
  if (a.y > b.y) [a, b] = [b, a];
  const s = new Sprite(Texture.from(FENCE));
  s.label = 'garden-fence-segment';
  s.texture.source.scaleMode = 'nearest';
  s.pivot.set(FOOT.x, FOOT.y);
  s.position.set(a.x, a.y);
  s.scale.set((b.x - a.x) / SPAN.x, (b.y - a.y) / SPAN.y);
  s.zIndex = depth;
  parent.addChild(s);
}

// Exposed cell edges also handle non-rectangular generated fields. The opening
// removes exactly one span, preserving the endpoint posts on adjacent spans.
function perimeter(cells: Array<Point & { tier: number }>): Edge[] {
  const occupied = new Set(cells.map(({ x, y }) => `${x},${y}`));
  const edges: Edge[] = [];
  for (const { x, y, tier } of cells) {
    const add = (dx: number, dy: number, side: Side, a: Point, b: Point) => {
      if (!occupied.has(`${x + dx},${y + dy}`)) edges.push({ a, b, side, tier });
    };
    add(0, -1, 'NE', { x: x - .5, y: y - .5 }, { x: x + .5, y: y - .5 });
    add(1, 0, 'SE', { x: x + .5, y: y - .5 }, { x: x + .5, y: y + .5 });
    add(0, 1, 'SW', { x: x - .5, y: y + .5 }, { x: x + .5, y: y + .5 });
    add(-1, 0, 'NW', { x: x - .5, y: y - .5 }, { x: x - .5, y: y + .5 });
  }
  return edges;
}

function withEntrance(edges: Edge[], side: Args['entrance']) {
  const candidates = edges.filter((edge) => edge.side === side);
  const opening = candidates[Math.floor(candidates.length / 2)];
  return edges.filter((edge) => edge !== opening);
}

function label(parent: Container, text: string, x: number, y: number) {
  const t = new Text({ text, style: { fontFamily: 'monospace', fontSize: 13, fill: '#e4e9cf' } });
  t.position.set(x, y);
  parent.addChild(t);
}

function Modules(args: Args) {
  return <PixiStage width={1040} height={790} background="#243c43"
    assets={{ 'garden-fence-preview': FENCE }} setup={(stage) => {
      label(stage, 'DIAGONALES · même module vu sur les quatre côtés', 24, 18);
      const project = ({ x, y }: Point) => ({ x: (x - y) * 22, y: (x + y) * 12 });
      const panel = (x: number, y: number, title: string, edges: Edge[], scale = 2.5) => {
        label(stage, title, x - 90, y - 72);
        const c = new Container();
        c.sortableChildren = true;
        c.position.set(x, y);
        c.scale.set(scale);
        stage.addChild(c);
        for (const e of edges) segment(c, project(e.a), project(e.b), e.a.x + e.a.y + e.b.x + e.b.y);
      };
      const square = perimeter([{ x: 0, y: 0, tier: 1 }]);
      (['NW', 'NE', 'SE', 'SW'] as Side[]).forEach((side, i) => {
        panel(130 + i * 260, 120, side, square.filter((e) => e.side === side));
      });
      label(stage, 'COINS · jonctions et poteaux communs', 24, 190);
      const corners: [string, Side[]][] = [
        ['Arrière', ['NW', 'NE']], ['Droite', ['NE', 'SE']],
        ['Avant', ['SE', 'SW']], ['Gauche', ['SW', 'NW']],
      ];
      corners.forEach(([name, sides], i) => panel(130 + i * 260, 290, name, square.filter((e) => sides.includes(e.side))));
      label(stage, 'ENCLOS · entrée sur chaque côté · dimensions dans les Controls', 24, 368);
      const cells = Array.from({ length: args.columns * args.rows }, (_, i) => ({
        x: i % args.columns - (args.columns - 1) / 2,
        y: Math.floor(i / args.columns) - (args.rows - 1) / 2, tier: 1,
      }));
      const edges = perimeter(cells);
      const fit = Math.min(1.7, 205 / ((args.columns + args.rows) * 22 + 20));
      (['NW', 'NE', 'SE', 'SW'] as Side[]).forEach((side, i) => {
        panel(130 + i * 260, 500, `Entrée ${side}`, withEntrance(edges, side), fit);
      });
      label(stage, 'RÉPÉTITION · alignement sur plusieurs cellules', 24, 620);
      const line = (axis: 'x' | 'y'): Edge[] => Array.from({ length: 5 }, (_, i) => ({
        a: { x: axis === 'x' ? i - 2.5 : 0, y: axis === 'y' ? i - 2.5 : 0 },
        b: { x: axis === 'x' ? i - 1.5 : 0, y: axis === 'y' ? i - 1.5 : 0 }, side: 'NE', tier: 1,
      }));
      panel(260, 710, '', line('x'), 1.8);
      panel(780, 710, '', line('y'), 1.8);
    }} />;
}

function Garden(args: Args) {
  // Prepare the real terrain off-stage; PixiStage owns its descendants only
  // after setup. An early unmount still disposes the pending terrain below.
  let terrain: BurrowTerrainView | undefined;
  let disposed = false;
  return <PixiStage width={1040} height={640} background="#16485a"
    prepare={async () => { await Promise.all([loadAllAssets(), Assets.load(FENCE)]); }}
    setup={(stage, app) => {
      initTileTextures(app.renderer);
      const world = new Container();
      world.sortableChildren = true;
      let crop: CarrotCrop | undefined;
      const tick = (t: { deltaMS: number }) => { terrain?.update(t.deltaMS); crop?.update(t.deltaMS); };
      void createBurrowTerrain(world, args.seed, args.level).then((result) => {
        if (disposed) { result.destroy(); world.destroy({ children: true }); return; }
        terrain = result;
        stage.addChild(world);
        const { field } = burrowFor(args.seed);
        const cells = field.map((tile) => {
          const { col, row } = burrowColRow(tile);
          return { x: col, y: row, tier: burrowTier(args.seed, tile), tile };
        });
        const edges = withEntrance(perimeter(cells), args.entrance);
        if (args.fence) for (const e of edges) {
          // Anchor to the field's real ground height (including terrace lift).
          const cell = cells.find((c) => c.tier === e.tier &&
            Math.abs(c.x - (e.a.x + e.b.x) / 2) <= .5 &&
            Math.abs(c.y - (e.a.y + e.b.y) / 2) <= .5)!;
          const centre = burrowTileScreen(args.seed, cell.tile);
          const project = (p: Point) => ({
            x: centre.x + ((p.x - cell.x) - (p.y - cell.y)) * BURROW_HALF_W,
            y: centre.y + ((p.x - cell.x) + (p.y - cell.y)) * BURROW_HALF_H,
          });
          segment(world, project(e.a), project(e.b),
            (e.a.x + e.a.y + e.b.x + e.b.y) * 8 + e.tier + .3);
        }
        crop = new CarrotCrop(world, Texture.from('/assets/carottes/carrote.png'), args.seed, args.level);
        crop.setProgress(args.garden);
        // Settle the crop immediately, so comparisons start with the selected
        // fullness rather than a different instant of the growth animation.
        for (let i = 0; i < 240; i++) crop.update(1000);
        const points = field.map((tile) => burrowTileScreen(args.seed, tile));
        const centre = {
          x: points.reduce((n, p) => n + p.x, 0) / points.length,
          y: points.reduce((n, p) => n + p.y, 0) / points.length,
        };
        if (args.wholeIsland) {
          const bounds = terrain.view.getLocalBounds();
          const scale = Math.min(940 / bounds.width, 530 / bounds.height);
          world.scale.set(scale);
          world.position.set(520 - (terrain.view.x + bounds.x + bounds.width / 2) * scale,
            335 - (terrain.view.y + bounds.y + bounds.height / 2) * scale);
        } else {
          world.scale.set(args.zoom);
          world.position.set(480 - centre.x * args.zoom, 350 - centre.y * args.zoom);
        }
        // The label also gives the runtime probe a reliable completion signal.
        world.label = 'garden-fence-ready';
        app.ticker.add(tick);
      }).catch((error: unknown) => {
        console.error(error);
        if (!disposed) label(stage, 'Impossible de charger le potager — voir la console.', 24, 40);
      });
      const header = new Graphics().rect(0, 0, 1040, 54).fill({ color: 0x142e38, alpha: .92 });
      header.zIndex = 99999;
      stage.addChild(header);
      label(header, `POTAGER · ${args.fence ? 'avec clôture' : 'sans clôture'} · ${args.entrance === 'closed' ? 'enclos fermé' : `entrée ${args.entrance}`}`, 22, 19);
      return () => {
        disposed = true;
        app.ticker.remove(tick);
        crop?.destroy();
        terrain?.destroy();
      };
    }} />;
}

const meta: Meta<Args> = {
  title: 'Burrow/Garden fence',
  render: (args) => <div>
    {args.view === 'modules' ? <Modules key={JSON.stringify(args)} {...args} /> : <Garden key={JSON.stringify(args)} {...args} />}
    <p style={{ color: '#adc2bc', font: '12px monospace', padding: '0 16px' }}>
      Prototype visuel · sprite issu du concept · orientations obtenues par miroir, caméra fixe.
      {' '}Le potager utilise le terrain et les carottes du jeu. Aucun achat ni collision ajoutés.
    </p>
  </div>,
  args: { view: 'garden', seed: 'player-1', entrance: 'SW', fence: true, zoom: 3,
    garden: 1, level: 1, wholeIsland: false, columns: 4, rows: 3 },
  argTypes: {
    view: { control: 'radio', options: ['garden', 'modules'] },
    seed: { control: 'select', options: ['player-1', 'player-2', 'player-3', 'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b'] },
    entrance: { control: 'radio', options: ['NW', 'NE', 'SE', 'SW', 'closed'] },
    zoom: { control: { type: 'range', min: 1, max: 5, step: .25 } },
    garden: { control: { type: 'range', min: 0, max: 1, step: .1 } },
    level: { control: { type: 'range', min: 1, max: 4, step: 1 } },
    columns: { control: { type: 'range', min: 2, max: 6, step: 1 }, if: { arg: 'view', eq: 'modules' } },
    rows: { control: { type: 'range', min: 2, max: 6, step: 1 }, if: { arg: 'view', eq: 'modules' } },
  },
};
export default meta;
type Story = StoryObj<Args>;
export const InGarden: Story = { name: 'Dans le potager' };
export const AllDirections: Story = { name: 'Toutes les orientations', args: { view: 'modules' } };
export const EntranceNW: Story = { args: { entrance: 'NW' } };
export const EntranceNE: Story = { args: { entrance: 'NE' } };
export const EntranceSE: Story = { args: { entrance: 'SE' } };
export const EntranceSW: Story = { args: { entrance: 'SW' } };
export const Closed: Story = { name: 'Enclos fermé', args: { entrance: 'closed' } };
export const EmptyGarden: Story = { name: 'Potager vide', args: { garden: 0 } };
export const WithoutFence: Story = { name: 'Sans barrière — comparaison', args: { fence: false } };
export const WholeIsland: Story = { name: 'Sur toute l’île', args: { wholeIsland: true } };
