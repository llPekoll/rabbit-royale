/**
 * Google Play Billing, the server's half (web2).
 *
 * The client buys through Play and hands us a purchaseToken. Nothing in that
 * hand-off is believed: the server asks the Google Play Developer API about
 * the token itself, with its own service account, and credits only what Play
 * says was PAID, for the product Play says, to the account the purchase was
 * bound to at checkout (`obfuscatedExternalAccountId`, see `accountTag`).
 *
 * CONFIGURATION
 *   PLAY_SERVICE_ACCOUNT  the service account JSON, as-is or base64 of it (the
 *                         same reading as FIREBASE_SERVICE_ACCOUNT). The account
 *                         is invited in the Play Console (Users and
 *                         permissions) with "View financial data" and "Manage
 *                         orders". Absent: the store route answers
 *                         store_unavailable and the shelf hides the price.
 *   PLAY_PACKAGE_NAME     optional, `pro.gravity5.rabbitroyale` by default
 *                         (playPackage, lib/world.ts).
 *
 * No googleapis package: one GET, one POST and an OAuth token, which `jose`
 * signs as it does for FCM (src/lib/notify/fcm.ts).
 */
import { createHash } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import { parseServiceAccount } from '@/lib/notify/fcm';
import { playPackage } from '@/lib/world';
import { takeBackStorePurchase } from './store';

type ServiceAccount = NonNullable<ReturnType<typeof parseServiceAccount>>;

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const TOKEN_KEEP_MS = 55 * 60_000;

let account: ServiceAccount | null | undefined;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const raw = process.env.PLAY_SERVICE_ACCOUNT;
  account = parseServiceAccount(raw);
  console.log(account
    ? `[play] billing on, as ${account.client_email}`
    : raw?.trim()
      ? '[play] PLAY_SERVICE_ACCOUNT unreadable: store purchases OFF'
      : '[play] PLAY_SERVICE_ACCOUNT not set: store purchases OFF');
  return account;
}

export function playEnabled(): boolean {
  return loadAccount() !== null;
}


/**
 * The tag a purchase carries to bind it to ONE player.
 *
 * The client sets it before checkout (BillingClient.set_obfuscated_account_id)
 * and Play hands it back on the purchase, out of the client's reach. Hashed:
 * Play asks for an id that is not personal, and it caps it at 64 characters,
 * which a sha256 in hex fills exactly. Godot computes the same
 * (`String.sha256_text()`, store_pay.gd).
 */
export function accountTag(playerId: string): string {
  return createHash('sha256').update(playerId).digest('hex');
}

let cached: { token: string; until: number } | null = null;
let minting: Promise<string> | null = null;

async function mint(sa: ServiceAccount): Promise<string> {
  const tokenUri = sa.token_uri || DEFAULT_TOKEN_URI;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`[play] token mint ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('[play] token mint: no access_token');
  const life = Math.min(TOKEN_KEEP_MS, Math.max(60, (body.expires_in ?? 3600) - 300) * 1000);
  cached = { token: body.access_token, until: Date.now() + life };
  return body.access_token;
}

async function accessToken(): Promise<string> {
  const sa = loadAccount();
  if (!sa) throw new Error('[play] no service account');
  if (cached && cached.until > Date.now()) return cached.token;
  minting ??= mint(sa).finally(() => { minting = null; });
  return minting;
}

/** What Play says about one token (ProductPurchase, the fields we read). */
export interface PlayPurchase {
  /** 0 purchased, 1 cancelled, 2 pending. */
  purchaseState?: number;
  /** 0 not consumed yet, 1 consumed. */
  consumptionState?: number;
  /** 0 not acknowledged yet, 1 acknowledged. */
  acknowledgementState?: number;
  orderId?: string;
  purchaseTimeMillis?: string;
  obfuscatedExternalAccountId?: string;
  /** 0 test (a license tester), 1 promo, 2 rewarded; absent for a real sale. */
  purchaseType?: number;
}

export type PlayVerdict =
  | { ok: true; orderId: string | null; purchasedAt: Date | null; test: boolean }
  | { ok: false; reason: 'pending' | 'cancelled' | 'invalid_token' | 'wrong_account' | 'store_unreachable' };

/**
 * Was this token PAID, for this product, by this player? Pure on the answer
 * Play gave, so the rules are tested without Google (test/store-play.test.ts).
 *
 * An absent account tag is accepted: a promo code redeemed in the Play Store
 * app, outside the game, carries none, and the token still names a real sale.
 * A tag that names someone else is refused — a token lifted from another
 * account, or a restore on the wrong burrow.
 */
export function judgePlayPurchase(p: PlayPurchase, playerId: string): PlayVerdict {
  if (p.purchaseState === 2) return { ok: false, reason: 'pending' };
  if (p.purchaseState !== 0) return { ok: false, reason: 'cancelled' };
  const tag = p.obfuscatedExternalAccountId;
  if (tag && tag !== accountTag(playerId)) return { ok: false, reason: 'wrong_account' };
  const millis = Number(p.purchaseTimeMillis);
  return {
    ok: true,
    orderId: p.orderId ?? null,
    purchasedAt: Number.isFinite(millis) && millis > 0 ? new Date(millis) : null,
    test: p.purchaseType === 0,
  };
}

function tokenUrl(productId: string, token: string): string {
  return `${API}/${encodeURIComponent(playPackage())}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
}

/** Ask Play about a token. A 400/404/410 is a token Play does not know. */
export async function verifyPlayPurchase(productId: string, token: string, playerId: string): Promise<PlayVerdict> {
  let res: Response;
  try {
    res = await fetch(tokenUrl(productId, token), {
      headers: { Authorization: `Bearer ${await accessToken()}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.warn('[play] verify unreachable', err);
    return { ok: false, reason: 'store_unreachable' };
  }
  if ([400, 404, 410].includes(res.status)) return { ok: false, reason: 'invalid_token' };
  if (!res.ok) {
    console.warn(`[play] verify ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { ok: false, reason: 'store_unreachable' };
  }
  return judgePlayPurchase((await res.json()) as PlayPurchase, playerId);
}

/**
 * Acknowledge a purchase that is NOT consumed (a skin). Play refunds any
 * purchase left unacknowledged for three days, so the server does it rather
 * than trusting the client to come back. A consumable is acknowledged by its
 * consume, on the device. Best effort: the client acknowledges too.
 */
export async function acknowledgePlayPurchase(productId: string, token: string): Promise<void> {
  try {
    const res = await fetch(`${tokenUrl(productId, token)}:acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn(`[play] acknowledge ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (err) {
    console.warn('[play] acknowledge unreachable', err);
  }
}

/** How far back each sweep reads: two days, so a sweep missed (a deploy, a
 *  Google outage) is caught by the next. Taking back is idempotent. */
const VOIDED_LOOKBACK_MS = 2 * 24 * 60 * 60_000;

/**
 * The purchase tokens Play gave the money back for since `since` — refunds
 * (by us, by Google, by the player within 48 h) and chargebacks — read from
 * the Voided Purchases API, page after page. Null when Play could not be
 * asked: the next sweep tries again.
 */
export async function voidedPlayTokens(since: number): Promise<string[] | null> {
  const tokens: string[] = [];
  let page: string | undefined;
  try {
    do {
      const url = new URL(`${API}/${encodeURIComponent(playPackage())}/purchases/voidedpurchases`);
      url.searchParams.set('startTime', String(since));
      url.searchParams.set('maxResults', '1000');
      if (page) url.searchParams.set('token', page);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${await accessToken()}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.warn(`[play] voided ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return null;
      }
      const body = (await res.json()) as {
        voidedPurchases?: { purchaseToken?: string }[];
        tokenPagination?: { nextPageToken?: string };
      };
      for (const v of body.voidedPurchases ?? []) if (v.purchaseToken) tokens.push(v.purchaseToken);
      page = body.tokenPagination?.nextPageToken;
    } while (page);
  } catch (err) {
    console.warn('[play] voided unreachable', err);
    return null;
  }
  return tokens;
}

/**
 * Take back every sachet Play voided lately (store.ts). Play does not call
 * us: its only push is a Pub/Sub topic, which this server does not have, so
 * rr-ws asks every hour (server/index.ts). Each region asks; the first to
 * reach a token takes it back, the others find it done.
 */
export async function sweepVoidedPlay(now = Date.now()): Promise<number> {
  if (!playEnabled()) return 0;
  const tokens = await voidedPlayTokens(now - VOIDED_LOOKBACK_MS);
  let taken = 0;
  for (const token of tokens ?? []) {
    const back = await takeBackStorePurchase('play', { token });
    if (!back) continue;
    taken++;
    console.log('[play] took back', back.qty, 'gold from', back.playerId);
  }
  return taken;
}
