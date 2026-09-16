/**
 * The burrow's placement hints: a ghost bomb under a mouse, a pressing glove
 * for a finger. The motion itself is verified live (it is a Pixi stage); what
 * is pinned here is the logic that decides where and for whom, and the
 * teardown paths a regression would quietly leave behind.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nearestTo } from '../src/game/ui/PlacementHints';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SCENE = read('../src/game/scenes/BurrowScene.ts');
const HINTS = read('../src/game/ui/PlacementHints.ts');

describe('nearestTo', () => {
  it('picks the candidate closest to the point', () => {
    const cells = [{ tile: 1, x: 0, y: 0 }, { tile: 2, x: 48, y: 52 }, { tile: 3, x: 100, y: 100 }];
    expect(nearestTo(cells, { x: 50, y: 50 })?.tile).toBe(2);
  });

  it('returns null when there is nothing to press', () => {
    expect(nearestTo([], { x: 0, y: 0 })).toBeNull();
  });
});

describe('placement hints in the burrow', () => {
  it('previews on hover for a MOUSE only', () => {
    // A finger sends pointerover on its way to a tap; a ghost under it is noise.
    expect(SCENE).toMatch(/e\.pointerType !== 'mouse'/);
  });

  it('shows the glove only where there is no hover at all', () => {
    expect(HINTS).toMatch(/\(hover: none\) and \(pointer: coarse\)/);
    expect(SCENE).toMatch(/!isTouchPrimary\(\)/);
  });

  it('never lets a hint take the tap it is asking for', () => {
    // Ghost holder and glove hand are both pointer-transparent.
    expect((HINTS.match(/eventMode = 'none'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('honours reduced motion instead of looping', () => {
    expect(HINTS).toMatch(/prefers-reduced-motion: reduce/);
    expect(SCENE).toMatch(/prefersReducedMotion\(\)/);
  });

  it('dismisses the glove on the first toggle and tears everything down', () => {
    expect(SCENE).toMatch(/this\.dismissGlove\(\);[\s\S]{0,400}this\.data\.onToggle\(i/);
    // Before the ground is rebuilt (a raid) and on destroy.
    //
    // BEFORE, not immediately before: other bookkeeping that also dies with
    // the terrain is torn down in the same run of statements (the trap sprites
    // mounted inside its blocks — see trap-persistence), so this asserts the
    // ORDER the two calls happen in rather than that they are adjacent lines.
    // What matters is that no hint is left tweening a destroyed block.
    expect(SCENE).toMatch(/this\.teardownPlacementHints\(\);[\s\S]{0,1200}?this\.terrain\?\.destroy\(\)/);
    expect(SCENE).toMatch(/destroy\(\): void \{\s*this\.teardownPlacementHints\(\)/);
  });

  it('sizes the ghost exactly like the buried bomb', () => {
    expect(SCENE).toMatch(/new GhostBomb\(tex, trapBombScale\(tex\), BOMB_ANCHOR_Y\)/);
    expect(SCENE).toMatch(/const k = trapBombScale\(bombTex\)/);
  });
});
