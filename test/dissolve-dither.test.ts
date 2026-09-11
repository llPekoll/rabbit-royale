/**
 * The dither matrix in the shader IS the Bayer matrix.
 *
 * Almost everything about `DissolveFilter` is an eye problem and belongs in a
 * story — how big the dot should be, whether the hole reads as a window or as
 * damage. This one thing is not. The shader cannot use a lookup table (GLSL ES
 * 1.00 has no array constructor and no dynamic indexing of a const array), so
 * the sixteen values are COMPUTED from the bits of the coordinates, and that
 * arithmetic has a failure mode no screenshot catches: get the interleave order
 * backwards and you get a matrix holding the same sixteen numbers in different
 * places. It still looks like an even stipple. It simply removes the wrong
 * pixels first, which is the whole property an ORDERED dither is chosen for —
 * the alternative is noise, and noise crawls.
 *
 * So the formula is mirrored here in TypeScript and pinned against the table
 * every reference prints. Mirrored rather than shared because the original has
 * to be GLSL; the guard is that the two are checked to agree, cell by cell.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The canonical 4x4 ordered Bayer matrix, `[row][col]`.
 *
 * Not derived from anything in `src` on purpose — a test that computes its
 * expectation the same way the code does passes for any formula.
 */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** The shader's `bayer4`, transcribed. Returns the raw 0..15 value. */
function bayer4Raw(x: number, y: number): number {
  const xm = ((x % 4) + 4) % 4;
  const ym = ((y % 4) + 4) % 4;
  const x0 = xm % 2;
  const x1 = Math.floor(xm / 2);
  const y0 = ym % 2;
  const y1 = Math.floor(ym / 2);
  // XOR of two bits without an integer XOR, exactly as the shader does it.
  const a1 = y1 + x1 - 2 * y1 * x1;
  const a0 = y0 + x0 - 2 * y0 * x0;
  return a0 * 8 + y0 * 4 + a1 * 2 + y1;
}

const SOURCE = readFileSync(
  new URL('../src/game/fx/DissolveFilter.ts', import.meta.url), 'utf8',
);

describe('dissolve dither', () => {
  it('computes the canonical Bayer matrix', () => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(bayer4Raw(x, y), `cell (${x}, ${y})`).toBe(BAYER[y][x]);
      }
    }
  });

  it('spreads its thresholds evenly over 0..1', () => {
    // What the matrix is FOR: at amount a, about a of the pixels go. Uneven
    // thresholds would still be a valid-looking pattern but would make the
    // `amount` control non-linear, so half the range does nothing visible.
    const values: number[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      values.push((bayer4Raw(x, y) + 0.5) / 16);
    }
    values.sort((a, b) => a - b);
    expect(new Set(values).size).toBe(16);
    for (let i = 0; i < 16; i++) {
      expect(values[i]).toBeCloseTo((i + 0.5) / 16, 10);
    }
  });

  it('keeps the shader formula in step with the one tested here', () => {
    // The test transcribes GLSL, so it can drift from it silently. Pinning the
    // one line that carries the bit order is what makes the transcription a
    // guard rather than a copy that rots.
    const glsl = SOURCE.slice(SOURCE.indexOf('float bayer4'));
    expect(glsl).toMatch(/float v = a0 \* 8\.0 \+ y0 \* 4\.0 \+ a1 \* 2\.0 \+ y1;/);
  });

  it('is written for GLSL ES 1.00, which has no array lookup', () => {
    // The version this replaced compiled on WebGL2 and failed on WebGL1 with
    // nothing but a console error and a black sprite. Nobody would look for a
    // regression here until a player on an older phone reported a black tree.
    const glsl = SOURCE.slice(SOURCE.indexOf('const BAYER_4X4'));
    expect(glsl).not.toMatch(/float\s*\[\s*16\s*\]/);
    expect(glsl).not.toMatch(/BAYER\s*\[/);
  });
});
