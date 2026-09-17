/**
 * The first trip lands on ONE tutorial island, decided at sign-in.
 *
 * Seen live: a first-timer's island drawn twice, one coastline over another,
 * the rabbit standing off both. The ask for a seat had gone out twice —
 * socket.io buffers an emit made on a socket that is still connecting and
 * flushes it on `connect`, where the client's own handler asks again — and
 * the server dealt a first island per ask. On the client, the two snapshots
 * then interleaved two terrain builds on one scene. Four things pin it shut:
 * the client asks once, the server answers one ask at a time, the first
 * island is named after the player (so two asks could only ever name one),
 * and a build the scene has moved on from throws its ground away.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryIslandStore } from '../server/islands/store';
import { firstIslandSeed } from '../src/lib/game/first-island';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const HOOK = read('../src/components/use-game-socket.ts');
const SCENE = read('../src/game/scenes/IslandScene.ts');
const PAGE = read('../src/app/page.tsx');
const LOGIN = read('../src/components/use-wallet-login.tsx');
const GUEST = read('../src/app/api/auth/guest/route.ts');
const VERIFY = read('../src/app/api/auth/verify/route.ts');

describe('one ask, one seat', () => {
  it('asks only on a socket that is connected — the connect handler asks otherwise', () => {
    const join = HOOK.slice(HOOK.indexOf('const join = useCallback'));
    expect(join.slice(0, 900)).toMatch(/if \(socket\?\.connected\) socket\.emit\('join'\)/);
    // The unguarded emit is what got buffered and sent twice.
    expect(join.slice(0, 900)).not.toMatch(/socketRef\.current\?\.emit\('join'\)/);
  });

  it('answers one join at a time on a socket, dropping the duplicate', () => {
    expect(SERVER).toMatch(/joining\?: boolean/);
    expect(SERVER).toMatch(/socket\.on\('join', guard\('join', oneAtATime\(data, async \(\) => \{/);
    const gate = SERVER.slice(SERVER.indexOf('function oneAtATime'));
    // Dropped, not queued: a queued duplicate would find the seat the first
    // one took and restart the run as a walk-home-and-back.
    expect(gate.slice(0, 600)).toMatch(/if \(data\.joining\) \{[\s\S]*?return;/);
    expect(gate.slice(0, 600)).toMatch(/finally \{\s*data\.joining = false;/);
  });
});

describe('the first island is named after the player', () => {
  it('is dealt from the player id, not a random uuid', () => {
    expect(SERVER).toMatch(/newFirstIsland\(player\.id\)/);
    const deal = SERVER.slice(SERVER.indexOf('function newFirstIsland'));
    expect(deal.slice(0, 900)).toMatch(/firstIslandSeed\(playerId\)/);
    expect(deal.slice(0, 900)).not.toMatch(/randomUUID/);
  });

  it('is the same island the client cuts as its placeholder', () => {
    // Both sides name it the same way, so the first frame IS the island.
    expect(PAGE).toMatch(/firstTimer \? firstIslandSeed\(player\.id\) : player\.id/);
  });

  it('tears down a stale first island rather than reusing its holes', () => {
    const store = new MemoryIslandStore();
    const seed = firstIslandSeed('p1');
    const stale = store.create(seed, 0, { solo: true });
    // A second `create` with the same id would overwrite in the map; the
    // server deletes first so the terrain cache is dropped with it.
    expect(store.get(seed)).toBe(stale);
    store.delete(seed);
    expect(store.get(seed)).toBeUndefined();
    const fresh = store.create(seed, 0, { solo: true });
    expect(fresh).not.toBe(stale);
    expect(fresh.solo).toBe(true);
    const deal = SERVER.slice(SERVER.indexOf('function newFirstIsland'));
    expect(deal.slice(0, 900)).toMatch(/if \(store\.get\(seed\)\) store\.delete\(seed\);/);
  });
});

describe('a build the scene moved on from is thrown away', () => {
  it('numbers each setIsland and checks the number after the await', () => {
    const swap = SCENE.slice(SCENE.indexOf('private async swapIsland'));
    expect(SCENE).toMatch(/const swap = this\.swapIsland\(seed, \+\+this\.islandRun\)/);
    // The old ground is let go of BEFORE the await, so an overtaking call
    // cannot destroy it a second time...
    expect(swap.slice(0, 2500)).toMatch(/this\.background\?\.destroy\(\);[\s\S]*?this\.background = null;[\s\S]*?await createTerrainBackground/);
    // ...and a ground built for a seed that is no longer wanted never joins
    // the container's picture.
    expect(swap.slice(0, 2500)).toMatch(/if \(run !== this\.islandRun\) \{[\s\S]*?background\.destroy\(\);[\s\S]*?await this\.islandSwap;[\s\S]*?return;/);
  });
});

describe('first-timer is decided at the cut, from the sign-in', () => {
  it('reads runsPlayed off the player when the burrow has not answered yet', () => {
    expect(PAGE).toMatch(/const firstTimer = burrow \? burrow\.runs === 0 : player\?\.runsPlayed === 0;/);
  });

  it('carries runsPlayed on the player from every sign-in', () => {
    expect(LOGIN).toMatch(/runsPlayed\?: number/);
    // Both setters: the restore from /me and the adopt from verify/guest.
    expect(LOGIN.match(/runsPlayed: typeof \w+\.player\.runsPlayed === 'number'/g)?.length).toBe(2);
    expect(GUEST).toMatch(/guest: true, runsPlayed: 0/);
    expect(VERIFY).toMatch(/runsPlayed: player!\.runsPlayed/);
  });
});
