/**
 * The RPC relay: what it refuses, and why it exists.
 *
 * It exists so the Alchemy API key never reaches a browser. Serving the
 * provider URL to the client put the key in the page source AND forced the
 * account's IP allowlist off, since the callers are players from everywhere.
 *
 * That makes this endpoint quota-shaped rather than payment-shaped: nothing a
 * client does here can credit anything (crediting goes through `verifyPayment`,
 * which calls out from the server), so what is defended is the KEY and the
 * QUOTA. Hence: signed-in players only, and only the methods a wallet needs.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { signSession } from '../src/lib/auth/jwt';

const call = async (body: unknown, opts: { token?: string; query?: string } = {}) => {
  const { POST } = await import('../src/app/api/rpc/route');
  const url = `http://smoke.test/api/rpc${opts.query ?? ''}`;
  return POST(new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
};

let token: string;

beforeEach(async () => {
  vi.resetModules();
  process.env.JWT_SIGNING_SECRET = '0'.repeat(64);
  process.env.SOLANA_RPC_URL = 'https://solana-devnet.example/v2/secret-key';
  token = await signSession({ sub: 'sol:test', wallet: 'test', name: 'Test' });
  // Nothing should reach the network in these tests: every case under test is
  // refused before the relay would call upstream.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"upstream":true}')));
});

describe('who may use the relay', () => {
  const ok = { jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash' };

  it('refuses an anonymous caller', async () => {
    // The quota is paid for by this game, so it is spent on this game's players.
    expect((await call(ok)).status).toBe(401);
  });

  it('refuses a forged token', async () => {
    expect((await call(ok, { token: 'not.a.token' })).status).toBe(401);
  });

  it('accepts a session in the Authorization header', async () => {
    expect((await call(ok, { token })).status).toBe(200);
  });

  it('accepts a session in the query string', async () => {
    // web3.js cannot set a header on its own requests, so this one endpoint
    // takes the token from `?t=`.
    expect((await call(ok, { query: `?t=${encodeURIComponent(token)}` })).status).toBe(200);
  });
});

describe('what may pass through', () => {
  it('allows the calls a wallet needs to build a transfer', async () => {
    for (const method of ['getLatestBlockhash', 'getAccountInfo', 'sendTransaction']) {
      const res = await call({ jsonrpc: '2.0', id: 1, method }, { token });
      expect(res.status, method).toBe(200);
    }
  });

  it('refuses a method that is not on the list', async () => {
    // An open proxy would let anyone spend this deployment's quota on whatever
    // they liked, including the expensive historical queries.
    const res = await call({ jsonrpc: '2.0', id: 1, method: 'getProgramAccounts' }, { token });
    expect(res.status).toBe(403);
  });

  it('checks EVERY call in a batch, not just the first', async () => {
    // web3.js batches, and a batch must not be a way to smuggle one past.
    const res = await call([
      { jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash' },
      { jsonrpc: '2.0', id: 2, method: 'getProgramAccounts' },
    ], { token });
    expect(res.status).toBe(403);
  });

  it('refuses a batch with no calls, or an absurd number', async () => {
    expect((await call([], { token })).status).toBe(400);
    const huge = Array.from({ length: 50 }, (_, i) =>
      ({ jsonrpc: '2.0', id: i, method: 'getAccountInfo' }));
    expect((await call(huge, { token })).status).toBe(400);
  });

  it('refuses a body that is not JSON', async () => {
    expect((await call('not json', { token })).status).toBe(400);
  });

  it('refuses a body with no method at all', async () => {
    expect((await call({ jsonrpc: '2.0', id: 1 }, { token })).status).toBe(403);
  });
});

describe('the key', () => {
  it('never appears in a response', async () => {
    // The whole reason this endpoint exists.
    const res = await call({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash' }, { token });
    expect(await res.text()).not.toContain('secret-key');
  });

  it('says so plainly when no RPC is configured', async () => {
    delete process.env.SOLANA_RPC_URL;
    const res = await call({ jsonrpc: '2.0', id: 1, method: 'getHealth' }, { token });
    expect(res.status).toBe(503);
  });
});
