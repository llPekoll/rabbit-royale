/**
 * Playing without a wallet.
 *
 * The guest door exists because the wallet is the right identity for this game
 * and the wrong FIRST screen for it. What that costs is a second kind of
 * session, and the things worth pinning here are the seams where the two kinds
 * meet — every one of which fails silently rather than loudly:
 *
 *   - a session whose wallet claim is ABSENT must survive a round trip as
 *     `null`, not as `"undefined"` or `""`. The paid routes branch on it, so a
 *     truthy nothing opens a rail there is no wallet behind;
 *   - a guest must not be able to quote a USDC purchase;
 *   - linking must never be the thing that silently moves an account between
 *     owners, and must never renumber a player id that eight tables point at.
 *
 * Database-free on purpose: everything here is either pure or a refusal that
 * lands before the first query, which is what lets it run in CI without a
 * Postgres.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { signSession, verifySession } from '../src/lib/auth/jwt';
import { isGuestId } from '../src/lib/auth/guest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

beforeEach(() => {
  process.env.JWT_SIGNING_SECRET = '0'.repeat(64);
});

describe('guest ids', () => {
  it('tells a guest from a wallet player', () => {
    expect(isGuestId('guest:8f0c1a2e-0000-4000-8000-000000000000')).toBe(true);
    expect(isGuestId('sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toBe(false);
  });
});

describe('a guest session', () => {
  it('round-trips a null wallet as null', async () => {
    // The whole point. `String(payload.wallet ?? '')` used to live here, which
    // turns "no wallet" into a non-null empty string — and `if (!session.wallet)`
    // happens to still catch that, while `session.wallet.slice(0, 4)` does not.
    const token = await signSession({ sub: 'guest:abc', wallet: null, name: 'LuckyClover7' });
    const claims = await verifySession(token);
    expect(claims).not.toBeNull();
    expect(claims!.wallet).toBeNull();
    expect(claims!.sub).toBe('guest:abc');
    expect(claims!.name).toBe('LuckyClover7');
  });

  it('omits the claim rather than writing a null into the token', async () => {
    // The Android wrapper and the WS server read this payload too, and an
    // absent claim is unambiguous in every language that will ever parse it.
    const token = await signSession({ sub: 'guest:abc', wallet: null, name: 'X' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect('wallet' in payload).toBe(false);
  });

  it('still carries a wallet for a wallet player', async () => {
    const addr = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
    const token = await signSession({ sub: `sol:${addr}`, wallet: addr, name: 'X' });
    expect((await verifySession(token))!.wallet).toBe(addr);
  });

  it('is signed with the same secret as any other, so a forgery still fails', async () => {
    const token = await signSession({ sub: 'guest:abc', wallet: null, name: 'X' });
    process.env.JWT_SIGNING_SECRET = '1'.repeat(64);
    expect(await verifySession(token)).toBeNull();
  });
});

describe('what a guest cannot do', () => {
  it('is refused a USDC quote, before any payment row is written', async () => {
    vi.resetModules();
    process.env.JWT_SIGNING_SECRET = '0'.repeat(64);
    // Enough for `payEnabled()` to be true — the refusal under test must come
    // from the missing wallet, not from the rail being switched off.
    process.env.USDC_TREASURY_ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
    process.env.USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    process.env.SOLANA_RPC_URL = 'https://solana-devnet.example/v2/key';

    const token = await signSession({ sub: 'guest:abc', wallet: null, name: 'X' });
    const { POST } = await import('../src/app/api/shop/pay/route');
    const res = await POST(new Request('http://smoke.test/api/shop/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: 'shield', qty: 1 }),
    }));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('wallet_required');
  });
});

/**
 * Decisions made in the source rather than at runtime.
 *
 * Pinned the way `wallet-session.test.ts` pins the session shape: these are
 * one-line changes that look harmless in a diff and break the feature quietly.
 */
describe('the shape of the feature', () => {
  const LINK = read('../src/lib/auth/link.ts');
  const GUEST = read('../src/lib/auth/guest.ts');
  const PAGE = read('../src/app/page.tsx');

  it('keeps the player id when a wallet is linked', () => {
    // Renaming `guest:<uuid>` to `sol:<address>` would need an ON UPDATE
    // CASCADE this schema does not have, across eight foreign keys, plus a
    // rewrite of the Redis leaderboard set. The link only ever SETS the wallet.
    expect(LINK).toMatch(/\.set\(\{\s*wallet: address/);
    expect(LINK).not.toMatch(/\.set\(\{[^}]*\bid:/);
  });

  it('refuses a wallet that already owns a burrow instead of merging', () => {
    // Merging two burrows has real losers (whose carrots? whose raid log?) and
    // a login is the worst possible place to decide it silently.
    expect(LINK).toMatch(/wallet_taken/);
  });

  it('refuses to relink a player who already has a wallet', () => {
    expect(LINK).toMatch(/already_linked/);
  });

  it('gives a guest the onboarding shield a wallet player gets', () => {
    // A guest is the most fragile new player there is, so they are the last
    // account to take the anti-farming shield away from.
    expect(GUEST).toMatch(/ONBOARDING_SHIELD_MS/);
  });

  it('stores a null wallet rather than a placeholder', () => {
    // The unique index on `players.wallet` makes any shared placeholder string
    // a constraint violation for the SECOND guest to sign up.
    expect(GUEST).toMatch(/wallet: null/);
  });

  it('offers PLAY on the doorstep, not only a wallet', () => {
    expect(PAGE).toMatch(/playAsGuest/);
  });

  it('hides the paid rail from a guest', () => {
    expect(PAGE).toMatch(/onPayUsdc=\{payments && !player\.guest/);
  });
});

/**
 * Pressing "Connect wallet" as a guest did nothing visible.
 *
 * `linkWallet` reports every refusal — no wallet installed, prompt dismissed,
 * wallet already owns a burrow — into the SESSION's `error`, which the profile
 * panel never read: its own `error` state belongs to the rename field. So a
 * failed link left the panel byte-for-byte identical, and a successful one left
 * it open on copy that no longer applied. Both read to the player as "the
 * button is broken", which is exactly how it was reported.
 */
describe('a guest connecting their wallet is answered', () => {
  const PANEL = read('../src/components/profile-menu.tsx');
  const BUTTON = read('../src/components/wallet-button.tsx');

  it('shows the refusal inside the panel that caused it', () => {
    expect(PANEL).toMatch(/connectError/);
    // Rendered, not merely accepted as a prop.
    expect(PANEL).toMatch(/\{connectError && /);
  });

  it('feeds the panel the session error rather than swallowing it', () => {
    expect(BUTTON).toMatch(/connectError=\{player\.guest \? error/);
  });

  it('closes the panel once the wallet is actually attached', () => {
    // The chip behind has just dropped its GUEST tag; staying open on the old
    // copy is what made a SUCCESSFUL link look like nothing happened.
    expect(BUTTON).toMatch(/if \(linked\) setOpen\(false\)/);
  });
});
