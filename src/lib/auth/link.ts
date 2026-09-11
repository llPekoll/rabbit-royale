/**
 * A guest connecting their first wallet.
 *
 * This is the whole point of the guest door: the burrow a player built in their
 * first hour has to be the burrow they sign in to. Losing it at the moment they
 * finally commit would punish exactly the players who did what the game asked.
 *
 * THE ID DOES NOT CHANGE. A linked guest keeps `guest:<uuid>` for ever, and
 * gains a `wallet`. That is deliberate and worth defending:
 *
 *   - `players.id` is a foreign key in eight tables (runs, raids, raid_runs,
 *     traps, inventory, purchases, payments, season_standings) and a member of
 *     a Redis sorted set. Renaming it means an ON UPDATE CASCADE this schema
 *     does not have, plus a matching rewrite of the leaderboard set, and a
 *     partial failure would strand a player's history under an id nothing
 *     points at any more.
 *   - Nothing downstream reads the PREFIX. Every route resolves a player by
 *     `session.sub`, and identity-as-wallet is enforced by the unique index on
 *     `players.wallet`, not by the shape of the id.
 *
 * So the id is an opaque primary key, as it should have been all along, and the
 * wallet is the claim. `sol:<address>` remains what a wallet-first player gets,
 * because for them it is free.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { players } from '../db/schema';
import { isSolanaAddress } from './signature';
import { verifyLoginChallenge } from './wallet-login';

export type LinkResult =
  | { ok: true; playerId: string; wallet: string; name: string }
  /** The signature did not check out, or the nonce was stale or spent. */
  | { ok: false; reason: 'invalid_signature' }
  /** This player already has a wallet. Linking a second one would silently
   *  move an account between owners, so it is refused rather than overwritten. */
  | { ok: false; reason: 'already_linked' }
  /**
   * The wallet is already somebody's.
   *
   * The honest outcome, and the one that must NOT be papered over: merging two
   * burrows is a design decision with real losers (whose carrot count wins?
   * whose raid log?), and doing it implicitly during a login is the worst
   * possible place to decide it. The client is told to sign in to that account
   * instead, and the guest row is left untouched.
   */
  | { ok: false; reason: 'wallet_taken'; playerId: string }
  | { ok: false; reason: 'unknown_player' };

/**
 * Prove `address`, then attach it to `playerId`.
 *
 * Takes the same signed challenge as a plain sign-in — this is a login that
 * lands on an existing row rather than a new kind of credential, so it is
 * exactly as hard to forge as the front door.
 */
export async function linkWalletToPlayer(
  playerId: string,
  address: string,
  signatureB58: string,
  now: Date = new Date(),
): Promise<LinkResult> {
  if (!isSolanaAddress(address)) return { ok: false, reason: 'invalid_signature' };

  const me = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  if (!me) return { ok: false, reason: 'unknown_player' };
  if (me.wallet) return { ok: false, reason: 'already_linked' };

  // Checked BEFORE the signature is consumed, so a player who picked the wrong
  // wallet is not also charged a spent nonce for the mistake.
  const taken = await db.query.players.findFirst({ where: eq(players.wallet, address) });
  if (taken) return { ok: false, reason: 'wallet_taken', playerId: taken.id };

  if (!(await verifyLoginChallenge(address, signatureB58, now))) {
    return { ok: false, reason: 'invalid_signature' };
  }

  // The unique index is the real guard: two guests racing the same wallet both
  // pass the read above, and exactly one of them survives this write. The loser
  // is told the wallet is taken, which is true by the time they are told it.
  try {
    const [updated] = await db
      .update(players)
      .set({ wallet: address, lastSeenAt: now })
      .where(eq(players.id, playerId))
      .returning();
    if (!updated) return { ok: false, reason: 'unknown_player' };
    return { ok: true, playerId: updated.id, wallet: address, name: updated.name };
  } catch {
    return { ok: false, reason: 'wallet_taken', playerId: '' };
  }
}
