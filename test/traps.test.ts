/**
 * The trap allowance.
 *
 * Derived from a timestamp, so it has to be right for arbitrary gaps — including
 * "away for a month", which a cron would have handled by accident and this has
 * to handle on purpose.
 */
import { describe, expect, it } from 'vitest';
import { TRAPS } from '../config/tuning';
import {
  availableTraps, freeTraps, spendTrap, refundTrap, placementBlocker,
} from '../src/lib/game/traps';

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const perTrap = TRAPS.REFILL_MS / TRAPS.FREE_PER_DAY;

describe('freeTraps', () => {
  it('gives nothing immediately after a claim', () => {
    expect(freeTraps({ trapsOwned: 0, trapsClaimedAt: new Date() })).toBe(0);
  });

  it('refills one at a time rather than all at midnight', () => {
    expect(freeTraps({ trapsOwned: 0, trapsClaimedAt: ago(perTrap) })).toBe(1);
    expect(freeTraps({ trapsOwned: 0, trapsClaimedAt: ago(perTrap * 2) })).toBe(2);
  });

  it('caps the allowance however long you were away', () => {
    expect(freeTraps({ trapsOwned: 0, trapsClaimedAt: ago(30 * 24 * HOUR) }))
      .toBe(TRAPS.FREE_PER_DAY);
  });
});

describe('availableTraps', () => {
  it('adds bought stock to the free allowance', () => {
    const row = { trapsOwned: 4, trapsClaimedAt: ago(TRAPS.REFILL_MS) };
    expect(availableTraps(row)).toBe(4 + TRAPS.FREE_PER_DAY);
  });

  it('never exceeds what a player may hold', () => {
    const row = { trapsOwned: 999, trapsClaimedAt: ago(TRAPS.REFILL_MS) };
    expect(availableTraps(row)).toBe(TRAPS.MAX_HELD);
  });
});

describe('spendTrap', () => {
  it('spends the free allowance before bought stock', () => {
    const row = { trapsOwned: 5, trapsClaimedAt: ago(TRAPS.REFILL_MS) };
    const after = spendTrap(row)!;
    // Bought stock untouched: the perishable resource goes first.
    expect(after.trapsOwned).toBe(5);
    expect(after.trapsClaimedAt.getTime()).toBeGreaterThan(row.trapsClaimedAt.getTime());
  });

  it('does not discard progress towards the next free trap', () => {
    // Two free earned, one spent → one still available. Resetting the stamp to
    // `now` would throw the second away, which is the bug this shape prevents.
    const row = { trapsOwned: 0, trapsClaimedAt: ago(perTrap * 2) };
    const after = spendTrap(row)!;
    expect(freeTraps({ trapsOwned: 0, trapsClaimedAt: after.trapsClaimedAt })).toBe(1);
  });

  it('falls back to bought stock when the allowance is dry', () => {
    const row = { trapsOwned: 2, trapsClaimedAt: new Date() };
    expect(spendTrap(row)!.trapsOwned).toBe(1);
  });

  it('returns null with nothing to spend', () => {
    expect(spendTrap({ trapsOwned: 0, trapsClaimedAt: new Date() })).toBeNull();
  });
});

describe('placementBlocker', () => {
  const rich = { trapsOwned: 10, trapsClaimedAt: ago(TRAPS.REFILL_MS) };

  it('allows a legal placement', () => {
    expect(placementBlocker(rich, 0, true, false)).toBeNull();
  });

  it('refuses a tile off the board, and one that already holds a bomb', () => {
    // Not the field or the entrance any more — those are minable now (see
    // game/burrow/cells). What is left is ground that is not ground at all.
    expect(placementBlocker(rich, 0, false, false)).toBe('tile_not_trappable');
    expect(placementBlocker(rich, 0, true, true)).toBe('tile_already_trapped');
  });

  it('refuses past the board cap — a maze is not a gauntlet', () => {
    expect(placementBlocker(rich, TRAPS.MAX_PLACED, true, false)).toBe('board_full');
  });

  it('refuses with no traps in hand', () => {
    const broke = { trapsOwned: 0, trapsClaimedAt: new Date() };
    expect(placementBlocker(broke, 0, true, false)).toBe('no_traps');
  });
});

describe('refundTrap', () => {
  it('hands a lifted trap back as bought stock', () => {
    const row = { trapsOwned: 2, trapsClaimedAt: new Date() };
    expect(refundTrap(row).trapsOwned).toBe(3);
  });

  it('does not rewind the free allowance, however the trap was paid for', () => {
    // The loop this closes: spend a free trap, lift it, and a rewound stamp
    // would give back the trap AND the progress towards the next one — so a
    // defender could rearrange their burrow into free traps. Owned stock has
    // no clock, so a lift is worth exactly the placement it undoes.
    const row = { trapsOwned: 0, trapsClaimedAt: ago(perTrap * 2) };
    const spent = spendTrap(row)!;
    const after = { ...row, ...spent, ...refundTrap({ ...row, ...spent }) };

    expect(availableTraps(after)).toBe(availableTraps(row));
    // And the clock kept running rather than restarting: one free trap is
    // still one step away, exactly as it was before the placement.
    expect(freeTraps(after)).toBe(1);
  });

  it('never pushes a player over what the bag holds', () => {
    const full = { trapsOwned: TRAPS.MAX_HELD, trapsClaimedAt: new Date() };
    expect(availableTraps(refundTrapRow(full))).toBe(TRAPS.MAX_HELD);

    // With the free allowance full too, the cap counts BOTH: a refund that
    // ignored the allowance would let a lift smuggle a player past MAX_HELD.
    const brimming = { trapsOwned: TRAPS.MAX_HELD, trapsClaimedAt: ago(TRAPS.REFILL_MS) };
    expect(availableTraps(refundTrapRow(brimming))).toBe(TRAPS.MAX_HELD);
  });
});

/** A row with its refund applied, for the assertions above. */
const refundTrapRow = (row: { trapsOwned: number; trapsClaimedAt: Date }) =>
  ({ ...row, ...refundTrap(row) });
