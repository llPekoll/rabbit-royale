/**
 * The chrome waits for the shutter.
 *
 * Crossing between the burrow and the island happens behind the carrot iris:
 * it closes (580ms), holds black (500ms) while the scenes swap, then opens
 * (680ms). React's own chrome used to flip at the MIDPOINT — the right moment
 * for the island's thin HUD, the wrong one for the burrow.
 *
 * The burrow's chrome is a stack of nine-slice panels, and mounting it at the
 * midpoint put the whole column on screen over a canvas that was still pitch
 * black, then left it sitting there for the entire 680ms opening. Measured in
 * a browser: the column appeared at ~690ms, the aperture finished at ~1760ms.
 * The furniture arrived a second before the room.
 *
 * So a crossing now renders NEITHER screen's chrome, and the burrow's column
 * waits for `wipeTo` to resolve — which is exactly when the iris is open.
 *
 * Easy to undo by accident: dropping `crossing` from any one of these gates
 * looks like removing a redundant condition, and the result only shows during
 * a ~1s animation.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');

describe('chrome across the wipe', () => {
  it('marks the whole crossing, not just the cut', () => {
    // Set before the wipe starts and cleared when it RESOLVES (iris fully
    // open). Clearing it at the midpoint would restore the original bug.
    expect(PAGE).toMatch(/setCrossing\(true\)/);
    expect(PAGE).toMatch(/\.finally\(\(\) => setCrossing\(false\)\)/);
  });

  it('still swaps the scene at the black midpoint', () => {
    // The scene swap and `setWhere` must stay in the midpoint callback: moving
    // them later would show the OLD place through the opening aperture.
    expect(PAGE).toMatch(/wipeTo\([^)]*,\s*\(\) => setWhere\(next\)\)/);
  });

  it('shows neither screen while crossing', () => {
    // A crossing is its own state. Gating only the burrow would let the
    // island's HUD render in its place while the shutter sits over the burrow.
    // `crossing` must still be the first thing the ternary asks. A raid now
    // suppresses the same chrome for its own reason (the board underneath
    // belongs to someone else), so the test pins the ORDER — crossing first,
    // then the screen choice — rather than the exact expression.
    // `shownRaid`, not `raid.raid`: the chrome turns over at the shutter's
    // midpoint rather than when the server answers. See wipe-everywhere's
    // "swaps the raid's chrome at the midpoint" for why.
    expect(PAGE).toMatch(/\{crossing(?: \|\| shownRaid)? \? null : where === 'burrow'/);
  });

  it('never shows the island to a signed-out player', () => {
    // `where` is not derived from the player, so signing out on the island left
    // it on 'island' and the sign-in screen kept the island's HUD and its "To
    // the burrow" arrow. Two things put that right and both are asserted: the
    // branch falls back to the burrow while the sign-in screen owns the frame.
    //
    // `showCanvas`, not `player`: the frame changes hands at the curtain's
    // midpoint, and gating this on `player` put the island branch in play the
    // instant the wallet answered — a HUD over the sign-in art for the length
    // of the wipe. See wipe-everywhere for the rest of that family.
    expect(PAGE).toMatch(/where === 'burrow' \|\| !showCanvas \?/);
    // ...and `where` itself is reset when the session ends, so a later sign-in
    // does not land back on the island. The window is generous because the
    // same block also tears down the sign-in curtain — what is pinned is that
    // the reset lives in the no-player branch, not how many lines precede it.
    expect(PAGE).toMatch(/if \(player\) return;[\s\S]{0,400}setWhere\('burrow'\)/);
  });

  it('holds the burrow-anchored controls too', () => {
    // The leaderboard and the way onto the island belong to the burrow screen,
    // so they wait with the column rather than appearing over black.
    expect(PAGE).toMatch(/where === 'burrow' && !crossing/);
    expect(PAGE).toMatch(/!shownRaid && !crossing/);
  });
});
