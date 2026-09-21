/**
 * SABOTAGE IS SOMETHING YOU GO AND DO, AND THE DIGGER SEES YOU COMING.
 *
 * Two halves of one rule, pinned here because each is a one-character edit
 * away from silently reverting:
 *
 *  - the bolt and the bomb belong to the VIEWER. They used to be offered on
 *    your own run, where they had nothing worth aiming at. You open a rival
 *    from the leaderboard, you watch them dig, and the two buttons are there.
 *    Paul, 2026-09-21: "il faut le voir seulement quand tu es en mode viewer".
 *
 *  - and the digger is told. `0 online` over MARK A BOMB is the quiet board;
 *    a number above it means somebody is out there choosing a tile; and when
 *    one of them lands a hit, the same line names them.
 *
 * The client half is pinned against the SOURCES (a rendering test of a Pixi
 * page would be a test of Pixi), the server half against its own file. What
 * cannot be faked here — that the server actually accepts a spectator's bolt —
 * is pinned as the ABSENCE of the guard that used to refuse it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGE = read('../src/app/page.tsx');
const SERVER = read('../server/index.ts');
const STRIP = read('../src/components/watcher-strip.tsx');
const SOCKET = read('../src/components/use-game-socket.ts');

/** The body of one `socket.on('<event>', ...)` handler, up to the next one. */
function handler(event: string): string {
  const at = SERVER.indexOf(`socket.on('${event}'`);
  expect(at, `no handler for ${event}`).toBeGreaterThan(-1);
  const next = SERVER.indexOf("socket.on('", at + 10);
  return SERVER.slice(at, next === -1 ? SERVER.length : next);
}

describe('the bolt and the bomb are the viewer\'s', () => {
  it('offers the arm plate while watching, and not while digging', () => {
    // The whole rule is this one condition. It read `!spectating` before.
    expect(PAGE).toMatch(/arm=\{spectating && !game\.firstRun \?/);
    expect(PAGE).not.toMatch(/arm=\{!spectating/);
  });

  it('lets a spectator fire, and still refuses them a step', () => {
    // The two sabotage handlers dropped their spectator guard...
    for (const event of ['lightning', 'plant']) {
      expect(handler(event), event).not.toMatch(/\|\| data\.spectating\) return/);
    }
    // ...and every handler that MOVES A RABBIT kept it. A spectator owns no
    // rabbit, so these are not policy, they are the absence of a subject.
    for (const event of ['move', 'flag', 'mirage']) {
      expect(handler(event), event).toMatch(/data\.spectating/);
    }
    // The plant had a second gate with the same effect — "only somebody
    // actually digging this island may mine it" — which a watcher also fails.
    expect(handler('plant')).toMatch(/!data\.spectating && !live\.rabbits\.get/);
  });

  it('fires the tap through, rather than dropping it while watching', () => {
    // The intents that aim an item no longer bail on `spectating`; the one
    // that steps a rabbit still does.
    expect(PAGE).toMatch(/const onMoveIntent[\s\S]{0,200}?if \(spectating\) return;/);
    for (const intent of ['onStrikeIntent', 'onPlantIntent']) {
      const at = PAGE.indexOf(`const ${intent}`);
      expect(at, intent).toBeGreaterThan(-1);
      expect(PAGE.slice(at, at + 200), intent).not.toMatch(/if \(spectating\) return;/);
    }
  });
});

describe('the digger is told who is watching', () => {
  it('counts watchers off the live sockets, and pushes on every change', () => {
    expect(SERVER).toMatch(/function watchersOf\(playerId: string\): number/);
    // Counted by walking, not tallied: a counter that misses one of the four
    // ways out of a watch shows an eye that is not there.
    expect(SERVER).toMatch(/spectating === playerId/);
    // Both ends of a switch, plus the three exits: spectate, leave, disconnect.
    expect(handler('spectate')).toMatch(/pushWatchers\(target\)/);
    expect(handler('spectate')).toMatch(/pushWatchers\(watchedBefore\)/);
    expect(handler('leave')).toMatch(/pushWatchers\(watched\)/);
    expect(handler('disconnect')).toMatch(/pushWatchers\(data\.spectating\)/);
  });

  it('starts every island at zero rather than at the last one\'s count', () => {
    // The server pushes only on a CHANGE, so a new island with nobody on it
    // sends nothing — without this the strip opens showing stale eyes.
    expect(SOCKET).toMatch(/setWatchers\(0\)/);
    expect(SOCKET).toMatch(/socket\.on\('watchers'/);
  });

  it('prints the count in every language, zero included', () => {
    for (const locale of LOCALES) {
      const { run } = DICTIONARIES[locale];
      expect(run.watchers(0), locale).toContain('0');
      expect(run.watchers(3), locale).toContain('3');
      // Zero is PRINTED, not blanked: a line that only appears when someone
      // arrives is a jump-scare that also shifts the button under it.
      expect(run.watchers(0).trim(), locale).not.toBe('');
    }
  });

  it('names the rival on a hit, and says it in one place only', () => {
    // The strip carries both kinds of hit, in the SHORT wording: the long
    // `struckBy`/`plantedBy` were written for a toast across the screen and
    // ran off the right edge of a phone down here. Seen in the story shot.
    expect(STRIP).toMatch(/t\.run\.hitBolt\(who\)/);
    expect(STRIP).toMatch(/t\.run\.hitBomb\(who\)/);
    for (const locale of LOCALES) {
      const { run } = DICTIONARIES[locale];
      for (const line of [run.hitBolt('BlackPaw'), run.hitBomb('BlackPaw')]) {
        expect(line, locale).toContain('BlackPaw');
        // The corner fits a short line. Latin scripts are held to a budget
        // that survives a long name on a 420px screen; CJK says it in fewer
        // characters and is measured on its own terms.
        expect(line.length, `${locale}: "${line}"`).toBeLessThanOrEqual(32);
      }
    }
    // ...and the page no longer raises the same sentence as a toast beside it.
    expect(PAGE).not.toMatch(/setNote\(t\.run\.struckBy\(/);
    expect(PAGE).not.toMatch(/setNote\(t\.run\.plantedBy\(/);
  });

  it('shows the strip on exactly the run MARK A BOMB is offered on', () => {
    // The count is the warning and the X is the answer to it, so the pair
    // must never half-appear. Same guard, twice.
    const guard = /!spectating && game\.me\?\.alive && !game\.recap && game\.erupting === null/g;
    expect(PAGE.match(guard)?.length).toBe(2);
  });
});
