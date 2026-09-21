/**
 * The carrot pill's figure is ONE LINE at a FIXED width. "1 683" beside "#211"
 * broke at its grouping space and pushed the rank chip out of the plate; the
 * face steps down instead, on the kit's own sizes.
 */
import { describe, expect, it } from 'vitest';
import { figureSize } from '../src/components/carrot-pill';
import { groupDigits } from '../src/i18n/format';

describe('the pill figure', () => {
  it('keeps the full face for a short pile, ranked or not', () => {
    // 28 since 2026-09-20: the upper plank gives the pile a row of its own
    // and 22 read small against the wood (see FIGURE_STEPS).
    expect(figureSize(groupDigits(683), null)).toBe(28);
    expect(figureSize(groupDigits(683), '211')).toBe(28);
    expect(figureSize(groupDigits(9999), null)).toBe(28);
  });

  it('steps down once the grouped figure would not fit beside the chip', () => {
    // The screenshot: "1 683" and "#211".
    expect(figureSize(groupDigits(1683), '211')).toBe(16);
    expect(figureSize(groupDigits(12345), '211')).toBe(12);
    expect(figureSize(groupDigits(123456), '5')).toBe(12);
    expect(figureSize(groupDigits(1234567), '1234')).toBe(10);
  });


  it('only ever answers with a step of the kit', () => {
    for (const n of [0, 7, 42, 999, 1000, 1683, 25000, 999999, 5000000, 123456789]) {
      for (const r of [null, '1', '99', '211', '4321']) {
        expect([28, 22, 16, 12, 10]).toContain(figureSize(groupDigits(n), r));
      }
    }
  });
});
