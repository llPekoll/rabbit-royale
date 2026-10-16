/**
 * RR-ADMIN — the back office, a service of its own (2026-10-15).
 *
 * Not rr-ws: the game server is left alone. ONE site, admin.rabbit.rip, on
 * Coolify beside Europe's database. Singapore and the US publish no database
 * port, so a small rr-admin also runs beside each of theirs (deploy/region),
 * reachable only as ws-sg/ws-us.rabbit.rip/admin-agent/*: the site asks them
 * server to server and hands the page all three regions at once.
 *
 *   GET  /                      the page (admin/page.ts)            site
 *   POST /api/login             { email, code } — their authenticator's six digits → token
 *   GET  /api/me                who is signed in, and as what
 *   GET  /api/metrics           ?days=90 — every region's numbers
 *   GET  /api/team              the team (owner)                    admin/team.ts
 *   POST /api/team              { email, role } → a setup link (owner)
 *   POST /api/team/reset        { email } → a new setup link (owner)
 *   POST /api/team/remove       { email } (owner)
 *   POST /api/setup             { token } → the secret to scan, from the link
 *   POST /api/setup/confirm     { token, code } → token
 *   GET  /admin-agent/metrics   ?days=90 — this region's numbers     agent
 *   GET  /health
 *
 * Env, site: DATABASE_URL (read-only by connection, admin/db.ts),
 * ADMIN_TOTP_SECRET (the owner's code, `bun tools/admin-totp.ts`),
 * ADMIN_OWNER_EMAIL (yohann.mepa@gmail.com), ADMIN_REGION (eu),
 * ADMIN_PEERS ("sg=https://ws-sg.rabbit.rip/admin-agent,us=…"),
 * JWT_SIGNING_SECRET (the game's, for the region-to-region token), ADMIN_PORT.
 * Env, agent: DATABASE_URL, JWT_SIGNING_SECRET, WS_DOMAIN or ADMIN_REGION.
 * Without ADMIN_TOTP_SECRET there is no site, only the agent.
 *
 *   ADMIN_TOTP_SECRET=… bun admin/server.ts
 */
import { ADMIN_PAGE } from './page';
import { isAgent, sessionOf, signAdmin, signAgent } from './session';
import { addMember, cleanEmail, listMembers, removeMember, resetMember, ROLES_GRANTED, setupConfirm, setupInfo, signIn, type Role } from './team';
import { adminSecret } from './totp';
import { regionMetrics, regionOf } from './metrics';

const PORT = Number(process.env.ADMIN_PORT ?? 3020);

// ── Sign-in: five tries per address per five minutes, twenty for everyone ──
const WINDOW_MS = 5 * 60 * 1000;
const tries = new Map<string, number[]>();
function spend(key: string, max: number, now: number): boolean {
  const list = (tries.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  tries.set(key, list);
  return list.length <= max;
}

/** The caller's address: the LAST of x-forwarded-for, the one the proxy saw. */
const ipOf = (req: Request, srv: { requestIP(r: Request): { address: string } | null }) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',').pop()?.trim() || srv.requestIP(req)?.address || 'direct';

const body = async (req: Request) => (await req.json().catch(() => ({}))) as Record<string, unknown>;
const fail = (error: string, status: number) => Response.json({ error }, { status });

async function login(req: Request, ip: string): Promise<Response> {
  const now = Date.now();
  if (!spend(`ip:${ip}`, 5, now) || !spend('all', 20, now)) return fail('too_many', 429);
  const b = await body(req);
  const email = cleanEmail(b.email);
  const role = email ? await signIn(email, String(b.code ?? '')) : null;
  if (!email || !role) return fail('wrong_code', 401);
  tries.delete(`ip:${ip}`);
  console.log(`[rr-admin] sign-in ${email} (${role})`);
  return Response.json({ token: await signAdmin(email), email, role });
}

/** The setup link: shows the secret once, then the first code closes it. */
async function setup(req: Request, ip: string, confirm: boolean): Promise<Response> {
  if (!spend(`setup:${ip}`, 10, Date.now())) return fail('too_many', 429);
  const b = await body(req);
  const token = String(b.token ?? '');
  if (!confirm) {
    const info = token ? await setupInfo(token) : null;
    return info ? Response.json(info) : fail('expired', 404);
  }
  const m = token ? await setupConfirm(token, String(b.code ?? '')) : null;
  if (!m) return fail('wrong_code', 401);
  console.log(`[rr-admin] set up ${m.email} (${m.role})`);
  return Response.json({ token: await signAdmin(m.email), email: m.email, role: m.role });
}

/** The owner's team page: list, add, new link, remove. */
async function team(req: Request, path: string, by: string): Promise<Response> {
  if (req.method === 'GET' && path === '/api/team') return Response.json({ members: await listMembers(), roles: ROLES_GRANTED });
  if (req.method !== 'POST') return fail('not_found', 404);
  const b = await body(req);
  const email = cleanEmail(b.email);
  if (!email) return fail('bad_email', 400);
  if (email === by) return fail('owner', 400);
  if (path === '/api/team') {
    const role = String(b.role ?? '') as Role;
    if (!ROLES_GRANTED.includes(role)) return fail('bad_role', 400);
    const token = await addMember(email, role, by);
    if (!token) return fail('exists', 409);
    console.log(`[rr-admin] ${by} added ${email} (${role})`);
    return Response.json({ token });
  }
  if (path === '/api/team/reset') {
    const token = await resetMember(email, by);
    if (!token) return fail('not_found', 404);
    console.log(`[rr-admin] ${by} reset ${email}`);
    return Response.json({ token });
  }
  if (path === '/api/team/remove') {
    if (!(await removeMember(email))) return fail('not_found', 404);
    console.log(`[rr-admin] ${by} removed ${email}`);
    return Response.json({ ok: true });
  }
  return fail('not_found', 404);
}

function daysOf(req: Request): number {
  const asked = Number(new URL(req.url).searchParams.get('days') ?? 90);
  return Math.min(Math.max(Number.isFinite(asked) ? Math.round(asked) : 90, 7), 365);
}

/** The other regions' agents: `ADMIN_PEERS` = "sg=https://…,us=https://…". */
function peers(): { region: string; base: string }[] {
  return (process.env.ADMIN_PEERS ?? '')
    .split(',')
    .map((p) => p.trim().split('='))
    .filter((p) => p.length === 2 && p[0] && /^https?:\/\//.test(p[1]))
    .map(([region, base]) => ({ region, base: base.replace(/\/+$/, '') }));
}

type RegionResult = { region: string; data?: unknown; error?: string };

async function own(days: number): Promise<RegionResult> {
  const region = regionOf();
  try {
    return { region, data: await regionMetrics(region, days) };
  } catch (e) {
    console.error('[rr-admin] metrics:', e);
    return { region, error: 'database error' };
  }
}

async function remote(peer: { region: string; base: string }, days: number): Promise<RegionResult> {
  try {
    const res = await fetch(`${peer.base}/metrics?days=${days}`, {
      headers: { Authorization: `Bearer ${await signAgent()}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { region: peer.region, error: res.status === 404 ? 'not set up' : `error ${res.status}` };
    return { region: peer.region, data: await res.json() };
  } catch (e) {
    console.error(`[rr-admin] ${peer.region}:`, e);
    return { region: peer.region, error: 'unreachable' };
  }
}

/** The page's one call: this region read here, the others asked in parallel. */
async function metrics(req: Request): Promise<Response> {
  const days = daysOf(req);
  const regions = await Promise.all([own(days), ...peers().map((p) => remote(p, days))]);
  return Response.json({ regions }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Another region's site asking for this region's numbers. */
async function agentMetrics(req: Request): Promise<Response> {
  if (!(await isAgent(req))) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const r = await own(daysOf(req));
  return r.data
    ? Response.json(r.data, { headers: { 'Cache-Control': 'no-store' } })
    : Response.json({ error: 'internal' }, { status: 500 });
}

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

const NOT_FOUND = () => new Response('Not found', { status: 404 });

if (!adminSecret()) console.log('[rr-admin] no ADMIN_TOTP_SECRET: agent only, no site');
if (!process.env.JWT_SIGNING_SECRET) console.warn('[rr-admin] no JWT_SIGNING_SECRET: no region-to-region calls');

const server = Bun.serve({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/admin-agent/metrics' && req.method === 'GET') return agentMetrics(req);

    if (!adminSecret()) return NOT_FOUND();
    const path = url.pathname;
    if (path === '/' && req.method === 'GET') return new Response(ADMIN_PAGE, { headers: PAGE_HEADERS });
    try {
      if (path === '/api/login' && req.method === 'POST') return await login(req, ipOf(req, srv));
      if (path === '/api/setup' && req.method === 'POST') return await setup(req, ipOf(req, srv), false);
      if (path === '/api/setup/confirm' && req.method === 'POST') return await setup(req, ipOf(req, srv), true);
      if (!path.startsWith('/api/')) return NOT_FOUND();

      const me = await sessionOf(req);
      if (!me) return fail('unauthenticated', 401);
      if (path === '/api/me' && req.method === 'GET') return Response.json(me);
      if (path === '/api/metrics' && req.method === 'GET') return await metrics(req);
      if (path === '/api/team' || path.startsWith('/api/team/')) {
        return me.role === 'owner' ? await team(req, path, me.email) : fail('forbidden', 403);
      }
    } catch (e) {
      console.error('[rr-admin]', path, e);
      return fail('internal', 500);
    }
    return NOT_FOUND();
  },
});

console.log(`[rr-admin] ${regionOf()}${adminSecret() ? ' site' : ' agent'} on :${server.port}`);
