/**
 * Every change of place gets a wipe — not just burrow ↔ island.
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
/**
 * The transitions, in their two kinds.
 *
 * The game draws one of five per crossing (see `fx/RandomWipe`), and they are
 * not all the same sort of thing:
 *
 *  - SHUTTERS cover the screen with something opaque, swap the world behind it,
 *    and take it away again. The three irises, and the sand — which reaches
 *    black by dissolving rather than by drawing a sheet, but does genuinely
 *    pass through a covered moment and swaps there like any other shutter.
 *  - SCENE-BASED variants cover nothing. They stack the two scenes and take the
 *    outgoing one away to reveal the other, so there is no covered moment and
 *    no black at all. The curtain is the one of these.
 *
 * Split because the properties below are about the SHUTTER contract — swapping
 * under cover, lowering the sheet in a `finally` — and asserting them of an
 * effect that has no sheet was how the curtain's tests went stale when it
 * stopped being one. What both kinds do share is the shared timings, which is
 * checked of everything.
 */
const SHUTTERS: Array<[string, string]> = [
  ['ShapeWipe', readFileSync(new URL('../src/game/fx/ShapeWipe.ts', import.meta.url), 'utf8')],
  ['SandWipe', readFileSync(new URL('../src/game/fx/SandWipe.ts', import.meta.url), 'utf8')],
];

/** The variants that reveal one scene from under another. */
const STACKED: Array<[string, string]> = [
  ['CurtainWipe', readFileSync(new URL('../src/game/fx/CurtainWipe.ts', import.meta.url), 'utf8')],
];

/** Everything, for the properties that really are universal. */
const ALL_WIPES = [...SHUTTERS, ...STACKED];

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
    //
    // What is pinned is that the swap is AWAITED WHILE COVERED, in both
    // shutters. How each one is covered at that moment is its own business and
    // deliberately not asserted here: the iris is shut and holding on black,
    // the curtain is mid-pass with its solid core spanning the screen. An
    // earlier version of this test compared the swap's position against
    // `await wait(HOLD_MS)`, which pinned the IRIS'S mechanism on both — and
    // so failed the moment the curtain dropped its hold to become one
    // continuous sweep, a change that does not touch this bug at all.
    for (const [name, FX] of SHUTTERS) {
      expect(FX, name).toMatch(/await midpoint\(\);/);
      // Scoped to the BODY of `play`, not the whole file. These files open with
      // a long comment that names `midpoint` and `to` several times over, and
      // an unscoped search finds the prose rather than the code — which reads
      // as an ordering failure that has nothing to do with the order of
      // anything.
      // From the `try`, not from `async play(` — the variants that need a
      // scene pair open with a bare-crossing bail-out (`if (!stack) { await
      // midpoint(); return; }`) for the case where they have none, and THAT
      // `await midpoint()` legitimately comes before any animation because in
      // that branch there is no animation to come before. The crossing being
      // described here is the one inside the `try`.
      const body = FX.slice(FX.indexOf('try {', FX.indexOf('async play(')));
      const swap = body.indexOf('await midpoint()');
      expect(swap, name).toBeGreaterThan(-1);
      // Covered first: a covering movement is awaited BEFORE the swap, so the
      // swap never happens over a screen the player can still see.
      const covering = body.search(/await this\.to\(/);
      expect(covering, name).toBeGreaterThan(-1);
      expect(covering, name).toBeLessThan(swap);
      // And still covered after: the uncovering is awaited AFTER it, so a slow
      // swap cannot leak into a screen that has started opening up again.
      //
      // Matched on the SHAPE of the call rather than on a duration's name: the
      // iris uncovers over `OPEN_MS` and the sand over `BUILD_MS`, and pinning
      // either spelling here tests which constant a file happens to use rather
      // than whether it waits at all.
      expect(body.slice(swap).search(/await this\.to\(/), name).toBeGreaterThan(-1);
    }
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
    // The cut handler is named now (a first-timer's cut also opens the canvas
    // on the island), but flipping `showCanvas` is still its FIRST act.
    expect(PAGE).toMatch(/onCut=\{onCurtainCut\}/);
    expect(PAGE).toMatch(/const onCurtainCut = useCallback\(\(\) => \{\s*setShowCanvas\(true\);/);
    // And nothing else flips it on: the sign-in screen hands over at the cut
    // and nowhere earlier.
    expect(PAGE.match(/setShowCanvas\(true\)/g)).toHaveLength(1);
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
      // The banked count. Anchored on the component the page actually renders:
      // this was `<CarrotCounter` until the counter became `<CarrotPill` (the
      // mock's panel, with a rank line under the figure), and a stale anchor
      // here would have passed on a gate that no longer wrapped anything.
      /\{showCanvas && \(\s*<CarrotPill/,
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

  it('reveals one scene from under another, with no black at all', () => {
    // The curtain is NOT a shutter. It stacks the two scenes and masks the
    // outgoing one with a travelling gradient, so the other shows through where
    // the mask has gone — every pixel at every instant belongs to one scene or
    // the other, and nothing black is ever drawn.
    //
    // It used to be a black band sweeping over the screen, and the band was the
    // problem: a thing passing in FRONT of the game is a third object in a
    // transition that should only have two.
    const [, FX] = STACKED.find(([n]) => n === 'CurtainWipe')!;

    // It masks a scene rather than covering the screen.
    expect(FX).toMatch(/\.mask = this\.sheet/);
    // And gives the mask back on the way out — a mask left on a scene whose
    // tween has stopped is a permanently half-hidden game.
    expect(FX).toMatch(/\.mask = null/);

    // The mask is a GRADIENT SPRITE, not a Graphics sheet. Pixi resolves a
    // Graphics mask as coverage and ignores its fill alpha, so a ramp drawn
    // that way comes out as a hard vertical line — the tear the softness exists
    // to avoid, present in the code and invisible until rendered.
    expect(FX).toMatch(/new Sprite\(rampTexture\(\)\)/);
    expect(FX).not.toMatch(/new Graphics\(\)/);

    // ONE plain Sprite, never a Container of sprites. Pixi chooses the mask
    // implementation by type — `AlphaMask.test` is `mask instanceof Sprite` —
    // and anything else becomes a stencil mask, which ignores alpha and turns
    // the gradient into a hard line. This is how the softness was lost the
    // second time, after the geometry had been fixed by splitting the mask in
    // two.
    expect(FX).toMatch(/private readonly sheet: Sprite;/);
    expect(FX).not.toMatch(/this\.sheet = new Container\(\)/);
    expect(FX).not.toMatch(/this\.sheet\.addChild/);

    // And the ramp is a constant share of one baked texture, so the boundary
    // is `edge` wide on screen and the rest of the scene is opaque. A
    // ramp-only texture on a viewport-wide sprite spreads the gradient over the
    // whole screen instead — the full-screen cross-fade that came first.
    expect(FX).toMatch(/EDGE \/ \(1 \+ EDGE\)/);
    expect(FX).toMatch(/this\.sheet\.width = edge \+ this\.w/);

    // And it is white, varying only in alpha: a mask is read for its alpha
    // alone, so any other colour would be a claim that is not true. Nothing
    // black is drawn anywhere in this file.
    expect(FX).not.toMatch(/0x000000/);

    // Clamped, not tiled. The sprite is drawn wider than the ramp so the solid
    // end carries on to the screen edge; under `repeat` the gradient would tile
    // and stripe the outgoing scene with soft bands.
    expect(FX).toMatch(/addressMode = 'clamp-to-edge'/);

    // One pass, one direction: no return trip to the side it started from.
    expect(FX).toMatch(/this\.to\(1, SWEEP_MS/);
    expect(FX).not.toMatch(/this\.to\(0, [A-Z_]+_MS/);

    // And no beat of black to hold on — there is no black to hold.
    expect(FX).not.toMatch(/WIPE_HOLD_MS/);
    expect(FX).not.toMatch(/await wait\(/);
  });

  it('keeps the sand and the curtain saying different things', () => {
    // The two scene-stacking variants are only worth having as a pair if they
    // differ in the thing a player actually reads. They do, and oppositely: the
    // sand goes THROUGH black (one scene at a time, the stack's floor showing
    // between them), the curtain never touches it (both scenes up at once,
    // divided by a travelling seam).
    //
    // Pinned because the obvious "tidy-up" is to make them share a base class,
    // and the first casualty of that would be exactly this difference.
    const [, SAND] = SHUTTERS.find(([n]) => n === 'SandWipe')!;
    const [, CURTAIN_FX] = STACKED.find(([n]) => n === 'CurtainWipe')!;

    // The sand hides the incoming scene through its first movement, which is
    // what makes the middle black rather than a reveal.
    expect(SAND).toMatch(/stack\.to\.visible = false/);
    // The curtain never does: both scenes are up for the whole pass.
    expect(CURTAIN_FX).not.toMatch(/stack\.to\.visible = false/);
  });

  it('keeps the two irises to one rhythm', () => {
    // The DOM curtain cannot import the Pixi one (that would drag the engine
    // into the page bundle), so the timings live in config/wipe and BOTH read
    // them from there. Two hardcoded sets would agree only until one is edited.
    expect(CURTAIN).toMatch(/from '@\/config\/wipe'/);
    // All of them, not just the iris: the curtain is a different effect on the
    // SAME beat, and a curtain with its own timings would read as an unrelated
    // thing happening to the game rather than as one of a set.
    for (const [name, FX] of ALL_WIPES) {
      expect(FX, name).toMatch(/from '@\/config\/wipe'/);
      expect(FX, name).not.toMatch(/const CLOSE_MS = \d/);
    }
  });

  /**
   * The shutter comes down even when the crossing throws.
   *
   * A shutter's `view` is `eventMode: 'static'` on purpose — while it is up it
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
    //
    // WHAT the reset is differs by variant and the test does not care: the
    // irises lower a sheet, the sand takes its filter back off the scenes. What
    // must not differ is that it happens on the way out however the crossing
    // ended. Checked of every variant, stacked ones included — the curtain has
    // no sheet but it does have a mask to strip, and a mask left on a scene
    // whose tween has stopped is a permanently half-hidden game.
    for (const [name, FX] of ALL_WIPES) {
      expect(FX, name).toMatch(/\}\s*finally\s*\{/);
      // And the cleanup is guarded by the run id, so a crossing that has been
      // superseded does not tear down the one that replaced it.
      expect(FX, name).toMatch(/finally\s*\{[\s\S]{0,1200}?run === this\.runId/);
    }
  });
});
