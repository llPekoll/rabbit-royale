/**
 * The lit ring is a PROMISE: tap a yellow tile and the move is accepted.
 *
 * It used to light all eight land neighbours, which broke that promise in two
 * situations the player meets often — out of energy, and stunned by a bomb.
 * Taps bounced with no explanation, which reads as a dropped input rather than
 * as a rule. These pin the ring to the same gates `resolveMove` applies.
 */
import { describe, expect, it } from 'vitest';
import { ENERGY } from '../config/tuning';
import { reachableTiles, type ReachableState } from '../src/lib/game/reachable';
import { SPAWN_INDEX, makeShape, neighbors } from '../src/config/gridConfig';

const SHAPE = makeShape('reachable-test');
const NOW = 1_000_000;

/** A healthy rabbit on the spawn, on an island nobody has dug yet. */
function rabbit(over: Partial<ReachableState> = {}): ReachableState {
  return {
    tile: SPAWN_INDEX,
    energy: 10,
    alive: true,
    stunnedUntil: 0,
    isRevealed: () => false,
    ...over,
  };
}

describe('a rabbit that can afford to dig', () => {
  it('lights every land neighbour', () => {
    const lit = reachableTiles(rabbit(), SHAPE, NOW);
    expect(lit.sort()).toEqual(neighbors(SPAWN_INDEX, SHAPE).sort());
    expect(lit.length).toBeGreaterThan(0);
  });

  it('never lights water, so the ring cannot point off the island', () => {
    // Walk the whole island rather than trusting the spawn's neighbourhood:
    // the coast is where a bad ring would show, and the spawn is inland.
    for (const from of neighbors(SPAWN_INDEX, SHAPE)) {
      const lit = reachableTiles(rabbit({ tile: from }), SHAPE, NOW);
      const land = new Set(neighbors(from, SHAPE));
      for (const t of lit) expect(land.has(t)).toBe(true);
    }
  });
});

describe('out of energy', () => {
  it('goes fully dark on undug ground — every tile there costs a dig', () => {
    expect(reachableTiles(rabbit({ energy: 0 }), SHAPE, NOW)).toEqual([]);
  });

  it('still lights ground someone has already dug, which is free to walk', () => {
    const [free] = neighbors(SPAWN_INDEX, SHAPE);
    const lit = reachableTiles(
      rabbit({ energy: 0, isRevealed: (i) => i === free }),
      SHAPE,
      NOW,
    );
    // The player's last remaining move. Darkening it would strand them on a
    // board that still had a legal step.
    expect(lit).toEqual([free]);
  });

  it('lights everything again at exactly the cost of one dig', () => {
    const lit = reachableTiles(rabbit({ energy: ENERGY.DIG_COST }), SHAPE, NOW);
    expect(lit.sort()).toEqual(neighbors(SPAWN_INDEX, SHAPE).sort());
  });
});

describe('stunned by a bomb', () => {
  it('darkens the ring while the stun runs, energy notwithstanding', () => {
    const lit = reachableTiles(rabbit({ stunnedUntil: NOW + 500 }), SHAPE, NOW);
    expect(lit).toEqual([]);
  });

  it('darkens even revealed ground — a stun refuses the free moves too', () => {
    const lit = reachableTiles(
      rabbit({ stunnedUntil: NOW + 500, isRevealed: () => true }),
      SHAPE,
      NOW,
    );
    expect(lit).toEqual([]);
  });

  it('comes back the moment the stun lapses', () => {
    const stunned = rabbit({ stunnedUntil: NOW });
    expect(reachableTiles(stunned, SHAPE, NOW).length).toBeGreaterThan(0);
  });
});

describe('a dead rabbit', () => {
  it('lights nothing at all', () => {
    expect(reachableTiles(rabbit({ alive: false }), SHAPE, NOW)).toEqual([]);
  });
});

/**
 * The Reachable stories drive this same rule, so their SETUPS must produce the
 * states their docs claim. A story titled "out of energy" that quietly still
 * lit eight tiles would mislead exactly the person opening Storybook to check
 * this behaviour.
 */
describe('the Storybook setups', () => {
  const STORY_SHAPE = makeShape('reachable');
  const dug = new Set(neighbors(SPAWN_INDEX, STORY_SHAPE));
  const at = (over: Partial<ReachableState> = {}) =>
    reachableTiles({ ...rabbit(), ...over }, STORY_SHAPE, NOW);

  it('ClickToMove and RunningLow light the full ring', () => {
    expect(at().length).toBe(dug.size);
    expect(at({ energy: 2 }).length).toBe(dug.size);
  });

  it('OutOfEnergy lights nothing', () => {
    expect(at({ energy: 0 })).toEqual([]);
  });

  it('OutOfEnergyOnDugGround keeps the dug neighbours lit', () => {
    expect(at({ energy: 0, isRevealed: (i) => dug.has(i) }).length).toBe(dug.size);
  });

  it('PartiallyLit lights SOME of the ring — the picture the others miss', () => {
    // The point of the story, and the one arrangement that shows the filter
    // choosing. All-lit and all-dark are both consistent with no rule at all.
    const some = new Set([...dug].slice(0, 3));
    const lit = at({ energy: 0, isRevealed: (i) => some.has(i) });
    expect(lit.length).toBe(3);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length).toBeLessThan(dug.size);
  });

  it('Stunned lights nothing, dug ground included', () => {
    expect(at({ stunnedUntil: NOW + 60_000, isRevealed: () => true })).toEqual([]);
  });
});
