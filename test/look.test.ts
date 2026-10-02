/**
 * The look of a rabbit (lib/game/look): skin, else picked fur, else default.
 * Pure — the rule only, no database.
 */
import { describe, expect, it } from 'vitest';
import { PASS } from '@config/tuning';
import { DEFAULT_AVATAR } from '@/lib/game/avatars';
import { lookOf } from '@/lib/game/look';

describe('lookOf', () => {
  it('wears the skin over the picked fur', () => {
    expect(lookOf('gray', PASS.SKIN)).toBe(PASS.SKIN);
  });

  it('wears the picked fur without a skin', () => {
    expect(lookOf('orange', null)).toBe('orange');
    expect(lookOf('white', undefined)).toBe('white');
  });

  it('falls back to the default fur for a player who never picked', () => {
    expect(lookOf(null, null)).toBe(DEFAULT_AVATAR);
  });

  it('never hands the client a key it cannot paint', () => {
    expect(lookOf('nft:1234', null)).toBe(DEFAULT_AVATAR);
  });
});
