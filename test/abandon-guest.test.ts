/**
 * A guest walking away, and the ghosts they used to leave.
 *
 * Abandoning a guest burrow used to be a plain sign-out: the cookie went, the
 * row stayed, and a burrow nobody could open kept its rank and its place in
 * the raid targets. What is pinned here is the RULE for which rows are gone
 * for good (pure, so it runs without Postgres) and the seams that make the
 * button actually delete: the panel's second press, the hook's request, and
 * the route's refusal for a wallet player.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isOrphanGuest, NEVER_PLAYED_TTL_MS, SESSION_TTL_MS } from '../src/lib/auth/abandon';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const MENU = read('../src/components/profile-menu.tsx');
const LOGIN = read('../src/components/use-wallet-login.tsx');
const ROUTE = read('../src/app/api/auth/abandon/route.ts');
const SERVER = read('../server/index.ts');

const NOW = new Date('2026-09-17T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const guest = (over: Partial<Parameters<typeof isOrphanGuest>[0]> = {}) => ({
  id: 'guest:8f0c1a2e-0000-4000-8000-000000000000',
  wallet: null,
  runsPlayed: 3,
  lastSeenAt: ago(60_000),
  ...over,
});

describe('isOrphanGuest', () => {
  it('keeps a guest seen within a session\'s life', () => {
    expect(isOrphanGuest(guest({ lastSeenAt: ago(SESSION_TTL_MS - 1) }), NOW)).toBe(false);
  });

  it('writes off a guest unseen for longer than a session can live', () => {
    expect(isOrphanGuest(guest({ lastSeenAt: ago(SESSION_TTL_MS) }), NOW)).toBe(true);
  });

  it('writes off a guest who never banked a run after a day', () => {
    expect(isOrphanGuest(guest({ runsPlayed: 0, lastSeenAt: ago(NEVER_PLAYED_TTL_MS) }), NOW)).toBe(true);
    expect(isOrphanGuest(guest({ runsPlayed: 0, lastSeenAt: ago(NEVER_PLAYED_TTL_MS - 1) }), NOW)).toBe(false);
  });

  it('never touches a wallet — linked guests included', () => {
    // A linked guest keeps `guest:` as their id (link.ts) but has a wallet on
    // the row: that account is reachable for ever.
    expect(isOrphanGuest(guest({ wallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', lastSeenAt: ago(SESSION_TTL_MS * 2) }), NOW)).toBe(false);
    expect(isOrphanGuest(guest({ id: 'sol:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', wallet: null, lastSeenAt: ago(SESSION_TTL_MS * 2) }), NOW)).toBe(false);
  });
});

describe('the ABANDON button', () => {
  it('deletes on the second press, and only for a guest', () => {
    expect(MENU).toMatch(/if \(!player\.guest\) return onLogout\(\);\s*if \(confirmingAbandon\) return onAbandon\(\);/);
  });

  it('asks the server to delete BEFORE forgetting the token it needs', () => {
    const abandon = LOGIN.slice(LOGIN.indexOf('const abandon = useCallback'));
    const request = abandon.indexOf("fetch('/api/auth/abandon'");
    const forget = abandon.indexOf('forget();');
    expect(request).toBeGreaterThan(-1);
    expect(forget).toBeGreaterThan(request);
  });

  it('is refused for a wallet player and clears the cookie for a guest', () => {
    expect(ROUTE).toMatch(/result === 'not_guest'\) return Response\.json\(\{ error: 'not_guest' \}, \{ status: 403 \}\)/);
    expect(ROUTE).toMatch(/Max-Age=0/);
  });
});

describe('the janitor', () => {
  it('runs at boot and on an interval on the WS server', () => {
    expect(SERVER).toMatch(/purgeOrphanGuests\(\)/);
    expect(SERVER).toMatch(/setTimeout\(sweepGuests/);
    expect(SERVER).toMatch(/setInterval\(sweepGuests/);
  });
});
