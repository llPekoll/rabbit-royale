/**
 * ed25519 verification for Solana wallet sign-in.
 *
 * Ported from the Domin8 hub (lib/nft/link.ts) — same proof, same SPKI wrapping
 * trick, so behaviour matches the wallet flows players already use. Every input
 * is attacker-controlled, so malformed data returns false rather than throwing.
 */
import { createPublicKey, verify as edVerify } from 'node:crypto';
import bs58 from 'bs58';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(v: unknown): v is string {
  return typeof v === 'string' && BASE58_RE.test(v);
}

export function verifySignature(address: string, message: string, signatureB58: string): boolean {
  try {
    if (!isSolanaAddress(address)) return false;
    const pub = bs58.decode(address);
    if (pub.length !== 32) return false;
    const sig = bs58.decode(signatureB58);
    if (sig.length !== 64) return false;
    // Node wants a DER/SPKI key object; wrap the raw 32-byte point in the fixed
    // ed25519 SPKI prefix rather than pulling in a crypto dependency.
    const spki = Buffer.concat([
      Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]),
      Buffer.from(pub),
    ]);
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    return edVerify(null, Buffer.from(message, 'utf8'), key, Buffer.from(sig));
  } catch {
    return false;
  }
}
