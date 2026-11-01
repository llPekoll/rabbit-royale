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
import bs58 from 'bs58';
import { eq, or } from 'drizzle-orm';
import { db } from '../db';
import { loginNonces, players } from '../db/schema';
import { isSolanaAddress, verifySignature } from './signature';
import { loginMessage } from './message';
import { randomRabbitName } from './names';
import { grantStartingKit } from './starting-kit';

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
  if (!row?.nonce) return refused(address, 'no challenge');

  await db.delete(loginNonces).where(eq(loginNonces.address, address));

  if (now.getTime() - row.issuedAt.getTime() > LOGIN_NONCE_TTL_MS) return refused(address, 'challenge expired');
  const message = loginMessage(row.nonce);
  if (verifySignature(address, message, signatureB58)) return true;
  return refused(address, signatureShape(message, signatureB58));
}

/**
 * WHY A WALLET WAS TURNED AWAY, in the server log only (2026-11-01: a Backpack
 * player approved in the wallet, then read "sign-in failed" in the game). The
 * client keeps its one message; the log says which half broke, so the next
 * report can be read instead of guessed.
 */
function refused(address: string, why: string): false {
  console.warn(`[auth] wallet refused ${address.slice(0, 4)}…${address.slice(-4)}: ${why}`);
  return false;
}

/**
 * What the signature looked like. `tail of the message` is the tell of a
 * wallet whose signed payload puts the signature FIRST: the MWA client cuts
 * the 64 bytes after the message and hands back the message's own end.
 */
export function signatureShape(message: string, signatureB58: string): string {
  let sig: Uint8Array;
  try {
    sig = bs58.decode(signatureB58);
  } catch {
    return `signature not base58 (${signatureB58.length} chars)`;
  }
  if (sig.length !== 64) return `signature of ${sig.length} bytes`;
  const tail = Buffer.from(message, 'utf8').subarray(-64);
  if (tail.length === 64 && Buffer.from(sig).equals(tail)) return 'signature is the tail of the message';
  return 'signature does not match';
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
  // BY THE WALLET TOO, not only the id: a guest who linked this wallet keeps
  // their `guest:` id (link/route.ts). Looking up `sol:` alone missed them, the
  // insert below hit the unique wallet index and did nothing, and the caller
  // read a player that did not exist — a 500 the browser reported as offline.
  const existing = await db.query.players.findFirst({
    where: or(eq(players.id, id), eq(players.wallet, address)),
  });
  if (existing) {
    await db.update(players).set({ lastSeenAt: now }).where(eq(players.id, existing.id));
    return existing.id;
  }

  const { RAID, OUT_OF_RUN_ENERGY, TRAPS } = await import('../tuning/tables');
  await db
    .insert(players)
    .values({
      id,
      wallet: address,
      name: randomRabbitName(address),
      shieldedUntil: new Date(now.getTime() + RAID.ONBOARDING_SHIELD_MS),
      // A FULL bank, not the column's default. The default is a literal the
      // schema cannot derive from the tuning, and it dates from before runs cost
      // anything: at 30 it paid exactly one game, and a newcomer's first visit
      // ended after it. Every energy game hands over a full bar on day one.
      energy: OUT_OF_RUN_ENERGY.MAX,
      energyUpdatedAt: now,
      // A FULL trap allowance, for the same reason the bank above is full.
      // `trapsClaimedAt` is when the free allowance was last drawn down, and
      // `freeTraps` reads it as "how long has it been refilling" — so the
      // column's `defaultNow()` means a brand new burrow has waited zero
      // seconds and holds ZERO traps, unable to bury anything for eight hours.
      // Backdating a whole REFILL_MS hands over FREE_PER_DAY at once, and no
      // more: `freeTraps` caps there however far back this points.
      trapsClaimedAt: new Date(now.getTime() - TRAPS.REFILL_MS),
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoNothing();
  // The bag, once the row it hangs off exists — `inventory` is a different
  // table, so it cannot ride in the INSERT above. Idempotent, like the insert:
  // two sign-ins racing on a first login grant one starting kit.
  await grantStartingKit(id);
  return id;
}
