/**
 * The burrow's cells are drawn at the BURROW's tile size.
 *
 * The diamond texture is baked once, from the island's grid (44x24 — see
 * TileTextures and gridConfig). A sprite that takes that texture and never
 * rescales it draws a cell at whatever size the bake happened to use: let the
 * two boards' tiles drift apart again and the diamonds overlap their
 * neighbours and stop lining up with the ground they name, which is how the
 * placement grid became unreadable in production while every test passed.
 *
 * The two tiles are equal TODAY, so the rescale is the identity and the bug
 * cannot bite. That is exactly why the helper still has to be used everywhere:
 * the day either board's diamond moves, the scene keeps working.
 *
 * Nothing about that is visible in a unit test of the config, so what is pinned
 * here is the SCENE's use of the texture: every diamond it builds must go
 * through the helper that rescales, and the scale itself must undo the bake's
 * inset rather than applying it twice.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { diamondScaleFor } from '../src/game/services/TileTextures';
import { HALF_W, HALF_H, TIER_LIFT } from '../src/config/gridConfig';
import { BURROW_HALF_W, BURROW_HALF_H, BURROW_TIER_LIFT } from '../src/config/burrowConfig';

const SCENE = readFileSync(new URL('../src/game/scenes/BurrowScene.ts', import.meta.url), 'utf8');

describe('burrow tile size', () => {
  it('scales a baked diamond onto the tile it is asked for', () => {
    // The island's own size is the identity case: the texture was baked for it,
    // inset and all. The 0.88 inset is KEPT rather than divided out — it is the
    // hairline between neighbouring cells, and it is how the island's board
    // reads. Diamonds that touch edge to edge look like a mesh laid over the
    // art; inset ones read as separate tiles you choose between.
    const island = diamondScaleFor(HALF_W, HALF_H);
    expect(island.x).toBeCloseTo(1, 5);
    expect(island.y).toBeCloseTo(1, 5);
    // And the burrow's scales by the ratio of the tiles, whatever that ratio
    // is. Asserting a DIRECTION here (that the burrow comes out smaller) is
    // what this test used to do, and it pinned an accident: the two boards
    // carried different diamonds only because nobody had made them agree.
    const burrow = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
    expect(burrow.x / island.x).toBeCloseTo(BURROW_HALF_W / HALF_W, 5);
    expect(burrow.y / island.y).toBeCloseTo(BURROW_HALF_H / HALF_H, 5);
  });

  it('draws the burrow on the island\'s diamond, so one set of art serves both', () => {
    // The reason this is pinned rather than left to the two config files:
    // every tile, cliff face and prop in the game is drawn for ONE diamond.
    // Split these numbers again and the art has to be drawn twice, at a 10%
    // difference no artist can eyeball — which is the bug this pins shut.
    expect(BURROW_HALF_W).toBe(HALF_W);
    expect(BURROW_HALF_H).toBe(HALF_H);
    expect(BURROW_TIER_LIFT).toBe(TIER_LIFT);
  });

  it('builds every diamond in the scene through the sized helper', () => {
    // One raw `new Sprite(getDiamondOutline())` is allowed: the helper itself.
    // Any other is a cell drawn at the island's size.
    const raw = SCENE.match(/new Sprite\(getDiamondOutline\(\)\)/g) ?? [];
    expect(raw.length).toBe(1);
    // And the helper must actually rescale, not merely wrap the constructor.
    expect(SCENE).toMatch(/diamondScaleFor\(BURROW_HALF_W, BURROW_HALF_H\)/);
  });

  it('animates the blast relative to the tile, not to an absolute scale', () => {
    // The diamond is pre-scaled now, so a tween to an absolute 2.2 would snap
    // it back to the island's size on the blast's first frame.
    expect(SCENE).toMatch(/x: blast\.scale\.x \* 2\.2/);
    expect(SCENE).not.toMatch(/gsap\.to\(blast\.scale, \{ x: 2\.2/);
  });
});
