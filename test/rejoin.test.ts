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
import { ERUPTION } from '../config/tuning';
import { safeTilesLeft } from '../src/lib/game/island';
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
    // The seat comes FIRST in the chain — before the first-timer's own island
    // and before drop-in. A first-timer who refreshes mid-run has a seat, and
    // must not be dealt a second tutorial island on top of it.
    expect(SERVER).toMatch(
      /store\.seatOf\(data\.playerId\)\s*\?\?\s*\(player\.runsPlayed === 0 \? newFirstIsland\(player\.id\) : undefined\)\s*\?\?\s*store\.findJoinable\(\)/,
    );
  });

  it('banks the abandoned rabbit rather than dropping its carrots', () => {
    expect(SERVER).toMatch(/bankRun:rejoin/);
  });
});

describe('every crossing out to the island asks for a seat', () => {
  it('exposes join alongside leave', () => {
    // On a CONNECTED socket only — a buffered ask is sent again by the
    // connect handler (first-trip.test.ts).
    expect(HOOK).toMatch(/if \(socket\?\.connected\) socket\.emit\('join'\)/);
    expect(HOOK).toMatch(/moveTo,\s*restart,\s*join,\s*leave/);
  });

  it('pairs the join on the way out with the leave on the way in', () => {
    // `watching`, the crossing's own argument, not the `spectating` state:
    // a spectate sets the state and crosses in the same breath, and the
    // closure it calls still read "playing" — see session-scope.test.ts.
    expect(PAGE).toMatch(/next === 'burrow' && where === 'island' && !watching\) game\.leave\(\)/);
    expect(PAGE).toMatch(/next === 'island' && where === 'burrow' && !watching\) game\.join\(\)/);
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

/** Dig every safe tile but `leave` of them, so the island is nearly cleared. */
function nearlyClear(island: { tiles: Map<number, { revealed: boolean; content: string }> }, leave: number) {
  let left = safeTilesLeft(island as never);
  for (const tile of island.tiles.values()) {
    if (left <= leave) break;
    if (tile.content === 'bomb' || tile.revealed) continue;
    tile.revealed = true;
    left--;
  }
}

describe('a nearly cleared island is not worth a run to anyone new', () => {
  it('is skipped by findJoinable, and a fresh island is picked instead', () => {
    const store = new MemoryIslandStore();
    const spent = store.create('spent', 0);
    nearlyClear(spent.island, ERUPTION.JOIN_MIN_TILES_LEFT - 1);
    spent.rabbits.set('p1', spawnRabbit('p1', 'P', 10, spent.island.seed));
    const fresh = store.create('fresh', 0);
    // The spent island is the FULLER one, which is what findJoinable prefers —
    // the floor has to win over that.
    expect(store.findJoinable()).toBe(fresh);
  });

  it('is nobody\'s to join at all when it is the only one', () => {
    const store = new MemoryIslandStore();
    const spent = store.create('spent', 0);
    nearlyClear(spent.island, ERUPTION.JOIN_MIN_TILES_LEFT - 1);
    expect(store.findJoinable()).toBeUndefined();
  });

  it('still takes a joiner right at the floor', () => {
    const store = new MemoryIslandStore();
    const live = store.create('edge', 0);
    nearlyClear(live.island, ERUPTION.JOIN_MIN_TILES_LEFT);
    expect(store.findJoinable()).toBe(live);
  });
});

describe('an empty island', () => {
  it('lives out its day while there is something left to finish', () => {
    const store = new MemoryIslandStore();
    store.create('kept', 0);
    const now = Date.now();
    expect(store.reapable(now + 60 * 60 * 1000)).toEqual([]);
  });

  it('goes at once when nobody new would be sent to it', () => {
    const store = new MemoryIslandStore();
    const spent = store.create('spent', 0);
    nearlyClear(spent.island, ERUPTION.JOIN_MIN_TILES_LEFT - 1);
    expect(store.reapable(Date.now() + 1000)).toEqual([spent]);
  });
});
