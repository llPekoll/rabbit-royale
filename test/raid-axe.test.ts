/**
 * THE RAID AXE (2026-10-12): a felled tree is a stump a raider walks over and
 * an owner cannot mine, and it opens a burrow walled with trees.
 *
 * The wall is NorminaskyTV's, as it stood in prod on 2026-10-11: 31 trees
 * moved round the potager, the house, four planks — one cell into the field.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  burrowCell, burrowFor, burrowNeighbors, fieldTiles, isTrappable, setBurrowEdits,
} from '@/game/burrow/board';
import { editBurrow } from '@/game/burrow/generate';
import { baseBurrowFor } from '@/game/burrow/board';
import { fenceBlocks, type FenceSeg } from '@/game/burrow/fence';
import { axeTargets, planksTouching } from '@/lib/game/axe';

const ID = 'sol:6jqajzkMbciCYjKiXKJfXqwMUo9xBDaHUrrKXkoZhyVL';
const MOVES: [number, number][] = [[270, 174], [213, 193], [232, 173], [239, 172], [200, 177], [163, 158], [202, 120], [140, 100], [289, 101], [122, 81], [141, 80], [160, 79], [220, 178], [221, 196], [298, 140], [169, 197], [292, 121], [84, 82], [64, 61], [210, 62], [180, 192], [219, 212], [51, 211], [50, 63], [69, 179], [104, 198], [259, 160], [148, 141], [241, 122], [88, 103], [129, 139]];
const PLANKS: FenceSeg[] = [{ tile: 98, side: 'NE' }, { tile: 99, side: 'NE' }, { tile: 99, side: 'SE' }, { tile: 119, side: 'NE' }];

/** The cells a raider steps INTO the field from. */
function gates(): number[] {
  const { entrance } = burrowFor(ID);
  const field = new Set(fieldTiles(ID));
  const seen = new Set([entrance]);
  const queue = [entrance];
  const out = new Set<number>();
  while (queue.length) {
    const t = queue.shift()!;
    for (const n of burrowNeighbors(ID, t)) {
      if (fenceBlocks(ID, PLANKS, t, n)) continue;
      if (field.has(n)) { out.add(t); continue; }
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return [...out].sort((a, b) => a - b);
}

afterEach(() => setBurrowEdits(ID, null));

describe('raid axe', () => {
  it('the walled burrow has one way in, and one cut opens more', () => {
    setBurrowEdits(ID, { moves: MOVES });
    expect(gates()).toEqual([120]);
    setBurrowEdits(ID, { moves: MOVES, cuts: [173] });
    expect(gates().length).toBeGreaterThan(1);
  });

  it('a stump is walked, never mined', () => {
    setBurrowEdits(ID, { moves: MOVES, cuts: [173] });
    expect(burrowCell(ID, 173)).toBe('stump');
    expect(isTrappable(ID, 173)).toBe(false);
    expect(burrowFor(ID).placements.find((p) => p.x === 173 % 19 && p.y === Math.floor(173 / 19))?.kind).toBe('felled');
  });

  it('a cut with no tree on it changes nothing', () => {
    setBurrowEdits(ID, { moves: MOVES });
    const before = burrowFor(ID).cells.join();
    setBurrowEdits(ID, { moves: MOVES, cuts: [burrowFor(ID).entrance] });
    expect(burrowFor(ID).cells.join()).toBe(before);
  });

  it('a malformed cut list is refused like any bad edit', () => {
    expect(editBurrow(baseBurrowFor(ID), { cuts: [-1] })).toBe('bad_edits');
  });

  it('the axe reaches the trees around the raider and the plank in front', () => {
    setBurrowEdits(ID, { moves: MOVES });
    // 154 stands just inside the tree wall at 173.
    expect(axeTargets(ID, PLANKS, 154).trees).toContain(173);
    // 100 is the outer cell of two planks: 99's SE face and 119's NE face.
    const front = axeTargets(ID, PLANKS, 100);
    expect(front.planks).toEqual([{ tile: 99, side: 'SE' }, { tile: 119, side: 'NE' }]);
  });

  it('a landmark falls too, toppled, and is walked like a stump', () => {
    const seed = Array.from({ length: 300 }, (_, i) => `p${i}`)
      .find((id) => baseBurrowFor(id).placements.some((p) => p.kind === 'landmark'))!;
    const lm = baseBurrowFor(seed).placements.find((p) => p.kind === 'landmark')!;
    const at = lm.y * 19 + lm.x;
    try {
      setBurrowEdits(seed, { cuts: [at] });
      expect(burrowFor(seed).placements.find((p) => p.id === lm.id)?.kind).toBe('toppled');
      expect(burrowCell(seed, at)).toBe('stump');
    } finally {
      setBurrowEdits(seed, null);
    }
  });

  it('a falling tree takes every plank touching its cell, corners included', () => {
    // 100's square meets 99's SE and 119's NE faces, and 99's NE face at a
    // corner; 98's NE face stops a cell short.
    expect(planksTouching(PLANKS, 100)).toEqual([
      { tile: 99, side: 'NE' }, { tile: 99, side: 'SE' }, { tile: 119, side: 'NE' },
    ]);
    expect(planksTouching(PLANKS, 173)).toEqual([]);
  });
});
