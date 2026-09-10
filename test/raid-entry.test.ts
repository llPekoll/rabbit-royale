/**
 * The attacking half of the game, and who counts as "digging".
 *
 * Two bugs found by looking at a live board:
 *
 *  1. A player who walked back to their burrow stayed flagged as digging until
 *     they closed the tab. `markOffline` was only called on `disconnect`, and
 *     the `leave` handler — the "To the burrow" arrow — never cleared it. The
 *     board then offered a WATCH button on a run that had ended, which lands on
 *     the server's `not_playing`.
 *  2. You could not raid anyone. The target list, the raid HUD, the API and the
 *     whole crossing were built and wired, but `setPickingTarget(true)` was
 *     never called anywhere — the door was missing, so the feature was dead UI.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SERVER = readFileSync('server/index.ts', 'utf8');
const PAGE = readFileSync('src/app/page.tsx', 'utf8');
const PANEL = readFileSync('src/components/raid-panel.tsx', 'utf8');

/** The body of a `socket.on('<name>', ...)` handler. */
function handler(name: string): string {
  const start = SERVER.indexOf(`socket.on('${name}'`);
  expect(start, `no '${name}' handler`).toBeGreaterThan(-1);
  const next = SERVER.indexOf('socket.on(', start + 10);
  return SERVER.slice(start, next === -1 ? undefined : next);
}

describe('digging presence is cleared on every exit', () => {
  it('clears it when a player walks back to the burrow', () => {
    // THE bug: leaving is the ordinary way a run ends, and it is the one path
    // that did not clear presence.
    expect(handler('leave')).toMatch(/markOffline/);
  });

  it('clears it between two runs', () => {
    // Restart drops the rabbit and joins a new island; for that gap there is
    // no run to watch.
    expect(handler('restart')).toMatch(/markOffline/);
  });

  it('still clears it on disconnect', () => {
    // The path that already worked. Kept so a refactor cannot trade one for
    // the others.
    expect(handler('disconnect')).toMatch(/markOffline/);
  });

  it('sets it when a run actually starts', () => {
    // Presence must mean "on an island", not "connected" — otherwise the whole
    // column is decoration and every row offers a watch.
    expect(handler('join')).toMatch(/markOnline/);
  });

  it('never lets presence break a run', () => {
    // This file took production down once already: a bad second from Redis
    // killed the process and every live island on it.
    expect(SERVER).toMatch(/optional\('markOffline'/);
    expect(SERVER).toMatch(/optional\('markOnline'/);
  });
});

describe('raiding is reachable', () => {
  it('has a control that opens the target list', () => {
    // The bug: `setPickingTarget` existed and was only ever set to false.
    expect(PAGE).toMatch(/setPickingTarget\(true\)/);
  });

  it('refreshes the targets when the door opens', () => {
    // The list is loaded once on mount; stock and shields move, and a raid on
    // a stale target is a wasted crossing.
    expect(PAGE).toMatch(/setPickingTarget\(true\); void raid\.refresh\(\)/);
  });

  it('counts only burrows that can actually be robbed', () => {
    // Advertising loot behind a shield is the button lying about the trip.
    expect(PANEL).toMatch(/targets\.filter\(\(t\) => !t\.shielded\)/);
  });

  it('still shows the door when there is nobody to rob', () => {
    // A control that vanishes on a quiet night reads as a broken feature.
    expect(PANEL).toMatch(/NOBODY TO ROB/);
    expect(PANEL).toMatch(/ALL BURROWS SHIELDED/);
  });
});

/**
 * Getting back OUT of a raid.
 *
 * Found by walking into Clementine's burrow and looking for the exit: there
 * wasn't one. The way home is normally in the burrow column, which is (rightly)
 * hidden during a raid, and the HUD's only button lived behind `raid.finished`.
 */
describe('leaving a raid', () => {
  const ROUTE = readFileSync('src/app/api/raid/route.ts', 'utf8');
  const HOOK = readFileSync('src/components/use-raid.ts', 'utf8');

  it('offers a way out mid-raid', () => {
    // Without this a raider who changed their mind was stuck on someone else's
    // board until their energy ran out.
    expect(PANEL).toMatch(/!raid\.finished && \([\s\S]{0,200}rr-raid-quit/);
  });

  it('can end a raid server-side', () => {
    // The row must be CLOSED, or the run stays open with a null endedAt and
    // every later raid comes back `raid_in_progress` forever.
    expect(ROUTE).toMatch(/export async function DELETE/);
    expect(ROUTE).toMatch(/\.set\(\{ endedAt: new Date\(\), succeeded: false, carrotsLooted: 0 \}\)/);
  });

  it('actually calls it when leaving', () => {
    // Clearing local state alone was the bug: the client forgot, the server
    // did not.
    expect(HOOK).toMatch(/fetch\('\/api\/raid', auth\(\{ method: 'DELETE' \}\)\)/);
  });

  it('closes rather than deletes, so the cooldown still counts', () => {
    // Abandoning must not be a free re-roll of the trap layout.
    expect(ROUTE).not.toMatch(/delete\(raidRuns\)/);
  });

  it('hides your own burrow while you are in someone else\'s', () => {
    // Your 400/400 HP and a HARVEST button over a castle you are robbing.
    expect(PAGE).toMatch(/crossing \|\| raid\.raid \? null/);
  });
});
