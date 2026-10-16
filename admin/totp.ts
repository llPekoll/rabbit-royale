/**
 * The back office's one-time codes: TOTP (RFC 6238), the six digits an
 * authenticator app shows every thirty seconds.
 *
 * An app rather than a mailed code: the back office must open on the day the
 * mail is down. The owner's secret lives in the environment
 * (`ADMIN_TOTP_SECRET`, base32, `bun tools/admin-totp.ts`); each member of
 * the team has one of their own (admin/team.ts).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const STEP_S = 30;
const DIGITS = 6;
/** One step either side: a phone clock a little off still gets in. */
const DRIFT = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('ADMIN_TOTP_SECRET is not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function totpAt(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const n = (h.readUInt32BE(off) & 0x7fffffff) % 10 ** DIGITS;
  return String(n).padStart(DIGITS, '0');
}

/** The secret, or null when the back office is switched off. */
export function adminSecret(): string | null {
  const s = process.env.ADMIN_TOTP_SECRET?.trim();
  return s ? s : null;
}

/** Steps already spent, per secret: a code read over a shoulder is dead. */
const spent = new Map<string, number>();

/** The step the code matched, or null. A step opens once. */
export function checkTotp(secret: string, code: string, now = Date.now()): number | null {
  const given = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const key = base32Decode(secret);
  const step = Math.floor(now / 1000 / STEP_S);
  for (let d = -DRIFT; d <= DRIFT; d++) {
    const want = totpAt(key, step + d);
    if (timingSafeEqual(Buffer.from(want), Buffer.from(given)) && (spent.get(secret) ?? -1) < step + d) {
      spent.set(secret, step + d);
      return step + d;
    }
  }
  return null;
}
