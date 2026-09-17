/**
 * What one session must not leave for the next — and what a spectate must
 * not pay for.
 *
 * Three things seen in the code and pinned here:
 *  - watching a run asked for a seat: `spectate` set the target and crossed
 *    in the same breath, and the crossing's closure still read "playing";
 *  - a guest who abandoned mid-raid left `shownRaid` standing, so the doorstep
 *    rendered without its buttons; a second first-timer in the same tab found
 *    `firstTrip` spent and landed on the burrow's chrome over the tutorial;
 *  - a join the server refused (or never answered) opened the iris on the
 *    old island and then started a second wipe home.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGE = read('../src/app/page.tsx');
const CANVAS = read('../src/components/game-canvas.tsx');

describe('watching is free', () => {
  it('names the target to the crossing rather than reading stale state', () => {
    const spectate = PAGE.slice(PAGE.indexOf('const spectate = useCallback'));
    expect(spectate.slice(0, 600)).toMatch(/goTo\('island', targetId\)/);
  });

  it('asks for a seat only when the crossing is not a watch', () => {
    const goTo = PAGE.slice(PAGE.indexOf('const goTo = useCallback'));
    expect(goTo.slice(0, 200)).toMatch(/watching: string \| null = spectating/);
    expect(goTo).toMatch(/if \(next === 'island' && where === 'burrow' && !watching\) game\.join\(\)/);
    expect(goTo).toMatch(/if \(next === 'burrow' && where === 'island' && !watching\) game\.leave\(\)/);
  });
});

describe('one mount per session', () => {
  it('remounts the page when the player signs out', () => {
    expect(PAGE).toMatch(/<Burrow key=\{generation\} \/>/);
    // Bumped on the way OUT only: remounting at sign-in restarts the doorstep
    // under the closing curtain.
    expect(PAGE).toMatch(/if \(!player && hadPlayer\) \{\s*setHadPlayer\(false\);\s*setGeneration/);
  });

  it('keeps no hand-written sign-out reset', () => {
    expect(PAGE).not.toMatch(/if \(player\) return;\s*\/\/ Signing out/);
    expect(PAGE).not.toMatch(/handles\.current = null;\s*shownSeed\.current = null;/);
  });
});

describe('a crossing that goes nowhere turns round under the black', () => {
  it('answers the cut with the burrow when no island came', () => {
    const goTo = PAGE.slice(PAGE.indexOf('const goTo = useCallback'));
    expect(goTo).toMatch(/if \(arrival === 'ready'\) return;[\s\S]*?setWhere\('burrow'\);\s*return SCENE\.burrow;/);
    expect(goTo).not.toMatch(/goToRef/);
  });

  it('re-aims the scene-based wipes at the scene it turned back to', () => {
    expect(CANVAS).toMatch(/const back = await atCut\?\.\(\);[\s\S]*?wipe\.retarget\(scene\.container\)/);
  });
});
