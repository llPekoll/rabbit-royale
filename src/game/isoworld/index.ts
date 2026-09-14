/**
 * Block islands, from the isometric block sheets — pixel or smooth.
 *
 * The island itself still comes from `generateIsland` — same seed, same tiers,
 * same knobs as the top-down workbench. This module adds what a block world
 * needs on top of it (ramps between tiers, props) and draws it.
 *
 *     const tileset = await loadIsoTileset('smooth');
 *     const map = generateIsland({ seed: 'harbour-9', tiers: 3 });
 *     const world = rotateIsoWorld(planIsoWorld(map, { ramps: 0.35 }), 1);
 *     stage.addChild(new IsoWorldView({ world, tileset }).view);
 */
export {
  planIsoWorld,
  rotateIsoWorld,
  regularize,
  rampHighSides,
  rampCorners,
  tierAt,
  rampAt,
  propAt,
  touchesSea,
  DIR,
  DIR_STEP,
} from './terrain';
export type { IsoWorld, IsoWorldOptions, Ramp, RampKind, Prop, PropKind, Dir, DecorChoice } from './terrain';
export { loadDecor, DECOR_WEIGHTS, SHEET_CELL } from './decor';
export type { DecorSet, DecorPiece } from './decor';

export { loadIsoTileset, ISO_SHEET_URL, ISO_STYLES, SHEETS, BLOCK, CELL, MATERIALS } from './sheet';
export type { IsoTileset, IsoStyle, Material, MaterialTiles } from './sheet';

export { IsoWorldView } from './IsoWorldView';
export type { IsoWorldViewOptions, IsoGround } from './IsoWorldView';
