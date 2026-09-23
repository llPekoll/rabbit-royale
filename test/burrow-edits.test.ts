import { describe, expect, it } from 'vitest';
import {
  burrowTerrain, editBurrow, burrowIndex, burrowColRow, MIN_CROSSING, MAX_CROSSING,
  type BurrowTerrain,
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

  it('a tree cannot land on the entrance or on another thing', () => {
    const base = burrowTerrain(SEEDS[1]);
    const [a, b] = base.placements;
    const from = burrowIndex(a.x, a.y);
    expect(editBurrow(base, { moves: [[from, base.entrance]] })).toBe('cells_overlap');
    expect(editBurrow(base, { moves: [[from, burrowIndex(b.x, b.y)]] })).toBe('cells_overlap');
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
