/**
 * The burrow's cells are drawn at the BURROW's tile size.
 *
 * The diamond texture is baked once, from the island's grid (44x24 — see
 * TileTextures and gridConfig). The burrow's tile is 34x19. A sprite that takes
 * that texture and never rescales it therefore draws a cell a quarter too big:
 * the diamonds overlap their neighbours and stop lining up with the ground they
 * name, which is how the placement grid became unreadable in production while
 * every test still passed.
 *
 * Nothing about that is visible in a unit test of the config, so what is pinned
 * here is the SCENE's use of the texture: every diamond it builds must go
 * through the helper that rescales, and the scale itself must undo the bake's
 * inset rather than applying it twice.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { diamondScaleFor } from '../src/game/services/TileTextures';
import { HALF_W, HALF_H } from '../src/config/gridConfig';
import { BURROW_HALF_W, BURROW_HALF_H } from '../src/config/burrowConfig';

const SCENE = readFileSync(new URL('../src/game/scenes/BurrowScene.ts', import.meta.url), 'utf8');

describe('burrow tile size', () => {
  it('scales a baked diamond onto the tile it is asked for', () => {
    // The island's own size is the identity case: the texture was baked for it.
    const island = diamondScaleFor(HALF_W, HALF_H);
    expect(island.x).toBeCloseTo(1 / 0.88, 5);
    expect(island.y).toBeCloseTo(1 / 0.88, 5);
    // And the burrow's is smaller, in both axes, by the ratio of the tiles.
    const burrow = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
    expect(burrow.x / island.x).toBeCloseTo(BURROW_HALF_W / HALF_W, 5);
    expect(burrow.y / island.y).toBeCloseTo(BURROW_HALF_H / HALF_H, 5);
    expect(burrow.x).toBeLessThan(island.x);
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
