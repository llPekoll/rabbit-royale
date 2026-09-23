import { describe, expect, it } from 'vitest';
import {
  burrowTerrain, editBurrow, burrowIndex, burrowColRow, MIN_CROSSING, MAX_CROSSING,
  givesWay, houseFootprint, type BurrowTerrain,
} from '@/game/burrow/generate';
import { burrowFor, setBurrowEdits, isWalkable, fieldTiles } from '@/game/burrow/board';
import { blocksCell } from '@/game/island/blocking';
import { parseBurrowEdits } from '@/lib/game/burrowEdits';

const SEEDS = Array.from({ length: 60 }, (_, i) => `guest:edit-${i}`);

describe('editBurrow', () => {
  it('an empty edit is the generated burrow', () => {
    for (const seed of SEEDS) {
      const base = burrowTerrain(seed);
      const out = editBurrow(base, {}) as BurrowTerrain;
      expect(typeof out).toBe('object');
      expect(out.cells).toEqual(base.cells);
      expect(out.crossing).toBe(base.crossing);
      expect(out.doorstep).toEqual(base.doorstep);
    }
  });

  it('a field pushed into the sea is refused', () => {
    const base = burrowTerrain(SEEDS[0]);
    expect(editBurrow(base, { field: [40, 0] })).toBe('field_off_ground');
  });

  it('a tree cannot land on the entrance or on another solid thing', () => {
    const base = burrowTerrain(SEEDS[1]);
    const [a, b] = base.placements.filter((p) => !givesWay(p.kind));
    const from = burrowIndex(a.x, a.y);
    expect(editBurrow(base, { moves: [[from, base.entrance]] })).toBe('cells_overlap');
    expect(editBurrow(base, { moves: [[from, burrowIndex(b.x, b.y)]] })).toBe('cells_overlap');
  });

  describe('ground clutter gives way', () => {
    // A seed with a tree free to move onto a bush or prop it does not block.
    const pick = () => {
      for (const seed of SEEDS) {
        const base = burrowTerrain(seed);
        for (const solid of base.placements.filter((p) => !givesWay(p.kind))) {
          for (const clutter of base.placements.filter((p) => givesWay(p.kind))) {
            const from = burrowIndex(solid.x, solid.y);
            const to = burrowIndex(clutter.x, clutter.y);
            const out = editBurrow(base, { moves: [[from, to]] });
            if (typeof out !== 'string') return { base, solid, clutter, from, to, out };
          }
        }
      }
      throw new Error('no seed lets a solid thing onto clutter');
    };

    it('a solid thing set on a bush or a prop covers it, and the clutter is gone', () => {
      const { base, clutter, to, out } = pick();
      expect(out.placements.some((p) => p.id === clutter.id)).toBe(false);
      expect(out.placements.filter((p) => burrowIndex(p.x, p.y) === to)).toHaveLength(1);
      expect(out.placements).toHaveLength(base.placements.length - 1);
    });

    it('the ground is the same with or without it — clutter never blocks', () => {
      const { base, from, to, out } = pick();
      // The same move judged against a burrow with no clutter at all.
      const bare = { ...base, placements: base.placements.filter((p) => !givesWay(p.kind)) };
      const alone = editBurrow(bare, { moves: [[from, to]] }) as BurrowTerrain;
      expect(out.cells).toEqual(alone.cells);
      expect(out.crossing).toBe(alone.crossing);
    });

    it('clutter the owner picked up keeps its cell like anything else', () => {
      const { base, solid, clutter, from, to } = pick();
      // The clutter moved first, onto the solid thing's cell: refused.
      expect(editBurrow(base, { moves: [[to, from]] })).toBe('cells_overlap');
      // And moved clutter under a solid thing's final cell: refused too.
      const elsewhere = base.placements.find((p) => givesWay(p.kind) && p.id !== clutter.id)!;
      const other = burrowIndex(elsewhere.x, elsewhere.y);
      expect(editBurrow(base, { moves: [[from, to], [other, to]] })).toBe('cells_overlap');
      expect(solid.id).not.toBe(clutter.id);
    });

    it('the house set down on clutter covers it too', () => {
      for (const seed of SEEDS) {
        const base = burrowTerrain(seed);
        for (const clutter of base.placements.filter((p) => givesWay(p.kind))) {
          const house = burrowIndex(clutter.x, clutter.y);
          const out = editBurrow(base, { house });
          if (typeof out === 'string') continue;
          const square = new Set(houseFootprint(house));
          expect(out.placements.some((p) => square.has(burrowIndex(p.x, p.y)))).toBe(false);
          return;
        }
      }
      throw new Error('no seed lets the house onto clutter');
    });
  });

  it('every accepted edit keeps the crossing in bounds and the field reachable', () => {
    let accepted = 0;
    for (const seed of SEEDS) {
      const base = burrowTerrain(seed);
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 2], [-2, -1]] as const) {
        const out = editBurrow(base, { field: [d[0], d[1]] });
        if (typeof out === 'string') continue;
        accepted++;
        expect(out.crossing).toBeGreaterThanOrEqual(MIN_CROSSING);
        expect(out.crossing).toBeLessThanOrEqual(MAX_CROSSING);
        for (const t of out.field) expect(out.cells[t]).toBe('field');
        const solid = new Set(out.placements.filter((p) => blocksCell(p.kind)).map((p) => burrowIndex(p.x, p.y)));
        for (const t of out.field) expect(solid.has(t)).toBe(false);
      }
    }
    expect(accepted).toBeGreaterThan(20);
  });

  it('moving a tree onto open ground makes that cell a wall', () => {
    const seed = SEEDS[2];
    const base = burrowTerrain(seed);
    const tree = base.placements.find((p) => blocksCell(p.kind))!;
    const from = burrowIndex(tree.x, tree.y);
    const to = base.cells.findIndex((c, i) => c === 'ground'
      && !base.placements.some((p) => burrowIndex(p.x, p.y) === i)
      && typeof editBurrow(base, { moves: [[from, i]] }) !== 'string');
    expect(to).toBeGreaterThanOrEqual(0);
    setBurrowEdits(seed, { moves: [[from, to]] });
    expect(isWalkable(seed, to)).toBe(false);
    setBurrowEdits(seed, null);
    expect(isWalkable(seed, to)).toBe(true);
  });

  it('the board answers with the edited field, and drops an edit that no longer holds', () => {
    const seed = SEEDS.find((s) => typeof editBurrow(burrowTerrain(s), { field: [1, 0] }) !== 'string')!;
    const base = burrowTerrain(seed);
    setBurrowEdits(seed, { field: [1, 0] });
    expect(fieldTiles(seed)).toEqual(base.field.map((t) => {
      const { col, row } = burrowColRow(t);
      return burrowIndex(col + 1, row);
    }).sort((a, b) => a - b));
    setBurrowEdits(seed, { field: [40, 0] });
    expect(burrowFor(seed).field).toEqual(base.field);
    setBurrowEdits(seed, null);
  });
});

describe('parseBurrowEdits', () => {
  it('keeps the known keys and drops no-ops', () => {
    expect(parseBurrowEdits({ field: [0, 0], moves: [[3, 3]], junk: 1 })).toEqual({});
    expect(parseBurrowEdits({ field: [1, -2], house: 40, moves: [[3, 4]] }))
      .toEqual({ field: [1, -2], house: 40, moves: [[3, 4]] });
    expect(parseBurrowEdits({ field: [1.5, 0] })).toBeNull();
    expect(parseBurrowEdits('x')).toBeNull();
  });
});
