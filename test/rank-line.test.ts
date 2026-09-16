/**
 * The carrot pill's rank line has to fit its fixed box.
 *
 * The pill is a fixed width on purpose (a centred counter that changes width
 * walks under the eye), so the line inside it is the part that must give. It
 * gave by ellipsis — "#2 · 5,560 to pa..." — which cut off the one word that
 * said what the number was. The gap is shortened instead, and pinned here so a
 * big season cannot bring the ellipsis back.
 */
import { describe, expect, it } from 'vitest';
import { shortGap } from '../src/i18n/format';

describe('the rank line fits', () => {
  it('keeps small gaps whole, with the pill\'s own thin-space separators', () => {
    expect(shortGap(340)).toBe('340');
    expect(shortGap(5560)).toBe('5 560');
    expect(shortGap(9999)).toBe('9 999');
  });

  it('shortens large gaps to at most five characters', () => {
    expect(shortGap(12_345)).toBe('12.3k');
    expect(shortGap(10_000)).toBe('10k');
    expect(shortGap(123_456)).toBe('123k');
    expect(shortGap(1_234_567)).toBe('1.2M');
    for (const n of [10_000, 54_321, 99_999, 100_000, 999_999, 1_000_000, 9_900_000]) {
      expect(shortGap(n).length, String(n)).toBeLessThanOrEqual(5);
    }
  });

  it('rounds a fractional gap up and never goes negative', () => {
    expect(shortGap(339.2)).toBe('340');
    expect(shortGap(-5)).toBe('0');
  });
});
