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
    // `pointerdown`, not `pointertap`: the move must not wait for the finger
    // to lift on top of the server round trip it already waits for.
    expect(SCENE).toMatch(/on\('pointerdown'/);
  });

  it('lets each tile answer for itself as well', () => {
    // Through its VEIL, not its container: the veil is the tile as drawn and
    // sorts with the ground, so a raised tile's veil is hit before the lower
    // veil it covers — and the container, which floats above everything with
    // the hints, stays transparent to the pointer.
    expect(SCENE).toMatch(/tile\.onTap\(/);
    const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');
    expect(TILE).toMatch(/this\.fog\.on\('pointerdown', fn\)/);
    expect(TILE).toMatch(/this\.container\.eventMode = 'passive'/);
  });

  it('never waits for the finger to lift before asking to move', () => {
    // A move already costs a server round trip — the rabbit is placed by the
    // server, never locally — so the press must go out at the moment of
    // contact. `pointertap` fires on RELEASE, quietly adding however long the
    // player held the screen to every hop. Both the per-tile handler and the
    // scene's between-the-diamonds fallback are on `pointerdown`; neither may
    // drift back.
    const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');
    expect(TILE).not.toMatch(/\.on\('pointertap'/);
    expect(SCENE).not.toMatch(/\.on\('pointertap'/);
  });
});
