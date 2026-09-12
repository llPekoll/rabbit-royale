/**
 * The end of a run offers something the player can actually do.
 *
 * The recap used to end EVERY run with one button: "Again" — the one thing a
 * finished run can never do. `resolveMove` ends a run at `energy <= 0` and
 * NOWHERE else: a bomb costs 8 energy and is survivable, so it does not end
 * anything by itself. "Run over" therefore means "the tank is empty", always.
 *
 * An earlier fix tried to gate that on the BURROW's energy, which is a
 * different pool entirely (a right of entry, 12/hour up to 60, never debited
 * by a run) — so the gate read a full tank and offered "Again" to the very
 * player who had just run dry. The screen states the one true reason and
 * offers the two things that follow from it: buy a refill, or go home and let
 * the garden fill the bar for free. Home is always written down — the shop
 * must never be the only door out of an empty tank, or the wait becomes a toll.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const RECAP = read('../src/components/run-recap.tsx');
const PAGE = read('../src/app/page.tsx');

describe('run recap', () => {
  it('never offers "Again" — a finished run is always out of energy', () => {
    // The run-ending rule, restated where it is relied upon: if `run.ts` ever
    // grows a second way to end a run, this recap stops being true and this
    // test is the thing that should notice.
    const RUN = read('../src/lib/game/run.ts');
    expect(RUN).toMatch(/rabbit\.energy <= 0/);
    expect(RUN.match(/alive = false/g) ?? []).toHaveLength(2); // the victim's, and the mover's
    expect(RECAP).not.toMatch(/onAgain/);
    expect(RECAP).not.toMatch(/>\s*Again\s*</);
  });

  it('does not gate on the burrow energy, which a run never spends', () => {
    // The burrow's pool is a right of entry (12/hour to a ceiling of 60) and
    // `bankRun` never debits it. Reading it here is what made the screen offer
    // "Again" to a player who had just run dry.
    expect(RECAP).not.toMatch(/energy !== null/);
    expect(RECAP).not.toMatch(/energy: number \| null/);
  });

  it('offers a refill AND a free way out', () => {
    expect(RECAP).toMatch(/Get more energy/);
    // The free route must survive alongside the paid one.
    expect(RECAP).toMatch(/Back to the burrow/);
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
