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
