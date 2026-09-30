/**
 * Firebase Cloud Messaging, HTTP v1 — the one door out to phones and browsers.
 *
 * No firebase-admin: all this needs is an OAuth access token and one POST per
 * token, and the token is a JWT signed with the service account's key, which
 * `jose` (already here for the session JWTs) does in a few lines. The access
 * token lives an hour; it is kept 55 minutes and re-minted, one mint at a time.
 *
 * CONFIGURATION
 *   FIREBASE_SERVICE_ACCOUNT  the service account JSON, as-is or base64 of it
 *                             (Coolify mangles multi-line values; base64 does
 *                             not care). Absent: every push is a silent no-op,
 *                             said once in the log at boot.
 *   FIREBASE_PROJECT_ID       optional; the service account's `project_id`
 *                             when absent.
 *
 * A token FCM says is gone (404 / UNREGISTERED, a sender mismatch, or an
 * INVALID_ARGUMENT that names the registration token) is reported `dead` and
 * the caller deletes the row. An INVALID_ARGUMENT that does NOT name the
 * token is a malformed message — our bug, not the device's — and deleting on
 * it would wipe every token in the table on the first bad deploy, so it is
 * logged and the token kept.
 */
import { importPKCS8, SignJWT } from 'jose';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id?: string;
  token_uri?: string;
}

interface FcmConfig {
  account: ServiceAccount;
  projectId: string;
}

/** Parse the env value: raw JSON first, then base64 of JSON. Pure, for tests. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  const candidates = [text];
  if (!text.startsWith('{')) {
    try {
      candidates.push(Buffer.from(text, 'base64').toString('utf8').trim());
    } catch { /* not base64 either */ }
  }
  for (const c of candidates) {
    try {
      const v = JSON.parse(c) as Partial<ServiceAccount>;
      if (typeof v?.client_email !== 'string' || typeof v.private_key !== 'string') continue;
      // An env var pasted through a UI often arrives with the key's newlines
      // escaped; PKCS#8 PEM needs the real ones.
      return { ...v, private_key: v.private_key.replace(/\\n/g, '\n') } as ServiceAccount;
    } catch { /* try the next reading */ }
  }
  return null;
}

let config: FcmConfig | null | undefined;

function loadConfig(): FcmConfig | null {
  if (config !== undefined) return config;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const account = parseServiceAccount(raw);
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || account?.project_id;
  if (!account || !projectId) {
    config = null;
    console.log(raw?.trim()
      ? '[push] FIREBASE_SERVICE_ACCOUNT unreadable (not JSON nor base64 JSON, or no project id): push notifications OFF'
      : '[push] FIREBASE_SERVICE_ACCOUNT not set: push notifications OFF');
    return null;
  }
  config = { account, projectId };
  console.log(`[push] FCM on, project ${projectId} as ${account.client_email}`);
  return config;
}

/** Is there anyone to send through? Logs its answer once. */
export function pushEnabled(): boolean {
  return loadConfig() !== null;
}

// ── The access token ─────────────────────────────────────────────────────────

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
/** Google's tokens live an hour; five minutes of margin for clock skew and
 *  for a send that starts just before expiry and lands just after. */
const TOKEN_KEEP_MS = 55 * 60_000;

let cached: { token: string; until: number } | null = null;
let minting: Promise<string> | null = null;

async function mintAccessToken(cfg: FcmConfig): Promise<string> {
  const { account } = cfg;
  const tokenUri = account.token_uri || DEFAULT_TOKEN_URI;
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(account.private_key_id ? { kid: account.private_key_id } : {}) })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`[push] token mint ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('[push] token mint: no access_token');
  const life = Math.min(TOKEN_KEEP_MS, Math.max(60, (body.expires_in ?? 3600) - 300) * 1000);
  cached = { token: body.access_token, until: Date.now() + life };
  return body.access_token;
}

async function accessToken(cfg: FcmConfig): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  // One mint at a time: a raid alert and a sweep batch asking together must
  // not sign two JWTs and race to cache them.
  minting ??= mintAccessToken(cfg).finally(() => { minting = null; });
  return minting;
}

// ── The message ──────────────────────────────────────────────────────────────

export interface OutgoingPush {
  token: string;
  title: string;
  body: string;
  /** `data.kind` and `data.path` — the client routes a tap on `path`. */
  kind: string;
  path: string;
  /** Raids go on their own Android channel (a louder one, set up by the app). */
  raid: boolean;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
  /** How long FCM keeps trying an offline device. */
  ttlSeconds: number;
}

/** Where a web push opens. The Godot build lives under /play/. */
export const WEB_LINK = 'https://rabbit.rip/play/';

/** The FCM v1 `message` object. Pure, for tests. */
export function buildFcmMessage(p: OutgoingPush) {
  return {
    token: p.token,
    notification: { title: p.title, body: p.body },
    data: { kind: p.kind, path: p.path },
    android: {
      priority: 'HIGH',
      ttl: `${p.ttlSeconds}s`,
      collapse_key: p.tag,
      notification: {
        channel_id: p.raid ? 'rr_raid' : 'rr_default',
        tag: p.tag,
      },
    },
    webpush: {
      headers: { TTL: String(p.ttlSeconds), Urgency: p.raid ? 'high' : 'normal' },
      notification: { tag: p.tag },
      fcm_options: { link: WEB_LINK },
    },
  };
}

export type SendOutcome = 'sent' | 'dead' | 'failed' | 'off';

interface FcmError {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: { '@type'?: string; errorCode?: string }[];
  };
}

/** Is this FCM error the TOKEN being gone, as opposed to anything else? Pure. */
export function isDeadTokenError(httpStatus: number, body: FcmError | null): boolean {
  if (httpStatus === 404) return true;
  const err = body?.error;
  const codes = new Set([err?.status, ...(err?.details ?? []).map((d) => d.errorCode)].filter(Boolean));
  if (codes.has('UNREGISTERED') || codes.has('SENDER_ID_MISMATCH')) return true;
  if (codes.has('INVALID_ARGUMENT')) return /registration token/i.test(err?.message ?? '');
  return false;
}

/** Send one push to one token. Never throws. */
export async function sendFcm(p: OutgoingPush): Promise<SendOutcome> {
  const cfg = loadConfig();
  if (!cfg) return 'off';
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`;
  const payload = JSON.stringify({ message: buildFcmMessage(p) });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken(cfg)}`, 'Content-Type': 'application/json' },
        body: payload,
      });
      if (res.ok) return 'sent';
      // A token revoked early (key rotated): mint again, once.
      if (res.status === 401 && attempt === 0) { cached = null; continue; }
      const body = (await res.json().catch(() => null)) as FcmError | null;
      if (isDeadTokenError(res.status, body)) return 'dead';
      console.warn(`[push] FCM ${res.status} ${body?.error?.status ?? ''} ${body?.error?.message ?? ''}`.trim());
      return 'failed';
    } catch (e) {
      console.warn('[push] FCM send failed:', e instanceof Error ? e.message : e);
      return 'failed';
    }
  }
  return 'failed';
}
