/**
 * The grey the map drains to when the run ends.
 *
 * Pinned as numbers because the failure modes are ones a screenshot flatters:
 * a matrix that also scales alpha dims the silhouettes into the sea and still
 * "looks grey", and one that desaturates without dimming — or dims before it
 * desaturates — reads as a filter glitch mid-fade rather than as the lights
 * going down.
 */
import { describe, expect, it } from 'vitest';
import { DRAIN_BRIGHTNESS, drainMatrix } from '../src/game/fx/Drain';

const IDENTITY = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/** Apply the matrix to an opaque RGB colour. */
function apply(m: number[], [r, g, b]: [number, number, number]): [number, number, number, number] {
  const row = (i: number) => m[i * 5] * r + m[i * 5 + 1] * g + m[i * 5 + 2] * b + m[i * 5 + 3] * 1 + m[i * 5 + 4];
  return [row(0), row(1), row(2), row(3)];
}

describe('the map drains to grey', () => {
  it('starts in full colour', () => {
    drainMatrix(0).forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i], 10));
  });

  it('ends grey: every colour lands on equal channels', () => {
    for (const c of [[1, 0, 0], [0, 1, 0], [0.2, 0.5, 0.9], [1, 1, 1]] as [number, number, number][]) {
      const [r, g, b] = apply(drainMatrix(1), c);
      expect(g).toBeCloseTo(r, 10);
      expect(b).toBeCloseTo(r, 10);
    }
  });

  it('dims white to the drained brightness, not to black', () => {
    const [r] = apply(drainMatrix(1), [1, 1, 1]);
    expect(r).toBeCloseTo(DRAIN_BRIGHTNESS, 10);
  });

  it('never touches alpha, so silhouettes stay whole', () => {
    for (const t of [0, 0.3, 0.7, 1]) {
      expect(drainMatrix(t).slice(15)).toEqual([0, 0, 0, 1, 0]);
    }
  });

  it('loses colour and light together, all the way through the fade', () => {
    // Spread between channels of a saturated blue, and its brightness, both
    // fall at every step: no frame is grey-but-bright or dark-but-coloured.
    let prevSpread = Infinity;
    let prevLight = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const [r, g, b] = apply(drainMatrix(t), [0.2, 0.5, 0.9]);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const light = r + g + b;
      expect(spread).toBeLessThanOrEqual(prevSpread + 1e-12);
      expect(light).toBeLessThanOrEqual(prevLight + 1e-12);
      prevSpread = spread;
      prevLight = light;
    }
  });
});
