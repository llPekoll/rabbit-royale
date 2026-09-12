/**
 * A duck must never be seen on the land.
 *
 * This is the bug the first version shipped with: only the DESTINATION was
 * tested, so a duck took the straight line between two patches of open sea and
 * swam under the island — it surfaced sitting on top of a rock. A test is the
 * right place for it because the failure is intermittent by nature (it needs
 * the right pair of waypoints) and easy to miss by eye.
 */
import { describe, expect, it } from 'vitest';
import { createDucks } from '../src/game/fx/Ducks';

/** A stand-in for a Pixi texture; `createDucks` only ever assigns it. */
const FRAMES = [{}, {}, {}] as never[];

/** A square island in the middle of a 24x24 sea. */
const isWater = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < 24 && y < 24 && !(x >= 8 && x < 16 && y >= 8 && y < 16);

/** Straight projection: the test cares about map space, not the diamond. */
const at = (x: number, y: number) => ({ x: x * 10, y: y * 10 });

/** A deterministic generator, so a failure can be reproduced exactly. */
function seeded(seed: number): () => number {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

describe('ducks', () => {
  it('never swims onto the land, however long it paddles', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const flock = createDucks(FRAMES, 24, 24, isWater, at, seeded(seed), {
        count: 8, speed: 3, range: 9, restMs: 200,
      });
      // Long enough for every duck to cross the map several times, at a frame
      // length the browser actually produces.
      for (let frame = 0; frame < 4000; frame++) {
        flock.update(16);
        for (const sprite of flock.view.children) {
          const x = Math.floor(sprite.x / 10);
          const y = Math.floor(sprite.y / 10);
          expect(
            isWater(x, y),
            `seed ${seed}, frame ${frame}: a duck is on land at ${x},${y}`,
          ).toBe(true);
        }
      }
      flock.destroy();
    }
  });

  it('actually gets somewhere rather than sitting still', () => {
    const flock = createDucks(FRAMES, 24, 24, isWater, at, seeded(7), {
      count: 4, speed: 3, range: 9, restMs: 200,
    });
    const start = flock.view.children.map((s) => ({ x: s.x, y: s.y }));
    for (let frame = 0; frame < 600; frame++) flock.update(16);
    const moved = flock.view.children.filter(
      (s, i) => Math.hypot(s.x - start[i].x, s.y - start[i].y) > 10,
    ).length;
    expect(moved, 'no duck travelled a whole cell in ten seconds').toBeGreaterThan(0);
    flock.destroy();
  });

  /**
   * The heading turns toward the target a little at a time, so a corner comes
   * out rounded. If it ever snapped straight onto the bearing the track would
   * be a polyline, which is what reads as a machine following waypoints.
   */
  it('turns gradually, so its track is a curve', () => {
    const flock = createDucks(FRAMES, 24, 24, isWater, at, seeded(3), {
      count: 1, speed: 3, range: 9, restMs: 0, turn: 1.2,
    });
    let worst = 0;
    let prev: number | null = null;
    let last = { x: flock.view.children[0].x, y: flock.view.children[0].y };
    for (let frame = 0; frame < 1200; frame++) {
      flock.update(16);
      const s = flock.view.children[0];
      const dx = s.x - last.x;
      const dy = s.y - last.y;
      if (Math.hypot(dx, dy) > 0.01) {
        const bearing = Math.atan2(dy, dx);
        if (prev !== null) {
          const d = Math.abs(Math.atan2(Math.sin(bearing - prev), Math.cos(bearing - prev)));
          worst = Math.max(worst, d);
        }
        prev = bearing;
      }
      last = { x: s.x, y: s.y };
    }
    // One frame at turn=1.2 rad/s is ~0.02 rad; allow generous slack for the
    // frame where a new leg is chosen, but nothing like an instant reversal.
    expect(worst, 'the duck snapped onto a new bearing instead of turning').toBeLessThan(0.5);
    flock.destroy();
  });
});
