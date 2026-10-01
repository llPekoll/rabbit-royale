/**
 * The Crown Race Ticket: how the prize pool is cut, and when the ticket may
 * be sold. All pure — no database, a fixed clock.
 */
import { describe, expect, it } from 'vitest';
import { PASS, passPayoutShare } from '@config/tuning';
import { passSaleBlocker, payoutPlan, prizePoolCents } from '@/lib/game/season-pass';

const DAY = 86_400_000;
const holders = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, score: 1000 - i }));

describe('prize pool', () => {
  it('shares sum to one', () => {
    expect(PASS.PAYOUT_SHARES.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(PASS.PAYOUT_SHARES).toHaveLength(10);
  });

  it('is half of the pot', () => {
    expect(prizePoolCents(100 * 499)).toBe(24_950);
  });

  it('pays the top ten 40/24/16 then 20 % evenly, never more than the pool', () => {
    const pot = 100 * 499;                      // 100 passes at $4.99
    const plan = payoutPlan(pot, holders(25));
    expect(plan).toHaveLength(10);
    expect(plan.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(plan[0].usdCents).toBe(9_980);       // 40 % of $249.50
    expect(plan[1].usdCents).toBe(5_988);
    expect(plan[2].usdCents).toBe(3_992);
    expect(plan[3].usdCents).toBe(plan[9].usdCents);
    expect(plan.reduce((a, p) => a + p.usdCents, 0)).toBeLessThanOrEqual(prizePoolCents(pot));
    expect(prizePoolCents(pot) - plan.reduce((a, p) => a + p.usdCents, 0)).toBeLessThan(10);
  });

  it('normalises the shares when fewer than ten holders scored', () => {
    const plan = payoutPlan(1000, holders(2));
    expect(plan[0].usdCents).toBe(312);         // 40/64 of 500
    expect(plan[1].usdCents).toBe(187);
    expect(passPayoutShare(0, 1)).toBe(1);
    expect(passPayoutShare(5, 3)).toBe(0);
  });

  it('pays nobody from an empty pot', () => {
    expect(payoutPlan(0, holders(3)).every((p) => p.usdCents === 0)).toBe(true);
    expect(payoutPlan(500, [])).toEqual([]);
  });
});

describe('sale', () => {
  const now = Date.UTC(2026, 9, 5);
  const season = { id: 4, endsAt: new Date(now + 10 * DAY), endedAt: null, passOn: true };

  it('sells during a pass season to a player without one', () => {
    expect(passSaleBlocker(season, false, now)).toBeNull();
  });

  it('refuses outside a pass season, twice, and in the last hour', () => {
    expect(passSaleBlocker(null, false, now)).toBe('pass_closed');
    expect(passSaleBlocker({ ...season, passOn: false }, false, now)).toBe('pass_closed');
    expect(passSaleBlocker(season, true, now)).toBe('pass_owned');
    expect(passSaleBlocker({ ...season, endsAt: new Date(now + PASS.SALE_CUTOFF_MS - 1) }, false, now)).toBe('pass_ending');
  });
});
