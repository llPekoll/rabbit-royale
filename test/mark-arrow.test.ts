/**
 * THE ARROW OVER MARK A BOMB.
 *
 * The board points at the CELL with a ghost cross; this points at the CONTROL.
 * Both halves of the gesture have to be marked, or the player is told what to
 * do and not with what. Paul, 2026-09-20: "ya toujours pas la fleche sur mark
 * a bomb" — what stood there was a 3px lift over 1.2s, which is a twitch
 * rather than a sign.
 *
 * Pinned as source rather than rendered: the component pulls the kit's
 * `PixelArrow`, which wants a browser to tint a sprite, and what matters here
 * is the RULE — an arrow exists, and only while the lesson is asking.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BUTTON = readFileSync('src/components/mark-bomb-button.tsx', 'utf8');
const CSS = readFileSync('src/app/globals.css', 'utf8');

const SCENE = readFileSync('src/game/scenes/IslandScene.ts', 'utf8');
const PAGE = readFileSync('src/app/page.tsx', 'utf8');

describe('the ask waits until the player can obey it', () => {
  /**
   * `flagTile` refuses a mark that is not on a NEIGHBOURING cell, so a cross
   * hovering two steps away asks for something the server would refuse — and
   * the arrow over the button asked for it too. Paul, 2026-09-20: "quand on
   * est la ya pas encore la croix, c'est vraiment quand on est juste devant."
   */
  it('shows the cross only when the rabbit is beside the bomb', () => {
    expect(SCENE).toMatch(/private syncTeachMark\(\): void \{/);
    expect(SCENE).toMatch(/setGhostFlag\(near\)/);
  });

  it('re-checks on every move, not just when the lesson opens', () => {
    // `refreshReachable` already runs on each step and each stun.
    const fn = SCENE.slice(SCENE.indexOf('private refreshReachable(): void {'));
    expect(fn.slice(0, 400)).toMatch(/this\.syncTeachMark\(\);/);
  });

  it('withdraws the arrow too, so the two never disagree', () => {
    expect(PAGE).toMatch(/teach=\{game\.teachReady && !game\.flagMode\}/);
  });
});

describe('the MARK A BOMB arrow', () => {
  it('bobs then RESTS, so it never becomes wallpaper', () => {
    // "Anime 2sc stop et animation up and down" (Paul, 2026-09-20). A sign in
    // perpetual motion is filed as decoration; stopping is what makes the next
    // bob a new event.
    const frames = /@keyframes rr-mark-arrow-bob \{([\s\S]*?)\n\}/.exec(CSS)![1];
    // The second half of the cycle holds the resting position.
    expect(frames).toMatch(/50%\s*\{ transform: translate\(-50%, 0\); \}/);
    expect(frames).toMatch(/100% \{ transform: translate\(-50%, 0\); \}/);
  });

  it('fades in rather than popping', () => {
    expect(CSS).toMatch(/rr-mark-arrow-in 280ms/);
    expect(CSS).toMatch(/@keyframes rr-mark-arrow-in \{[\s\S]*?opacity: 0;/);
  });

  it('is drawn while the tutorial asks for a cross', () => {
    expect(BUTTON).toMatch(/\{teach && !armed && \(/);
    expect(BUTTON).toMatch(/<PixelArrow dir="down"/);
  });

  it('goes away once the mode is armed — the ask moves to the board', () => {
    // `!armed` in the guard: once X mode is on, the caption points at the tile
    // and an arrow still pointing at the button would be arguing with it.
    const guard = /\{teach && !armed && \(/.exec(BUTTON);
    expect(guard).not.toBeNull();
  });

  it('is the ONLY thing moving — the button itself does not animate', () => {
    // "Vire l'animation du bouton mark a bomb" (Paul, 2026-09-20): a button
    // lifting under a bobbing arrow is two things in motion saying one thing.
    expect(BUTTON).not.toMatch(/' teach'/);
    expect(CSS).not.toMatch(/\.rr-mark-btn\.teach \{ animation/);
  });

  it('bobs on the same clock as the board chevrons', () => {
    // fx/ChestPointer bobs a few px a leg over 0.9s; a sign over a control and
    // a sign over a tile should read as one language.
    expect(CSS).toMatch(/\.rr-mark-arrow\b[\s\S]*?rr-mark-arrow-bob 4s/);
    expect(CSS).toMatch(/@keyframes rr-mark-arrow-bob \{[\s\S]*?translate\(-50%, -7px\)/);
  });

  it('is CENTRED on the button, not offset from the screen edge', () => {
    /**
     * "Trop petit et pas centre" (Paul, 2026-09-20). The first cut pinned the
     * arrow a fixed 56px from the right edge, which can only be centred for
     * one button width — and the button's width follows its label, which
     * changes with the language. Anchoring to the button's own box is right
     * for every string.
     *
     * The -50% has to live in the KEYFRAMES too: an `animation` overrides
     * `transform`, so a bob that only moved Y would snap the arrow right on
     * its first frame.
     */
    expect(BUTTON).toMatch(/<\/span>\s*\{teach && !armed && \(/);
    expect(CSS).toMatch(/\.rr-mark-arrow\b[\s\S]*?position: absolute;[\s\S]*?left: 50%;/);
    expect(CSS).toMatch(/@keyframes rr-mark-arrow-bob \{\s*0%\s*\{ transform: translate\(-50%, 0\); \}/);
  });

  it('is big enough to read as a sign', () => {
    // 28 was "trop petit" against a 52px-tall button; 44 was still small.
    // The arrow is the one thing on screen telling a new player which control
    // to press, so it is allowed to be the biggest sign there.
    const size = Number(/<PixelArrow dir="down" size=\{(\d+)\}/.exec(BUTTON)![1]);
    expect(size).toBeGreaterThanOrEqual(64);
  });

  it('never eats a tap meant for the button under it', () => {
    expect(CSS).toMatch(/\.rr-mark-arrow\b[\s\S]*?pointer-events: none;/);
  });
});
