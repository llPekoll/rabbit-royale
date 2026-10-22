/**
 * BOMBS STEP ASIDE (2026-10-22): a rearrangement that covers a bomb moves it
 * to the nearest free minable cell instead of lifting it into a capped bag.
 */
import { describe, expect, it } from 'vitest';
import { burrowColRow, isDoorstep, isTrappable, walkableTiles } from '@/game/burrow/board';
import { HOP_REACH, hopAside } from '@/lib/game/traps';

const ID = 'guest:bomb-hop';
const minable = walkableTiles(ID).filter((t) => isTrappable(ID, t) && !isDoorstep(ID, t));

function dist(a: number, b: number): number {
  const p = burrowColRow(a);
  const q = burrowColRow(b);
  return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row));
}

describe('hopAside', () => {
  it('moves a covered bomb to a free minable cell nearby', () => {
    const from = minable[Math.floor(minable.length / 2)];
    const to = hopAside(ID, [from], new Set(), new Set([from])).get(from);
    expect(to).not.toBeNull();
    expect(to).not.toBe(from);
    expect(isTrappable(ID, to!)).toBe(true);
    expect(isDoorstep(ID, to!)).toBe(false);
    expect(dist(from, to!)).toBe(1);
  });

  it('never lands two bombs on one cell, nor on a mined or blocked one', () => {
    const [a, b, c] = minable;
    const taken = new Set(minable.slice(3, 12));
    const blocked = new Set([a, b, c]);
    const hops = hopAside(ID, [a, b, c], taken, blocked);
    const landed = [...hops.values()].filter((t): t is number => t !== null);
    expect(new Set(landed).size).toBe(landed.length);
    for (const t of landed) {
      expect(taken.has(t)).toBe(false);
      expect(blocked.has(t)).toBe(false);
    }
  });

  it('sends a bomb home when nothing is free within reach', () => {
    const from = minable[0];
    const everything = new Set(minable);
    const hops = hopAside(ID, [from], everything, new Set([from]));
    expect(hops.get(from)).toBeNull();
    expect(HOP_REACH).toBeGreaterThan(0);
  });

  it('lands the same way every time', () => {
    const from = minable[5];
    const once = hopAside(ID, [from], new Set(), new Set([from])).get(from);
    const again = hopAside(ID, [from], new Set(), new Set([from])).get(from);
    expect(again).toBe(once);
  });
});
