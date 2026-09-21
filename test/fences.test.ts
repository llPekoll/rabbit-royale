/**
 * The garden fence: its geometry, and the one rule that is not arithmetic.
 *
 * Asserts BEHAVIOUR over real generated burrows rather than over a fixture
 * grid, because the whole difficulty of this feature is that a potager is an
 * arbitrary connected blob (`pickField`) and not a rectangle. A suite built on
 * a hand-drawn 3x3 would pass while the thing that actually ships — a field
 * with a notch, flush against a cliff — did something else.
 *
 * A fence is ONE PLANK on one exposed edge (a span). What is pinned is what
 * must survive any retune: a plank follows the field's edge, a standing plank
 * refuses a raider's step, and the potager can never be sealed off entirely.
 */
import { describe, expect, it } from 'vitest';
import {
  FENCE_SIDES, fenceBlocks, fenceSpans, fieldReachable, isSpan, outerTile, raiderSteps,
  segKey, type FenceSeg,
} from '../src/game/burrow/fence';
import { fencePlacementBlocker, fenceRemovalBlocker, fencedSpans } from '../src/lib/game/fences';
import { fieldTiles, burrowNeighbors, entranceTile, walkableTiles } from '../src/game/burrow/board';
import { burrowColRow } from '../src/config/burrowConfig';
import { FENCES } from '../config/tuning';

/** A spread of real seeds, so nothing here is true of one lucky field. */
const SEEDS = [
  'player-1', 'player-2', 'player-3', 'sol:test-wallet',
  'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b',
];
const seg = (s: { tile: number; side: string }): FenceSeg => ({ tile: s.tile, side: s.side as FenceSeg['side'] });
const all = (seed: string) => fenceSpans(seed).map(seg);

describe('the perimeter walk', () => {
  it('puts every span on a field cell', () => {
    for (const seed of SEEDS) {
      const field = new Set(fieldTiles(seed));
      for (const span of fenceSpans(seed)) expect(field.has(span.tile)).toBe(true);
    }
  });

  it('emits one span per exposed face, and none for an interior face', () => {
    for (const seed of SEEDS) {
      const field = fieldTiles(seed);
      const occupied = new Set(field.map((t) => { const { col, row } = burrowColRow(t); return `${col},${row}`; }));
      let expected = 0;
      for (const tile of field) {
        const { col, row } = burrowColRow(tile);
        for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (!occupied.has(`${col + dc},${row + dr}`)) expected += 1;
        }
      }
      expect(fenceSpans(seed)).toHaveLength(expected);
    }
  });

  it('names every span uniquely, and `isSpan` agrees with the walk', () => {
    for (const seed of SEEDS) {
      const keys = all(seed).map(segKey);
      expect(new Set(keys).size).toBe(keys.length);
      for (const s of all(seed)) expect(isSpan(seed, s.tile, s.side)).toBe(true);
      // An interior face, or a non-field cell, is not a span.
      const inner = fieldTiles(seed).find((t) => FENCE_SIDES.some((side) => !isSpan(seed, t, side)));
      expect(inner).toBeDefined();
      expect(isSpan(seed, entranceTile(seed), 'NE')).toBe(false);
    }
  });

  it('puts the target cell across the edge, never on the field', () => {
    for (const seed of SEEDS) {
      const field = new Set(fieldTiles(seed));
      for (const span of fenceSpans(seed)) {
        const outer = outerTile(span);
        if (outer !== null) expect(field.has(outer)).toBe(false);
      }
    }
  });
});

describe('what a plank does to a raider', () => {
  it('refuses the step across it, in both directions', () => {
    for (const seed of SEEDS) {
      let checked = 0;
      for (const s of all(seed)) {
        const outer = burrowNeighbors(seed, s.tile).find((t) => fenceBlocks(seed, [s], s.tile, t));
        // Not every exposed face has WALKABLE ground behind it.
        if (outer === undefined) continue;
        expect(fenceBlocks(seed, [s], outer, s.tile)).toBe(true);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('only refuses steps that cross ITS edge or its corner', () => {
    // One plank, one field cell: every other span's face stays open.
    for (const seed of SEEDS) {
      const s = all(seed)[0];
      const others = all(seed).filter((o) => o.tile !== s.tile);
      for (const o of others) {
        for (const to of burrowNeighbors(seed, o.tile)) {
          const { col, row } = burrowColRow(o.tile);
          const b = burrowColRow(to);
          // An orthogonal step from another cell never touches this plank.
          if (b.col === col || b.row === row) {
            if (to !== s.tile) expect(fenceBlocks(seed, [s], o.tile, to)).toBe(false);
          }
        }
      }
    }
  });

  it('never refuses a step from one field cell to another', () => {
    for (const seed of SEEDS) {
      const field = fieldTiles(seed);
      for (const from of field) {
        for (const to of burrowNeighbors(seed, from)) {
          if (!field.includes(to)) continue;
          expect(fenceBlocks(seed, all(seed), from, to)).toBe(false);
        }
      }
    }
  });

  it('answers the same whichever way the step is written', () => {
    for (const seed of SEEDS) {
      const walled = all(seed).filter((_, i) => i % 2 === 0);
      for (const from of walkableTiles(seed)) {
        for (const to of burrowNeighbors(seed, from)) {
          expect(fenceBlocks(seed, walled, from, to)).toBe(fenceBlocks(seed, walled, to, from));
        }
      }
    }
  });

  it('lets every step through when nothing is walled', () => {
    for (const seed of SEEDS) {
      for (const tile of fieldTiles(seed)) {
        expect(raiderSteps(seed, [], tile)).toEqual(burrowNeighbors(seed, tile));
      }
    }
  });

  it('only ever removes steps, never adds one', () => {
    for (const seed of SEEDS) {
      const walled = all(seed).slice(0, 3);
      for (const tile of fieldTiles(seed)) {
        const open = burrowNeighbors(seed, tile);
        const left = raiderSteps(seed, walled, tile);
        expect(left.every((t) => open.includes(t))).toBe(true);
      }
    }
  });

  it('seals the field when EVERY span is walled — corners included', () => {
    // The property the diagonal fix exists for: with the whole edge fenced,
    // no eight-way step gets in. Without the corner rule this was reachable.
    for (const seed of SEEDS) expect(fieldReachable(seed, all(seed))).toBe(false);
  });
});

describe('the gate rule', () => {
  it('lets the starting three go up, in any order', () => {
    for (const seed of SEEDS) {
      const standing: FenceSeg[] = [];
      for (const s of all(seed).slice(0, FENCES.STARTING)) {
        expect(fencePlacementBlocker(seed, 3, standing, s.tile, s.side)).toBeNull();
        standing.push(s);
      }
      expect(fieldReachable(seed, standing)).toBe(true);
    }
  });

  it('never lets a legal sequence of planks seal the field', () => {
    // Whatever order they are placed in, a burrow that accepted every
    // placement is still raidable — and at least one span was refused.
    for (const seed of SEEDS) {
      const standing: FenceSeg[] = [];
      let refused = 0;
      for (const s of all(seed)) {
        const why = fencePlacementBlocker(seed, FENCES.MAX_HELD, standing, s.tile, s.side);
        if (why === 'would_seal_burrow') { refused += 1; continue; }
        expect(why).toBeNull();
        standing.push(s);
      }
      expect(fieldReachable(seed, standing)).toBe(true);
      expect(refused).toBeGreaterThan(0);
    }
  });
});

describe('the refusals', () => {
  const seed = SEEDS[0];
  const first = all(seed)[0];

  it('names an empty bag rather than the span', () => {
    expect(fencePlacementBlocker(seed, 0, [], first.tile, first.side)).toBe('no_fences');
  });

  it('refuses a span that already carries a plank', () => {
    expect(fencePlacementBlocker(seed, 3, [first], first.tile, first.side)).toBe('span_already_fenced');
  });

  it('refuses a face that is not an edge of the field', () => {
    const inner = fieldTiles(seed).find((t) => !isSpan(seed, t, 'NE'))!;
    expect(fencePlacementBlocker(seed, 3, [], inner, 'NE')).toBe('span_not_exposed');
    expect(fencePlacementBlocker(seed, 3, [], entranceTile(seed), 'SW')).toBe('span_not_exposed');
  });

  it('refuses a span that is not a span', () => {
    expect(fencePlacementBlocker(seed, 3, [], first.tile, 'NORTH')).toBe('bad_span');
    expect(fencePlacementBlocker(seed, 3, [], Number.NaN, 'NE')).toBe('bad_span');
    expect(fenceRemovalBlocker([], 0, 1.5, 'NE')).toBe('bad_span');
  });

  it('refuses to lift a plank that is not there', () => {
    expect(fenceRemovalBlocker([], 0, first.tile, first.side)).toBe('span_not_fenced');
  });

  it('refuses to lift one into a full bag, rather than destroying it', () => {
    expect(fenceRemovalBlocker([first], FENCES.MAX_HELD, first.tile, first.side)).toBe('inventory_full');
    expect(fenceRemovalBlocker([first], FENCES.MAX_HELD - 1, first.tile, first.side)).toBeNull();
  });
});

describe('reading the rows back', () => {
  it('keeps only the spans the geometry could name', () => {
    expect(fencedSpans([{ tile: 4, side: 'NE' }, { tile: 5, side: 'sideways' }, { tile: 2.5, side: 'SW' }]))
      .toEqual([{ tile: 4, side: 'NE' }]);
  });

  it('folds a duplicated row into one plank', () => {
    expect(fencedSpans([{ tile: 4, side: 'NE' }, { tile: 4, side: 'NE' }])).toEqual([{ tile: 4, side: 'NE' }]);
  });
});

describe('the starting kit', () => {
  it('is a start, not a wall', () => {
    for (const seed of SEEDS) expect(FENCES.STARTING).toBeLessThan(all(seed).length);
  });

  it('caps the bag above the starting grant', () => {
    expect(FENCES.MAX_HELD).toBeGreaterThan(FENCES.STARTING);
  });
});
