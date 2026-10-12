/**
 * THE RAID READS LIKE A MINESWEEPER (2026-10-12): a number only where the
 * raider stood, or where a 0 opened it — never on a bomb.
 */
import { describe, expect, it } from 'vitest';
import { burrowNeighbors, entranceTile } from '@/game/burrow/board';
import { burrowColRow } from '@/game/burrow/generate';
import { ISLAND } from '@config/tuning';
import { raiderView, trapClues } from '@/lib/game/raid';

const SEED = 'guest-42';

const viewOf = (visited: number[], traps: number[], smoked = false) =>
  new Map(raiderView(SEED, visited, trapClues(SEED, traps), smoked, traps).map((v) => [v.tile, v.clue]));

describe('raid clues', () => {
  it('a neighbour next to a bomb shows its ground, not its number', () => {
    const door = entranceTile(SEED);
    const [bomb] = burrowNeighbors(SEED, door);
    const view = viewOf([door], [bomb]);
    expect(view.get(door)).toBe(1);
    for (const n of burrowNeighbors(SEED, door)) {
      expect(view.has(n)).toBe(true);
      expect(view.get(n)).toBeNull();
    }
  });

  it('a 0 opens its neighbours, and their 0s open further', () => {
    const door = entranceTile(SEED);
    const view = viewOf([door], []);
    const opened = [...view.values()].filter((c) => c !== null).length;
    expect(opened).toBeGreaterThan(burrowNeighbors(SEED, door).length);
    for (const n of burrowNeighbors(SEED, door)) expect(view.get(n)).toBe(0);
  });

  it('the cascade stops at numbers and never opens a bomb', () => {
    const door = entranceTile(SEED);
    const far = burrowNeighbors(SEED, burrowNeighbors(SEED, door)[0]).find(
      (t) => t !== door && !burrowNeighbors(SEED, door).includes(t),
    )!;
    const view = viewOf([door], [far]);
    expect(view.get(far) ?? null).toBeNull();
  });

  it('a bomb stood on reads blank, and the smoke shows no number', () => {
    const door = entranceTile(SEED);
    const [bomb] = burrowNeighbors(SEED, door);
    expect(viewOf([door, bomb], [bomb]).get(bomb)).toBe(0);
    for (const clue of viewOf([door], [bomb], true).values()) expect(clue).toBeNull();
  });

  it('the door opens small: nothing past the island\'s cascade radius', () => {
    const door = entranceTile(SEED);
    const d = burrowColRow(door);
    for (const [tile, clue] of viewOf([door], [])) {
      if (clue === null) continue;
      const c = burrowColRow(tile);
      expect(Math.max(Math.abs(c.col - d.col), Math.abs(c.row - d.row))).toBeLessThanOrEqual(ISLAND.CASCADE_RADIUS);
    }
  });
});
