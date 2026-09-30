/**
 * Registering a device for push notifications (FCM).
 *
 *   POST   { token, platform: 'android' | 'web', locale, tzOffsetMin }
 *          → upsert. A token already held by another player MOVES to this one:
 *            a token names an app install, and the install belongs to whoever
 *            signed in on it last (a guest who connects a wallet, a shared
 *            tablet). The previous owner stops being buzzed for a burrow that
 *            is no longer the one on that screen.
 *   DELETE { token } → forget it (sign-out, notifications turned off). Only
 *          the caller's own token: a player cannot unsubscribe someone else.
 *
 * `tzOffsetMin` is minutes EAST of UTC (Paris in summer: +120) — Godot's
 * `get_time_zone_from_system().bias`, i.e. `-Date.getTimezoneOffset()` in JS.
 * It is what quiet hours are read against (`lib/notify/schedule.ts`).
 *
 * Accepted even when FCM is not configured on this server: the token is the
 * client's to give, and a deployment that turns push on later should find
 * the devices already registered.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushTokens } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { overLimit, tooMany } from '@/lib/rate-limit';
import { resolveLocale } from '@/lib/notify/messages';
import { clampTzOffset } from '@/lib/notify/schedule';

/** FCM tokens run ~160 characters; anything past this is not one. */
const TOKEN_MAX = 4096;
const PLATFORMS = new Set(['android', 'web']);

function readToken(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.length <= TOKEN_MAX ? t : null;
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  // A client registers at boot and when FCM rotates the token: a handful an
  // hour is generous, and a loop writing rows is stopped.
  if (await overLimit('push-token', session.sub, 10)) return tooMany();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = readToken(body.token);
  if (!token) return Response.json({ error: 'bad_token' }, { status: 400 });
  const platform = typeof body.platform === 'string' ? body.platform : '';
  if (!PLATFORMS.has(platform)) return Response.json({ error: 'bad_platform' }, { status: 400 });
  // Stored as the locale we will actually write in, so the table says what
  // the player reads rather than what their OS happened to call it.
  const locale = resolveLocale(body.locale);
  const tzOffsetMin = clampTzOffset(body.tzOffsetMin);
  const now = new Date();

  await db.insert(pushTokens)
    .values({ token, playerId: session.sub, platform, locale, tzOffsetMin, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { playerId: session.sub, platform, locale, tzOffsetMin, updatedAt: now },
    });

  return Response.json({ ok: true, locale, tzOffsetMin });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('push-token', session.sub, 10)) return tooMany();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = readToken(body.token);
  if (!token) return Response.json({ error: 'bad_token' }, { status: 400 });

  // Already gone reads as success: a sign-out retried must not look like a failure.
  await db.delete(pushTokens)
    .where(and(eq(pushTokens.token, token), eq(pushTokens.playerId, session.sub)));
  return Response.json({ ok: true });
}
