/**
 * THE BURROW'S BAR IS FETCHED, NOT PUSHED — so every moment that changes it
 * server-side needs a matching re-read on the client, or the number lies.
 *
 * Reported from production on 15 September 2026: "je vais farmer, ça me coûte
 * pas d'énergie, je suis toujours à 60". The energy WAS spent — `payForRun`
 * charges at the crossing — but the only refresh was keyed on `banked`, the
 * event announcing that a finished run's carrots are written. That fires much
 * later than the charge, and not at all for a run that banked nothing, so the
 * bar sat at its pre-run figure indefinitely.
 *
 * Asserted against the sources rather than by mounting the page: what broke is
 * not a computation but a MISSING WIRE, and a wire is only visible in the code
 * that draws it. Each assertion below names one moment the server moves the
 * bar and the client must answer.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const SERVER = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
const RAID_HUD = readFileSync(new URL('../src/components/raid-panel.tsx', import.meta.url), 'utf8');

/**
 * The body of a `useEffect` whose dependency array mentions `dep`.
 *
 * Brace-matched from the opening call rather than cut at the first `});`,
 * which lands inside any effect holding a nested callback — and most of them
 * do. Naive cutting made this helper report an effect's first few lines and
 * then fail to find a call that was plainly there.
 */
function effectsOn(source: string, dep: string): string[] {
  const found: string[] = [];
  for (let i = source.indexOf('useEffect('); i !== -1; i = source.indexOf('useEffect(', i + 1)) {
    let depth = 0;
    let end = -1;
    for (let j = i + 'useEffect'.length; j < source.length; j++) {
      const c = source[j];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }
    if (end === -1) continue;
    const call = source.slice(i, end + 1);
    // The dependency array is the last bracketed group in the call.
    const deps = call.slice(call.lastIndexOf('['), call.lastIndexOf(']') + 1);
    if (deps.includes(dep)) found.push(call);
  }
  return found;
}

/**
 * Does any effect watching `dep` actually CALL the refresher?
 *
 * The body is searched without its dependency array, because `refreshBurrow`
 * is itself a dependency of every effect that uses it — matching the whole
 * call would pass on an effect that merely lists it and never calls it, which
 * is exactly the bug this file exists to catch. A `Ref.current()` call counts:
 * two effects reach the refresher that way on purpose, to keep a changing
 * callback out of their dependencies.
 */
function refreshesOn(source: string, dep: string): boolean {
  const effects = effectsOn(source, dep);
  expect(effects.length).toBeGreaterThan(0);
  return effects.some((call) => {
    const body = call.slice(0, call.lastIndexOf('['));
    return /refreshBurrow(Ref\.current)?\(\)/.test(body);
  });
}

describe('the burrow bar keeps up with the server', () => {
  it('is charged at the crossing, not when a run ends', () => {
    // The premise of everything below: if this ever moves to the END of a run,
    // the refresh that matters moves with it.
    const join = SERVER.slice(SERVER.indexOf("socket.on('join'"));
    expect(join.slice(0, join.indexOf('const rabbit ='))).toMatch(/payForRun\(/);
  });

  it('re-reads once a seat is granted — the charge just happened', () => {
    // ON THE KEY, NOT THE SEED. `findJoinable` seats a returning player back on
    // the island they just left whenever it still has room, so a second trip
    // out carries the SAME seed: keyed on the seed this effect does not re-run,
    // and the bar holds its pre-run figure for the whole run. Reported again on
    // 21 September 2026 — "si tu vas dig et que tu fais pas un mouvement ton
    // energie est pas consomee, si tu etais a 60 tu restes a 60" — the charge
    // having landed at the door all along. `islandKey` is bumped by every
    // snapshot, which is the question this effect asks.
    expect(refreshesOn(PAGE, 'game.islandKey')).toBe(true);
  });

  it('re-reads when a run banks its carrots', () => {
    expect(refreshesOn(PAGE, 'game.banked')).toBe(true);
  });

  it('re-reads when the server refuses a crossing for lack of energy', () => {
    // The refusal carries a figure the player is about to act on (buy a
    // refill, or wait), so a stale bar underneath it is worse here than
    // anywhere else.
    expect(refreshesOn(PAGE, 'game.refused')).toBe(true);
  });
});

describe('the raid spends the one tank, and the one gauge shows it', () => {
  /**
   * The report this used to guard against — "j'ai fait un raid il me reste
   * 10, alors que j'avais 60" — came from a raid having its OWN budget drawn
   * like the bank's. There is one tank now (ENERGY.CROSSING_COST's note): the
   * raid pays its toll and its steps out of it, and the medallion on the
   * carrot pill is the one place the number is read.
   */
  it('draws no bar of its own on the raid plate', () => {
    expect(RAID_HUD).not.toMatch(/rr-raid-energy/);
    expect(PAGE).toMatch(/if \(raid\.raid && raid\.raid\.tank !== null\) return \{ energy: raid\.raid\.tank, max \}/);
  });

  it('pays the toll and every step from the player\'s own energy', () => {
    const route = readFileSync(new URL('../src/app/api/raid/route.ts', import.meta.url), 'utf8');
    const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'));
    expect(patch).toMatch(/await payEnergy\(session\.sub, TOLL\)/);
    expect(patch).toMatch(/cost: RAID_RUN\.STEP_COST \+ \(trap \? TRAPS\.DRAIN : 0\)/);
    expect(patch).toMatch(/floor: true/);
  });
});
