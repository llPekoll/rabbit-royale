/**
 * Every change of place gets the carrot iris — not just burrow ↔ island.
 *
 * The wipe started life as the crossing between the two scenes, but the same
 * cut is owed to every other moment where the SCREEN changes under the player:
 * signing in (a painting becomes a game), entering or leaving a raid (your
 * ground becomes a stranger's), and opening the trap grid (a home becomes a
 * board to decide on). Each one used to happen instantly, which read as the
 * app glitching rather than as going somewhere.
 *
 * These are source assertions, like wipe-chrome's, for the same reason: the
 * behaviour only exists during a ~1.7s animation, and dropping any one of
 * these calls looks like a harmless simplification in review.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const CANVAS = readFileSync(new URL('../src/components/game-canvas.tsx', import.meta.url), 'utf8');
const CURTAIN = readFileSync(new URL('../src/components/carrot-curtain.tsx', import.meta.url), 'utf8');
const WIPE = readFileSync(new URL('../src/game/fx/CarrotWipe.ts', import.meta.url), 'utf8');

describe('the iris covers every crossing', () => {
  it('offers a same-scene wipe as well as a scene swap', () => {
    // A raid and the trap grid stay on the burrow scene, so they cannot go
    // through `wipeTo` — it always calls `show(key)`. Without `wipeOver` the
    // only way to wipe them would be to re-show the scene they are already on.
    expect(CANVAS).toMatch(/wipeOver\(atCut: \(\) => void \| Promise<void>\): Promise<void>/);
    expect(CANVAS).toMatch(/wipeOver: \(atCut\) =>/);
  });

  it('still crosses when the shutter is missing', () => {
    // An early press during boot has no wipe yet. The change must happen
    // anyway: the flourish is optional, the navigation is not.
    expect(CANVAS).toMatch(/if \(!wipe\) return Promise\.resolve\(atCut\(\)\)/);
  });

  it('does NOT wipe into or out of placement mode', () => {
    // The opposite of what this test used to pin. Placement is not a change
    // of screen — it is the same burrow seen from further back — and putting
    // the carrot shutter over it read as a black flash for nothing. The
    // camera's own tween between the home and board shots
    // (BurrowScene.moveCamera) is the transition, and it has to be SEEN.
    expect(PAGE).not.toMatch(/wipeOver\([^)]*setPlacing\(true\)/);
    expect(PAGE).not.toMatch(/wipeOver\([^)]*setPlacing\(false\)/);
    // The bare calls are what remain: the scene retunes the camera itself.
    expect(PAGE).toMatch(/setPlacing\(true\);\s*handles\.current\?\.burrow\?\.setPlacing\(true\)/);
    expect(PAGE).toMatch(/setPlacing\(false\);\s*handles\.current\?\.burrow\?\.setPlacing\(false\)/);
  });

  it('does not wipe every step of a raid', () => {
    // The raid effect re-runs on every dug tile. Wiping those would put a
    // 1.7s shutter between a tap and its answer — fatal in a minesweeper. Only
    // the transition in and out of `raid.raid` being null is a change of place.
    expect(PAGE).toMatch(/const inRaid = raid\.raid !== null/);
    expect(PAGE).toMatch(/const crossed = inRaid !== wasRaiding\.current/);
    expect(PAGE).toMatch(/if \(!crossed \|\| !h\) \{ void draw\(\); return; \}/);
  });

  it('holds the shutter shut until the ground is actually rebuilt', () => {
    // The bug, reported as "ca change de scene apres ya l'opercule qui swipe"
    // and again on the way out of a raid.
    //
    // `setRaid` is ASYNC: either end of a raid destroys the terrain and grows
    // the other homestead from its seed (see BurrowScene.showGround). `draw`
    // used to fire it with `void` and return undefined, so `play()` awaited a
    // midpoint that was already resolved, held its 500ms of black over the OLD
    // board, and opened the iris — and the new ground popped in a frame or two
    // into the opening, in full view. The swap has to happen BEHIND the sheet,
    // which means the midpoint must last as long as the swap.
    //
    // So `draw` RETURNS the promise, and every branch of it returns one.
    expect(PAGE).toMatch(/if \(!raid\.raid\) return burrow\.setRaid\(null\);/);
    expect(PAGE).toMatch(/return burrow\.setRaid\(\{/);
    expect(PAGE).not.toMatch(/void burrow\.setRaid\(/);

    // And the shutter must actually await what it is handed — a `play` that
    // dropped the midpoint's promise would put the bug back with `draw` intact.
    const FX = readFileSync(new URL('../src/game/fx/CarrotWipe.ts', import.meta.url), 'utf8');
    expect(FX).toMatch(/await midpoint\(\);/);
    // The beat of black comes AFTER the swap, not in place of waiting for it.
    expect(FX.indexOf('await midpoint()')).toBeLessThan(FX.indexOf('await wait(HOLD_MS)'));
  });

  it("swaps the raid's chrome at the midpoint, not when the server answers", () => {
    // The rest of the bug above, and the half that was actually visible.
    //
    // The iris is a Pixi object on the stage, so it covers the CANVAS and
    // cannot cover DOM at all. The raid's HUD and the burrow's column are DOM,
    // and they were gated on `raid.raid` — which lands the instant the fetch
    // answers. So the column vanished and "X's burrow" appeared over your own
    // garden, and only THEN did the shutter start closing: the carrot swiped
    // over a change already made. Exactly the sign-in bug one screen along, and
    // why that one reads `showCanvas` rather than `player`.
    //
    // `shownRaid` is the raid the SCREEN belongs to. It is flipped inside
    // `draw`, so the DOM turns over under full black in step with the board.
    expect(PAGE).toMatch(/const \[shownRaid, setShownRaid\] = useState<RaidState \| null>\(null\)/);
    // Flipped in the midpoint callback, and nowhere else — a `setShownRaid`
    // sitting in an effect keyed on `raid.raid` would put the bug straight back.
    expect(PAGE).toMatch(/const draw = \(\) => \{[\s\S]{0,600}setShownRaid\(raid\.raid\);/);
    expect(PAGE.match(/setShownRaid\(/g)).toHaveLength(1);
    // And nothing the player SEES may read the server's copy directly.
    expect(PAGE).not.toMatch(/\{player && raid\.raid && \(/);
    expect(PAGE).toMatch(/\{player && shownRaid && \(/);
  });

  it('hands the screen over at the sign-in curtain\'s midpoint', () => {
    // `showCanvas`, not `player`, is what swaps the screen — so the sign-in art
    // survives until the sheet is black and the canvas is uncovered rather
    // than dropped on top of it.
    expect(PAGE).toMatch(/\{player && showCanvas && \(/);
    expect(PAGE).toMatch(/\{!showCanvas && \(/);
    expect(PAGE).toMatch(/onCut=\{\(\) => setShowCanvas\(true\)\}/);
  });

  it('hands the WHOLE screen over at the midpoint, not just the canvas', () => {
    // The bug: `player` lands the instant the wallet answers, so every piece of
    // chrome gated on it swapped BEFORE the shutter closed — the sign-in column
    // and the lore vanished, the burrow's panels appeared, and only then did the
    // iris play over a change the player had already watched happen. Reported
    // as "d'abord ca change et apres ca joue l'animation".
    //
    // So screen OWNERSHIP reads `showCanvas` everywhere. `player` still gates
    // things that need a session (a token, an id) — those may pair the two, but
    // none of them may test `player` alone to decide which screen is up.
    for (const gate of [
      /\{!showCanvas && <LoreCrawl \/>\}/,
      /\{!showCanvas && \(/,                       // the sign-in art
      /\{player && showCanvas && \(/,               // the canvas itself
      /\{showCanvas && where === 'burrow' && !shownRaid && !crossing && \(/,
      /\{showCanvas && \(\s*<CarrotCounter/,
      /\{!showCanvas \? \(/,                       // the sign-in column body
    ]) expect(PAGE).toMatch(gate);
  });

  it('does not put a loading screen over the sign-in art', () => {
    // The boot it reports on has not started while the curtain is closing —
    // the canvas is not mounted yet. Keyed on `player` it threw "Waking the
    // warren" over the screen the curtain was still working on.
    expect(PAGE).toMatch(/<LoadingScreen ready=\{!showCanvas \|\| ready\}/);
  });

  it('does not hold the sign-in curtain open until the canvas boots', () => {
    // Boot takes as long as it takes. Gating the curtain on `ready` would turn
    // a flourish into an indefinite black screen on a slow connection.
    expect(PAGE).toMatch(/if \(!player \|\| showCanvas \|\| arriving\) return;/);
  });

  it('never lets the webkit alias overwrite mask-composite', () => {
    // The bug this caught, verified in a browser: `-webkit-mask-composite`
    // takes a DIFFERENT keyword set from `mask-composite` (`xor` vs
    // `subtract`), and in Chromium it also writes the standard property. With
    // the prefixed line last, `subtract` became `source-out`, the hole never
    // opened, and signing in left a permanently black screen. So the prefixed
    // declaration must come FIRST and the standard one must win.
    const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
    const rule = CSS.slice(CSS.indexOf('.rr-curtain {'));
    const webkit = rule.indexOf('-webkit-mask-composite');
    const standard = rule.indexOf('\n  mask-composite');
    expect(webkit).toBeGreaterThan(-1);
    expect(standard).toBeGreaterThan(webkit);
  });

  it('keeps the two irises to one rhythm', () => {
    // The DOM curtain cannot import the Pixi one (that would drag the engine
    // into the page bundle), so the timings live in config/wipe and BOTH read
    // them from there. Two hardcoded sets would agree only until one is edited.
    expect(CURTAIN).toMatch(/from '@\/config\/wipe'/);
    const FX = readFileSync(new URL('../src/game/fx/CarrotWipe.ts', import.meta.url), 'utf8');
    expect(FX).toMatch(/from '@\/config\/wipe'/);
    expect(FX).not.toMatch(/const CLOSE_MS = \d/);
  });

  /**
   * The shutter comes down even when the crossing throws.
   *
   * `CarrotWipe.view` is `eventMode: 'static'` on purpose — while it is up it
   * swallows every tap meant for the board behind it. So a `midpoint` that
   * throws does not merely skip an animation: it parks a full-screen,
   * INTERACTIVE sheet over the game permanently. And because the sheet is left
   * at aperture 0 — fully open, so invisible — the board looks perfectly normal
   * while nothing on it can be clicked. A failure whose only symptom is
   * silence.
   *
   * `midpoint` is the scene swap: it rebuilds terrain and runs alongside
   * fetches that can time out, so it is precisely the callback most likely to
   * throw.
   */
  it('lowers the shutter even if the midpoint throws', () => {
    // The reset must be in a `finally`, not merely the last statement of the
    // happy path — which is what it was.
    expect(WIPE).toMatch(/finally\s*\{[^}]*this\.view\.visible = false/);
  });
});
