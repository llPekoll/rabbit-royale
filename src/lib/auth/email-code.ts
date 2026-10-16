/**
 * Sign-in by a six-digit code sent to an address.
 *
 * A code, not a link: on a phone the mail opens in another app, and a link
 * would land in the browser rather than the game. Six digits are read in the
 * mail and typed in the game.
 *
 * Kept guessable-proof by what surrounds the code rather than its length:
 * ten minutes to live, five tries, then it is gone and a new one must be
 * asked for — which is itself limited to one a minute per address.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { emailCodes } from '../db/schema';
import { sendMail } from '../mail';

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_RESEND_MS = 60 * 1000;
export const EMAIL_CODE_MAX_TRIES = 5;

/** Lower-cased and trimmed, or null when it is not an address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/** Keyed by the session secret: a dumped table does not give the codes away. */
function hashCode(email: string, code: string): string {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret) throw new Error('JWT_SIGNING_SECRET must be set');
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

export type IssueResult = { ok: true } | { ok: false; reason: 'too_soon' | 'mail_failed' };

export async function issueEmailCode(
  email: string,
  mode: 'login' | 'link',
  playerId: string | null,
  now: Date = new Date(),
): Promise<IssueResult> {
  const prev = await db.query.emailCodes.findFirst({ where: eq(emailCodes.email, email) });
  if (prev && now.getTime() - prev.issuedAt.getTime() < EMAIL_CODE_RESEND_MS) {
    return { ok: false, reason: 'too_soon' };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = { codeHash: hashCode(email, code), mode, playerId, attempts: 0, issuedAt: now };
  await db.insert(emailCodes).values({ email, ...row }).onConflictDoUpdate({ target: emailCodes.email, set: row });

  try {
    await sendMail({
      to: email,
      subject: `${code} is your Rabbit Royale code`,
      text: `Your Rabbit Royale code: ${code}\n\nType it in the game. It expires in 10 minutes.\nIf you did not ask for it, ignore this mail.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;text-align:center">
<p style="font-size:16px;color:#333">Your Rabbit Royale code</p>
<p style="font-size:40px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#111">${code}</p>
<p style="font-size:14px;color:#666">Type it in the game. It expires in 10 minutes.<br>If you did not ask for it, ignore this mail.</p>
</div>`,
    });
  } catch (e) {
    console.error('[email-code] envoi rate :', e);
    // Free the address at once: the player will retry, and the one-a-minute
    // limit is there for mail that left, not mail that did not.
    await db.delete(emailCodes).where(eq(emailCodes.email, email));
    return { ok: false, reason: 'mail_failed' };
  }
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; mode: 'login' | 'link'; playerId: string | null }
  | { ok: false; reason: 'wrong_code' | 'expired' | 'too_many' };

export async function verifyEmailCode(
  email: string,
  code: string,
  now: Date = new Date(),
): Promise<VerifyResult> {
  const row = await db.query.emailCodes.findFirst({ where: eq(emailCodes.email, email) });
  if (!row || now.getTime() - row.issuedAt.getTime() > EMAIL_CODE_TTL_MS) {
    if (row) await db.delete(emailCodes).where(eq(emailCodes.email, email));
    return { ok: false, reason: 'expired' };
  }
  // Counted BEFORE the comparison, atomically: parallel guesses each spend a
  // try, so five is five however fast they arrive.
  const [spent] = await db
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(eq(emailCodes.email, email))
    .returning({ attempts: emailCodes.attempts });
  if (!spent || spent.attempts > EMAIL_CODE_MAX_TRIES) {
    await db.delete(emailCodes).where(eq(emailCodes.email, email));
    return { ok: false, reason: 'too_many' };
  }

  const given = Buffer.from(hashCode(email, String(code).trim()), 'hex');
  const want = Buffer.from(row.codeHash, 'hex');
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    if (spent.attempts < EMAIL_CODE_MAX_TRIES) return { ok: false, reason: 'wrong_code' };
    // The last try: the code is burnt now, not on the next guess.
    await db.delete(emailCodes).where(eq(emailCodes.email, email));
    return { ok: false, reason: 'too_many' };
  }

  await db.delete(emailCodes).where(eq(emailCodes.email, email));
  return { ok: true, mode: row.mode as 'login' | 'link', playerId: row.playerId };
}
