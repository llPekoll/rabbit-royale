/**
 * Block islands, from the isometric sandbox sheet.
 *
 * The island itself still comes from `generateIsland` — same seed, same tiers,
 * same knobs as the top-down workbench. This module adds what a block world
 * needs on top of it (ramps between tiers, props) and draws it.
 *
 *     const tileset = await loadIsoTileset();
 *     const map = generateIsland({ seed: 'harbour-9', tiers: 3 });
 *     const world = rotateIsoWorld(planIsoWorld(map, { ramps: 0.35 }), 1);
 *     stage.addChild(new IsoWorldView({ world, tileset }).view);
 */
export { planIsoWorld, rotateIsoWorld, tierAt, rampAt, propAt, touchesSea, DIR, DIR_STEP } from './terrain';
export type { IsoWorld, IsoWorldOptions, Ramp, RampKind, Prop, PropKind, Dir } from './terrain';

export { loadIsoTileset, ISO_SHEET_URL, BLOCK, CELL, MATERIALS } from './sheet';
export type { IsoTileset, Material, MaterialTiles } from './sheet';

export { IsoWorldView } from './IsoWorldView';
export type { IsoWorldViewOptions, IsoGround } from './IsoWorldView';
