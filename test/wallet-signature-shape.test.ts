/**
 * The server log's account of a refused wallet signature (wallet-login.ts
 * `signatureShape`): which half of the Backpack sign-in broke.
 */
import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import { signatureShape } from '@/lib/auth/wallet-login';
import { loginMessage } from '@/lib/auth/message';

const message = loginMessage('0123456789abcdef0123456789abcdef');

describe('signatureShape', () => {
  it('spots the tail of the message handed back as a signature', () => {
    const tail = Buffer.from(message, 'utf8').subarray(-64);
    expect(signatureShape(message, bs58.encode(tail))).toBe('signature is the tail of the message');
  });

  it('names a wrong length and a wrong alphabet', () => {
    expect(signatureShape(message, bs58.encode(new Uint8Array(32).fill(7)))).toBe('signature of 32 bytes');
    expect(signatureShape(message, '0OIl')).toMatch(/not base58/);
  });

  it('says a well-formed signature simply does not match', () => {
    expect(signatureShape(message, bs58.encode(new Uint8Array(64).fill(9)))).toBe('signature does not match');
  });
});
