/**
 * A CROWN CHEST'S RR GENESIS PIECE, FROM THE ROLL TO THE WINNER'S WALLET.
 *
 * "Du moment où il est gagné, il est gagné" (2026-10-20): the piece is a real
 * asset the moment the chest opens. `awardGenesis` runs right after the dig
 * that rolled it — it takes one asset the game wallet holds and nobody has
 * been given yet, writes it to `genesis_pieces` against the player, and hands
 * back what the ceremony shows (name, rarity, the image itself). The transfer
 * follows at once in the background (`sendPending`), and keeps trying until
 * the chain shows the piece in the player's wallet.
 *
 * A GUEST'S PIECE IS HELD (2026-11-01 — the ceremony told them they had won
 * it, and they believed it): the asset is taken for them at once, the row
 * waits in 'held' with no wallet, and `claimHeld` sends it the day they link
 * one. A guest who never comes back does not lock it forever:
 * `releaseExpiredHeld` drops the row after GENESIS_HOLD_DAYS and the asset is
 * back in stock — the game wallet never moved it.
 *
 * `genesisOpen()` is what the roll asks first (src/lib/game/run.ts): once the
 * game wallet is empty no chest draws a piece, rather than promising one there
 * is no asset for.
 */
import { and, eq, inArray, isNull, asc, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { genesisPieces, players } from '@/lib/db/schema';
import { isWeb2 } from '@/lib/world';
import { isTransient, liveChain, type GenesisChain, type PieceLook } from './chain';

/** What the client is told after the dig: the ceremony's data, or the miss. */
export type GenesisAward =
  | { kind: 'won'; piece: PieceView }
  | { kind: 'missed' }
  | { kind: 'none' };

export interface PieceView {
  id: string;
  assetId: string | null;
  name: string | null;
  rarity: string | null;
  /** The PNG itself, base64 — the client never fetches a gateway. */
  image: string | null;
  status: string;
  signature: string | null;
  wonAt: string;
}

let chain: GenesisChain | null | undefined;
/** Injected by tests; otherwise the live chain, built once. */
export function setGenesisChain(c: GenesisChain | null): void {
  chain = c;
  stockAt = 0;
}
export function genesisChain(): GenesisChain | null {
  if (chain === undefined) chain = liveChain();
  return chain;
}

// THE STOCK, cached: a getProgramAccounts per chest would be the most
// expensive call the server makes. A minute is short next to how rarely a
// piece drops (about one island in twenty-four).
const STOCK_TTL_MS = 60_000;
let stock: string[] = [];
let stockAt = 0;
let stockLoading: Promise<string[]> | null = null;

async function freshStock(force = false): Promise<string[]> {
  const c = genesisChain();
  if (!c) return [];
  if (!force && Date.now() - stockAt < STOCK_TTL_MS) return stock;
  stockLoading ??= c.stock()
    .then((s) => { stock = s; stockAt = Date.now(); return s; })
    .catch((e) => { console.warn('[genesis] stock unreadable', String(e)); return stock; })
    .finally(() => { stockLoading = null; });
  return stockLoading;
}

/** Can a crown chest draw a piece right now? Sync, from the cached stock. */
export function genesisOpen(): boolean {
  if (isWeb2() || !genesisChain()) return false;
  if (Date.now() - stockAt >= STOCK_TTL_MS) void freshStock();
  return stock.length > 0;
}

/** Warm the cache at boot, so the first crown chest of the day can draw. */
export async function warmGenesis(): Promise<number> {
  if (isWeb2()) return 0;
  return (await freshStock(true)).length;
}

// THE IMAGES, by URL. A piece is ~4 KB of PNG; the few that drop in a day
// fit in memory, and the profile asks for the same ones again and again.
const images = new Map<string, string>();
const IMAGE_CAP = 600;

export async function imageData(url: string | null): Promise<string | null> {
  if (!url) return null;
  const hit = images.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    if (images.size >= IMAGE_CAP) images.delete(images.keys().next().value!);
    images.set(url, b64);
    return b64;
  } catch {
    return null;
  }
}

type Row = typeof genesisPieces.$inferSelect;

export async function viewOf(row: Row): Promise<PieceView> {
  return {
    id: row.id,
    assetId: row.assetId,
    name: row.name,
    rarity: row.rarity,
    image: await imageData(row.imageUrl),
    status: row.status,
    signature: row.signature,
    wonAt: row.wonAt.toISOString(),
  };
}

/**
 * Give `row` an asset: one the game wallet holds that no row has taken.
 * Returns the row as it now stands, or null when the wallet is empty.
 *
 * The unique index on `asset_id` settles a race between two digs (or two
 * regions sharing the wallet would, if they shared a database — they do not,
 * which is why the sender reads the owner on chain before every transfer).
 */
export async function assign(row: Row, skip: ReadonlySet<string> = new Set(), status: 'sending' | 'held' = 'sending'): Promise<Row | null> {
  const c = genesisChain();
  if (!c) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const held = (await freshStock(attempt > 0)).filter((a) => !skip.has(a));
    if (!held.length) continue;
    const taken = new Set((await db.select({ a: genesisPieces.assetId }).from(genesisPieces)
      .where(inArray(genesisPieces.assetId, held))).map((r) => r.a));
    const free = held.filter((a) => !taken.has(a));
    // Random, so two servers drawing at once rarely reach for the same one.
    for (const asset of free.sort(() => Math.random() - 0.5).slice(0, 5)) {
      let look: PieceLook;
      try {
        look = await c.look(asset);
      } catch (e) {
        if (isTransient(e)) throw e;
        console.warn('[genesis] skipping unreadable asset', asset, String(e));
        continue;
      }
      try {
        const [updated] = await db.update(genesisPieces)
          .set({ assetId: asset, name: look.name, imageUrl: look.imageUrl, rarity: look.rarity, status, lastError: null })
          .where(eq(genesisPieces.id, row.id))
          .returning();
        stock = stock.filter((a) => a !== asset);
        return updated ?? null;
      } catch {
        // Taken in the meantime (unique asset_id): the next one.
      }
    }
  }
  return null;
}

/**
 * The dig rolled a piece for `playerId` on `tile` of `runId`. Never throws:
 * a chain or database hiccup leaves the row waiting for the sender, and the
 * player still sees the ceremony as soon as an asset is in hand.
 */
export async function awardGenesis(playerId: string, runId: string | undefined, tile: number): Promise<GenesisAward> {
  if (isWeb2()) return { kind: 'none' };
  try {
    const [p] = await db.select({ wallet: players.wallet }).from(players).where(eq(players.id, playerId));
    if (!p) return { kind: 'none' };
    // Pas de wallet : la piece est gardee pour lui (claimHeld).
    const wallet = p.wallet ?? null;
    const [inserted] = await db.insert(genesisPieces)
      .values({ playerId, runId: runId ?? null, tile, wallet, status: wallet ? 'sending' : 'held' })
      .onConflictDoNothing()
      .returning();
    // A replayed dig finds the row its first pass wrote.
    const row = inserted ?? (await db.select().from(genesisPieces)
      .where(and(eq(genesisPieces.playerId, playerId), runId ? eq(genesisPieces.runId, runId) : isNull(genesisPieces.runId), eq(genesisPieces.tile, tile))))[0];
    if (!row) return { kind: 'none' };
    const ready = row.assetId ? row : await assign(row, new Set(), wallet ? 'sending' : 'held');
    if (!ready) {
      await db.update(genesisPieces).set({ status: 'failed', lastError: 'the game wallet is empty' }).where(eq(genesisPieces.id, row.id));
      console.error('[genesis] a piece was rolled but the game wallet is empty', playerId);
      return { kind: 'none' };
    }
    console.log('[genesis] won', playerId, ready.assetId, ready.name);
    return { kind: 'won', piece: await viewOf(ready) };
  } catch (e) {
    console.error('[genesis] award failed', playerId, runId, tile, e);
    return { kind: 'none' };
  }
}

/** Rows the sender still owes, oldest first. */
export async function owed(limit = 10): Promise<Row[]> {
  return db.select().from(genesisPieces).where(eq(genesisPieces.status, 'sending'))
    .orderBy(asc(genesisPieces.wonAt)).limit(limit);
}

/** How long a guest's piece waits for a wallet before it goes back to stock. */
export const GENESIS_HOLD_DAYS = 30;

/**
 * A guest just proved a wallet (`/api/auth/link`): every piece held for them
 * leaves for it. Called on the proof itself, so even a wallet that already
 * digs for another burrow receives what this one won — the signature says the
 * pieces reach their owner. Returns how many are now on their way.
 */
export async function claimHeld(playerId: string, wallet: string): Promise<number> {
  const rows = await db.update(genesisPieces)
    .set({ wallet, status: 'sending', lastError: null })
    .where(and(eq(genesisPieces.playerId, playerId), eq(genesisPieces.status, 'held')))
    .returning({ id: genesisPieces.id });
  if (rows.length) console.log('[genesis] claimed', rows.length, 'held piece(s) for', playerId, '->', wallet);
  return rows.length;
}

/**
 * Pieces held longer than GENESIS_HOLD_DAYS go back to stock: the row is
 * dropped, and its asset — still in the game wallet, never sent — is free for
 * the next crown chest. Returns how many were released.
 */
export async function releaseExpiredHeld(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - GENESIS_HOLD_DAYS * 86_400_000);
  const rows = await db.delete(genesisPieces)
    .where(and(eq(genesisPieces.status, 'held'), lt(genesisPieces.wonAt, before)))
    .returning({ asset: genesisPieces.assetId });
  if (rows.length) {
    console.log('[genesis] released', rows.length, 'unclaimed piece(s) back to stock');
    stockAt = 0;
  }
  return rows.length;
}
