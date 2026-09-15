/**
 * The NEXT strip's rules, once the quest arc is claimed.
 *
 * One line, in priority order: risk (a full garden), then a lapse (the
 * shield), then a temptation (a rich open burrow), then the island. Pinned
 * because the order IS the design: the line is the one place the game says
 * "now do this", and a garden that empties into a raider's bag while the
 * strip says "Dig" is the strip lying.
 */
import { describe, expect, it } from 'vitest';
import { nextAction, type NextActionInput } from '../src/config/next-action';
import { NEXT_ACTION } from '../config/tuning';

const base = (over: Partial<NextActionInput> = {}): NextActionInput => ({
  energy: 60,
  runCost: 25,
  nextRunInMs: null,
  gardenReady: 0,
  gardenCapacity: 864,
  shieldMs: null,
  trapsLive: 5,
  trapsPlaced: 5,
  targets: [],
  ...over,
});

describe('nextAction', () => {
  it('sends a full bank to the island', () => {
    const a = nextAction(base());
    expect(a.door).toBe('farm');
    expect(a.text).toMatch(/Dig\./);
  });

  it('names the wait when the bank is short', () => {
    const a = nextAction(base({ energy: 10, nextRunInMs: 30 * 60_000 }));
    expect(a.door).toBe('farm');
    expect(a.text).toMatch(/A run in 30m/);
  });

  it('puts a nearly full garden before everything', () => {
    const a = nextAction(base({
      gardenReady: 864 * NEXT_ACTION.GARDEN_FULL_SHARE,
      shieldMs: 10 * 60_000, trapsLive: 0,
      targets: [{ name: 'Thistle', garden: 900, shielded: false }],
    }));
    expect(a.door).toBe('garden');
    expect(a.text).toMatch(/before a raider does/);
  });

  it('warns of a lifting shield only when the floor is not standing', () => {
    const soon = NEXT_ACTION.SHIELD_WARNING_MS - 1;
    expect(nextAction(base({ shieldMs: soon, trapsLive: 0 })).door).toBe('base');
    expect(nextAction(base({ shieldMs: soon, trapsLive: NEXT_ACTION.TRAPS_WANTED })).door).toBe('farm');
    // A shield with hours left is not news yet.
    expect(nextAction(base({ shieldMs: NEXT_ACTION.SHIELD_WARNING_MS * 5, trapsLive: 0 })).door).toBe('farm');
  });

  it('names the richest open burrow, and ignores shielded or poor ones', () => {
    const a = nextAction(base({
      targets: [
        { name: 'Thistle', garden: 900, shielded: true },
        { name: 'Ironwood', garden: 400, shielded: false },
        { name: 'Bramble', garden: 650, shielded: false },
        { name: 'Sly', garden: NEXT_ACTION.RAID_WORTH_GARDEN - 1, shielded: false },
      ],
    }));
    expect(a.door).toBe('raid');
    expect(a.text).toMatch(/^Bramble left 650/);
    expect(nextAction(base({ targets: [{ name: 'Sly', garden: 10, shielded: false }] })).door).toBe('farm');
  });

  it('keeps every line short enough to read at a glance', () => {
    const cases = [
      base(),
      base({ energy: 0, nextRunInMs: 5 * 3_600_000 + 60_000 }),
      base({ gardenReady: 864 }),
      base({ shieldMs: 1000, trapsLive: 0 }),
      base({ targets: [{ name: 'Ironwood', garden: 400, shielded: false }] }),
    ];
    for (const c of cases) expect(nextAction(c).text.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});
