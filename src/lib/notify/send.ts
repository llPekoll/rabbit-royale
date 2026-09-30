/**
 * Send one kind of push to every device a player registered.
 *
 * Each token gets the text in ITS locale (a phone in French and a laptop in
 * English are both the same player), and a token FCM reports gone is deleted
 * on the spot — the table only ever shrinks by what FCM itself says is dead.
 *
 * Deciding WHETHER to send is not done here: see `schedule.ts` for the sweep
 * and `raid.ts` for raids. By the time this runs, the push is owed.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { pushTokens } from '../db/schema';
import { sendFcm, type SendOutcome } from './fcm';
import { PUSH_PATH, pushText, type PushKind, type PushVars } from './messages';

export type TokenRow = typeof pushTokens.$inferSelect;

/**
 * How long FCM holds a push for a phone that is off. A raid alert is stale
 * once the raid is over — minutes; the rest are worth the evening.
 */
const TTL_SECONDS: Record<PushKind, number> = {
  raid_incoming: 10 * 60,
  raid_looted: 24 * 3600,
  raid_held: 24 * 3600,
  energy_full: 12 * 3600,
  garden_ready: 12 * 3600,
  comeback_1: 24 * 3600,
  comeback_2: 24 * 3600,
};

/**
 * The notification tag: a second push with the same tag REPLACES the first in
 * the tray rather than stacking under it. One per raid (its outcome takes the
 * place of its alert), one per sweep kind.
 */
function tagFor(kind: PushKind, raidId?: string): string {
  if (kind.startsWith('raid_')) return raidId ? `raid-${raidId}` : 'raid';
  if (kind.startsWith('comeback_')) return 'comeback';
  return kind;
}

export async function tokensOf(playerId: string): Promise<TokenRow[]> {
  return db.select().from(pushTokens).where(eq(pushTokens.playerId, playerId));
}

/**
 * Push `kind` to `tokens` (one player's). Resolves to how many devices took
 * it; never throws.
 */
export async function sendToTokens(
  tokens: TokenRow[],
  kind: PushKind,
  vars: PushVars = {},
  raidId?: string,
): Promise<number> {
  if (tokens.length === 0) return 0;
  const raid = kind.startsWith('raid_');
  const outcomes: SendOutcome[] = await Promise.all(tokens.map((t) => {
    const { title, body } = pushText(kind, t.locale, vars);
    return sendFcm({
      token: t.token,
      title,
      body,
      kind,
      path: PUSH_PATH[kind],
      raid,
      tag: tagFor(kind, raidId),
      ttlSeconds: TTL_SECONDS[kind],
    });
  }));

  const dead = tokens.filter((_, i) => outcomes[i] === 'dead').map((t) => t.token);
  if (dead.length) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, dead))
      .catch((e) => console.warn('[push] could not delete dead tokens', e));
    console.log(`[push] dropped ${dead.length} dead token(s) of ${tokens[0].playerId}`);
  }
  return outcomes.filter((o) => o === 'sent').length;
}
