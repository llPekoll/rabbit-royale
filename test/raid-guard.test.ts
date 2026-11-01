/**
 * The burrow's guard (lib/game/raid-guard): the breather after a raid that
 * took something, and the ceiling per 24 h, whoever the raiders. Pure.
 */
import { describe, expect, it } from 'vitest';
import { RAID, RAID_RUN } from '@/lib/tuning/tables';
import { attackShieldCostMs, restLeftMs } from '@/lib/game/raid-guard';

const NOW = Date.UTC(2026, 9, 23, 12);
const M = 60_000;
const H = 60 * M;

describe('the burrow rests', () => {
  it('is open when nothing was taken in a day', () => {
    expect(restLeftMs([], NOW)).toBe(0);
    expect(restLeftMs([NOW - 25 * H], NOW)).toBe(0);
  });
  it('breathes after a raid that took something, whoever comes next', () => {
    expect(restLeftMs([NOW - 5 * M], NOW)).toBe(RAID_RUN.VICTIM_REST_MS - 5 * M);
    expect(restLeftMs([NOW - RAID_RUN.VICTIM_REST_MS], NOW)).toBe(0);
  });
  it('the Abols/Zicels chain: the second raid, 9 s after the first, finds the door shut', () => {
    expect(restLeftMs([NOW - 9_000], NOW)).toBeGreaterThan(0);
  });
  it('shuts for the day at the ceiling, until the oldest of them is a day old', () => {
    const cap = RAID_RUN.VICTIM_DAY_CAP;
    const times = Array.from({ length: cap }, (_, i) => NOW - (10 - i) * H);
    expect(restLeftMs(times, NOW)).toBe(times[0] + 24 * H - NOW);
    expect(restLeftMs(times.slice(1), NOW)).toBe(0);
  });
});

describe('raiding spends your own shield (2026-11-01)', () => {
  it('3 h for the first raid of the day, an hour more for each one after', () => {
    expect(attackShieldCostMs(0)).toBe(RAID.ATTACK_SHIELD_COST_MS);
    expect(attackShieldCostMs(1)).toBe(RAID.ATTACK_SHIELD_COST_MS + RAID.ATTACK_SHIELD_STEP_MS);
    expect(attackShieldCostMs(3)).toBe(RAID.ATTACK_SHIELD_COST_MS + 3 * RAID.ATTACK_SHIELD_STEP_MS);
  });
  it('never more than a day', () => {
    expect(attackShieldCostMs(500)).toBe(24 * H);
  });
});
