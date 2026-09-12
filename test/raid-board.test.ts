/**
 * The burrow as a minefield: what a raider may read, and what they may not.
 *
 * These pin the information contract, which is the whole reason burying a trap
 * is worth doing. Get this wrong in either direction and one half of the game
 * stops working: leak the trap positions and defence is pointless, hand over
 * every clue at once and the crossing is solved before the first step.
 */
import { describe, expect, it } from 'vitest';
import { trapClues, raiderView } from '../src/lib/game/raid';
import {
  burrowNeighbors, entranceTile, fieldTiles, isTrappable, walkableTiles,
} from '../src/game/burrow/board';

/**
 * One burrow, named.
 *
 * The information contract does not depend on the shape of the ground, so one
 * generated homestead is enough here — `burrow-raid` is where the generator
 * itself is checked across a spread of seeds. Named rather than inlined so
 * every assertion below is visibly about the SAME burrow: a clue read from one
 * player's ground and a step taken on another's would be a meaningless test.
 */
const SEED = 'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk';

describe('trapClues', () => {
  it('reads zero everywhere on an unmined burrow', () => {
    const clues = trapClues(SEED, []);
    expect([...clues.values()].every((n) => n === 0)).toBe(true);
    // Every walkable tile gets a number — a missing one renders as a hole.
    expect(clues.size).toBe(walkableTiles(SEED).length);
  });

  it('counts the traps touching a tile, not the tile itself', () => {
    const mined = walkableTiles(SEED).find((t) => isTrappable(SEED, t))!;
    const clues = trapClues(SEED, [mined]);
    for (const neighbour of burrowNeighbors(SEED, mined)) {
      expect(clues.get(neighbour), `tile ${neighbour}`).toBe(1);
    }
    // The mined tile's OWN number counts its neighbours, not itself.
    expect(clues.get(mined)).toBe(0);
  });

  it('adds up when several traps touch one tile', () => {
    const centre = walkableTiles(SEED).find(
      (t) => burrowNeighbors(SEED, t).filter((n) => isTrappable(SEED, n)).length >= 3,
    )!;
    const mined = burrowNeighbors(SEED, centre)
      .filter((n) => isTrappable(SEED, n)).slice(0, 3);
    expect(trapClues(SEED, mined).get(centre)).toBe(3);
  });
});

describe('raiderView', () => {
  const clues = trapClues(SEED, []);

  it('shows where you stand and what touches it, and nothing else', () => {
    const start = entranceTile(SEED);
    const view = raiderView(SEED, [start], clues, false);
    const shown = new Set(view.map((v) => v.tile));

    expect(shown.has(start)).toBe(true);
    for (const n of burrowNeighbors(SEED, start)) expect(shown.has(n)).toBe(true);
    // The board is bigger than a doorway: handing over the whole thing would
    // solve the crossing before the first step.
    expect(shown.size).toBeLessThan(walkableTiles(SEED).length);
  });

  it('grows as the raider walks', () => {
    const start = entranceTile(SEED);
    const next = burrowNeighbors(SEED, start)[0];
    const one = raiderView(SEED, [start], clues, false).length;
    const two = raiderView(SEED, [start, next], clues, false).length;
    expect(two).toBeGreaterThan(one);
  });

  it('never shows the field before the raider gets near it', () => {
    // The objective is across the board from the door — a raider who could see
    // it from the doorway would know the whole route immediately.
    const shown = new Set(
      raiderView(SEED, [entranceTile(SEED)], clues, false).map((v) => v.tile),
    );
    expect(fieldTiles(SEED).some((f) => shown.has(f))).toBe(false);
  });

  it('blanks every number under a smoke screen', () => {
    const mined = walkableTiles(SEED).filter((t) => isTrappable(SEED, t)).slice(0, 4);
    const view = raiderView(SEED, [entranceTile(SEED)], trapClues(SEED, mined), true);
    expect(view.every((v) => v.clue === null)).toBe(true);
  });

  it('still shows WHERE the tiles are under a screen', () => {
    // Blind is not the same as void: a raider must know where the walls are, or
    // they are guessing rather than playing a board.
    const lit = raiderView(SEED, [entranceTile(SEED)], clues, false);
    const dark = raiderView(SEED, [entranceTile(SEED)], clues, true);
    expect(dark.map((v) => v.tile).sort()).toEqual(lit.map((v) => v.tile).sort());
  });

  it('tells the raider which shelf each tile stands on', () => {
    // The defender's ground is terraced. Without the tier a revealed tile is
    // drawn at ground level, which on a plateau puts it inside the cliff it is
    // standing on.
    const view = raiderView(SEED, [entranceTile(SEED)], clues, false);
    expect(view.every((v) => v.tier >= 1)).toBe(true);
  });

  it('never leaks a trap position, only the numbers around one', () => {
    // The whole information contract in one line: the payload a raider gets
    // carries clues and tiles, and nothing that says "a trap is here".
    const mined = walkableTiles(SEED).filter((t) => isTrappable(SEED, t)).slice(0, 4);
    const view = raiderView(SEED, [entranceTile(SEED)], trapClues(SEED, mined), false);
    expect(Object.keys(view[0])).toEqual(['tile', 'clue', 'tier']);
  });
});
