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
