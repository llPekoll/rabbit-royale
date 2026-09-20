/**
 * THE RING'S SWEEP IS PACED BY THE LAP, NOT BY THE TILE.
 *
 * The light travels round the reachable ring one cell at a time, which reads
 * as motion while the ring is full — eight cells at a quarter-second each make
 * a two-second lap. On a SMALL ring the same rule is a strobe: the tutorial
 * corridor lights one cell, so that cell was blinking four times a second.
 * Paul, 2026-09-20: "ca blink hyper vite, faudrait manager la vitesse en
 * fonction du nombre de navigation tile affiche."
 *
 * The rule pinned here is the fix: stretch the per-tile step so a lap never
 * finishes faster than the floor, which leaves a full ring untouched and slows
 * only the rings small enough to flicker.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SCENE = readFileSync('src/game/scenes/IslandScene.ts', 'utf8');

/** The pace the scene computes, mirrored from its own source constants. */
function paceFor(lit: number): number {
  const step = Number(/const SWEEP_STEP_SECONDS = ([\d.]+);/.exec(SCENE)![1]);
  const floor = Number(/const SWEEP_MIN_LAP_SECONDS = ([\d.]+);/.exec(SCENE)![1]);
  return Math.max(step, floor / lit);
}

describe('the sweep', () => {
  it('computes its pace from how many tiles are lit', () => {
    expect(SCENE).toMatch(/SWEEP_MIN_LAP_SECONDS \/ ring\.length/);
  });

  it('never laps faster than the floor, however small the ring', () => {
    const floor = Number(/const SWEEP_MIN_LAP_SECONDS = ([\d.]+);/.exec(SCENE)![1]);
    for (const lit of [1, 2, 3, 4, 5, 6]) {
      expect(paceFor(lit) * lit, `${lit} lit`).toBeGreaterThanOrEqual(floor - 1e-9);
    }
  });

  it('leaves a full ring exactly as it was', () => {
    const step = Number(/const SWEEP_STEP_SECONDS = ([\d.]+);/.exec(SCENE)![1]);
    // Eight neighbours is the ordinary case, and its lap already clears the
    // floor — the change must not slow down normal play.
    expect(paceFor(8)).toBe(step);
  });

  it('gives a single lit tile a pace a player reads as breathing', () => {
    // A quarter-second blink is a strobe; anything at or above a second reads
    // as an invitation. This is the number the tutorial corridor gets.
    expect(paceFor(1)).toBeGreaterThanOrEqual(1);
  });
});
