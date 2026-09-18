/**
 * The name under a rabbit is CUT, and cut safely.
 *
 * The plate exists to tell four rabbits apart at a glance, not to carry a
 * handle: a full name spanned three cells of counts and hid the numbers behind
 * it, which on a minesweeper board is the run. So it is trimmed to four
 * characters and marked.
 *
 * Worth a test rather than an eye, for two reasons the picture does not show:
 *
 *   - the mark is three PERIODS, not the single-glyph ellipsis. The kit's
 *     bitmap atlas is 0x20–0x7E and a BitmapText drops an unknown glyph
 *     silently, so "…" would render as nothing in English — the name would
 *     read as accidentally truncated instead of deliberately shortened, and
 *     nothing on screen would say why.
 *   - a string indexes by UTF-16 code unit. `slice(0, 4)` through a name whose
 *     fourth character is an emoji or a sinogram cuts mid-surrogate and yields
 *     half a character, which draws as a blank box. Names are user input and
 *     this game ships in four languages, so that case is real.
 */
import { describe, expect, it } from 'vitest';
import { shortName } from '@/game/entities/PlayerRabbit';

describe('the name plate under a rabbit', () => {
  it('leaves a short name alone', () => {
    expect(shortName('BRAM')).toBe('BRAM');
    expect(shortName('AB')).toBe('AB');
    expect(shortName('')).toBe('');
  });

  it('cuts a long one to four characters and marks it', () => {
    expect(shortName('CURSEDWHISKERS2')).toBe('CURS...');
    expect(shortName('BRAMBLE')).toBe('BRAM...');
  });

  it('marks with three periods, never the ellipsis glyph', () => {
    // The atlas cannot draw "…", and drops it without a word.
    expect(shortName('CURSEDWHISKERS2')).not.toContain('…');
    expect(shortName('CURSEDWHISKERS2').endsWith('...')).toBe(true);
  });

  it('counts code points, so a wide name is not cut in half', () => {
    // Five sinograms: cut to four whole ones, not to four code units.
    expect(shortName('兎小屋兎小')).toBe('兎小屋兎...');
    // An emoji is a surrogate PAIR — `slice` would leave a lone half here.
    const emoji = shortName('🐰🐰🐰🐰🐰');
    expect(emoji).toBe('🐰🐰🐰🐰...');
    // No lone surrogate survived the cut.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(emoji)).toBe(false);
  });

  it('keeps a name of exactly the limit whole, with no mark', () => {
    // The boundary: four is kept, five is cut. An off-by-one here would put a
    // mark on a name that fits, which looks like a bug to the player.
    expect(shortName('ABCD')).toBe('ABCD');
    expect(shortName('ABCDE')).toBe('ABCD...');
  });
});
