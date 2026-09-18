/**
 * The name floats high above its rabbit, joined to it by a line.
 *
 * The plate has moved twice in one day and each move broke something the
 * previous position hid: over the head it covered the counts, under the feet
 * it read as part of the sprite. It now sits a good half-tile up with a leader
 * line down to the ears — which only works while three numbers stay in the
 * right order, and nothing on screen says so when they stop.
 *
 * That is what this asserts. The height itself is a matter of taste and is
 * judged by eye in `Island/CrownedRabbit`; the RELATIONSHIP is not, because a
 * retune of any one of them gives either a name joined to nothing or a stick
 * driven through the rabbit's head.
 *
 * The rabbit's own measurements are the ones the crown is placed against (see
 * CROWN_Y): the art stands ~16 units tall from the feet at y 0, so anything
 * between -16 and 0 is INSIDE the sprite.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAME_Y, NAME_STEM_TOP, NAME_STEM_BOTTOM } from '@/game/entities/PlayerRabbit';

/** How tall the rabbit's art stands above its feet, in container units. */
const RABBIT_TOP = -16;

describe('the name plate above a rabbit', () => {
  it('floats above the head, not on it', () => {
    // Clear of the ears by a real gap — this is the whole point of the move.
    expect(NAME_Y).toBeLessThan(RABBIT_TOP);
    // And by enough to read as a separate label rather than as a hat.
    expect(RABBIT_TOP - NAME_Y).toBeGreaterThanOrEqual(24);
  });

  it('draws the line from inside the plate down to above the ears', () => {
    // Up is negative, so the top is the SMALLER number.
    expect(NAME_STEM_TOP).toBeLessThan(NAME_STEM_BOTTOM);
    // Tucked into the glyphs, so the line and the name read as one object
    // instead of as a label hovering over an unrelated stick.
    expect(NAME_STEM_TOP).toBeGreaterThan(NAME_Y);
    // Stops before the art: a line into the sprite is a spike through the head.
    expect(NAME_STEM_BOTTOM).toBeLessThan(RABBIT_TOP);
  });

  it('leaves no gap between the line and the plate', () => {
    // The failure this catches: someone lifts the plate without lifting the
    // line, and the name floats free above a stub that points at nothing.
    expect(NAME_STEM_TOP - NAME_Y).toBeLessThanOrEqual(8);
  });
});

/**
 * The leader line crosses the counts, and must not be cut by them.
 *
 * The plate floats most of a tile above its rabbit, so the line spans whatever
 * lies between — on a dug board, that is numbers. Drawn under them the line
 * came out in pieces: a dash over the head, a dash under the plate, and the
 * name joined to nothing wherever the rabbit stood next to a cleared tile.
 *
 * The rule everywhere else in this scene is that nothing may hide a number, so
 * this is the one deliberate exception and it is worth stating where a later
 * reader will find it: a one-pixel white hairline costs a glyph nothing, and
 * a broken leader line costs the label its whole purpose.
 */
describe('the name layer', () => {
  const SCENE = readFileSync(new URL('../src/game/scenes/IslandScene.ts', import.meta.url), 'utf8');

  it('draws above the hint layer', () => {
    const hint = SCENE.match(/hintLayer\.zIndex = ([\d_]+)/);
    const name = SCENE.match(/nameLayer\.zIndex = ([\d_]+)/);
    expect(hint).not.toBeNull();
    expect(name).not.toBeNull();
    const value = (m: RegExpMatchArray) => Number(m[1].replaceAll('_', ''));
    expect(value(name!)).toBeGreaterThan(value(hint!));
  });
});

/**
 * A plate and its line die with their rabbit.
 *
 * Both are DEPORTED — they hang on the scene's name layer, not in the rabbit's
 * own container, because they have to draw over the counts and over whatever
 * sorts after the rabbit. That buys the look and costs the guarantee: a
 * container's `destroy({ children: true })` does not reach them, so every path
 * that ends a rabbit has to drop them by hand.
 *
 * One path did not. The line was written when it was still a child of the
 * container, and the comment saying so outlived the move — so `destroy` and
 * `vanish` let go of the HANDLE without destroying the object, and every
 * rabbit that ever left the island left its line behind: white sticks standing
 * on empty grass, one per departure, for the rest of the session ("the line is
 * persistant lol").
 *
 * Asserted on the source rather than by running Pixi, in the idiom
 * `island-layering.test.ts` already uses: what matters is that each teardown
 * path CALLS destroy on both, which is exactly the line a future edit drops.
 */
describe('a rabbit takes its plate and line with it', () => {
  const RABBIT = readFileSync(new URL('../src/game/entities/PlayerRabbit.ts', import.meta.url), 'utf8');

  /** The body of a method, from its signature to the next one at that indent. */
  const methodBody = (name: string): string => {
    const start = RABBIT.indexOf(`  ${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const rest = RABBIT.slice(start + 1);
    const end = rest.search(/\n  \}\n/);
    return rest.slice(0, end);
  };

  it.each(['destroy', 'vanish'])('%s destroys the plate, not just the handle', (method) => {
    const body = methodBody(method);
    expect(body).toMatch(/nameplate|plate/);
    // A `= null` with no `.destroy()` beside it is the whole bug.
    expect(body).toMatch(/plate\.destroy\(/);
  });

  it.each(['destroy', 'vanish'])('%s destroys the line, not just the handle', (method) => {
    const body = methodBody(method);
    expect(body).toMatch(/nameStem|stem/);
    expect(body).toMatch(/stem\.destroy\(/i);
  });

  it('sweeps the layer when the island is swapped', () => {
    // Belt and braces over the per-rabbit teardown above: the one place that
    // can state the layer is empty rather than trust every path to leave it so.
    const SCENE = readFileSync(new URL('../src/game/scenes/IslandScene.ts', import.meta.url), 'utf8');
    const swap = SCENE.slice(SCENE.indexOf('private async swapIsland'));
    expect(swap).toMatch(/nameLayer\.removeChildren\(\)/);
  });
});
