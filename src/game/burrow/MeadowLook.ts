import { Container, Graphics, Sprite } from 'pixi.js';
import { burrowFor, burrowIndex, BURROW_COLS, BURROW_ROWS } from './board';
import { burrowBuilding } from './buildings';
import { burrowTileScreen } from './screen';
import { BURROW_HALF_W as W, BURROW_HALF_H as H } from '@/config/burrowConfig';
import { mulberry32, seedFrom } from '@/lib/game/rng';

export interface MeadowLook { flat: boolean; details: boolean; shadows: boolean; shadowLength: number; autumn: boolean }
export const MEADOW_LOOK: MeadowLook = { flat: true, details: true, shadows: true, shadowLength: .65, autumn: false };
const diamond = (g: Graphics, x: number, y: number, color: number) =>
  g.poly([x, y-H, x+W, y, x, y+H, x-W, y]).fill(color);

/** Optional visual study. Ground stays in the real terrain blocks, below gameplay overlays. */
export function mountMeadowLook(
  world: Container, seed: string, level: number | null | undefined,
  view: { mountVeil(tile: number, veil: Container, zIndex?: number): boolean },
  args: MeadowLook,
  board = {
    cols: BURROW_COLS, rows: BURROW_ROWS,
    index: burrowIndex, at: (tile: number) => burrowTileScreen(seed, tile),
    field: new Set(burrowFor(seed).field), home: { x: burrowBuilding(seed, level).x, y: burrowBuilding(seed, level).y },
  },
) {
  const grass = args.autumn ? 0xb2b665 : 0x9dbd71;
  const meadow = args.autumn ? 0xbfc477 : 0xabc87b;
  const dirt = 0xc9ac76;
  const soil = 0x94704d;
  const random = mulberry32(seedFrom(`${seed}:meadow-study`));
  const { field, home } = board;
  const grounds = new Map<number, Graphics>();
  const mask = new Graphics();
  mask.zIndex = -8;
  world.addChild(mask);
  const kind = (x: number, y: number) => {
    if (field.has(board.index(x, y))) return soil;
    // A gently winding lane from the southern meadow to the front door.
    const lane = home.x + Math.sin((y-home.y)*0.48)*1.5;
    if (y >= home.y && Math.abs(x-lane) < 0.85) return dirt;
    return x > 9 && y < 10 ? meadow : grass;
  };
  for (let y=0; y<board.rows; y++) for (let x=0; x<board.cols; x++) {
    const tile = board.index(x,y);
    const color = kind(x,y);
    const ground = new Graphics();
    ground.label = `meadow-ground-${tile}`;
    diamond(ground, 0, 0, color);
    if (!view.mountVeil(tile, ground, 1.5)) { ground.destroy(); continue; }
    grounds.set(tile, ground);
    const p = board.at(tile);
    diamond(mask, p.x, p.y, 0xffffff);
    if (!args.flat) { ground.visible = false; continue; }
    if (!args.details) continue;
    // Sparse blade clusters, never a full-tile noise texture.
    if (color === grass || color === meadow) {
      if (random() < 0.44) {
        const u = (random()-.5)*18, v = (random()-.5)*7;
        ground.poly([u-4,v, u-6,v-4, u-2,v-2, u-1,v-7, u+1,v-2, u+5,v-5, u+3,v+1])
          .fill(args.autumn ? 0x838e4f : 0x6f964e);
        ground.rect(u,v-5,1,4).fill(0xc5d78b);
      }
      if (random() < 0.10) {
        const u = (random()-.5)*20;
        ground.rect(u,0,1,4).fill(0x668749).rect(u-1,-1,3,2).fill(0xf5e7ac);
      }
      // Irregular grass teeth soften the edge of the neighbouring lane.
      for (const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
        if (kind(x+dx,y+dy) !== dirt && kind(x+dx,y+dy) !== soil) continue;
        const ex = (dx-dy)*W*.5, ey = (dx+dy)*H*.5;
        ground.poly([ex-5,ey,ex-2,ey-3,ex+2,ey,ex+5,ey+2,ex,ey+3]).fill(0x799c55);
      }
    } else if (color === soil) {
      for (let n=-1; n<=1; n++) ground.moveTo(-10+n*4,-3+n*3).lineTo(5+n*4,5+n*3).stroke({color:0x76583e,width:1});
    } else if (random() < .3) {
      ground.ellipse(2,1,3,1.5).fill(0xdccc9e);
    }
  }
  // Project existing sprite silhouettes away from the upper-right light.
  // This is a stylised projection, not a realtime lighting simulation.
  const shadowLayer = new Container();
  shadowLayer.label = 'meadow-cast-shadows';
  shadowLayer.eventMode = 'none';
  shadowLayer.zIndex = -9;
  shadowLayer.mask = mask;
  shadowLayer.alpha = args.shadows ? .21 : 0;
  world.addChild(shadowLayer);
  const projections: Array<{ source: Sprite; shadow: Sprite }> = [];
  for (const child of [...world.children]) {
    if (!(child instanceof Sprite) || child.height < 25 || !child.visible) continue;
    const shadow = new Sprite(child.texture);
    shadow.anchor.copyFrom(child.anchor);
    shadow.position.copyFrom(child.position);
    shadow.scale.set(child.scale.x, -child.scale.y * args.shadowLength);
    shadow.skew.x = -.78;
    shadow.tint = 0x304437;
    shadowLayer.addChild(shadow);
    projections.push({ source: child, shadow });
  }

  return {
    dig(tile: number) { grounds.get(tile)?.destroy(); grounds.delete(tile); },
    setVisible(visible: boolean) { shadowLayer.visible = visible; },
    update() {
      for (const { source, shadow } of projections) {
        shadow.visible = !source.destroyed && source.visible;
        if (!shadow.visible) continue;
        shadow.texture = source.texture;
        shadow.position.copyFrom(source.position);
        shadow.anchor.copyFrom(source.anchor);
        shadow.scale.set(source.scale.x, -source.scale.y * args.shadowLength);
      }
    },
    destroy() { shadowLayer.destroy({ children: true }); mask.destroy(); },
  };
}
