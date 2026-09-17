/**
 * A reload does not end a run — on BOTH sides now.
 *
 * The server always kept the seat through a grace window; the client after a
 * reload opened on the burrow and asked for nothing, so the run was recovered
 * only if DIG was pressed inside the window and banked by the sweep
 * otherwise. The server now announces a live seat on connect (`seat_held`),
 * and the page crosses back to it by itself; the join finds `existing` and
 * pays nothing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const HOOK = read('../src/components/use-game-socket.ts');
const PAGE = read('../src/app/page.tsx');

describe('seat_held', () => {
  it('is announced on connect for a LIVE rabbit whose socket dropped', () => {
    const conn = SERVER.slice(SERVER.indexOf("io.on('connection'"));
    const head = conn.slice(0, conn.indexOf("socket.on('join'"));
    expect(head).toMatch(/store\.seatOf\(data\.playerId\)/);
    // Alive, and behind a dropped socket: a dead rabbit's run is over, and a
    // seat without `disconnectedAt` is a walk-home-and-back, which pays.
    expect(head).toMatch(/rabbit\?\.alive && held\.disconnectedAt\.has\(data\.playerId\)/);
    expect(head).toMatch(/socket\.emit\('seat_held', \{ seed: held\.island\.seed \}\)/);
  });

  it('is held as spendable state and cleared once seated or gone', () => {
    expect(HOOK).toMatch(/socket\.on\('seat_held'/);
    const island = HOOK.slice(HOOK.indexOf("socket.on('island'"));
    expect(island.slice(0, 400)).toMatch(/setSeatHeld\(null\)/);
    const leave = HOOK.slice(HOOK.indexOf('const leave = useCallback'));
    expect(leave.slice(0, 300)).toMatch(/setSeatHeld\(null\)/);
  });

  it('crosses back from a settled burrow, once', () => {
    const fx = PAGE.slice(PAGE.indexOf('const spentSeat = useRef(0);'));
    const body = fx.slice(0, fx.indexOf('}, [game.seatHeld'));
    expect(body).toMatch(/s\.at === spentSeat\.current\) return;/);
    expect(body).toMatch(/!ready \|\| !showCanvas \|\| arriving \|\| crossing \|\| spectating \|\| game\.dropped\) return;/);
    // Spent BEFORE the burrow check: on the island (a first-timer's reload)
    // there is nothing to do, and the announcement must not fire later.
    expect(body).toMatch(/spentSeat\.current = s\.at;\s*if \(where !== 'burrow'\) return;/);
    expect(body).toMatch(/goTo\('island'\)/);
  });
});
