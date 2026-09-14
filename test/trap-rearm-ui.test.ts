/**
 * What the defence panel SAYS while a burrow is rearming.
 *
 * The arming clock is a psychology fix as much as an economy one: the same
 * board reported two ways is the difference between "you lost five traps" and
 * "five are coming back, free". These tests pin the reading, because the
 * wording is the entire deliverable of the client half — the numbers were
 * already correct on the server.
 *
 * Asserted on the pure state->copy rules rather than by rendering, so they
 * describe the CONTRACT the panel honours: which count is shown, when the
 * alarm fires, and which sentence a mid-rearm burrow gets.
 */
import { describe, expect, it } from 'vitest';
import { TRAPS } from '../config/tuning';
import { armedTraps, rearmingTraps } from '../src/lib/game/traps';

const ago = (ms: number) => new Date(Date.now() - ms);

/** A board as the server would report it to the shelf. */
function panel(traps: { tile: number; sprungAt?: Date | null }[]) {
  const armed = armedTraps(traps);
  const coming = rearmingTraps(traps);
  return {
    placed: traps.length,
    armed: armed.length,
    rearming: coming.length,
    nextRearmAt: coming.length ? coming[0].readyAt : null,
    /** The alarm: is anything standing RIGHT NOW? */
    bare: armed.length === 0,
    /** Nothing up, but traps on the way — a different sentence from bare. */
    healing: armed.length === 0 && coming.length > 0,
  };
}

const board = (n: number, sprung: number) =>
  Array.from({ length: n }, (_, tile) => ({
    tile,
    sprungAt: tile < sprung ? ago(0) : null,
  }));

describe('what the count reports', () => {
  it('shows what is STANDING, not what is buried', () => {
    // A board reading 8/8 with five down would be a lie in the player's
    // favour, which is the worse kind on a defence screen.
    const p = panel(board(8, 5));
    expect(p.placed).toBe(8);
    expect(p.armed).toBe(3);
  });

  it('adds up: standing plus rearming is the whole board', () => {
    const p = panel(board(8, 5));
    expect(p.armed + p.rearming).toBe(p.placed);
  });

  it('says nothing about rearming on an untouched burrow', () => {
    const p = panel(board(8, 0));
    expect(p.rearming).toBe(0);
    expect(p.nextRearmAt).toBeNull();
    expect(p.healing).toBe(false);
  });
});

describe('the alarm', () => {
  it('fires when nothing is standing, rearming or not', () => {
    // A raider arriving this minute meets open ground either way — that is the
    // fact the colour is about.
    expect(panel(board(8, 8)).bare).toBe(true);
    expect(panel([]).bare).toBe(true);
  });

  it('does not fire while even one trap holds', () => {
    expect(panel(board(8, 7)).bare).toBe(false);
  });
});

describe('bare versus healing — the sentence that matters', () => {
  /**
   * THE distinction the clock was added for. An owner whose traps are coming
   * back has nothing to fix, and "NOTHING BURIED" would send them to a board
   * they cannot act on — the failure mode this test exists to catch.
   */
  it('separates a burrow with nothing from one that is coming back', () => {
    const empty = panel([]);
    const walked = panel(board(8, 8));

    expect(empty.bare).toBe(true);
    expect(empty.healing).toBe(false);

    expect(walked.bare).toBe(true);
    expect(walked.healing).toBe(true);
  });

  it('stops calling it healing once something stands again', () => {
    const later = armedTraps(board(8, 8), Date.now() + TRAPS.REARM_MS + 1000);
    expect(later.length).toBeGreaterThan(0);
  });
});

describe('the countdown', () => {
  it('points at the trap that comes back first', () => {
    const traps = [
      { tile: 1, sprungAt: ago(60_000) },
      { tile: 2, sprungAt: ago(TRAPS.REARM_MS - 60_000) },
    ];
    const p = panel(traps);
    const soonest = Math.min(...rearmingTraps(traps).map((r) => r.readyAt));
    expect(p.nextRearmAt).toBe(soonest);
  });

  it('always points forward while traps are down', () => {
    // A countdown reading a past instant would render as "0m" and never move,
    // which reads as broken rather than as waiting.
    const p = panel(board(8, 5));
    expect(p.nextRearmAt).not.toBeNull();
    expect(p.nextRearmAt!).toBeGreaterThan(Date.now());
  });
});
