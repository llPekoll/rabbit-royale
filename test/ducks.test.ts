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
   * The art faces down-left in three-quarter view, so the only directions in
   * which it swims FORWARD are that one and its mirror: map steps (0,1) and
   * (1,0). With the straight projection here those are bearings of 90 and 0
   * degrees, and the sprite flip has to match — mirrored for (1,0).
   *
   * A duck can never turn round (the art has no back), so it dives when it
   * runs out of water ahead and surfaces elsewhere. That is a JUMP between two
   * frames, not a bearing, and is skipped here; the "never on land" test above
   * covers where it comes up.
   */
  it('swims only forward: down-left as drawn, or down-right mirrored', () => {
    const flock = createDucks(FRAMES, 24, 24, isWater, at, seeded(3), {
      count: 4, speed: 3, range: 9, restMs: 0,
    });
    let legs = 0;
    const last = flock.view.children.map((s) => ({ x: s.x, y: s.y }));
    for (let frame = 0; frame < 1200; frame++) {
      flock.update(16);
      flock.view.children.forEach((s, i) => {
        const dx = s.x - last[i].x;
        const dy = s.y - last[i].y;
        last[i] = { x: s.x, y: s.y };
        const d = Math.hypot(dx, dy);
        // A dive: it surfaced somewhere else this frame.
        if (d > 5) return;
        if (d > 0.01) {
          const bearing = Math.atan2(dy, dx);
          const step = Math.abs(bearing) < 1e-6 ? [1, 0] : Math.abs(bearing - Math.PI / 2) < 1e-6 ? [0, 1] : null;
          expect(step, `frame ${frame}: a duck swam sideways, bearing ${bearing}`).not.toBeNull();
          expect(Math.sign(s.scale.x), `frame ${frame}: a duck swam backwards`)
            .toBe(step![0] === 1 ? -1 : 1);
          legs++;
        }
      });
    }
    expect(legs).toBeGreaterThan(0);
    flock.destroy();
  });

  it('dives and comes up on open water when it cannot go forward', () => {
    // A thin channel of water with the island's south and east shores right
    // below: after a few legs every duck runs out of water ahead.
    const flock = createDucks(FRAMES, 24, 24, isWater, at, seeded(11), {
      count: 6, speed: 4, range: 9, restMs: 0, diveMs: 100,
    });
    let dives = 0;
    const last = flock.view.children.map((s) => ({ x: s.x, y: s.y }));
    for (let frame = 0; frame < 3000; frame++) {
      flock.update(16);
      flock.view.children.forEach((s, i) => {
        if (Math.hypot(s.x - last[i].x, s.y - last[i].y) > 5) {
          dives++;
          expect(isWater(Math.floor(s.x / 10), Math.floor(s.y / 10))).toBe(true);
        }
        last[i] = { x: s.x, y: s.y };
      });
    }
    expect(dives, 'no duck ever dived — they would be stuck against the shore').toBeGreaterThan(0);
    flock.destroy();
  });

  it('is never rotated, only flipped to face the way it swims', () => {
    const flock = createDucks(FRAMES, 24, 24, isWater, at, seeded(5), {
      count: 4, speed: 3, range: 9, restMs: 0, scale: 0.8,
    });
    for (let frame = 0; frame < 600; frame++) {
      flock.update(16);
      for (const s of flock.view.children) {
        expect(s.rotation).toBe(0);
        expect(Math.abs(s.scale.x)).toBeCloseTo(0.8, 5);
        expect(s.scale.y).toBeCloseTo(0.8, 5);
      }
    }
    flock.destroy();
  });
});
