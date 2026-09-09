import { Graphics, Texture, type Renderer } from 'pixi.js';
import { HALF_W, HALF_H } from '@/config/gridConfig';

const DW = HALF_W * 0.88;
const DH = HALF_H * 0.88;

let fillTex: Texture | null = null;
let outlineTex: Texture | null = null;

/** Bake the tile diamond into low-res, non-antialiased textures so the
 *  fog / highlight / blink / flash overlays inherit the same chunky
 *  nearest-neighbor scaling as the rest of the pixel art (which is loaded
 *  with `scaleMode: 'nearest'` in AssetLoader). Without this, the diamonds
 *  were drawn as Graphics polygons whose edges are GPU-rasterized smooth,
 *  visually clashing with the upscaled pixel sprites around them.
 *
 *  Two textures: a solid white fill, and a fill+stroke combo. Both are
 *  tinted at use-time so a single bake covers every color variant. */
export function initTileTextures(renderer: Renderer): void {
  if (fillTex && outlineTex) return;

  const fillG = new Graphics()
    .poly([0, -DH, DW, 0, 0, DH, -DW, 0])
    .fill(0xffffff);
  fillTex = renderer.generateTexture({
    target: fillG,
    resolution: 1,
    antialias: false,
  });
  fillTex.source.scaleMode = 'nearest';
  fillG.destroy();

  // Outline = 30% fill + 2px stroke, both white. Tinted gold for the
  // reachable-neighbour highlight, red for the killer-mine highlight.
  const outlineG = new Graphics()
    .poly([0, -DH, DW, 0, 0, DH, -DW, 0])
    .fill({ color: 0xffffff, alpha: 0.3 })
    .poly([0, -DH, DW, 0, 0, DH, -DW, 0])
    .stroke({ color: 0xffffff, width: 2 });
  outlineTex = renderer.generateTexture({
    target: outlineG,
    resolution: 1,
    antialias: false,
  });
  outlineTex.source.scaleMode = 'nearest';
  outlineG.destroy();
}

export function getDiamondFill(): Texture {
  if (!fillTex) throw new Error('initTileTextures() not called');
  return fillTex;
}

export function getDiamondOutline(): Texture {
  if (!outlineTex) throw new Error('initTileTextures() not called');
  return outlineTex;
}
