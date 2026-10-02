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
 * `Kit.AVATARS`). Equipment is saved on the player; the profile verifies
 * ownership before changing it. Buying another skin does not replace it.
 *
 * RELATIVE imports, like season-pass.ts: the WS server imports this.
 */
import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { players as playerTable } from '../db/schema';
import { DEFAULT_AVATAR, isBuiltInAvatar } from './avatars';
import { isSkinKey } from './skins';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/** The rule itself, for a player whose skin is already known. */
export function lookOf(avatar: string | null | undefined, skin: string | null | undefined): string {
  if (isSkinKey(skin)) return skin;
  return avatar && isBuiltInAvatar(avatar) ? avatar : DEFAULT_AVATAR;
}

/**
 * The chosen skin for a page of players, in one round trip.
 */
export async function skinsOf(ids: string[], tx: Tx = db): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await tx.select({ playerId: playerTable.id, skin: playerTable.equippedSkin }).from(playerTable)
    .where(inArray(playerTable.id, ids));
  for (const r of rows) if (isSkinKey(r.skin)) out.set(r.playerId, r.skin);
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

export async function equippedSkinOf(playerId: string, tx: Tx = db): Promise<string | null> {
  return (await skinsOf([playerId], tx)).get(playerId) ?? null;
}
