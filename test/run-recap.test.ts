/**
 * The end of a run offers something the player can actually do.
 *
 * The recap used to end EVERY run with one button: "Again". That is fine for a
 * run that ended on a bomb, and useless for the runs that ended because the
 * tank ran dry — where digging again is precisely the thing that cannot happen.
 * The one screen a player reaches by running out of energy had no way forward
 * on it.
 *
 * So the recap reads the burrow's out-of-run energy and offers what is real:
 * dig again if there is a run left, otherwise buy a refill or go home and let
 * the garden fill the bar for free. Home is always written down — the shop must
 * never be the only door out of an empty tank, or the wait becomes a toll.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const RECAP = read('../src/components/run-recap.tsx');
const PAGE = read('../src/app/page.tsx');

describe('run recap', () => {
  it('branches on the burrow energy, not on the run', () => {
    // The recap's own stats say nothing about whether ANOTHER run is possible:
    // in-run energy is a different pool from the burrow's. The gate has to read
    // the burrow.
    expect(RECAP).toMatch(/energy !== null && energy <= 0/);
  });

  it('treats an unknown burrow as "can dig", not as empty', () => {
    // Null is "the burrow has not answered yet". Pitching a refill there would
    // be a shop ad shown to a player who may have a full tank.
    expect(RECAP).toMatch(/energy: number \| null/);
  });

  it('offers a refill AND a free way out when dry', () => {
    const dry = RECAP.slice(RECAP.indexOf('{dry ? ('), RECAP.indexOf(') : ('));
    expect(dry).toMatch(/Get more energy/);
    // The free route must survive alongside the paid one.
    expect(dry).toMatch(/Back to the burrow/);
    // ...and the button that cannot work must be gone.
    expect(dry).not.toMatch(/onAgain/);
  });

  it('says WHY there is no "Again"', () => {
    // A button that simply vanished reads as a broken screen.
    expect(RECAP).toMatch(/Out of energy\./);
  });

  it('crosses home before opening the shop', () => {
    // The shop is a drawer over the BURROW. Opening it from the island would
    // mount it over the wrong scene, and the effect that clears the burrow's
    // overlays would shut it on the next render.
    expect(PAGE).toMatch(/setShopOnArrival\(true\);\s*\n\s*goTo\('burrow'\)/);
  });

  it('states the duration in the unit a player thinks in', () => {
    // "214s" makes the reader do the division, and it used to print with no
    // separator before it: "💣 3 214s" reads as one four-digit number.
    expect(RECAP).toMatch(/function formatRunTime/);
    expect(RECAP).toMatch(/&middot; \{formatRunTime\(recap\.durationMs\)\}/);
  });
});
