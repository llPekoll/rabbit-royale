/**
 * Playing without a wallet.
 *
 * The wallet flow is the right identity for this game and the wrong FIRST
 * SCREEN for it: a new player arrives having never heard of the Seed Vault, and
 * asking them to approve a signature before they have dug a single tile is the
 * steepest possible price for something they cannot yet value. So there is a
 * second door — press play, get a burrow.
 *
 * A guest is a REAL player, not a sandbox: their row is the same row, so the
 * burrow, the energy clock, the leaderboard and the raids all work without a
 * single branch anywhere downstream. The differences are exactly two, and both
 * follow from having no wallet:
 *   - they cannot buy with USDC (there is nothing to pay from);
 *   - their account lives in one browser's localStorage, and a cleared browser
 *     loses it. The UI says so rather than pretending otherwise.
 *
 * Connecting a wallet later keeps everything — see link.ts. That is what makes
 * this an on-ramp rather than a demo.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { players } from '../db/schema';
import { randomRabbitName } from './names';

/** True for a player id minted by this module. */
export function isGuestId(id: string): boolean {
  return id.startsWith('guest:');
}

/**
 * Mint a brand new guest and their burrow.
 *
 * Born with the SAME onboarding shield a wallet player gets. That is the point
 * of the shield — a fresh burrow must not be farmed on day one — and a guest is
 * the most fragile new player there is, so the one account that would most
 * benefit from it is the last one to take it away from.
 */
export async function createGuestPlayer(now: Date = new Date()): Promise<{
  id: string;
  name: string;
}> {
  // The uuid is the whole identity: nothing about the device is collected, so
  // there is no fingerprint to leak and no way to correlate two guests.
  const id = `guest:${randomUUID()}`;
  const name = randomRabbitName(id);

  const { RAID } = await import('../../../config/tuning');
  await db.insert(players).values({
    id,
    // Null, not a placeholder string: the unique index on this column is what
    // stops two players owning one wallet, and a shared placeholder would make
    // the second guest a constraint violation.
    wallet: null,
    name,
    shieldedUntil: new Date(now.getTime() + RAID.ONBOARDING_SHIELD_MS),
    createdAt: now,
    lastSeenAt: now,
  });

  return { id, name };
}
