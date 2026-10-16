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
 *   POST /api/login/start       { email } — mails a six-digit code (admin/codes.ts)
 *   POST /api/login             { email, code } → token
 *   GET  /api/me                who is signed in, and as what
 *   GET  /api/metrics           ?days=90 — every region's numbers
 *   GET  /api/team              the team (owner)                    admin/team.ts
 *   POST /api/team              { email, role } (owner)
 *   POST /api/team/remove       { email } (owner)
 *   GET  /admin-agent/metrics   ?days=90 — this region's numbers     agent
 *   GET  /health
 *
 * Env, site: DATABASE_URL (read-only by connection, admin/db.ts),
 * ADMIN_OWNER_EMAIL (yohann.mepa@gmail.com), JENVOIE_API_KEY (the codes),
 * MAIL_FROM, ADMIN_REGION (eu),
 * ADMIN_PEERS ("sg=https://ws-sg.rabbit.rip/admin-agent,us=…"),
 * JWT_SIGNING_SECRET (the game's, for the region-to-region token), ADMIN_PORT.
 * Env, agent: DATABASE_URL, JWT_SIGNING_SECRET, WS_DOMAIN or ADMIN_REGION.
 * Without ADMIN_OWNER_EMAIL there is no site, only the agent.
 *
 *   ADMIN_OWNER_EMAIL=… JWT_SIGNING_SECRET=… bun admin/server.ts
 */
import { ADMIN_PAGE } from './page';
import { isAgent, sessionOf, signAdmin, signAgent } from './session';
import { checkCode, sendCode } from './codes';
import { mailConfigured } from './mail';
import { addMember, cleanEmail, listMembers, owner, removeMember, roleOf, ROLES_GRANTED, touchLogin, type Role } from './team';
import { regionMetrics, regionOf } from './metrics';

const PORT = Number(process.env.ADMIN_PORT ?? 3020);

// ── Rate limits, per window of ten minutes ──────────────────────────────────
const WINDOW_MS = 10 * 60 * 1000;
const tries = new Map<string, number[]>();
function spend(key: string, max: number, now = Date.now()): boolean {
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

/**
 * Step one: a code to the address — if it is the owner's or a member's. Any
 * other address hears the same "sent", and no mail leaves.
 */
async function loginStart(req: Request, ip: string): Promise<Response> {
  const email = cleanEmail((await body(req)).email);
  if (!email) return fail('bad_email', 400);
  if (!spend(`start:${ip}`, 5) || !spend(`mail:${email}`, 3) || !spend('mail:all', 30)) return fail('too_many', 429);
  if (await roleOf(email)) {
    if (!mailConfigured()) return fail('no_mail', 503);
    await sendCode(email);
    console.log(`[rr-admin] code sent to ${email}`);
  } else {
    console.log(`[rr-admin] code refused to ${email} (not in the team)`);
  }
  return Response.json({ sent: true });
}

/** Step two: the six digits from the mail → a session. */
async function login(req: Request, ip: string): Promise<Response> {
  if (!spend(`login:${ip}`, 10)) return fail('too_many', 429);
  const b = await body(req);
  const email = cleanEmail(b.email);
  if (!email || !checkCode(email, String(b.code ?? ''))) return fail('wrong_code', 401);
  const role = await roleOf(email);
  if (!role) return fail('wrong_code', 401);
  await touchLogin(email);
  console.log(`[rr-admin] sign-in ${email} (${role})`);
  return Response.json({ token: await signAdmin(email), email, role });
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
    if (!(await addMember(email, role, by))) return fail('exists', 409);
    console.log(`[rr-admin] ${by} added ${email} (${role})`);
    return Response.json({ ok: true });
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

if (!owner()) console.log('[rr-admin] no ADMIN_OWNER_EMAIL: agent only, no site');
else if (!mailConfigured()) console.warn('[rr-admin] no JENVOIE_API_KEY: nobody can get a sign-in code');
if (!process.env.JWT_SIGNING_SECRET) console.warn('[rr-admin] no JWT_SIGNING_SECRET: no region-to-region calls');

const server = Bun.serve({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/admin-agent/metrics' && req.method === 'GET') return agentMetrics(req);

    if (!owner()) return NOT_FOUND();
    const path = url.pathname;
    if (path === '/' && req.method === 'GET') return new Response(ADMIN_PAGE, { headers: PAGE_HEADERS });
    try {
      if (path === '/api/login/start' && req.method === 'POST') return await loginStart(req, ipOf(req, srv));
      if (path === '/api/login' && req.method === 'POST') return await login(req, ipOf(req, srv));
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

console.log(`[rr-admin] ${regionOf()}${owner() ? ' site' : ' agent'} on :${server.port}`);
