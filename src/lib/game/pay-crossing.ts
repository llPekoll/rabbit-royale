/**
 * Take a crossing's worth of energy out of the burrow's bar, or say why not.
 *
 * THE ONE PLACE the out-of-run bar is spent, for both doors: a run's `join`
 * (server/index.ts) and a raid's first step (api/raid). It lived in the
 * socket server alone until raids were made to cost the same crossing, and a
 * second copy in the route would have been the start of two bars that drift.
 *
 * The debit is optimistic rather than locked: the row is read, the new bar is
 * worked out from its stamp, and the write is conditioned on the row still
 * carrying the values it was read with. Two charges racing on one player (a
 * double tap, two tabs) then cannot both pay out of the same points — the
 * second sees its condition fail, re-reads, and either pays from what is
 * genuinely left or is refused. Three tries is plenty for a row only its own
 * player writes to.
 */
import { and, eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { chargeEnergy, msToHave } from './burrow';
import { ENERGY } from '../../../config/tuning';
import { currentEnergy } from './regen';

export type CrossingPaid =
  | { ok: true; energy: number }
  | { ok: false; energy: number; nextRunInMs: number | null };

/** What a charge asks of the tank — see `chargeEnergy` (burrow.ts). */
export interface EnergyCharge { cost: number; need: number; floor?: boolean }

/** The crossing's own charge: the fee, behind the floor. */
export const CROSSING: EnergyCharge = { cost: ENERGY.CROSSING_COST, need: ENERGY.MIN_TO_CROSS };

export function payCrossing(
  playerId: string,
  /** The row as already read by the caller, to save a round trip. */
  first?: { energy: number; energyUpdatedAt: Date; burrowLevel?: number },
): Promise<CrossingPaid> {
  return payEnergy(playerId, CROSSING, first);
}

/**
 * Take a charge out of the ONE tank, atomically: read, compute against the
 * regen, write back only if nobody else wrote in between, three tries. Every
 * spend outside a live island goes through here — the crossing, a raid's
 * toll, a raid's step — so one place knows how the tank is written. (An
 * island run spends the rabbit's copy in memory and `bankRun` writes it home.)
 */
export async function payEnergy(
  playerId: string,
  charge: EnergyCharge,
  first?: { energy: number; energyUpdatedAt: Date; burrowLevel?: number },
): Promise<CrossingPaid> {
  let row = first ?? await db.query.players.findFirst({
    where: eq(players.id, playerId),
    columns: { energy: true, energyUpdatedAt: true, burrowLevel: true },
  });
  if (!row) return { ok: false, energy: 0, nextRunInMs: null };

  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const paid = chargeEnergy(row, charge, now);
    if (!paid) return { ok: false, energy: currentEnergy(row, now), nextRunInMs: msToHave(row, charge.need, now) };

    // The stamp is compared at MILLISECONDS: Postgres keeps microseconds and a
    // JS Date does not, so an exact match against the value just read never
    // holds — every attempt failed and every player was refused a run they
    // could afford. Truncating the column to what the driver handed back is
    // what makes "unchanged since I read it" a condition that can be true.
    const [charged] = await db.update(players)
      .set(paid)
      .where(and(
        eq(players.id, playerId),
        eq(players.energy, row.energy),
        // ISO text with a cast, not the Date itself: inside a raw fragment the
        // driver hands a Date over as its `toString()`, which Postgres rejects.
        raw`date_trunc('milliseconds', ${players.energyUpdatedAt}) = ${row.energyUpdatedAt.toISOString()}::timestamptz`,
      ))
      .returning({ id: players.id });
    // The bar AFTER the charge rides back so the caller can say what the
    // crossing cost — the one moment the number is news rather than a status.
    if (charged) return { ok: true, energy: paid.energy };

    const fresh = await db.query.players.findFirst({
      where: eq(players.id, playerId),
      columns: { energy: true, energyUpdatedAt: true, burrowLevel: true },
    });
    if (!fresh) break;
    row = fresh;
  }
  return { ok: false, energy: currentEnergy(row), nextRunInMs: msToHave(row, charge.need) };
}
