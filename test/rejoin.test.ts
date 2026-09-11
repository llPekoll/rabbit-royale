/**
 * Walking home and coming back out starts a NEW run, at the spawn.
 *
 * The burrow is a round trip: you carry a sack home, plant it, and go back out
 * to dig. Both halves of that trip were broken, and in the same place — `join`
 * was reachable only from the socket's `connect`, but the socket survives the
 * walk while the SEAT does not. So the second trip out arrived with no rabbit
 * on the server (every tap dropped, silently, with the old sprite still
 * standing on the board) and, when the seat happened to still be held, with the
 * rabbit wherever the last run had left it rather than at the spawn.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryIslandStore } from '../server/islands/store';
import { spawnRabbit } from '../src/lib/game/run';
import { spawnTile } from '../src/lib/game/terrainBoard';

const SERVER = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const HOOK = readFileSync(new URL('../src/components/use-game-socket.ts', import.meta.url), 'utf8');
const SCENE = readFileSync(new URL('../src/game/scenes/IslandScene.ts', import.meta.url), 'utf8');

describe('a held seat is found before a new island is picked', () => {
  it('returns the island the player is already sitting on', () => {
    const store = new MemoryIslandStore();
    const a = store.create('seat-a', 0);
    const b = store.create('seat-b', 0);
    // `b` is fuller, so `findJoinable` would send them there.
    a.rabbits.set('p1', spawnRabbit('p1', 'P', 10, a.island.seed));
    for (const id of ['o1', 'o2']) {
      b.rabbits.set(id, spawnRabbit(id, 'O', 10, b.island.seed));
    }

    expect(store.findJoinable()?.island.id).toBe(b.island.id);
    expect(store.seatOf('p1')?.island.id).toBe(a.island.id);
  });

  it('has nothing to say about a player with no seat', () => {
    const store = new MemoryIslandStore();
    store.create('seat-c', 0);
    expect(store.seatOf('nobody')).toBeUndefined();
  });

  it('will not send anyone back to an erupting island', () => {
    const store = new MemoryIslandStore();
    const live = store.create('seat-d', 0);
    live.rabbits.set('p1', spawnRabbit('p1', 'P', 10, live.island.seed));
    live.erupting = true;
    expect(store.seatOf('p1')).toBeUndefined();
  });
});

describe('the spawn is the island centre, not the flat-grid centre', () => {
  it('places a fresh rabbit on the seed-derived spawn', () => {
    for (const seed of ['r-1', 'r-2', 'r-3', 'r-4']) {
      expect(spawnRabbit('p1', 'P', 10, seed).tile).toBe(spawnTile(seed));
    }
  });
});

describe('the server only reuses a rabbit for a genuine reconnect', () => {
  it('gates reuse on disconnectedAt and on being alive', () => {
    // A seat with no `disconnectedAt` entry means the socket never dropped:
    // the player crossed to their burrow, which is a new run.
    expect(SERVER).toMatch(/live\.disconnectedAt\.has\(data\.playerId\)/);
    expect(SERVER).toMatch(/held\.alive/);
  });

  it('prefers the island already holding the seat', () => {
    expect(SERVER).toMatch(/store\.seatOf\(data\.playerId\)\s*\?\?\s*store\.findJoinable\(\)/);
  });

  it('banks the abandoned rabbit rather than dropping its carrots', () => {
    expect(SERVER).toMatch(/bankRun:rejoin/);
  });
});

describe('every crossing out to the island asks for a seat', () => {
  it('exposes join alongside leave', () => {
    expect(HOOK).toMatch(/socketRef\.current\?\.emit\('join'\)/);
    expect(HOOK).toMatch(/moveTo,\s*restart,\s*join,\s*leave/);
  });

  it('pairs the join on the way out with the leave on the way in', () => {
    expect(PAGE).toMatch(/next === 'burrow' && where === 'island' && !spectating\) game\.leave\(\)/);
    expect(PAGE).toMatch(/next === 'island' && where === 'burrow' && !spectating\) game\.join\(\)/);
  });
});

describe('a snapshot repositions a rabbit the scene already holds', () => {
  it('no longer drops the event on a known rabbit', () => {
    // The old guard — `if (this.rabbits.has(playerId)) return;` — left the
    // sprite standing where the last run ended while the server answered from
    // the spawn.
    expect(SCENE).not.toMatch(/if \(this\.rabbits\.has\(playerId\)\) return;/);
    expect(SCENE).toMatch(/known\.setPosition\(index\)/);
  });
});
