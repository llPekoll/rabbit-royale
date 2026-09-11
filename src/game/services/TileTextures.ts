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
  // Re-bake when the cached textures belong to a renderer that is GONE.
  //
  // These live in module scope and so outlive the Application that made them.
  // Storybook destroys the whole renderer between stories, which destroys
  // every texture it generated — but the variables here still hold those dead
  // objects, so a plain `if (fillTex) return` handed the next story textures
  // with no GPU source behind them. The tiles then drew as nothing at all:
  // the fog, the highlight and the blink silently vanished, and only on a
  // SECOND visit to a story, which is what made it look like a phantom.
  //
  // `destroyed` is the honest question to ask — not whether we have a texture,
  // but whether the one we have can still be drawn.
  if (fillTex && outlineTex && !fillTex.destroyed && !outlineTex.destroyed) return;

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

/**
 * The scale a diamond sprite needs to sit on a tile of a given size.
 *
 * The textures above are baked ONCE, at the island's tile size, and the burrow
 * uses its own (34x19 against 44x24). A sprite left at its natural size
 * therefore draws the island's diamond over the burrow's grid: the cells
 * overlap their neighbours and no longer line up with the ground they name.
 *
 * The 0.88 inset is DELIBERATELY kept rather than divided out. It is what
 * leaves a hairline between neighbouring cells, and it is how the island's
 * board reads — a grid whose diamonds touch edge to edge looks like a mesh
 * laid over the art, where inset ones read as separate tiles you pick between.
 * The burrow should look like the same game as the farm.
 */
export function diamondScaleFor(halfW: number, halfH: number): { x: number; y: number } {
  return { x: halfW / HALF_W, y: halfH / HALF_H };
}
