import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { playerSkins, seasonPasses } from '../db/schema';
import { PASS } from '../../../config/tuning';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export const SKINS = [
  { key: 'solana', kind: 'skin_solana', name: 'Solana', usdCents: 99, onSale: true },
  // Off sale while its art is redone (2026-10-02): the client no longer
  // paints it, nothing quotes it, but a payment already open still delivers.
  { key: 'noir-violet', kind: 'skin_noir_violet', name: 'Indie Games on Solana', usdCents: 99, onSale: false },
  { key: 'carrot', kind: 'skin_carrot', name: 'Carrot', usdCents: 99, onSale: true },
  { key: 'solflare', kind: 'skin_solflare', name: 'Flary', usdCents: 99, onSale: true },
] as const;
export type SkinKind = typeof SKINS[number]['kind'];

export function isSkinKind(value: unknown): value is SkinKind {
  return SKINS.some((skin) => skin.kind === value);
}

export function skinForKind(kind: SkinKind) {
  return SKINS.find((skin) => skin.kind === kind)!;
}

export function isSkinKey(value: unknown): value is string {
  return value === PASS.SKIN || SKINS.some((skin) => skin.key === value);
}

export function skinSaleBlocker(qty: number, owned: boolean, onSale = true): string | null {
  if (!onSale) return 'unknown_item';
  if (qty !== 1) return 'bad_quantity';
  return owned ? 'skin_owned' : null;
}

export async function ownsSkin(playerId: string, key: string, tx: Tx = db): Promise<boolean> {
  if (key === PASS.SKIN) {
    const [pass] = await tx.select({ id: seasonPasses.playerId }).from(seasonPasses)
      .where(eq(seasonPasses.playerId, playerId)).limit(1);
    return !!pass;
  }
  const [skin] = await tx.select({ key: playerSkins.skin }).from(playerSkins)
    .where(and(eq(playerSkins.playerId, playerId), eq(playerSkins.skin, key))).limit(1);
  return !!skin;
}

export async function ownedSkinKeys(playerId: string, tx: Tx = db): Promise<string[]> {
  const rows = await tx.select({ key: playerSkins.skin }).from(playerSkins)
    .where(eq(playerSkins.playerId, playerId));
  const keys = rows.map((row) => row.key).filter(isSkinKey);
  if (await ownsSkin(playerId, PASS.SKIN, tx)) keys.push(PASS.SKIN);
  return keys;
}

export async function grantSkin(tx: Tx, playerId: string, kind: SkinKind, paymentId?: string) {
  await tx.insert(playerSkins).values({ playerId, skin: skinForKind(kind).key, paymentId })
    .onConflictDoNothing();
}
