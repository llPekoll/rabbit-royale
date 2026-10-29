/**
 * Carrying a browser sign-in back into the game (see `authHandoffs` in the
 * schema for why there is no deep link).
 *
 *   game  ── POST /api/auth/google/start ──▶ { url, handoff }
 *   game  opens `url` in the browser, then waits on GET /api/auth/handoff
 *   browser ── Google ──▶ /api/auth/google/callback?state=… ── writes result
 *   game  ◀── its waiting request returns the token
 *
 * The game's `handoff` id and the browser's `state` are two different
 * randoms: whoever sees the browser's URL (history, a screenshot) learns the
 * state, which can only finish the sign-in, never collect its token.
 *
 * `returnTo: 'android'` (the Play app, 2026-10-29): the callback sends the
 * browser back INTO the app (androidReturnUrl) instead of leaving the player on
 * a page that says "go back". The app still collects the token by polling —
 * the redirect only brings it to the front, it carries nothing.
 */
import { randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { authHandoffs } from '../db/schema';

/** A sign-in left unfinished this long is dropped. */
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

export type HandoffResult = Record<string, unknown>;

/** Where the browser goes once the sign-in is written: an app, or nowhere. */
export type HandoffReturn = 'android';

export function isHandoffReturn(v: unknown): v is HandoffReturn {
  return v === 'android';
}

export async function startHandoff(
  mode: 'login' | 'link',
  playerId: string | null,
  returnTo: HandoffReturn | null = null,
  now: Date = new Date(),
): Promise<{ id: string; state: string }> {
  // The sweep rides on the next start: there are few of these, and a timer
  // would be one more thing running in the socket server.
  await db.delete(authHandoffs).where(lt(authHandoffs.createdAt, new Date(now.getTime() - HANDOFF_TTL_MS)));
  const id = randomBytes(24).toString('hex');
  const state = randomBytes(24).toString('hex');
  await db.insert(authHandoffs).values({ id, state, mode, playerId, returnTo, createdAt: now });
  return { id, state };
}

/** The sign-in a callback belongs to, if it is still waiting. */
export async function handoffByState(state: string, now: Date = new Date()) {
  const row = await db.query.authHandoffs.findFirst({ where: eq(authHandoffs.state, state) });
  if (!row || row.result || now.getTime() - row.createdAt.getTime() > HANDOFF_TTL_MS) return null;
  return row;
}

export async function finishHandoff(id: string, result: HandoffResult): Promise<void> {
  await db.update(authHandoffs).set({ result }).where(eq(authHandoffs.id, id));
}

/**
 * The outcome, as many times as the game asks until the handoff expires.
 *
 * NOT read-once, and that is the fix of 2026-10-29: on a phone the game sits
 * in the background while the browser works, and Android may cut its waiting
 * request after the server answered it. Deleting the row on that first answer
 * lost the token for good — the next poll read "expired" and the player saw
 * "sign-in failed" right under a browser saying "you are signed in". Only the
 * game knows `id`, so a second read hands the same session to the same game;
 * the sweep in startHandoff deletes the row once HANDOFF_TTL_MS has passed.
 * `null` while the browser is still on its way.
 */
export async function takeHandoff(id: string, now: Date = new Date()): Promise<HandoffResult | null> {
  const row = await db.query.authHandoffs.findFirst({ where: eq(authHandoffs.id, id) });
  if (!row) return { error: 'expired' };
  if (now.getTime() - row.createdAt.getTime() > HANDOFF_TTL_MS) {
    await db.delete(authHandoffs).where(eq(authHandoffs.id, id));
    return { error: 'expired' };
  }
  return (row.result as HandoffResult | null) ?? null;
}

/**
 * The link that brings the Play app back to the front: an Android intent URL
 * for the scheme its manifest declares (ReturnToGameActivity, the RabbitFirebase
 * plugin, web2 AAR: the scheme IS the package name). Chrome follows it when it
 * comes as a redirect of the player's own tap on Google's page; when it cannot
 * (the app too old to know the scheme, an intent refused), it goes to
 * `fallback` instead — the page with a button that does the same on a tap.
 */
export function androidReturnUrl(pkg: string, fallback?: string): string {
  const extra = fallback ? `S.browser_fallback_url=${encodeURIComponent(fallback)};` : '';
  return `intent://signed-in#Intent;scheme=${pkg};package=${pkg};${extra}end`;
}
