/**
 * THE ISLAND IS DEALT BY THE RABBIT'S LEVEL (2026-09-23). The list on DIG is
 * gone from the game's own client: a rabbit has ten levels, clearing an island
 * alive is one up, and the level deals the next island — its densities, and
 * how many share it (alone to 5, two from 6 to 9, four at 10). Nobody raids
 * or is raided below RABBIT_LEVELS.RAID_MIN.
 *
 * The web page still carries the old picker (asserted at the bottom); the
 * server ignores its choice.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryIslandStore } from '../server/islands/store';
import { RABBIT_LEVELS, levelRow, mayFight } from '../config/tuning';
import { spawnRabbit } from '../src/lib/game/run';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const PAGE = read('../src/app/page.tsx');

describe('the level ladder', () => {
  it('has ten rows, solo to 5, two to 9, four at 10, bombs rising', () => {
    const ladder = RABBIT_LEVELS.LADDER;
    expect(ladder).toHaveLength(RABBIT_LEVELS.MAX);
    expect(ladder.map((r) => r.seats)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 4]);
    for (let k = 1; k < ladder.length; k++) {
      expect(ladder[k].level).toBe(k + 1);
      expect(ladder[k].bombDensity).toBeGreaterThan(ladder[k - 1].bombDensity);
    }
  });

  it('clamps a level to the ladder', () => {
    expect(levelRow(0).level).toBe(1);
    expect(levelRow(-3).level).toBe(1);
    expect(levelRow(4).level).toBe(4);
    expect(levelRow(99).level).toBe(RABBIT_LEVELS.MAX);
    expect(levelRow(Number.NaN).level).toBe(1);
  });

  it('opens fights only when both have reached RAID_MIN', () => {
    expect(mayFight(10, 10)).toBe(true);
    expect(mayFight(9, 10)).toBe(false);
    expect(mayFight(10, 3)).toBe(false);
  });
});

describe('seating by level', () => {
  it('never seats a second rabbit on a solo level', () => {
    const store = new MemoryIslandStore();
    const live = store.create('solo-3', 0, { level: 3 });
    expect(live.seats).toBe(1);
    expect(live.solo).toBe(true);
    expect(live.island.level).toBe(3);
    expect(store.joinable(live)).toBe(false);
    expect(store.findJoinable(3)).toBeUndefined();
  });

  it('seats two on a duo level, and only rabbits of that level', () => {
    const store = new MemoryIslandStore();
    const live = store.create('duo-7', 0, { level: 7 });
    expect(live.seats).toBe(2);
    expect(store.findJoinable(7)?.island.id).toBe('duo-7');
    expect(store.findJoinable(6)).toBeUndefined();
    live.rabbits.set('a', spawnRabbit('a', 'A', 30, 'duo-7', 7));
    expect(store.findJoinable(7)?.island.id).toBe('duo-7');
    live.rabbits.set('b', spawnRabbit('b', 'B', 30, 'duo-7', 7));
    expect(store.findJoinable(7)).toBeUndefined();
  });

  it('seats four at the last level', () => {
    const store = new MemoryIslandStore();
    const live = store.create('final', 0, { level: 10 });
    expect(live.seats).toBe(4);
    for (const id of ['a', 'b', 'c']) live.rabbits.set(id, spawnRabbit(id, id, 30, 'final', 10));
    expect(store.findJoinable(10)?.island.id).toBe('final');
    live.rabbits.set('d', spawnRabbit('d', 'd', 30, 'final', 10));
    expect(store.findJoinable(10)).toBeUndefined();
  });

  it('sinks a solo island as soon as its rabbit is out', () => {
    const store = new MemoryIslandStore();
    const live = store.create('solo-1', 0, { level: 1 });
    // Fresh and empty: the join is still paying for the crossing.
    expect(store.reapable(Date.now())).toHaveLength(0);
    const r = spawnRabbit('a', 'A', 30, 'solo-1', 1);
    live.rabbits.set('a', r);
    expect(store.reapable(Date.now())).toHaveLength(0);
    r.alive = false;
    expect(store.reapable(Date.now()).map((l) => l.island.id)).toEqual(['solo-1']);
  });

  it('deals by level, ignores the choice, and levels up on a clear', () => {
    expect(SERVER).toMatch(/\?\? store\.findJoinable\(player\.level\)\s*\?\? newIsland\(player\.level\);/);
    expect(SERVER).toMatch(/cleared: true,\s*level,\s*leveledUp,/);
  });
});

describe('the list on DIG', () => {
  it('is skipped on the first trip, and opens for every trip after', () => {
    expect(PAGE).toMatch(/if \(\(burrow\?\.runs \?\? 0\) === 0\) \{ goTo\('island'\); return; \}\s*setIslandList\(null\);\s*setPickingIsland\(true\);/);
    expect(PAGE).toMatch(/game\.chooseIsland\(choice\);\s*setPickingIsland\(false\);\s*goTo\('island'\);/);
  });

  it('closes with the burrow and says why a choice was refused', () => {
    expect(PAGE).toMatch(/setPickingTarget\(false\);\s*setPickingIsland\(false\);\s*setEnergyPanelOpen\(false\);\s*setLoreOpen\(false\);/);
    expect(PAGE).toMatch(/r\.code === 'island_gone' \? t\.islandPick\.gone : t\.islandPick\.tierLocked/);
  });
});
