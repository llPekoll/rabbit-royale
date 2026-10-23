/**
 * WHO IS AT THE KEYBOARD, AND WHO IS OUT DIGGING — in every region (2026-10-23).
 *
 * The raid list, the raid door and the board each say, of a name, whether
 * its owner is away, home (a socket, no island) or out digging. Those words
 * used to be two Redis sets written by the one game server that held the
 * socket. Redis is REGIONAL, and the regions now share their players: a
 * defender connected in Singapore would read "away" to a raider in Europe,
 * who would walk in expecting no lightning.
 *
 * So each game server SAYS what it sees — on every arrival and departure, and
 * every PRESENCE_BEAT_MS for everyone it holds — over the shared database's
 * NOTIFY bus (server/index.ts), and every server writes what it hears into
 * its own region's Redis, under the speaker's name. A read stays local and
 * takes no time; it merges the speakers.
 *
 * WHY UNDER THE SPEAKER'S NAME, and why every entry expires. A player who
 * moves from Singapore's server to Europe's is "home" in Europe a moment
 * before Singapore's socket closes and says "away": kept apart, Singapore's
 * word removes only Singapore's entry. And a server that dies says nothing
 * at all — its entries simply run out (PRESENCE_TTL_MS), in every region,
 * where a set would have kept a crashed server's players home for ever.
 *
 * DIGGING IS SAID ONLY OF THIS SERVER'S ISLANDS. "Digging" is what puts
 * WATCH beside a name, and an island can only be watched on the server that
 * holds it: a player out digging on another region's server reads `away` —
 * which is true for a raid, their burrow is unattended — and never `home`.
 *
 * Redis down, or absent (local runs), reads as "nobody": presence is
 * decoration on lists that must render regardless.
 *
 * RELATIVE imports: the WS server imports this (see look.ts).
 */
import { redis } from './leaderboard';

export type Where = 'away' | 'home' | 'digging';

/** The NOTIFY channel servers tell each other on. */
export const PRESENCE_CHANNEL = 'rr_presence';
/** Every entry is restated this often by the server holding the socket… */
export const PRESENCE_BEAT_MS = 30_000;
/** …and believed for this long without word: three beats, so a late one or
 *  a lost one does not flicker anyone. */
export const PRESENCE_TTL_MS = 90_000;

/** What a server says: its name, until when to believe it, who stands where. */
export interface PresenceNote {
  /** The speaker — its boot id. */
  s: string;
  /** Epoch ms after which these entries are no longer true. */
  x: number;
  e: Array<[playerId: string, where: Where]>;
  /** A heartbeat restating what is already known: nothing changed. */
  beat?: true;
}

/** Speakers heard from, scored by when their word runs out. */
const SPEAKERS_KEY = 'rr:presence:speakers';
const KEY = (speaker: string, kind: 'connected' | 'digging') => `rr:presence:${speaker}:${kind}`;

/** Write a server's word into this region's Redis. */
export async function notePresence(note: PresenceNote): Promise<void> {
  const r = await redis();
  if (!r) return;
  const connected = KEY(note.s, 'connected');
  const digging = KEY(note.s, 'digging');
  const m = r.multi();
  m.zAdd(SPEAKERS_KEY, { score: note.x, value: note.s });
  m.zRemRangeByScore(SPEAKERS_KEY, '-inf', Date.now());
  for (const [id, where] of note.e) {
    if (where === 'away') {
      m.zRem(connected, id);
      m.zRem(digging, id);
      continue;
    }
    m.zAdd(connected, { score: note.x, value: id });
    if (where === 'digging') m.zAdd(digging, { score: note.x, value: id });
    else m.zRem(digging, id);
  }
  // A speaker that falls silent takes its keys with it.
  m.pExpire(connected, PRESENCE_TTL_MS * 2);
  m.pExpire(digging, PRESENCE_TTL_MS * 2);
  await m.exec();
}

/** Encode for the bus; null when the note is past Postgres's 8000 bytes. */
export function encodePresence(note: PresenceNote): string | null {
  const wire = JSON.stringify(note);
  return wire.length < 7900 ? wire : null;
}

export function decodePresence(wire: string): PresenceNote | null {
  try {
    const note = JSON.parse(wire) as PresenceNote;
    if (typeof note?.s !== 'string' || typeof note.x !== 'number' || !Array.isArray(note.e)) return null;
    const words = new Set<Where>(['away', 'home', 'digging']);
    note.e = note.e.filter((x) => Array.isArray(x) && typeof x[0] === 'string' && words.has(x[1]));
    return note;
  } catch {
    return null;
  }
}

/** This game server's own name on the bus: whose islands can be watched
 *  from here. Set once at boot (server/index.ts); unset, nobody digs. */
let localSpeaker = '';
export function setLocalSpeaker(speaker: string): void {
  localSpeaker = speaker;
}

/** The three words for each of `ids`, merged over every live speaker. */
export async function presenceAmong(ids: string[]): Promise<Map<string, Where>> {
  const words = new Map<string, Where>(ids.map((id) => [id, 'away']));
  if (ids.length === 0) return words;
  try {
    const r = await redis();
    if (!r) return words;
    const now = Date.now();
    const speakers = await r.zRangeByScore(SPEAKERS_KEY, now, '+inf');
    const [connected, digging] = await Promise.all([
      Promise.all(speakers.map((s) => r.zmScore(KEY(s, 'connected'), ids))),
      Promise.all(speakers.map((s) => r.zmScore(KEY(s, 'digging'), ids))),
    ]);
    const live = (row: (number | null)[], i: number) => (row[i] ?? 0) > now;
    ids.forEach((id, i) => {
      const diggingAt = speakers.filter((_, k) => live(digging[k], i));
      if (diggingAt.includes(localSpeaker)) words.set(id, 'digging');
      else if (diggingAt.length > 0) words.set(id, 'away');
      else if (connected.some((row) => live(row, i))) words.set(id, 'home');
    });
    return words;
  } catch {
    return words;
  }
}

/** Which of `ids` are out on an island of THIS server — a run worth
 *  watching. Not a solo island: it turns every watcher away. */
export async function onlineAmong(ids: string[]): Promise<Set<string>> {
  const words = await presenceAmong(ids);
  return new Set(ids.filter((id) => words.get(id) === 'digging'));
}

/**
 * Which of `ids` are at the keyboard (`home`) or digging here. A SUPERSET of
 * `onlineAmong`: connected and digging is "out digging", connected and not
 * digging is "home", neither is "away" — which is what a player digging on
 * another region's server reads as.
 */
export async function connectedAmong(ids: string[]): Promise<Set<string>> {
  const words = await presenceAmong(ids);
  return new Set(ids.filter((id) => words.get(id) !== 'away'));
}

/**
 * Everyone with a live socket right now, in any region. The raid list asks
 * for them by name so that a player who is PLAYING is on it whatever their
 * stock — ordered by stock alone, two newcomers online at the same time
 * never saw each other.
 */
export async function connectedIds(): Promise<string[]> {
  try {
    const r = await redis();
    if (!r) return [];
    const now = Date.now();
    const speakers = await r.zRangeByScore(SPEAKERS_KEY, now, '+inf');
    const lists = await Promise.all(speakers.map((s) => r.zRangeByScore(KEY(s, 'connected'), now, '+inf')));
    return [...new Set(lists.flat())];
  } catch {
    return [];
  }
}
