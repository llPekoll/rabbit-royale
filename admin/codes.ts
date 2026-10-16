/**
 * Sign-in by mail: the address, then the six digits sent to it.
 *
 * A code lives ten minutes and survives five wrong tries; asking again
 * replaces it. Kept in memory: rr-admin is one process, and a restart only
 * means asking for a new code. Only the owner and the team get a mail — any
 * other address gets the same "sent" and nothing, so the page tells no one
 * who is in.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { sendMail } from './mail';

const TTL_MS = 10 * 60 * 1000;
const MAX_TRIES = 5;

const pending = new Map<string, { hash: Buffer; expires: number; tries: number }>();

const hash = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest();

export async function sendCode(email: string): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  pending.set(email, { hash: hash(email, code), expires: now + TTL_MS, tries: 0 });
  await sendMail({
    to: email,
    subject: `${code} is your Rabbit Royale back office code`,
    text: `Your sign-in code for the Rabbit Royale back office is ${code}.\n\nIt expires in 10 minutes. If you did not ask for it, ignore this email.`,
    html:
      `<p>Your sign-in code for the Rabbit Royale back office:</p>` +
      `<p style="font:600 28px/1.2 ui-monospace,monospace;letter-spacing:6px">${code}</p>` +
      `<p style="color:#6f655d">It expires in 10 minutes. If you did not ask for it, ignore this email.</p>`,
  });
}

/** True once, for the right code in time. */
export function checkCode(email: string, code: string): boolean {
  const p = pending.get(email);
  const given = String(code ?? '').replace(/\s/g, '');
  if (!p || !/^\d{6}$/.test(given)) return false;
  if (p.expires < Date.now() || p.tries >= MAX_TRIES) {
    pending.delete(email);
    return false;
  }
  p.tries++;
  if (!timingSafeEqual(p.hash, hash(email, given))) return false;
  pending.delete(email);
  return true;
}
