/**
 * The login message is PINNED. Changing it silently invalidates every challenge
 * in flight and every wrapper build that hardcodes it — this test is the thing
 * that makes that a deliberate decision rather than an accident.
 */
import { describe, expect, it } from 'vitest';
import { loginMessage } from '../src/lib/auth/message';
import { isSolanaAddress, verifySignature } from '../src/lib/auth/signature';
import { randomRabbitName } from '../src/lib/auth/names';

describe('loginMessage', () => {
  it('is exactly the pinned string', () => {
    expect(loginMessage('deadbeef')).toBe('Sign in to Rabbit Royale\n\nnonce: deadbeef');
  });
});

describe('isSolanaAddress', () => {
  it('accepts a real address', () => {
    expect(isSolanaAddress('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toBe(true);
  });

  it('rejects junk, empty values and non-strings', () => {
    for (const bad of ['', 'not-an-address!', '0x1234', null, undefined, 42, {}]) {
      expect(isSolanaAddress(bad)).toBe(false);
    }
  });
});

describe('verifySignature', () => {
  it('returns false rather than throwing on malformed input', () => {
    expect(verifySignature('bad', 'msg', 'sig')).toBe(false);
    expect(verifySignature('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'msg', 'notbase58!')).toBe(false);
  });
});

describe('randomRabbitName', () => {
  it('is stable for an address', () => {
    const addr = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
    expect(randomRabbitName(addr)).toBe(randomRabbitName(addr));
  });

  it('differs between addresses', () => {
    expect(randomRabbitName('aaa')).not.toBe(randomRabbitName('bbb'));
  });

  /**
   * Stability and distinctness were both satisfied by "undefinedTail0", which
   * is how roughly half of all wallets went out under that name in the first
   * place. Names are what a player is called above their own rabbit and on the
   * leaderboard, so the shape of the name is what has to be asserted.
   */
  it('is an adjective, a noun and a number for every address', () => {
    for (let i = 0; i < 2000; i++) {
      const name = randomRabbitName(`sol:address${i}`);
      expect(name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
    }
  });

  it('names the wallet whose hash went negative', () => {
    // A real address from a playtest: its FNV hash is negative, so the old
    // `h % ADJECTIVES.length` indexed off the front of the array.
    const name = randomRabbitName('CbbPo8VdSpJmsnTJ7r1ipCpJoTtH8VsQxZVyPp4C2rJt');
    expect(name).not.toContain('undefined');
    expect(name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
  });
});
