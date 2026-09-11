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
  it('makes the stage interactive', () => {
    // Pixi 8's stage is `passive` by default, which stops events reaching
    // children even when those children are `static`.
    expect(APP).toMatch(/stage\.eventMode\s*=\s*'static'/);
  });

  it('gives the board a hit area that covers the gaps between diamonds', () => {
    // Taps land between two tiles constantly on a phone; without this the game
    // feels like it is ignoring you.
    expect(SCENE).toMatch(/hitArea = \{ contains: \(\) => true \}/);
    expect(SCENE).toMatch(/on\('pointertap'/);
  });

  it('lets each tile answer for itself as well', () => {
    // Through its VEIL, not its container: the veil is the tile as drawn and
    // sorts with the ground, so a raised tile's veil is hit before the lower
    // veil it covers — and the container, which floats above everything with
    // the hints, stays transparent to the pointer.
    expect(SCENE).toMatch(/tile\.onTap\(/);
    const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');
    expect(TILE).toMatch(/this\.fog\.on\('pointertap', fn\)/);
    expect(TILE).toMatch(/this\.container\.eventMode = 'passive'/);
  });
});
