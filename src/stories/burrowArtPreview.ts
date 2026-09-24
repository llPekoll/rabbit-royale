import { Assets, Rectangle, Texture } from 'pixi.js';
import { BURROW_HALF_W } from '@/config/burrowConfig';
import type { BurrowArtPreview } from '@/game/burrow/BurrowTerrain';

// Painted by `tools/paint_burrows.py`, retouched in `art-source/burrows/burrows.aseprite`.
const URL = '/assets/buildings/burrow-levels.png?v=5x96x112';
// Five 96 × 112 frames side by side. Each is painted at game resolution on a
// 2 × 2 cell footprint (88 × 48) whose centre sits at (48, 85).
const FRAME_W = 96;
const FRAME_H = 112;
const FOOTPRINT_W = 88;
// The scene stands the house on its footprint's centre.
const FOOTPRINT_CENTRE_Y = 85;

let textures: Texture[] | undefined;

export async function loadBurrowArtPreview() {
  const sheet = await Assets.load<Texture>(URL);
  sheet.source.scaleMode = 'nearest';
  sheet.source.autoGenerateMipmaps = false;
  textures ??= [0, 1, 2, 3, 4].map((i) => new Texture({
    source: sheet.source, frame: new Rectangle(i * FRAME_W, 0, FRAME_W, FRAME_H),
  }));
}

export const burrowArtPreview: BurrowArtPreview = (level) => {
  if (!textures) throw new Error('Load burrow art before mounting the scene');
  const index = Math.max(0, Math.min(4, Math.floor(level || 1) - 1));
  return {
    texture: textures[index],
    scale: BURROW_HALF_W * 4 / FOOTPRINT_W,
    anchorY: FOOTPRINT_CENTRE_Y / FRAME_H,
  };
};
