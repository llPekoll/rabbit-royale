/**
 * The carrot pill's figure is ONE LINE at a FIXED width. "1 683" beside "#211"
 * broke at its grouping space and pushed the rank chip out of the plate; the
 * face steps down instead, on the kit's own sizes.
 */
import { describe, expect, it } from 'vitest';
import { figureSize } from '../src/components/carrot-pill';
import { groupDigits } from '../src/i18n/format';

describe('the pill figure', () => {
  it('keeps the full face for a short pile', () => {
    // 28 since 2026-09-20: the upper plank gives the pile a row of its own
    // and 22 read small against the wood (see FIGURE_STEPS). Since the dial
    // and the plank became one board (2026-09-21) the stack is what the wood
    // leaves between the leaf clusters, less the carrot — and the rank chip
    // no longer sits beside the figure, so the figure gets the whole stack.
    expect(figureSize(groupDigits(683), null)).toBe(28);
    expect(figureSize(groupDigits(9999), null)).toBe(28);
  });

  it('steps down as the grouped figure outgrows the wood', () => {
    expect(figureSize(groupDigits(12345), null)).toBe(22);
    expect(figureSize(groupDigits(123456), null)).toBe(16);
    expect(figureSize(groupDigits(12345678), null)).toBe(12);
  });

  it('still narrows the row for a chip, should one come back', () => {
    // The function keeps its rank argument: a chip's inset, "#" and digits
    // come out of the room first. The pill passes null today.
    expect(figureSize(groupDigits(683), '211')).toBe(16);
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
