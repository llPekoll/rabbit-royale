/**
 * Tile islands, from the Tiny Swords terrain pack.
 *
 * Three pieces that stay apart on purpose: `generate` makes a grid of terrain
 * tiers from a seed and knows nothing about pixels, `autotile` turns a cell's
 * neighbours into a sheet coordinate and knows nothing about the map, and
 * `IslandView` is the only part that touches Pixi. A map can therefore be built
 * and asserted on the server, and drawn later, or not at all.
 *
 *     const tileset = await loadIslandTileset();
 *     const map = generateIsland({ seed: 'harbour-9', tiers: 3 });
 *     const island = new IslandView({ map, tileset });
 *     stage.addChild(island.view);
 *     app.ticker.add((t) => island.update(t.deltaMS));
 */
export { generateIsland, levelAt, atOrAbove, southEdges } from './generate';
export type { IslandMap, IslandOptions } from './generate';

export { blobCol, blobRow, edgeMask, elevationWallRow, ELEVATION_SURFACE_ROW, ELEVATION_WALL_STACK_ROW } from './autotile';
export type { BlobIndex, EdgeMask, RegionTest } from './autotile';

export { loadIslandTileset, TILE, ISLAND_SHEETS, propUrl, seaRockUrl, PROP_COUNT, SEA_ROCK_COUNT } from './tileset';
export type { IslandTileset, GroundKind, FootSprite } from './tileset';

export { IslandView } from './IslandView';
export type { IslandViewOptions } from './IslandView';
