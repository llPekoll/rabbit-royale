/**
 * Google and email: the doors for players who do not hold a Solana wallet.
 *
 * Same rule as the wallet (link.ts): the identity is a CLAIM on a player row,
 * not the row's id. A guest who adds Google keeps `guest:<uuid>` and every
 * carrot on it; a player who arrives by Google first is minted as `acct:<uuid>`
 * — opaque, because nothing downstream reads the prefix, and an email in an id
 * would end up wherever ids go (raid lists, logs).
 *
 * Google and email meet on the address. Both are verified (Google's
 * `email_verified`, our own code), so a player who made their burrow with an
 * email code and later presses "Continue with Google" on the same address
 * lands on that burrow instead of a fresh one. That is the only merge: a
 * wallet is never matched to anything by address.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db';
import { playerIdentities, players } from '../db/schema';
import { mintPlayer } from './guest';
import { signSession } from './jwt';

export type Provider = 'google' | 'email';

export interface ProvenIdentity {
  provider: Provider;
  /** Google's `sub`, or the lower-cased address for 'email'. */
  subject: string;
  /** Verified address, lower-cased. */
  email: string | null;
}

export type LinkIdentityResult =
  | { ok: true }
  /** This identity already opens another burrow — named, like `wallet_taken`. */
  | { ok: false; reason: 'identity_taken'; takenBy: string }
  /** The player already has one of this provider; a second would be a quiet
   *  transfer of the account to whoever holds it. */
  | { ok: false; reason: 'provider_linked' }
  | { ok: false; reason: 'unknown_player' };

/** The player an identity opens, or null. */
async function ownerOf(idn: ProvenIdentity): Promise<string | null> {
  const row = await db.query.playerIdentities.findFirst({
    where: and(eq(playerIdentities.provider, idn.provider), eq(playerIdentities.subject, idn.subject)),
  });
  if (row) return row.playerId;
  if (!idn.email) return null;
  // The other verified door on the same address (see the header).
  const sibling = await db.query.playerIdentities.findFirst({
    where: and(eq(playerIdentities.email, idn.email), ne(playerIdentities.provider, idn.provider)),
  });
  return sibling?.playerId ?? null;
}

async function attach(playerId: string, idn: ProvenIdentity, now: Date): Promise<boolean> {
  const rows = await db
    .insert(playerIdentities)
    .values({ provider: idn.provider, subject: idn.subject, playerId, email: idn.email, createdAt: now })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
}

/**
 * The player this identity opens, minting one on first sight.
 *
 * The new burrow is the same one the guest door hands out (`mintPlayer`):
 * shield, full energy, full traps, starting kit.
 */
export async function signInWithIdentity(
  idn: ProvenIdentity,
  now: Date = new Date(),
): Promise<{ playerId: string; created: boolean }> {
  const existing = await ownerOf(idn);
  if (existing) {
    // A sibling match (email ↔ Google) gains the new door too; a no-op for
    // the identity that matched itself.
    await attach(existing, idn, now);
    await db.update(players).set({ lastSeenAt: now }).where(eq(players.id, existing));
    return { playerId: existing, created: false };
  }

  const { id } = await mintPlayer(`acct:${randomUUID()}`, now);
  if (await attach(id, idn, now)) return { playerId: id, created: true };

  // Lost a race: the same Google account signed in twice at once, and the
  // other request's burrow holds the identity. Ours is an empty duplicate.
  await db.delete(players).where(eq(players.id, id));
  const winner = await ownerOf(idn);
  if (!winner) throw new Error('identity vanished during sign-in');
  return { playerId: winner, created: false };
}

/** Attach a proven identity to a signed-in player (a guest saving their burrow). */
export async function linkIdentity(
  playerId: string,
  idn: ProvenIdentity,
  now: Date = new Date(),
): Promise<LinkIdentityResult> {
  const me = await db.query.players.findFirst({ where: eq(players.id, playerId), columns: { id: true } });
  if (!me) return { ok: false, reason: 'unknown_player' };

  const owner = await ownerOf(idn);
  if (owner === playerId) {
    await attach(playerId, idn, now);
    return { ok: true };
  }
  if (owner) {
    const other = await db.query.players.findFirst({ where: eq(players.id, owner), columns: { name: true } });
    return { ok: false, reason: 'identity_taken', takenBy: other?.name ?? '' };
  }

  const mine = await db.query.playerIdentities.findFirst({
    where: and(eq(playerIdentities.playerId, playerId), eq(playerIdentities.provider, idn.provider)),
  });
  if (mine) return { ok: false, reason: 'provider_linked' };

  if (!(await attach(playerId, idn, now))) {
    // The unique index caught a concurrent claim between the read and here.
    return { ok: false, reason: 'identity_taken', takenBy: '' };
  }
  return { ok: true };
}

/**
 * Postgres' "undefined_table". The table arrives with migration 0032, and in
 * Europe migrations are run by hand after the deploy: until then `/me` and
 * ABANDON must keep working as they did — nobody has an identity yet, so
 * "none" is the true answer. Only the new sign-in routes wait for it.
 */
function tableMissing(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '42P01' || err?.cause?.code === '42P01';
}

/** The doors a player can come back through, for the profile. */
export async function identitiesOf(playerId: string): Promise<{ provider: Provider; email: string | null }[]> {
  try {
    const rows = await db.query.playerIdentities.findMany({ where: eq(playerIdentities.playerId, playerId) });
    return rows.map((r) => ({ provider: r.provider as Provider, email: r.email }));
  } catch (e) {
    if (tableMissing(e)) return [];
    throw e;
  }
}

/**
 * A guest is a player NOTHING can reopen once the token is gone: no wallet and
 * no identity. Everything that treats guests specially (the ABANDON button,
 * the janitor) must ask this, not look at the wallet alone.
 */
export async function isGuestAccount(player: { id: string; wallet: string | null }): Promise<boolean> {
  if (player.wallet) return false;
  return (await identitiesOf(player.id)).length === 0;
}

/** What every sign-in door answers: the token and the player summary. */
export async function sessionFor(playerId: string): Promise<{
  token: string;
  player: {
    id: string; name: string; wallet: string | null; guest: boolean; runsPlayed: number;
    identities: { provider: Provider; email: string | null }[];
  };
}> {
  const p = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  if (!p) throw new Error(`no player ${playerId}`);
  const token = await signSession({ sub: p.id, wallet: p.wallet, name: p.name });
  return {
    token,
    player: {
      id: p.id, name: p.name, wallet: p.wallet, guest: await isGuestAccount(p), runsPlayed: p.runsPlayed,
      // The profile lists them ("Google · a@b.com"), right after sign-in too.
      identities: await identitiesOf(p.id),
    },
  };
}
