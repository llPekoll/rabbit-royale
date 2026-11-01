/**
 * The raid door written beside a rival's name (lib/game/raid-door): the same
 * refusals as POST /api/raid, in the same order. Pure — no database.
 */
import { describe, expect, it } from 'vitest';
import { RABBIT_LEVELS } from '@config/tuning';
import { RAID } from '@/lib/tuning/tables';
import { doorOf } from '@/lib/game/raid-door';

const NOW = Date.UTC(2026, 9, 13, 12);
const H = 3_600_000;
const rich = {
  level: RABBIT_LEVELS.RAID_MIN, solo: false, shieldedUntil: null, stock: 5000, garden: 500,
  sleeping: false, takenWhileAsleep: false,
};

describe('the raid door', () => {
  it('opens on an awake, unshielded, rich burrow', () => {
    expect(doorOf(rich, 0, NOW)).toEqual({ state: 'open', waitMs: 0 });
  });
  it('says how long a shield still runs', () => {
    expect(doorOf({ ...rich, shieldedUntil: new Date(NOW + 3 * H) }, 0, NOW)).toEqual({ state: 'shield', waitMs: 3 * H });
  });
  it('waits for whichever ends later, shield or my cooldown', () => {
    expect(doorOf({ ...rich, shieldedUntil: new Date(NOW + H / 2) }, H, NOW)).toEqual({ state: 'shield', waitMs: H });
  });
  it('counts my cooldown on them as a shield', () => {
    expect(doorOf(rich, 20 * 60_000, NOW)).toEqual({ state: 'shield', waitMs: 20 * 60_000 });
  });
  it('revenge goes through the shield, and through nothing else', () => {
    const shielded = { ...rich, shieldedUntil: new Date(NOW + 5 * H), revenge: true };
    expect(doorOf(shielded, 0, NOW)).toEqual({ state: 'open', waitMs: 0 });
    expect(doorOf(shielded, H, NOW)).toEqual({ state: 'shield', waitMs: H });
    expect(doorOf({ ...shielded, stock: 0, garden: 0 }, 0, NOW).state).toBe('bare');
  });
  it('a lapsed shield is no shield', () => {
    expect(doorOf({ ...rich, shieldedUntil: new Date(NOW - 1) }, 0, NOW).state).toBe('open');
  });
  it('refuses the young, then the solo, before anything else', () => {
    expect(doorOf({ ...rich, level: RABBIT_LEVELS.RAID_MIN - 1, solo: true }, H, NOW).state).toBe('locked');
    expect(doorOf({ ...rich, solo: true, shieldedUntil: new Date(NOW + H) }, 0, NOW).state).toBe('solo');
  });
  it('a burrow with nothing to take is bare', () => {
    expect(doorOf({ ...rich, stock: 0, garden: 0 }, 0, NOW).state).toBe('bare');
    expect(RAID.NOTHING_TO_TAKE_BELOW).toBeGreaterThan(0);
  });
  it('an asleep burrow raided once this absence is shut', () => {
    expect(doorOf({ ...rich, sleeping: true, takenWhileAsleep: true }, 0, NOW).state).toBe('asleep');
  });
});
