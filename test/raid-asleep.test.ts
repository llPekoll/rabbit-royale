/**
 * Asleep burrows (RAID.ASLEEP_AFTER_MS): an owner away for days pays a tenth
 * of a haul, once per absence, and wakes the moment `lastSeenAt` moves.
 */
import { describe, expect, it } from 'vitest';
import { RAID } from '@config/tuning';
import { asleep, awakeSince, maxRaidHaul, nothingToTake, settleRaid } from '@/lib/game/raid';

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const H = 3_600_000;

describe('asleep', () => {
  it('a burrow seen within the window is awake', () => {
    expect(asleep(new Date(NOW - H), NOW)).toBe(false);
    expect(asleep(new Date(NOW - RAID.ASLEEP_AFTER_MS + H), NOW)).toBe(false);
  });

  it('past the window it sleeps', () => {
    expect(asleep(new Date(NOW - RAID.ASLEEP_AFTER_MS - H), NOW)).toBe(true);
    expect(asleep(new Date(NOW - 20 * 24 * H), NOW)).toBe(true);
  });

  it('coming back wakes it: a fresh lastSeenAt is awake again', () => {
    const before = new Date(NOW - 20 * 24 * H);
    expect(asleep(before, NOW)).toBe(true);
    expect(asleep(new Date(NOW), NOW)).toBe(false);
  });

  it('the list cutoff is the same line as the door', () => {
    const cut = awakeSince(NOW);
    expect(asleep(new Date(cut.getTime() + 1), NOW)).toBe(false);
    expect(asleep(new Date(cut.getTime() - 1), NOW)).toBe(true);
  });
});

describe('an asleep burrow pays ASLEEP_LOOT_SHARE', () => {
  // Small enough that the awake haul stays under RAID.LOOT_CAP.
  const base = { seed: 'sleeper', defenderStock: RAID.SAFE_FLOOR + 3_000, defenderGarden: 300, defenderLevel: 5, shielded: false };
  it('a tenth of the same raid, same rolls', () => {
    const endedAt = 0;
    const awake = settleRaid({ ...base, endedAt }, () => 0.5);
    const sleeping = settleRaid({ ...base, endedAt, asleep: true }, () => 0.5);
    expect(awake.loot).toBeGreaterThan(0);
    expect(sleeping.loot).toBeLessThanOrEqual(Math.ceil(awake.loot * RAID.ASLEEP_LOOT_SHARE) + 1);
    expect(sleeping.loot).toBeGreaterThanOrEqual(Math.floor(awake.loot * RAID.ASLEEP_LOOT_SHARE) - 1);
  });

  it('a purse worth a raid awake can be nothing to take asleep', () => {
    let stock = RAID.SAFE_FLOOR;
    while (maxRaidHaul(stock, 0) < RAID.NOTHING_TO_TAKE_BELOW * 2) stock += 10;
    expect(nothingToTake(stock, 0)).toBe(false);
    expect(nothingToTake(stock, 0, true)).toBe(true);
  });
});
