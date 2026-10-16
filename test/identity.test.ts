/** Local DB integration: Google / email sign-in, linking, the janitor, delete.
 * RR_AUTH_DB_TEST=1 bun run test -- test/identity.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const sent: { to: string; text: string }[] = [];
vi.mock('@/lib/mail', () => ({
  mailConfigured: () => true,
  sendMail: async (m: { to: string; text: string }) => { sent.push(m); },
}));

import { db } from '@/lib/db';
import { playerIdentities, players } from '@/lib/db/schema';
import { isGuestAccount, linkIdentity, signInWithIdentity } from '@/lib/auth/identity';
import { issueEmailCode, verifyEmailCode } from '@/lib/auth/email-code';
import { deleteAccount, isOrphanGuest, purgeOrphanGuests } from '@/lib/auth/abandon';

const enabled = process.env.RR_AUTH_DB_TEST === '1';
const tag = randomUUID().slice(0, 8);
const guestA = `guest:test:${tag}:a`;
const guestB = `guest:test:${tag}:b`;
const email = `rr-${tag}@example.com`;
const made: string[] = [guestA, guestB];

describe.skipIf(!enabled)('Google / email identities (local DB)', () => {
  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL!).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Auth integration tests require a local database');
    process.env.JWT_SIGNING_SECRET ||= 'test-secret';
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    await db.insert(players).values([
      { id: guestA, name: 'GuestA', lastSeenAt: old },
      { id: guestB, name: 'GuestB', lastSeenAt: old },
    ]);
  });
  afterAll(async () => {
    await db.delete(players).where(inArray(players.id, made));
  });

  it('mints one acct: burrow per Google account, and finds it again', async () => {
    const idn = { provider: 'google' as const, subject: `g-${tag}`, email };
    const first = await signInWithIdentity(idn);
    made.push(first.playerId);
    expect(first.created).toBe(true);
    expect(first.playerId.startsWith('acct:')).toBe(true);
    const again = await signInWithIdentity(idn);
    expect(again).toEqual({ playerId: first.playerId, created: false });
  });

  it('lands an email code on the Google burrow with the same address', async () => {
    const google = await db.query.playerIdentities.findFirst({ where: eq(playerIdentities.subject, `g-${tag}`) });
    const viaEmail = await signInWithIdentity({ provider: 'email', subject: email, email });
    expect(viaEmail.playerId).toBe(google!.playerId);
  });

  it('lets a guest save their burrow, and refuses a taken identity by name', async () => {
    const idn = { provider: 'google' as const, subject: `g2-${tag}`, email: `other-${tag}@example.com` };
    expect(await isGuestAccount({ id: guestA, wallet: null })).toBe(true);
    expect(await linkIdentity(guestA, idn)).toEqual({ ok: true });
    expect(await isGuestAccount({ id: guestA, wallet: null })).toBe(false);
    expect(await linkIdentity(guestB, idn)).toEqual({ ok: false, reason: 'identity_taken', takenBy: 'GuestA' });
    expect(await linkIdentity(guestA, { ...idn, subject: `g3-${tag}`, email: null })).toEqual({
      ok: false, reason: 'provider_linked',
    });
  });

  it('never purges a guest who linked an identity', async () => {
    expect(isOrphanGuest({ id: guestA, wallet: null, runsPlayed: 0, lastSeenAt: new Date(0), linked: true })).toBe(false);
    const doomed = (await purgeOrphanGuests(new Date(), { dryRun: true })).map((r) => r.id);
    expect(doomed).toContain(guestB);
    expect(doomed).not.toContain(guestA);
  });

  it('checks an email code: wrong, then right, then spent', async () => {
    const addr = `code-${tag}@example.com`;
    expect(await issueEmailCode(addr, 'login', null)).toEqual({ ok: true });
    expect(await issueEmailCode(addr, 'login', null)).toEqual({ ok: false, reason: 'too_soon' });
    const code = sent.find((m) => m.to === addr)!.text.match(/\d{6}/)![0];
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await verifyEmailCode(addr, wrong)).toEqual({ ok: false, reason: 'wrong_code' });
    expect(await verifyEmailCode(addr, code)).toEqual({ ok: true, mode: 'login', playerId: null });
    expect(await verifyEmailCode(addr, code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('stops after five tries', async () => {
    const addr = `tries-${tag}@example.com`;
    await issueEmailCode(addr, 'login', null);
    const code = sent.find((m) => m.to === addr)!.text.match(/\d{6}/)![0];
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect((await verifyEmailCode(addr, wrong)).ok).toBe(false);
    expect(await verifyEmailCode(addr, wrong)).toEqual({ ok: false, reason: 'too_many' });
    expect(await verifyEmailCode(addr, code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('deletes any account with its identities', async () => {
    expect(await deleteAccount(guestA)).toBe('deleted');
    expect(await db.query.playerIdentities.findFirst({ where: eq(playerIdentities.playerId, guestA) })).toBeUndefined();
    expect(await deleteAccount(guestA)).toBe('unknown_player');
  });
});
