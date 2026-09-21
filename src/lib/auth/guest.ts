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
import { grantStartingKit } from './starting-kit';

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

  const { RAID, OUT_OF_RUN_ENERGY, TRAPS } = await import('../../../config/tuning');
  await db.insert(players).values({
    id,
    // Null, not a placeholder string: the unique index on this column is what
    // stops two players owning one wallet, and a shared placeholder would make
    // the second guest a constraint violation.
    wallet: null,
    name,
    shieldedUntil: new Date(now.getTime() + RAID.ONBOARDING_SHIELD_MS),
    // A FULL bank, not the column's default. The default is a literal the
    // schema cannot derive from the tuning, and it dates from before runs cost
    // anything: at 30 it paid exactly one game, and a newcomer's first visit
    // ended after it. Every energy game hands over a full bar on day one.
    energy: OUT_OF_RUN_ENERGY.MAX,
    energyUpdatedAt: now,
    // A FULL trap allowance, for the same reason the bank above is full — and
    // the column's default is wrong here in the same way. `trapsClaimedAt` is
    // the instant the free allowance was last drawn down, and `freeTraps`
    // reads it as "how long has it been refilling"; `defaultNow()` therefore
    // means a brand new burrow has waited zero seconds and holds ZERO traps.
    // A new player then cannot bury anything for eight hours, which is the
    // one gesture the burrow screen exists to offer them.
    //
    // Backdating by a whole REFILL_MS hands over the full FREE_PER_DAY at
    // once. It cannot hand over more: `freeTraps` caps at FREE_PER_DAY however
    // far back this points, so this is "full", not "three".
    trapsClaimedAt: new Date(now.getTime() - TRAPS.REFILL_MS),
    createdAt: now,
    lastSeenAt: now,
  });
  // The bag, once the row it hangs off exists. Separate from the INSERT above
  // because these are `inventory` rows and that is a different table — see
  // `starting-kit.ts` for why both doors call one function.
  await grantStartingKit(id);

  return { id, name };
}
