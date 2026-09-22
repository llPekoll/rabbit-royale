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
    // The midpoint is async now (it may wait for the island, below), but
    // `setWhere` is still the first thing it does.
    expect(PAGE).toMatch(/wipeTo\([^)]*,\s*async \(\) => \{\s*setWhere\(next\);/);
  });

  it('holds the shutter until the island has arrived', () => {
    // The iris used to open on a fixed beat, and a slow join opened it on the
    // last island with no rabbit and the old recap. The midpoint awaits the
    // island, and the shutter awaits the midpoint.
    expect(PAGE).toMatch(/if \(!holdForIsland\) return;\s*arrival = await waitForIsland\(seenBefore, askedAt\);/);
    // No island: the crossing turns round UNDER the black (the cut answers
    // with the burrow) rather than opening on the old board and wiping again.
    expect(PAGE).toMatch(/if \(arrival === 'ready'\) return;[\s\S]{0,600}return SCENE\.burrow;/);
    expect(PAGE).toMatch(/if \(arrival === 'late'\) refuse\(/);
    const CANVAS = readFileSync(new URL('../src/components/game-canvas.tsx', import.meta.url), 'utf8');
    expect(CANVAS).toMatch(/wipe\.play\(async \(\) => \{\s*scenes\.show\(key\);\s*const back = await atCut\?\.\(\);/);
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
    // ...and `where` itself goes with the session: the page is remounted on
    // sign-out (session-scope.test.ts), so a later sign-in starts from the
    // burrow like every fresh mount does.
    expect(PAGE).toMatch(/<Burrow key=\{generation\} \/>/);
    expect(PAGE).toMatch(/useState<Where>\('burrow'\)/);
  });

  it('holds the burrow-anchored controls too', () => {
    // The leaderboard and the way onto the island belong to the burrow screen,
    // so they wait with the column rather than appearing over black.
    expect(PAGE).toMatch(/where === 'burrow' && !crossing/);
    expect(PAGE).toMatch(/!shownRaid && !crossing/);
  });
});

/**
 * The burrow column must not lie on the board.
 *
 * `.rr-overlay` learned this once already, and its comment says why: a
 * full-height column over a full-screen canvas swallows every tap meant for
 * the game. `.rr-burrow` is the same shape — `flex: 1` and `overflow-y: auto`
 * make it a ~400x844 scroll box — and it had the same bug, found in production
 * by measuring what `elementFromPoint` returned where the bombs are drawn: the
 * section, not the canvas.
 *
 * Placing a bomb still worked, which is what made it hard to see: that tap
 * lands on a row the panels happen to leave clear. Lifting one is a tap lower
 * down, on ground the column covered — and it did nothing at all, with no
 * request and no error to read.
 */
describe('the burrow column is transparent to the board', () => {
  const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

  /**
   * THE COLUMN NO LONGER COVERS THE BOARD AT ALL (22 September 2026). It
   * used to be a full-height sheet made transparent to the pointer with its
   * panels opted back in — and on an iPhone a scroll box that is itself
   * transparent to the pointer does not scroll (Paul: "the left column was
   * not scrollable ... can't reproduce it in desktop Chrome"). Now the box is
   * only as tall as its cards, so there is no empty sheet to see through and
   * no pointer-events trick to break iOS scrolling.
   */
  it('is only as tall as its cards, never a sheet over the empty board', () => {
    expect(CSS).toMatch(/\.rr-burrow \{[^}]*flex: 0 1 auto;/s);
    expect(CSS).toMatch(/\.rr-burrow \{[^}]*align-self: flex-start;/s);
  });

  it('takes the pointer like any scroll box — no pointer-events trick', () => {
    expect(CSS).not.toMatch(/\.rr-burrow \{[^}]*pointer-events: none;/s);
    expect(CSS).not.toMatch(/\.rr-burrow > \* \{ pointer-events: auto; \}/);
  });
});
