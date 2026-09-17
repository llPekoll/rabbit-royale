/**
 * Telling a CONNECTED player something from the HTTP side.
 *
 * The raid is decided over HTTP, in the Next process; the sockets live in the
 * ws process. The two share nothing but Postgres — and Postgres can push:
 * `NOTIFY` on a channel is delivered to every session that `LISTEN`s, the
 * moment the notifying transaction commits. So this is the bus: the API says
 * "player X should hear event E", the ws server hears it and emits E on X's
 * socket, if X has one. No polling on either side, no second process to
 * address, no shared secret to configure; and with several ws shards each one
 * listens and only the one holding the socket has anything to emit.
 *
 * Fire-and-forget by design. A player with no socket simply does not hear it,
 * which is the right answer: what these carry is the LIVE picture, and a
 * player who was not there reads the outcome from the row later, as before.
 *
 * Payloads are capped by Postgres at 8000 bytes. Everything sent here is a
 * raid view — a few numbers and a route of at most a few dozen tiles — so
 * `pushToPlayer` refuses anything larger rather than letting a stray field
 * blow the whole notification up.
 */
import type { Sql } from 'postgres';

export const PLAYER_PUSH_CHANNEL = 'player_push';

/** Postgres' own ceiling, minus room for the envelope. */
const MAX_PAYLOAD_BYTES = 7500;

export interface PlayerPush {
  /** Whose socket. */
  to: string;
  /** The socket.io event name the client listens for. */
  event: 'raid_incoming' | 'raid_struck';
  payload: unknown;
}

/** Wire form — a JSON string on the channel. */
export function encodePush(push: PlayerPush): string | null {
  const wire = JSON.stringify(push);
  if (Buffer.byteLength(wire, 'utf8') > MAX_PAYLOAD_BYTES) return null;
  return wire;
}

export function decodePush(wire: string): PlayerPush | null {
  try {
    const v = JSON.parse(wire) as Partial<PlayerPush>;
    if (typeof v?.to !== 'string' || typeof v.event !== 'string') return null;
    if (v.event !== 'raid_incoming' && v.event !== 'raid_struck') return null;
    return { to: v.to, event: v.event, payload: v.payload };
  } catch {
    return null;
  }
}

/**
 * Notify. Resolves once Postgres has taken the notification; never throws
 * into the caller's flow — a push that could not be sent is logged and the
 * raid goes on, because the raid is already true in the row.
 */
export async function pushToPlayer(sql: Sql, push: PlayerPush): Promise<void> {
  const wire = encodePush(push);
  if (!wire) {
    console.warn('[push] payload too large, dropped', push.event, push.to);
    return;
  }
  try {
    await sql.notify(PLAYER_PUSH_CHANNEL, wire);
  } catch (e) {
    console.warn('[push] notify failed', push.event, e);
  }
}
