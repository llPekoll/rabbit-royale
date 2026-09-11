/**
 * Watching someone else's run.
 *
 * Two bugs are pinned here, both found by clicking a leaderboard row in prod:
 *
 *  1. The row navigated to `/play?spectate=...` and that route does not exist.
 *     The game is ONE page and two Pixi scenes — every crossing is a wipe, not
 *     a navigation — so a router push could only ever 404.
 *  2. The id it put in the query string was `sol:<address>`: a live wallet in
 *     the address bar, in browser history, in the referrer of every request the
 *     page then made, and in any screenshot of the run. Irreversible once it
 *     has happened, and never necessary — watching needs a target, not a key.
 *
 * Source-text assertions, like the other chrome tests in this suite: the thing
 * being protected is a WIRING decision, and wiring is what regresses.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync('src/app/page.tsx', 'utf8');
const DRAWER = readFileSync('src/components/leaderboard-drawer.tsx', 'utf8');
const SCENE = readFileSync('src/game/scenes/IslandScene.ts', 'utf8');
const HUD = readFileSync('src/components/run-hud.tsx', 'utf8');

describe('spectating', () => {
  it('never routes to a URL', () => {
    // The 404 that started this. No route, no query string, no router.
    // Only CODE is scanned: the header comment names `/play` on purpose, to
    // record what went wrong, and a test that forbade the word would forbid
    // explaining the bug it protects against.
    const code = DRAWER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\/play/);
    expect(code).not.toMatch(/router\.push/);
    expect(code).not.toMatch(/useRouter/);
    expect(PAGE).not.toMatch(/spectate=/);
  });

  it('never puts a player id in a query string', () => {
    // `playerId` is `sol:<address>`. Nothing may encode it into a location.
    expect(DRAWER).not.toMatch(/encodeURIComponent\(e\.playerId\)/);
    expect(PAGE).not.toMatch(/searchParams/);
  });

  it('reports the target upward instead of navigating', () => {
    expect(DRAWER).toMatch(/onSpectate\?\.\(e\.playerId\)/);
    expect(PAGE).toMatch(/onSpectate=\{spectate\}/);
  });

  it('crosses to the island the same way playing does', () => {
    // A wipe, not a route change — the scene swap the app already owns.
    const fn = PAGE.slice(PAGE.indexOf('const spectate = useCallback'));
    const body = fn.slice(0, fn.indexOf('}, ['));
    expect(body).toMatch(/setSpectating\(targetId\)/);
    expect(body).toMatch(/goTo\('island'\)/);
  });

  it('feeds the target to the socket so the session switches mode', () => {
    // Passing a literal null here was what made the feature dead code.
    expect(PAGE).toMatch(/useGameSocket\(token, player\?\.id \?\? null, spectating\)/);
  });

  it('cannot strand the session in viewer mode', () => {
    // Every way off the island clears the target. A second exit path that
    // forgot to would leave a player watching with no route back to their own
    // game, and the only fix would be a reload.
    expect(PAGE).toMatch(/onClick=\{stopSpectating\}/);
    const stop = PAGE.slice(PAGE.indexOf('const stopSpectating = useCallback'));
    const body = stop.slice(0, stop.indexOf('}, ['));
    expect(body).toMatch(/setSpectating\(null\)/);
    expect(body).toMatch(/goTo\('burrow'\)/);
    // Signing out drops it too, or the next player inherits the watch.
    const reset = PAGE.slice(PAGE.indexOf('if (player) return;'));
    expect(reset.slice(0, reset.indexOf('}, [player]);'))).toMatch(/setSpectating\(null\)/);
  });

  it('does not let a viewer light up tiles they cannot dig', () => {
    // The scene flashes a tapped tile BEFORE the server answers, so the guard
    // has to be in the scene: the server refusing the move is not enough to
    // stop the lie, it only stops the dig.
    const fn = SCENE.slice(SCENE.indexOf('private requestMove'));
    const body = fn.slice(0, fn.indexOf('this.data?.onMoveIntent'));
    expect(body).toMatch(/this\.rabbits\.has\(this\.data\.playerId\)/);
    // ...and the guard must come before the flash, not after it.
    expect(body.indexOf('rabbits.has')).toBeLessThan(body.indexOf('.flash()'));
  });

  it('shows the watched run, not an empty one', () => {
    // `game.me` resolves by the VIEWER's id and is null while spectating, so
    // the playing HUD showed a spectator zero carrots and an empty bar.
    //
    // Reads the HUD's own file: it moved out of `page.tsx` so that a story
    // could drive it, which is how "the carrot counter does not move" became
    // answerable without playing the real game.
    expect(HUD).toMatch(/game\.rabbits\.get\(spectating\)/);
    expect(HUD).toMatch(/watching/);
  });

  it('offers no run recap to someone who was only watching', () => {
    // `restart` would start a run the viewer never asked for.
    expect(PAGE).toMatch(/game\.recap && !spectating/);
  });
});

/**
 * The season board's roster.
 *
 * Pinned because the bug it protects against was silent and long-lived: a
 * player with a real score in Postgres simply never appeared, and there was
 * nothing to see in any log.
 */
describe('leaderboard roster', () => {
  const ROUTE = readFileSync('src/app/api/leaderboard/route.ts', 'utf8');

  it('asks Postgres for the top players unconditionally', () => {
    // The bug: the Redis sorted set decided WHO EXISTS, not just their order.
    // A player only enters that set when the WS server mirrors their score on
    // join, so anyone who had not started a run since the season opened was
    // invisible however high they scored — and nothing ever backfilled it.
    const before = ROUTE.indexOf('const fromDb = await db.select');
    const branch = ROUTE.indexOf('if (ranked.length > 0)');
    expect(before).toBeGreaterThan(-1);
    // The query must sit BEFORE the branch, i.e. it is not conditional on Redis.
    expect(before).toBeLessThan(branch);
  });

  it('orders by the score in Postgres, not the one in Redis', () => {
    // Redis is a cache and can be stale. Sorting by its score would reorder the
    // board around a number that exists nowhere else.
    expect(ROUTE).toMatch(/sort\(\(a, b\) => b\.seasonScore - a\.seasonScore\)/);
  });

  it('still honours players Redis knows about', () => {
    // The merge must not become "ignore Redis": a player the cache ranks but
    // who falls outside the Postgres page is fetched rather than dropped.
    expect(ROUTE).toMatch(/filter\(\(id\) => !known\.has\(id\)\)/);
  });
});

/**
 * Who is out on an island right now.
 *
 * Presence is the only live column on the board, and it is what makes a row
 * worth tapping: spectating someone who is not digging lands on the server's
 * `not_playing` error, so without this the board is mostly buttons that fail.
 */
describe('digging presence', () => {
  const LIB = readFileSync('src/lib/leaderboard.ts', 'utf8');
  const ROUTE = readFileSync('src/app/api/leaderboard/route.ts', 'utf8');

  it('asks Redis once for the whole page', () => {
    // One SMISMEMBER, not one SISMEMBER per row — the board asks about fifty
    // players every time it opens.
    expect(LIB).toMatch(/smIsMember\(ONLINE_KEY, ids\)/);
    expect(ROUTE).toMatch(/onlineAmong\(rows\.map/);
  });

  it('never lets presence break the board', () => {
    // Redis is decoration here. A throw would take down a leaderboard that is
    // perfectly serveable from Postgres, so the failure mode is an empty set.
    const fn = LIB.slice(LIB.indexOf('export async function onlineAmong'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/try \{/);
    expect(body).toMatch(/catch \{[\s\S]*return new Set\(\)/);
  });

  it('only offers a watch on someone who is actually digging', () => {
    // The row is disabled otherwise: a spectate that lands on an empty board
    // is an error dressed up as a feature.
    expect(DRAWER).toMatch(/!e\.digging/);
  });

  it('refreshes, because presence goes stale', () => {
    // Scores barely move; who is on an island changes by the minute, and a
    // watch button pointing at someone who left ten minutes ago is worse than
    // no button at all.
    expect(DRAWER).toMatch(/setInterval\(load/);
    // ...and the poll must be cleaned up, or every open leaks a timer.
    expect(DRAWER).toMatch(/clearInterval\(id\)/);
  });
});
