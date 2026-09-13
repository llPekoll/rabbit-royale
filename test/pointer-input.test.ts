/**
 * The board must be playable with a mouse and a finger, not only a keyboard.
 *
 * It was keyboard-only in production, and neither cause was in the input code —
 * both were a layer above it silently eating every click. That is exactly the
 * kind of thing a later edit reintroduces without noticing, so both are pinned.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CSS = read('../src/app/globals.css');
const PAGE = read('../src/app/page.tsx');
const APP = read('../src/game/Application.ts');
const SCENE = read('../src/game/scenes/IslandScene.ts');

describe('the overlay does not swallow the board', () => {
  it('re-enables pointers on the CONTROLS, not on every child', () => {
    // `.rr-overlay > *` caught the flex spacer too — a 900px-tall invisible
    // div covering the whole board, with pointer-events: auto.
    expect(CSS).not.toMatch(/\.rr-overlay > \*\s*\{\s*pointer-events:\s*auto/);
    expect(CSS).toMatch(/\.rr-overlay > \.rr-hud/);
  });

  it('keeps the spacer transparent to input', () => {
    // Belt and braces: the spacer says so itself, so a future CSS change
    // cannot quietly make it solid again.
    expect(PAGE).toMatch(/flex: 1, pointerEvents: 'none'/);
  });
});

describe('Pixi receives events at all', () => {
  it('leaves the stage passive', () => {
    // This assertion used to be the exact opposite, on the belief that a
    // passive root stops events reaching `static` children. It does not —
    // Pixi prunes a passive container only when `interactiveChildren` is off.
    // A STATIC root is what breaks things: it puts the whole tree into
    // interactive mode, so the topmost sprite containing the point ends the
    // hit test and the search never reaches the diamond behind it. The burrow,
    // whose taps live on the diamonds, went completely dead while the island
    // (which resolves taps on its scene container, geometrically) kept
    // working — which is why it took three days to see. Measured on the real
    // scene with tools/tap-probe.mjs: passive hits `burrow-hint-N`, static
    // hits the stage.
    expect(APP).not.toMatch(/stage\.eventMode\s*=\s*'static'/);
    expect(APP).not.toMatch(/stage\.eventMode\s*=\s*'dynamic'/);
  });

  it('gives the board a hit area that covers the gaps between diamonds', () => {
    // Taps land between two tiles constantly on a phone; without this the game
    // feels like it is ignoring you.
    expect(SCENE).toMatch(/hitArea = \{ contains: \(\) => true \}/);
  });

  it('lets each tile answer for itself as well', () => {
    // Through its VEIL, not its container: the veil is the tile as drawn and
    // sorts with the ground, so a raised tile's veil is hit before the lower
    // veil it covers — and the container, which floats above everything with
    // the hints, stays transparent to the pointer.
    expect(SCENE).toMatch(/tile\.onPress\(/);
    const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');
    expect(TILE).toMatch(/this\.fog\.on\('pointerdown', fn\)/);
    expect(TILE).toMatch(/this\.container\.eventMode = 'passive'/);
  });

  it('never moves the rabbit on the press alone', () => {
    // The board is bigger than the screen and is dragged to pan. A drag that
    // starts on a lit tile — the rabbit is in the middle of the screen, which
    // is exactly where a thumb lands to pan — must NOT hop the rabbit before
    // the finger has moved. So the tile only REMEMBERS the press, and the move
    // fires from the gesture recogniser's tap, on the release. Neither the tile
    // nor the scene may fire a move straight from `pointerdown` again.
    const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');
    expect(TILE).not.toMatch(/onTap\(/);
    expect(SCENE).toMatch(/tile\.onPress\(\(\) => \{ this\.pressTile = i; \}\)/);
    expect(SCENE).not.toMatch(/this\.container\.on\('pointerdown'/);
    expect(SCENE).toMatch(/new PanZoomGestures\(/);
  });

  it('never uses pointertap, which would swallow a drag that ended on a tile', () => {
    const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');
    expect(TILE).not.toMatch(/\.on\('pointertap'/);
    expect(SCENE).not.toMatch(/\.on\('pointertap'/);
  });
});

describe('the camera can be driven by hand', () => {
  const GESTURES = readFileSync(new URL('../src/game/input/PanZoomGestures.ts', import.meta.url), 'utf8');

  it('follows the pointer wherever it goes mid-drag', () => {
    // `pointermove` stops at the canvas edge and under the HUD panels;
    // `globalpointermove` does not, so a drag never freezes mid-gesture.
    expect(GESTURES).toMatch(/on\('globalpointermove'/);
    expect(GESTURES).toMatch(/on\('pointerupoutside'/);
    // Pixi never forwards `pointercancel` to a container, so a cancelled touch
    // has to be dropped from the DOM or the next finger reads as a pinch.
    expect(GESTURES).toMatch(/window\.addEventListener\('pointercancel'/);
  });

  it('binds the wheel on the DOM so a trackpad pinch cannot zoom the page', () => {
    // Pixi's own wheel listener is passive; a `ctrlKey` wheel (a trackpad
    // pinch) has to be `preventDefault`ed or the browser zooms the document.
    expect(SCENE).toMatch(/addEventListener\('wheel', this\.onWheel, \{ passive: false \}\)/);
    expect(SCENE).toMatch(/e\.preventDefault\(\)/);
    expect(SCENE).toMatch(/removeEventListener\('wheel'/);
  });
});
