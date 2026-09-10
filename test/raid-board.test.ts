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
} from '../src/config/burrowConfig';

describe('trapClues', () => {
  it('reads zero everywhere on an unmined burrow', () => {
    const clues = trapClues([]);
    expect([...clues.values()].every((n) => n === 0)).toBe(true);
    // Every walkable tile gets a number — a missing one renders as a hole.
    expect(clues.size).toBe(walkableTiles().length);
  });

  it('counts the traps touching a tile, not the tile itself', () => {
    const mined = walkableTiles().find((t) => isTrappable(t))!;
    const clues = trapClues([mined]);
    for (const neighbour of burrowNeighbors(mined)) {
      expect(clues.get(neighbour), `tile ${neighbour}`).toBe(1);
    }
    // The mined tile's OWN number counts its neighbours, not itself.
    expect(clues.get(mined)).toBe(0);
  });

  it('adds up when several traps touch one tile', () => {
    const centre = walkableTiles().find((t) => burrowNeighbors(t).filter(isTrappable).length >= 3)!;
    const mined = burrowNeighbors(centre).filter(isTrappable).slice(0, 3);
    expect(trapClues(mined).get(centre)).toBe(3);
  });
});

describe('raiderView', () => {
  const clues = trapClues([]);

  it('shows where you stand and what touches it, and nothing else', () => {
    const start = entranceTile();
    const view = raiderView([start], clues, false);
    const shown = new Set(view.map((v) => v.tile));

    expect(shown.has(start)).toBe(true);
    for (const n of burrowNeighbors(start)) expect(shown.has(n)).toBe(true);
    // The board is bigger than a doorway: handing over the whole thing would
    // solve the crossing before the first step.
    expect(shown.size).toBeLessThan(walkableTiles().length);
  });

  it('grows as the raider walks', () => {
    const start = entranceTile();
    const next = burrowNeighbors(start)[0];
    const one = raiderView([start], clues, false).length;
    const two = raiderView([start, next], clues, false).length;
    expect(two).toBeGreaterThan(one);
  });

  it('never shows the field before the raider gets near it', () => {
    // The objective is across the board from the door — a raider who could see
    // it from the doorway would know the whole route immediately.
    const shown = new Set(raiderView([entranceTile()], clues, false).map((v) => v.tile));
    expect(fieldTiles().some((f) => shown.has(f))).toBe(false);
  });

  it('blanks every number under a smoke screen', () => {
    const mined = walkableTiles().filter(isTrappable).slice(0, 4);
    const view = raiderView([entranceTile()], trapClues(mined), true);
    expect(view.every((v) => v.clue === null)).toBe(true);
  });

  it('still shows WHERE the tiles are under a screen', () => {
    // Blind is not the same as void: a raider must know where the walls are, or
    // they are guessing rather than playing a board.
    const lit = raiderView([entranceTile()], clues, false);
    const dark = raiderView([entranceTile()], clues, true);
    expect(dark.map((v) => v.tile).sort()).toEqual(lit.map((v) => v.tile).sort());
  });
});
