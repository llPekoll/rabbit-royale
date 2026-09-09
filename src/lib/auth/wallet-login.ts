/**
 * Sign-in with a Solana wallet. This is the ONLY way in — there is no email and
 * no password.
 *
 * The target device is the Solana Seeker, where the wallet is the Seed Vault
 * and signing is a system-level gesture. On desktop the same flow runs through
 * a browser wallet, so one code path serves both.
 *
 * Flow: client asks for a challenge for its address → wallet signs the pinned
 * message → server verifies and issues a session JWT. The nonce is single-use
 * and consumed whether or not the signature checks out, so a captured challenge
 * cannot be replayed.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { loginNonces, players } from '../db/schema';
import { isSolanaAddress, verifySignature } from './signature';
import { loginMessage } from './message';
import { randomRabbitName } from './names';

export { loginMessage };

/** Challenge lifetime. Short: the wallet prompt appears immediately. */
export const LOGIN_NONCE_TTL_MS = 5 * 60 * 1000;

/**
 * Mint a challenge for `address`. Upsert by address, so re-requesting rotates
 * the nonce and kills the old one — the intended way to abandon a half-finished
 * attempt (a user who closed the wallet sheet).
 */
export async function issueLoginChallenge(
  address: string,
  now: Date = new Date(),
): Promise<{ nonce: string; message: string } | null> {
  if (!isSolanaAddress(address)) return null;
  const nonce = randomBytes(16).toString('hex');
  await db
    .insert(loginNonces)
    .values({ address, nonce, issuedAt: now })
    .onConflictDoUpdate({ target: loginNonces.address, set: { nonce, issuedAt: now } });
  return { nonce, message: loginMessage(nonce) };
}

/**
 * Verify a signed challenge. The nonce is consumed up front — one shot, valid
 * or not — so a leaked challenge is worthless by the time anyone replays it.
 */
export async function verifyLoginChallenge(
  address: string,
  signatureB58: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isSolanaAddress(address)) return false;

  const row = await db.query.loginNonces.findFirst({
    where: eq(loginNonces.address, address),
  });
  if (!row?.nonce) return false;

  await db.delete(loginNonces).where(eq(loginNonces.address, address));

  if (now.getTime() - row.issuedAt.getTime() > LOGIN_NONCE_TTL_MS) return false;
  return verifySignature(address, loginMessage(row.nonce), signatureB58);
}

/**
 * The player this wallet is, creating them on first sight.
 *
 * New players are born with the onboarding shield (tuning.RAID) so a fresh
 * burrow is not farmed on day one — that is the single biggest churn risk in a
 * raid game, and it costs one column to avoid.
 */
export async function resolveWalletPlayer(
  address: string,
  now: Date = new Date(),
): Promise<string> {
  const id = `sol:${address}`;
  const existing = await db.query.players.findFirst({ where: eq(players.id, id) });
  if (existing) {
    await db.update(players).set({ lastSeenAt: now }).where(eq(players.id, id));
    return id;
  }

  const { RAID } = await import('../../../config/tuning');
  await db
    .insert(players)
    .values({
      id,
      wallet: address,
      name: randomRabbitName(address),
      shieldedUntil: new Date(now.getTime() + RAID.ONBOARDING_SHIELD_MS),
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoNothing();
  return id;
}
