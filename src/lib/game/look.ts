/**
 * THE LOOK of a rabbit: the one sheet everyone sees it wear — on an island,
 * in its burrow, walking someone else's in a raid, on the podium.
 *
 * One rule, decided here and nowhere else: the SKIN it wears, else the FUR
 * its player picked (`players.avatar`), else the default fur. Before this,
 * the island painted a rabbit by its arrival seat and the burrow always
 * painted it white — the colour picked in the profile showed in the profile
 * and nowhere in play.
 *
 * The answer is a key the client knows how to paint (Godot `Kit.SKINS`, then
 * `Kit.AVATARS`). Today the only skin is the Crown Race Ticket's (PASS.SKIN);
 * when skins are owned and chosen, `skinsOf` is the one thing that changes.
 *
 * RELATIVE imports, like season-pass.ts: the WS server imports this.
 */
import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { seasonPasses } from '../db/schema';
import { PASS } from '../../../config/tuning';
import { DEFAULT_AVATAR, isBuiltInAvatar } from './avatars';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/** The rule itself, for a player whose skin is already known. */
export function lookOf(avatar: string | null | undefined, skin: string | null | undefined): string {
  if (skin) return skin;
  return avatar && isBuiltInAvatar(avatar) ? avatar : DEFAULT_AVATAR;
}

/**
 * The skin each player wears, for a page of them in one round trip. A ticket
 * bought once, any season, is a skin kept for good (`skinOf`).
 */
export async function skinsOf(ids: string[], tx: Tx = db): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await tx.selectDistinct({ playerId: seasonPasses.playerId }).from(seasonPasses)
    .where(inArray(seasonPasses.playerId, ids));
  for (const r of rows) out.set(r.playerId, PASS.SKIN);
  return out;
}

/**
 * The look of a page of players, by id. A failed skin lookup costs the skin,
 * never the screen: the rabbit falls back to its fur.
 */
export async function looksOf(players: Array<{ id: string; avatar: string | null }>, tx: Tx = db): Promise<Map<string, string>> {
  const skins = await skinsOf(players.map((p) => p.id), tx).catch(() => new Map<string, string>());
  return new Map(players.map((p) => [p.id, lookOf(p.avatar, skins.get(p.id))]));
}

/** The look of one player. */
export async function playerLook(player: { id: string; avatar: string | null }, tx: Tx = db): Promise<string> {
  return (await looksOf([player], tx)).get(player.id)!;
}
