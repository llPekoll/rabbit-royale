/**
 * THE SENDER: every piece won goes to its winner's wallet, whatever it takes.
 *
 * A sweep over `genesis_pieces` in 'sending', run by rr-ws every few seconds
 * and kicked right after each award. Its rule is the hub's
 * (hub/src/lib/nft/deliver.ts): READ THE OWNER ON CHAIN BEFORE EVERY SEND,
 * because the chain is the truth and both failures are real —
 *
 *   owner == the player's wallet → already sent (a run died before writing
 *                                  it down): record it, do NOT send again.
 *   owner == the game wallet     → the normal case: send it.
 *   anything else                → the piece left by another path (another
 *                                  region drew the same one, someone moved
 *                                  it by hand): give the row another piece.
 *
 * A transient error — throttling, a timeout, the game wallet out of SOL for
 * fees — leaves the row waiting for the next sweep. Nothing is ever given up:
 * a piece that is late is visible and fixable, a piece silently dropped is a
 * promise broken.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { genesisPieces } from '@/lib/db/schema';
import { assign, genesisChain, owed } from './award';
import { isTransient } from './chain';

let running = false;
let warnedNoKey = false;

export interface SendReport { sent: number; waiting: number; moved: number }

export async function sendPending(limit = 10): Promise<SendReport> {
  const out: SendReport = { sent: 0, waiting: 0, moved: 0 };
  const c = genesisChain();
  if (!c || running) return out;
  running = true;
  try {
    const rows = await owed(limit);
    if (rows.length && !c.canSend) {
      if (!warnedNoKey) console.warn(`[genesis] ${rows.length} piece(s) waiting: GENESIS_WALLET_SECRET_KEY is unset`);
      warnedNoKey = true;
      out.waiting = rows.length;
      return out;
    }
    for (let row of rows) {
      const note = (lastError: string) => db.update(genesisPieces)
        .set({ attempts: row.attempts + 1, lastError: lastError.slice(0, 400) })
        .where(eq(genesisPieces.id, row.id));
      try {
        if (!row.assetId) {
          const given = await assign(row);
          if (!given) { await note('the game wallet is empty'); out.waiting++; continue; }
          row = given;
        }
        const asset = row.assetId!;
        const owner = await c.ownerOf(asset);
        if (owner === row.wallet) {
          await db.update(genesisPieces).set({ status: 'sent', sentAt: new Date(), lastError: null }).where(eq(genesisPieces.id, row.id));
          out.sent++;
          continue;
        }
        if (owner !== c.wallet) {
          console.warn(`[genesis] ${asset} is no longer the game's (owner ${owner}): another piece for ${row.playerId}`);
          await db.update(genesisPieces).set({ assetId: null }).where(eq(genesisPieces.id, row.id));
          const again = await assign({ ...row, assetId: null }, new Set([asset]));
          if (!again) await note('the game wallet is empty');
          out.moved++;
          continue;
        }
        const signature = await c.transfer(asset, row.wallet);
        await db.update(genesisPieces)
          .set({ status: 'sent', signature, sentAt: new Date(), attempts: row.attempts + 1, lastError: null })
          .where(eq(genesisPieces.id, row.id));
        console.log('[genesis] sent', asset, 'to', row.wallet, signature);
        out.sent++;
      } catch (e) {
        if (!isTransient(e)) console.error('[genesis] send failed', row.id, row.assetId, e);
        await note(String((e as Error)?.message ?? e)).catch(() => {});
        out.waiting++;
      }
    }
    return out;
  } catch (e) {
    // A sweep never takes the server down: a database not migrated yet (EU
    // runs 0037 by hand after the deploy) or a dead RPC waits for the next one.
    console.error('[genesis] sweep failed', String((e as Error)?.message ?? e).slice(0, 200));
    return out;
  } finally {
    running = false;
  }
}
