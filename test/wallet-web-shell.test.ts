/**
 * The browser wallet bridge (godot/web/shell.html rrWalletWeb) against
 * wallets as they really call signMessage. Backpack reads its 2nd argument as
 * the signing ACCOUNT, Phantom as the display: passing 'utf8' to Backpack
 * broke the web sign-in (2026-11-01).
 */
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { verifySignature } from '@/lib/auth/signature';
import { loginMessage } from '@/lib/auth/message';
import { expect, it } from 'vitest';

const html = readFileSync(process.env.SHELL_HTML ?? 'godot/web/shell.html', 'utf8');
const src = html.slice(html.indexOf('window.rrWalletWeb = (function'), html.indexOf('})();', html.indexOf('window.rrWalletWeb')) + 5);

function load(win: Record<string, unknown>) {
  new Function('window', src)(win);
  return win.rrWalletWeb as { sign(m: string, cb: (v: string, e: string) => void): void; address(cb: (v: string, e: string) => void): void };
}
const pair = generateKeyPairSync('ed25519');
const raw = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x as string, 'base64url');
const kp = { publicKey: new PublicKey(raw) };
const nacl = { sign: { detached: (m: Uint8Array) => new Uint8Array(edSign(null, Buffer.from(m), pair.privateKey)) } };
const message = loginMessage('0123456789abcdef0123456789abcdef');
const sign = (w: ReturnType<typeof load>) => new Promise<[string, string]>((r) => w.sign(message, (v, e) => r([v, e])));

// Backpack, as provider-solana.ts writes it: the 2nd argument is the SIGNING
// ACCOUNT, `.toBase58()` is called on it, and the answer is { signature }.
const backpack = {
  isBackpack: true,
  publicKey: kp.publicKey,
  async connect() { return { publicKey: kp.publicKey }; },
  async signMessage(msg: Uint8Array, publicKey?: PublicKey) {
    const who = (publicKey ?? kp.publicKey).toBase58();
    if (who !== kp.publicKey.toBase58()) throw new Error('unknown account');
    return { signature: nacl.sign.detached(msg) };
  },
};
// Phantom: the 2nd argument is the display, the answer { signature, publicKey }.
const phantom = {
  publicKey: kp.publicKey,
  async connect() { return { publicKey: kp.publicKey }; },
  async signMessage(msg: Uint8Array, display?: string) {
    if (display !== undefined && display !== 'utf8' && display !== 'hex') throw new Error('bad display');
    return { signature: nacl.sign.detached(msg), publicKey: kp.publicKey };
  },
};

it('Backpack signs for its own account and the server accepts it', async () => {
  const [sig, err] = await sign(load({ backpack }));
  expect(err).toBe('');
  expect(verifySignature(kp.publicKey.toBase58(), message, sig)).toBe(true);
});

it('Phantom still gets the utf8 display and verifies', async () => {
  const [sig, err] = await sign(load({ phantom: { solana: phantom } }));
  expect(err).toBe('');
  expect(verifySignature(kp.publicKey.toBase58(), message, sig)).toBe(true);
});
