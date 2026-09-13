/**
 * The block world's ramps and rotation — the two things that draw a WRONG
 * PICTURE rather than throw: a ramp that climbs into nothing, or a turned
 * world whose slopes still point the way they did before the turn.
 */
import { describe, expect, it } from 'vitest';
import { generateIsland } from '@/game/island/generate';
import { DIR_STEP, planIsoWorld, rotateIsoWorld, tierAt, type IsoWorld } from '@/game/isoworld/terrain';

const island = (seed: string) => generateIsland({ seed, width: 34, height: 24, tiers: 4 });

function snapshot(world: IsoWorld) {
  return {
    width: world.width,
    height: world.height,
    level: Array.from(world.level),
    ramps: [...world.ramps.entries()].sort((a, b) => a[0] - b[0]),
    props: [...world.props.entries()].sort((a, b) => a[0] - b[0]),
  };
}

describe('planIsoWorld', () => {
  it('only puts a ramp where it climbs exactly one tier from level ground', () => {
    for (const seed of ['harbour-9', 'a', 'b', 'c', 'reef-2']) {
      const world = planIsoWorld(island(seed), { ramps: 1 });
      expect(world.ramps.size).toBeGreaterThan(0);
      for (const [i, ramp] of world.ramps) {
        const x = i % world.width;
        const y = (i / world.width) | 0;
        const tier = tierAt(world, x, y);
        const { dx, dy } = DIR_STEP[ramp.dir];
        expect(tier).toBeGreaterThan(0);
        expect(tierAt(world, x + dx, y + dy)).toBe(tier + 1);
        // The foot: plain ground at the ramp's own tier, never another ramp.
        expect(tierAt(world, x - dx, y - dy)).toBe(tier);
        expect(world.ramps.has((y - dy) * world.width + (x - dx))).toBe(false);
      }
    }
  });

  it('builds none at 0 and is the same island for the same seed', () => {
    expect(planIsoWorld(island('harbour-9'), { ramps: 0 }).ramps.size).toBe(0);
    const a = planIsoWorld(island('harbour-9'), { ramps: 0.4 });
    const b = planIsoWorld(island('harbour-9'), { ramps: 0.4 });
    expect(snapshot(a)).toEqual(snapshot(b));
  });
});

describe('rotateIsoWorld', () => {
  it('comes back to the same world after four quarter turns', () => {
    const world = planIsoWorld(island('harbour-9'), { ramps: 0.6 });
    expect(snapshot(rotateIsoWorld(world, 4))).toEqual(snapshot(world));
    expect(snapshot(rotateIsoWorld(world, -1))).toEqual(snapshot(rotateIsoWorld(world, 3)));
  });

  it('turns every ramp with its cell, so it still climbs onto the tier above', () => {
    const world = planIsoWorld(island('reef-2'), { ramps: 1 });
    for (let q = 1; q < 4; q++) {
      const turned = rotateIsoWorld(world, q);
      expect(turned.ramps.size).toBe(world.ramps.size);
      for (const [i, ramp] of turned.ramps) {
        const x = i % turned.width;
        const y = (i / turned.width) | 0;
        const { dx, dy } = DIR_STEP[ramp.dir];
        expect(tierAt(turned, x + dx, y + dy)).toBe(tierAt(turned, x, y) + 1);
      }
    }
  });
});

describe('corner mode', () => {
  const SEEDS = ['harbour-9', 'a', 'b', 'c', 'reef-2', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'];

  it('leaves no wall between two land tiers: every cell is flat or has a piece', () => {
    for (const seed of SEEDS) {
      for (const tiers of [2, 3]) {
        const map = generateIsland({ seed, width: 34, height: 24, tiers, rise: 0.7 });
        const world = planIsoWorld(map, { corners: true });
        for (let y = 0; y < world.height; y++) {
          for (let x = 0; x < world.width; x++) {
            const t = tierAt(world, x, y);
            if (t === 0) continue;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const n = tierAt(world, x + dx, y + dy);
                // Never two tiers at once, and the coast is always tier 1.
                expect(Math.abs(n - t) <= 1 || (n === 0 && t === 1)).toBe(true);
                if (n === 0) expect(t).toBe(1);
              }
            }
            // A raised corner that no piece covers would be drawn as a wall.
            const ramp = world.ramps.get(y * world.width + x);
            const raisedCorners = [0, 1, 2, 3].filter((c) => {
              const a = DIR_STEP[c as 0 | 1 | 2 | 3];
              const b = DIR_STEP[((c + 1) % 4) as 0 | 1 | 2 | 3];
              return (
                tierAt(world, x + a.dx, y + a.dy) > t ||
                tierAt(world, x + b.dx, y + b.dy) > t ||
                tierAt(world, x + a.dx + b.dx, y + a.dy + b.dy) > t
              );
            }).length;
            if (raisedCorners === 0) expect(ramp).toBeUndefined();
            else expect(ramp, `cell ${x},${y} of ${seed} with ${raisedCorners} raised corners`).toBeDefined();
          }
        }
      }
    }
  });

  it('keeps most of the island: regularising is a trim, not a demolition', () => {
    const map = generateIsland({ seed: 'harbour-9', width: 34, height: 24, tiers: 3 });
    const world = planIsoWorld(map, { corners: true });
    let before = 0;
    let after = 0;
    for (let i = 0; i < map.level.length; i++) {
      if (map.level[i] > 0) before++;
      if (world.level[i] > 0) after++;
    }
    expect(after).toBeGreaterThan(before * 0.9);
    expect(Math.max(...world.level)).toBe(3);
  });

  it('turns corner ramps with the world', () => {
    const world = planIsoWorld(generateIsland({ seed: 'reef-2', width: 34, height: 24, tiers: 3 }), { corners: true });
    const kinds = new Set([...world.ramps.values()].map((r) => r.kind));
    expect(kinds.has('inner')).toBe(true);
    expect(kinds.has('outer')).toBe(true);
    const turned = rotateIsoWorld(world, 1);
    // Every ramp still matches its corners after the turn: replan and compare.
    const replanned = planIsoWorld({ ...generateIsland({ seed: 'reef-2', width: 34, height: 24, tiers: 3 }), level: turned.level, width: turned.width, height: turned.height }, { corners: true });
    expect(snapshot({ ...turned, props: new Map() })).toEqual(snapshot({ ...replanned, props: new Map() }));
  });
});
