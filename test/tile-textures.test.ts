/**
 * The diamond textures, and the bug that keeps coming back.
 *
 * Symptom, both times: a story looks right on the FIRST visit and draws nothing
 * on every visit after it. Not a render bug — a lifetime one.
 *
 * `fillTex` and `outlineTex` live in module scope, so they outlive the
 * Application that baked them. Storybook destroys the whole renderer between
 * stories, which tears down the GPU resources behind those textures — but the
 * module variables still point at them, and a Texture in that state often
 * reports `destroyed === false`. Asking the texture whether it is alive gets a
 * confident wrong answer.
 *
 * The fix that did not hold was `if (fillTex) return`; the one that did not
 * hold either was `!fillTex.destroyed`. What cannot be fooled is identity: was
 * this baked by the renderer we are drawing with?
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/game/services/TileTextures.ts', import.meta.url), 'utf8');

describe('tile textures survive a renderer swap', () => {
  it('remembers which renderer baked them', () => {
    expect(SRC).toMatch(/let bakedBy: Renderer \| null = null;/);
    expect(SRC).toMatch(/bakedBy = renderer;/);
  });

  it('re-bakes when the renderer is a different one', () => {
    // The identity check is the load-bearing half: `destroyed` alone is what
    // let the bug back in.
    expect(SRC).toMatch(/bakedBy === renderer/);
  });

  it('does not trust `destroyed` on its own', () => {
    const guard = SRC.slice(SRC.indexOf('export function initTileTextures'));
    const early = guard.slice(0, guard.indexOf('return;'));
    // Whatever else it checks, the renderer has to be part of it.
    expect(early).toMatch(/bakedBy/);
  });

  it('frees the old pair instead of leaking one per visit', () => {
    expect(SRC).toMatch(/fillTex\.destroy\(true\)/);
    expect(SRC).toMatch(/outlineTex\.destroy\(true\)/);
  });
});
