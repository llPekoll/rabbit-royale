/**
 * The rendering budget for the Seeker.
 *
 * Three settings that cost nothing to get right and are invisible until a phone
 * is hot and the battery is flat — which is exactly the kind of thing that gets
 * "optimised" back out by someone who does not know why it was there.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../src/game/Application.ts', import.meta.url), 'utf8');
const CANVAS = readFileSync(new URL('../src/components/game-canvas.tsx', import.meta.url), 'utf8');

describe('pixel ratio', () => {
  it('is capped rather than taken from the device', () => {
    // The Seeker is ~460 PPI, so a native ratio of 3+ shades two to three times
    // the pixels for art drawn on a coarse grid and scaled nearest-neighbour —
    // the extra samples land inside the same flat blocks and cannot be seen.
    expect(APP).toMatch(/Math\.min\(\s*window\.devicePixelRatio[^)]*,\s*MAX_RESOLUTION\s*\)/);
    expect(APP).toMatch(/MAX_RESOLUTION\s*=\s*2\b/);
  });
});

describe('frame rate', () => {
  it('is pinned at 60 rather than following a 120Hz panel', () => {
    // Doubling the frames doubles the work for a game whose pieces move one
    // tile at a time on a 0.2s tween. Nobody can see it; the battery pays.
    expect(APP).toMatch(/ticker\.maxFPS\s*=\s*TARGET_FPS/);
    expect(APP).toMatch(/TARGET_FPS\s*=\s*60\b/);
  });
});

describe('the React / Pixi boundary', () => {
  it('never puts the game in React state', () => {
    // Pixi owns the canvas; React owns the menus and the HUD. A useState here
    // would re-render the component that holds the WebGL context.
    expect(CANVAS).not.toMatch(/\buseState\b/);
  });

  it('reads its callbacks through refs, so the scene cannot go stale', () => {
    // The mount effect deliberately does not re-run when a callback's identity
    // changes — rebuilding the board for that is the churn this boundary
    // exists to prevent — so the callbacks have to be read live.
    expect(CANVAS).toMatch(/moveRef\.current/);
    expect(CANVAS).toMatch(/readyRef\.current/);
  });

  it('rebuilds only when the island itself changes', () => {
    // Anything else in this dependency list drops the WebGL context mid-run.
    expect(CANVAS).toMatch(/\}, \[seed, playerId\]\);/);
  });
});
