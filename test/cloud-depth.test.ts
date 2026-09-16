/**
 * Who draws in front of whom, on the island.
 *
 * Three symptoms, one cause. The terrain is ONE container, so its `zIndex` is a
 * single number for the whole landscape — sea, cliffs, trees, rocks, sheep.
 * Parked under the board at -10 it buried its own sorting: every sprite inside
 * already carries `isoDepth(x, y, tier) + 1`, on exactly the scale the tiles
 * use, and the two were built to interleave. They never got the chance, which
 * is why a tree could not stand in front of a tile, why `fadeBehind` had
 * nothing to fade, and why raised tiles overlapped their neighbours.
 *
 * Source-read rather than rendered: standing up Pixi, a tileset and a WebGL
 * context to assert a handful of numbers is far more machinery than the
 * numbers are worth.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CLOUDS = read('../src/game/fx/Clouds.ts');
const TERRAIN = read('../src/game/services/TerrainBackground.ts');
const TILE = read('../src/game/entities/Tile.ts');
const ISO = read('../src/game/island/iso.ts');
const GRID = read('../src/config/gridConfig.ts');

describe('island layering', () => {
  it('puts the clouds in front of everything the board can reach', () => {
    // Tiles sort on tileDepth * 16 + tier, and tileDepth tops out at 30 on a
    // 16x16 grid — so the board alone climbs past 480. A tidy number just
    // above the effects (55, 60, 62) would sit UNDER most of the board.
    const z = CLOUDS.match(/const Z = ([0-9_]+);/);
    expect(z).not.toBeNull();
    expect(Number(z![1].replace(/_/g, ''))).toBeGreaterThan(480);
  });

  it('hands the standing art to the board container, not the terrain', () => {
    // The fix for a sheep drawn under the fog of its own cell: a container is
    // painted in ONE turn, so deco inside the terrain could only ever land
    // wholly in front of or wholly behind the tiles.
    expect(TERRAIN).toMatch(/decoLayer: container/);
    // ...and with no wrapper, which would be one sibling with one depth again.
    expect(TERRAIN).not.toMatch(/const deco = new Container\(\)/);
  });

  it('carries the deported sprites the shift that view gets for free', () => {
    expect(TERRAIN).toMatch(/island\.placeDeco\(/);
  });

  it('leaves the ground itself below the board', () => {
    expect(TERRAIN).toMatch(/island\.view\.zIndex = -10;/);
  });

  it('does not rely on insertion order inside a sorted container', () => {
    // addChildAt(view, 0) reads as "first, so behind" and a sorted container
    // ignores it entirely.
    expect(TERRAIN).not.toMatch(/addChildAt\(island\.view, 0\)/);
  });

  /**
   * The two depth scales MUST stay identical, or the interleave silently stops
   * working: the terrain would sort on one ruler and the board on another.
   */
  it('sorts terrain and tiles on the same ruler', () => {
    expect(ISO).toMatch(/return \(x \+ y\) \* 16 \+ tier;/);
    expect(TILE).toMatch(/tileDepth\(index\) \* 16 \+ tier/);
    // ...and that ruler's first term is the same quantity on both sides.
    expect(GRID).toMatch(/return col \+ row;/);
  });

  it('keeps height in the tie-break, so a raised tile clears its neighbour', () => {
    // tileDepth alone is col + row, which gives a plateau tile and a sea-level
    // one on the same diagonal an identical depth — the overlap seen when
    // walking up a tier.
    expect(TILE).toMatch(/\* 16 \+ tier/);
  });
});

/**
 * That the sky stays a sky.
 *
 * The frame used to get four bands: two hanging off the top edge and two more
 * parked under the bottom one, poking a sliver of puff back up over the board's
 * near corner. The bottom pair never read as weather — a cloud is something you
 * look UP at — so it is gone, and this guards against it creeping back the next
 * time someone decides the bottom of the frame looks empty. Source-read for the
 * same reason as the rest of this file.
 */
describe('the top of the sky', () => {
  it('only knows bands that hang off the top edge', () => {
    expect(CLOUDS).toMatch(/export type CloudBand = 'top' \| 'upper';/);
    expect(CLOUDS).toMatch(/const bands: CloudBand\[\] = \['top', 'upper'\];/);
  });

  it('parks every band ABOVE the frame', () => {
    // Both bands assign a NEGATIVE fraction of the height: the cloud sits over
    // the top edge and hangs the rest of itself into the margin. A positive one
    // is a band reaching back into the frame, over the tiles.
    const ys = [...CLOUDS.matchAll(/s\.y = rand\(\[([^\]]+)\]\)/g)].map((m) => m[1]);
    expect(ys.length).toBe(2);
    for (const y of ys) expect(y).toMatch(/^-h \* 0\.\d+, -h \* 0\.\d+$/);
  });

  it('keeps no machinery for measuring an overhang off the bottom', () => {
    // showBelow/PAINTED_TOP existed only to park the lower pair against the
    // frame's bottom edge. Left behind, they are an invitation to re-add it.
    expect(CLOUDS).not.toMatch(/showBelow/);
    expect(CLOUDS).not.toMatch(/PAINTED_TOP/);
  });

  it('re-solves the field when the design space is swapped', () => {
    // GAME_W/GAME_H flip on rotation; a field built in landscape and left alone
    // keeps parking its bands against the old height.
    expect(CLOUDS).toMatch(/resize\(width: number, height: number\): void/);
    const BURROW = read('../src/game/scenes/BurrowScene.ts');
    const ISLAND = read('../src/game/scenes/IslandScene.ts');
    expect(BURROW).toMatch(/clouds\?\.resize\(GAME_W, GAME_H\)/);
    expect(ISLAND).toMatch(/clouds\?\.resize\(this\.canvasW, this\.canvasH\)/);
  });
});
