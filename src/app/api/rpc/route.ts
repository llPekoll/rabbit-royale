/**
 * A Solana RPC relay, so the API key never reaches a browser.
 *
 * The wallet has to build the transfer itself — it needs a recent blockhash and
 * has to check the payer's token account exists — and that means SOMEONE has to
 * make RPC calls from the client. Handing the browser an Alchemy URL puts the
 * key in the page source, where anyone can lift it and spend the quota.
 *
 * So the browser talks to this instead. The key stays in the server's
 * environment, Alchemy only ever sees the server's IP (so the account's IP
 * allowlist can stay on), and a stolen "endpoint" is just this URL — which
 * only proxies, and only for signed-in players.
 *
 * This is NOT a trust boundary for payments. Nothing a client does here can
 * credit anything: crediting goes through `verifyPayment`, which makes its own
 * call from the server. This relay exists to protect the key and the quota,
 * nothing more.
 */
import { getSession, verifySession } from '@/lib/auth/jwt';
import { rpcUrl } from '@/lib/pay/solana';

/**
 * The session, from a header OR from `?t=`.
 *
 * web3.js's Connection offers no way to add a header, so the token has to ride
 * in the URL for this one endpoint. That is done HERE rather than by widening
 * `extractToken`, which every other route uses: a token in a query string ends
 * up in server logs and Referer headers, and that trade is worth making for a
 * read-only relay and for nothing else in this codebase.
 */
async function session(req: Request) {
  const fromHeader = await getSession(req);
  if (fromHeader) return fromHeader;
  const t = new URL(req.url).searchParams.get('t');
  return t ? verifySession(t) : null;
}

/**
 * The methods a wallet needs to build and send a USDC transfer, and nothing
 * else.
 *
 * An open proxy would let anyone use this deployment's quota for any query
 * they liked — including the expensive historical ones. The list is short on
 * purpose: it is what `use-usdc-pay` actually calls, plus what a wallet does
 * on its own behalf while sending.
 */
const ALLOWED = new Set([
  'getLatestBlockhash',
  'getAccountInfo',
  'getMultipleAccounts',
  'getBalance',
  'getTokenAccountBalance',
  'getMinimumBalanceForRentExemption',
  'getFeeForMessage',
  'sendTransaction',
  'simulateTransaction',
  'getSignatureStatuses',
  'getHealth',
]);

/** Bodies bigger than this are not a wallet building a transfer. */
const MAX_BODY = 64 * 1024;

export async function POST(req: Request) {
  // Signed-in players only. The quota is paid for by this game, so it is spent
  // on this game's players.
  if (!(await session(req))) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const upstream = rpcUrl();
  if (!upstream) return Response.json({ error: 'rpc_not_configured' }, { status: 503 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ error: 'body_too_large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }

  // web3.js batches, so a body may be one call or an array of them. Every entry
  // must be allowed — a batch is not a way to smuggle one past the list.
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 20) {
    return Response.json({ error: 'bad_batch' }, { status: 400 });
  }
  for (const call of calls) {
    const method = (call as { method?: unknown })?.method;
    if (typeof method !== 'string' || !ALLOWED.has(method)) {
      return Response.json({ error: 'method_not_allowed', method }, { status: 403 });
    }
  }

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error('[rpc] upstream failed', err);
    return Response.json({ error: 'upstream_unreachable' }, { status: 502 });
  }

  // Passed through verbatim: web3.js expects a JSON-RPC envelope, including for
  // errors, and rewriting one would break its own error handling.
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
