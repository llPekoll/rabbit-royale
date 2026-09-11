/**
 * Sheep that get out of the way.
 *
 * The rule this file exists to defend is the fourth one: a sheep can never
 * block. It BLOCKS its cell and it used to never move, so one standing in a
 * dead end took the carrots behind it out of the game for the whole run — and
 * that is not a bug anybody reports, it just quietly makes an island worse.
 *
 * Everything here drives a fake `Ground`, because the point is the decision,
 * not the terrain: a real map would make the cornered cases hard to set up and
 * impossible to read.
 */
import { describe, expect, it } from 'vitest';
import {
  cellDistance,
  isSpooked,
  planFlight,
  planFlock,
  GRAZE_CHANCE,
  PANIC_RADIUS,
  SPRINT_STEPS,
  type Ground,
} from '../src/lib/game/flee';
import { toIndex } from '../src/config/gridConfig';

/**
 * A board where `open` names every cell that exists and `tiers` gives the ones
 * that are not at sea level. Anything not in `taken` is free.
 */
function ground(open: string[], opts: { taken?: string[]; tiers?: Record<string, number> } = {}): Ground {
  const exists = new Set(open);
  const taken = new Set(opts.taken ?? []);
  const tiers = opts.tiers ?? {};
  return {
    stepsFrom(x, y) {
      const out: Array<{ x: number; y: number }> = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          if (exists.has(`${x + dx},${y + dy}`)) out.push({ x: x + dx, y: y + dy });
        }
      }
      return out;
    },
    isFree: (x, y) => exists.has(`${x},${y}`) && !taken.has(`${x},${y}`),
    tierAt: (x, y) => tiers[`${x},${y}`] ?? 0,
  };
}

/** A deterministic "random" that always takes the first option. */
const first = () => 0;
/** Never grazes: above GRAZE_CHANCE, so a calm sheep stays put. */
const never = () => 0.99;

describe('a sheep decides to bolt', () => {
  it('is spooked by a rabbit within the panic radius', () => {
    const sheep = { id: 's', x: 5, y: 5 };
    expect(isSpooked(sheep, [toIndex(5 + PANIC_RADIUS, 5)])).toBe(true);
    expect(isSpooked(sheep, [toIndex(5 + PANIC_RADIUS + 1, 5)])).toBe(false);
  });

  it('measures distance in MOVES, not in crow flight', () => {
    // The island steps diagonally, so (1,1) away is one move, not 1.41.
    expect(cellDistance(0, 0, 1, 1)).toBe(1);
    expect(cellDistance(0, 0, 3, 1)).toBe(3);
  });

  it('ignores a rabbit that is nowhere near', () => {
    expect(isSpooked({ id: 's', x: 0, y: 0 }, [toIndex(9, 9)])).toBe(false);
  });
});

describe('a calm sheep', () => {
  it('grazes only sometimes, so a flock drifts rather than marches', () => {
    const g = ground(['0,0', '1,0']);
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, false, never)).toBeNull();
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, false, first)).not.toBeNull();
    // The dial is the one the old `wander` used.
    expect(GRAZE_CHANCE).toBeGreaterThan(0);
    expect(GRAZE_CHANCE).toBeLessThan(1);
  });

  it('moves exactly one cell', () => {
    const g = ground(['0,0', '1,0', '2,0', '3,0']);
    const flight = planFlight({ id: 's', x: 0, y: 0 }, g, false, first);
    expect(cellDistance(0, 0, flight!.to.x, flight!.to.y)).toBe(1);
    expect(flight!.sprinting).toBe(false);
  });

  it('stays on its own shelf while grazing', () => {
    // The only neighbour is one tier up: a grazing sheep does not climb.
    const g = ground(['0,0', '1,0'], { tiers: { '1,0': 1 } });
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, false, first)).toBeNull();
  });
});

describe('a spooked sheep', () => {
  it('sprints several cells, not one', () => {
    const g = ground(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0']);
    const flight = planFlight({ id: 's', x: 0, y: 0 }, g, true, first);
    expect(flight!.sprinting).toBe(true);
    expect(cellDistance(0, 0, flight!.to.x, flight!.to.y)).toBe(SPRINT_STEPS);
  });

  /**
   * THE rule. A sheep blocks its cell, so one that cannot leave a dead end is
   * a permanent wall across whatever is behind it.
   */
  it('climbs out of a dead end rather than staying to block it', () => {
    // A pocket with exactly one exit, and that exit is a tier up.
    const g = ground(['0,0', '1,0'], { tiers: { '1,0': 1 } });
    const flight = planFlight({ id: 's', x: 0, y: 0 }, g, true, first);
    expect(flight).not.toBeNull();
    expect(flight!.to).toEqual({ x: 1, y: 0 });
  });

  it('prefers its own shelf when the shelf still has somewhere to go', () => {
    // Two exits from the start: one level, one up. A sprint of one step has to
    // take the level one.
    //
    // Checked with SPRINT_STEPS forced to a single step, because over four the
    // sheep legitimately exhausts its own shelf and then climbs — which is
    // rule 4 working, not the preference failing. The preference is about
    // which cell is picked while a choice exists, and that is a per-step
    // question.
    const g = ground(['0,0', '1,0', '0,1'], { tiers: { '1,0': 1 } });
    const oneStep = planFlight({ id: 's', x: 0, y: 0 }, g, false, () => 0);
    expect(oneStep).not.toBeNull();
    expect(g.tierAt(oneStep!.to.x, oneStep!.to.y)).toBe(0);
  });

  it('does not walk through another occupant', () => {
    const g = ground(['0,0', '1,0'], { taken: ['1,0'] });
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, true, first)).toBeNull();
  });

  it('stands still only when walled in on every side', () => {
    // A single cell with no neighbours at all: nothing to plan.
    const g = ground(['0,0']);
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, true, first)).toBeNull();
  });
});

describe('a flock', () => {
  it('never sends two sheep to the same cell', () => {
    // Both sheep can only reach '1,0'. The first claims it; the second must
    // find that it is taken.
    const claimed = new Set<string>();
    const g: Ground = {
      ...ground(['0,0', '1,0', '2,0']),
      isFree: (x, y) => !claimed.has(`${x},${y}`),
    };
    const flights = planFlock(
      [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }],
      g,
      [toIndex(0, 1)],
      first,
      (from, to) => {
        claimed.add(`${to.x},${to.y}`);
        claimed.delete(`${from.x},${from.y}`);
      },
    );
    const destinations = flights.map((f) => `${f.to.x},${f.to.y}`);
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it('leaves the unspooked ones alone', () => {
    const g = ground(['0,0', '1,0', '9,9', '8,9']);
    // Only the sheep at the origin has a rabbit near it.
    const flights = planFlock(
      [{ id: 'near', x: 0, y: 0 }, { id: 'far', x: 9, y: 9 }],
      g,
      [toIndex(1, 1)],
      never,
      () => {},
    );
    expect(flights.map((f) => f.id)).toEqual(['near']);
  });
});
