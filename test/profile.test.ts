/**
 * The rules behind the profile panel.
 *
 * Names and avatars are the only two things a player can set about themselves,
 * so both are validated on the server — and the picker has to refuse exactly
 * what the server would, which is why the rules live in one module and are
 * tested here rather than through the route.
 */
import { describe, expect, it } from 'vitest';
import {
  NAME_MAX,
  NAME_MIN,
  nameProblem,
  normalizeName,
} from '../src/lib/game/player-name';
import { AVATARS, DEFAULT_AVATAR, avatarSrc, isBuiltInAvatar } from '../src/lib/game/avatars';
import { raidResult } from '../src/lib/game/record-raid';
import { restoreDecision } from '../src/components/use-wallet-login';

describe('player names', () => {
  it('accepts ordinary names', () => {
    for (const n of ['Bun', 'CursedWarren42', 'Big Ears', 'lop-eared', 'a_b']) {
      expect(nameProblem(n), n).toBeNull();
    }
  });

  it('collapses whitespace so one name is one name', () => {
    expect(normalizeName('  Bun   Bun ')).toBe('Bun Bun');
    // Which means padding cannot be used to fake a distinct name.
    expect(normalizeName('Bun')).toBe(normalizeName('   Bun   '));
  });

  it('rejects the empty and the near-empty', () => {
    expect(nameProblem('')).toBe('too_short');
    expect(nameProblem('   ')).toBe('too_short');
    expect(nameProblem('ab')).toBe('too_short');
  });

  it('holds the length bounds', () => {
    expect(nameProblem('x'.repeat(NAME_MIN))).toBeNull();
    expect(nameProblem('x'.repeat(NAME_MAX))).toBeNull();
    expect(nameProblem('x'.repeat(NAME_MAX + 1))).toBe('too_long');
  });

  it('refuses leading and trailing punctuation, which is how names are faked', () => {
    expect(nameProblem('-Bun')).toBe('bad_chars');
    expect(nameProblem('Bun-')).toBe('bad_chars');
    expect(nameProblem('_Bun')).toBe('bad_chars');
  });

  it('refuses characters that do not render in the pixel face', () => {
    expect(nameProblem('Bun<script>')).toBe('bad_chars');
    expect(nameProblem('💀💀💀')).toBe('bad_chars');
  });

  it('treats a newline as the space it collapses to, not as a rejection', () => {
    // Normalising runs first, so a pasted line break cannot smuggle in a
    // second line — it just becomes an ordinary interior space.
    expect(normalizeName('Bun\nBun')).toBe('Bun Bun');
    expect(nameProblem('Bun\nBun')).toBeNull();
  });

  it('allows non-latin letters — the game is not English-only', () => {
    expect(nameProblem('Лапка')).toBeNull();
    expect(nameProblem('うさぎ')).toBeNull();
  });
});

describe('avatars', () => {
  it('only accepts rabbits the game actually ships', () => {
    for (const a of AVATARS) expect(isBuiltInAvatar(a.key)).toBe(true);
    expect(isBuiltInAvatar('../../etc/passwd')).toBe(false);
    expect(isBuiltInAvatar('')).toBe(false);
  });

  it('falls back rather than rendering a hole', () => {
    expect(avatarSrc(null)).toBe(AVATARS[0].src);
    expect(avatarSrc('nonsense')).toBe(AVATARS[0].src);
    expect(avatarSrc(DEFAULT_AVATAR)).toBe(AVATARS[0].src);
  });

  it('has a real file behind every choice', () => {
    for (const a of AVATARS) expect(a.src.startsWith('/assets/bunnies/')).toBe(true);
    expect(new Set(AVATARS.map((a) => a.key)).size).toBe(AVATARS.length);
  });
});

describe('raid classification', () => {
  const outcome = (loot: number, damage: number) => ({
    progress: 0.5,
    loot,
    damage,
    reachedField: false,
  });

  it('calls a raid by what it actually did', () => {
    expect(raidResult(outcome(12, 30))).toBe('looted');
    // Carrots taken outrank damage: the victim cares about the carrots.
    expect(raidResult(outcome(1, 0))).toBe('looted');
    expect(raidResult(outcome(0, 30))).toBe('damaged');
    // A shield, or a raider stopped on the doorstep.
    expect(raidResult(outcome(0, 0))).toBe('blocked');
  });
});


describe('restoring a stored session', () => {
  it('throws away a token the server refuses', () => {
    // The bug this exists to prevent: a refused token was KEPT, so the player
    // saw "Connect wallet" forever and signing in again wrote another dead
    // token behind the first one.
    for (const status of [401, 403, 404]) {
      expect(restoreDecision(status), String(status)).toBe('discard');
    }
  });

  it('keeps the token when the failure says nothing about it', () => {
    // A server error or a bad connection must not sign the player out.
    for (const status of [0, 429, 500, 502, 503]) {
      expect(restoreDecision(status), String(status)).toBe('keep');
    }
  });

  it('keeps a token the server accepted', () => {
    expect(restoreDecision(200)).toBe('keep');
  });
});
