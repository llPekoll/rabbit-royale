/**
 * The webhook endpoint is PUBLIC. These tests are about what it refuses.
 *
 * Anyone on the internet can POST to it, so every test here is a specific way
 * of trying to get free items, and the endpoint has to say no to all of them:
 * an unsigned body, a body signed with the wrong key, a body altered after
 * signing, and a body that claims a payment nobody made.
 *
 * The design that makes this tractable: the webhook is a NUDGE, never an
 * authority. It points at a transaction and the server reads that transaction
 * on chain itself. So the worst a forged webhook can achieve — even one that
 * somehow passed the signature check — is to make the server look at a
 * transaction that does not pay for anything.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const SECRET = 'test-signing-key';

/** Sign a body the way Alchemy does: HMAC-SHA256 over the raw text. */
const sign = (raw: string, secret = SECRET) =>
  createHmac('sha256', secret).update(raw, 'utf8').digest('hex');

const post = async (raw: string, signature?: string) => {
  const { POST } = await import('../src/app/api/webhooks/alchemy/route');
  return POST(new Request('http://smoke.test/api/webhooks/alchemy', {
    method: 'POST',
    headers: signature ? { 'x-alchemy-signature': signature } : {},
    body: raw,
  }));
};

beforeEach(() => {
  vi.resetModules();
  process.env.ALCHEMY_WEBHOOK_SECRET = SECRET;
  // Payments off: these tests are about the DOOR, not what happens past it, and
  // leaving the rail disabled keeps them from touching a database or an RPC.
  delete process.env.USDC_TREASURY_ADDRESS;
  delete process.env.USDC_MINT;
  delete process.env.SOLANA_RPC_URL;
});

describe('the webhook door', () => {
  const body = JSON.stringify({ event: { transaction: ['x'] } });

  it('refuses a body with no signature at all', async () => {
    const res = await post(body);
    expect(res.status).toBe(401);
  });

  it('refuses a signature made with the wrong key', async () => {
    // The whole point of the shared secret: knowing the payload is not enough.
    const res = await post(body, sign(body, 'not-the-key'));
    expect(res.status).toBe(401);
  });

  it('refuses a body altered after it was signed', async () => {
    const signature = sign(body);
    const tampered = JSON.stringify({ event: { transaction: ['y'] } });
    expect((await post(tampered, signature)).status).toBe(401);
  });

  it('refuses a signature of the wrong length without throwing', async () => {
    // timingSafeEqual throws on a length mismatch, and a throw here would be a
    // 500 — which tells an attacker their guess was the wrong SIZE.
    expect((await post(body, 'abc')).status).toBe(401);
    expect((await post(body, '')).status).toBe(401);
  });

  it('refuses everything when no secret is configured', async () => {
    // An unsigned endpoint that credited items would be a public "give me
    // things" button. Missing config CLOSES the door rather than opening it.
    delete process.env.ALCHEMY_WEBHOOK_SECRET;
    expect((await post(body, sign(body))).status).toBe(401);
  });

  it('accepts a correctly signed body', async () => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('does nothing when the payment rail is switched off', async () => {
    // No treasury configured: there is nothing a payment could even be for.
    const res = await post(body, sign(body));
    expect(await res.json()).toMatchObject({ skipped: 'payments_disabled' });
  });

  it('rejects malformed JSON that is otherwise correctly signed', async () => {
    const raw = 'not json at all';
    process.env.USDC_TREASURY_ADDRESS = '11111111111111111111111111111112';
    process.env.USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    process.env.SOLANA_RPC_URL = 'http://localhost:8899';
    expect((await post(raw, sign(raw))).status).toBe(400);
  });
});

describe('finding signatures in a delivery', () => {
  // Alchemy's Solana payload shape has changed before and will again, and the
  // only thing wanted from a delivery is a list of candidate signatures. So the
  // extractor walks the whole object rather than reaching into a path that a
  // format change would silently break — these tests pin that tolerance.
  const SIG = '5wHu1qwD4kLM5YMHFhVBLqA3d3nQ6y7pKq8p4kzXk2xJvnbTfWLYPvT9YkR1MBNvQx7CxJqZ2vXnKUP8Bd3aEEEE';

  it('finds a signature however deeply it is buried', async () => {
    const { signaturesIn } = await import('../src/app/api/webhooks/alchemy/route');
    expect([...signaturesIn({ a: { b: [{ c: SIG }] } })]).toEqual([SIG]);
  });

  it('finds several, and never the same one twice', async () => {
    const { signaturesIn } = await import('../src/app/api/webhooks/alchemy/route');
    const other = SIG.replace('EEEE', 'FFFF');
    expect([...signaturesIn([SIG, { x: other }, SIG])].sort()).toEqual([SIG, other].sort());
  });

  it('ignores strings that are not signature-shaped', async () => {
    const { signaturesIn } = await import('../src/app/api/webhooks/alchemy/route');
    // Addresses, hashes and prose all live in these payloads. Only base58 of
    // the right length is a candidate — and even that is only a CANDIDATE: the
    // chain decides whether such a transaction exists.
    const noise = {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      note: 'a transfer happened',
      hex: '0xdeadbeef',
      n: 42,
      nothing: null,
    };
    expect([...signaturesIn(noise)]).toEqual([]);
  });

  it('survives a payload shaped nothing like the one we expect', async () => {
    const { signaturesIn } = await import('../src/app/api/webhooks/alchemy/route');
    expect(() => signaturesIn(null)).not.toThrow();
    expect(() => signaturesIn(undefined)).not.toThrow();
    expect(() => signaturesIn(0)).not.toThrow();
    expect([...signaturesIn({ totally: { different: { shape: SIG } } })]).toEqual([SIG]);
  });
});
