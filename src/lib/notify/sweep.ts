/**
 * The push sweep: energy full, garden ready, and the comeback reminders.
 *
 * Run by rr-ws every PUSH.SWEEP_MS. There is no job per player and nothing
 * scheduled ahead: like the energy bar itself, every due time is DERIVED from
 * the row's timestamps when the sweep reads it (`schedule.ts`), so a harvest
 * or a run moves the next alert without anyone having to cancel the old one.
 *
 * Only players holding a push token are read, a page at a time — the few who
 * asked to be told, not the whole players table.
 *
 * ONE SENDER PER PUSH. The write that records a push is conditional on the
 * `last_push_at` the decision was made from, and happens BEFORE the send: if
 * two sweeps ever overlap (a second shard, a slow page running into the next
 * tick), exactly one of them wins the row and the other sends nothing. A push
 * whose send then fails is not retried — a missed "garden full" is cheaper
 * than a doubled one.
 */
import { and, asc, eq, gt, inArray, sql as raw } from 'drizzle-orm';
import { db } from '../db';
import { players, pushState, pushTokens, snackStreak } from '../db/schema';
import { gardenYield } from '../game/regen';
import { pushEnabled } from './fcm';
import { decideSweepPush, type SweepState } from './schedule';
import { sendToTokens, type TokenRow } from './send';

/** Players read per page. */
const PAGE = 200;

/** Whether a player has a live socket, as the calling process sees it. */
export type IsOnline = (playerId: string) => boolean;

let running = false;

export async function runPushSweep(isOnline: IsOnline, now = Date.now()): Promise<void> {
  if (!pushEnabled() || running) return;
  running = true;
  let sent = 0;
  try {
    let after = '';
    for (;;) {
      // A page of players who have at least one token, by id.
      const ids = (await db.selectDistinct({ id: pushTokens.playerId })
        .from(pushTokens)
        .where(gt(pushTokens.playerId, after))
        .orderBy(asc(pushTokens.playerId))
        .limit(PAGE)).map((r) => r.id);
      if (ids.length === 0) break;
      after = ids[ids.length - 1];
      sent += await sweepPage(ids, isOnline, now);
      if (ids.length < PAGE) break;
    }
  } finally {
    running = false;
  }
  if (sent > 0) console.log(`[push] sweep sent ${sent} push(es)`);
}

async function sweepPage(ids: string[], isOnline: IsOnline, now: number): Promise<number> {
  // Every swept player gets a state row, so the decision below always has one
  // to compare against and the claim always has one to win.
  await db.insert(pushState).values(ids.map((playerId) => ({ playerId }))).onConflictDoNothing();

  const [rows, states, tokens, snacks] = await Promise.all([
    db.select({
      id: players.id,
      energy: players.energy,
      energyUpdatedAt: players.energyUpdatedAt,
      burrowLevel: players.burrowLevel,
      gardenCollectedAt: players.gardenCollectedAt,
      fertilisedUntil: players.fertilisedUntil,
      wateredUntil: players.wateredUntil,
      lastSeenAt: players.lastSeenAt,
    }).from(players).where(inArray(players.id, ids)),
    db.select().from(pushState).where(inArray(pushState.playerId, ids)),
    db.select().from(pushTokens).where(inArray(pushTokens.playerId, ids)),
    db.select().from(snackStreak).where(inArray(snackStreak.playerId, ids)),
  ]);

  const stateOf = new Map(states.map((s) => [s.playerId, s]));
  const snackOf = new Map(snacks.map((s) => [s.playerId, s]));
  const tokensOf = new Map<string, TokenRow[]>();
  for (const t of tokens) {
    const list = tokensOf.get(t.playerId) ?? [];
    list.push(t);
    tokensOf.set(t.playerId, list);
  }

  let sent = 0;
  for (const player of rows) {
    const state = stateOf.get(player.id);
    const devices = tokensOf.get(player.id);
    if (!state || !devices?.length) continue;
    // Quiet hours follow the device registered last: the one in the hand.
    const newest = devices.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));

    const decision = decideSweepPush({
      now,
      online: isOnline(player.id),
      player,
      snack: snackOf.get(player.id) ?? null,
      state: state as SweepState,
      tzOffsetMin: newest.tzOffsetMin,
    });
    if (!decision.kind && Object.keys(decision.patch).length === 0) continue;

    try {
      // Claimed against the stamp the decision was made from (see the top).
      const [won] = await db.update(pushState)
        .set(decision.patch)
        .where(and(
          eq(pushState.playerId, player.id),
          state.lastPushAt
            ? eq(pushState.lastPushAt, state.lastPushAt)
            : raw`${pushState.lastPushAt} is null`,
        ))
        .returning({ id: pushState.playerId });
      if (!won || !decision.kind) continue;
      // The count is what makes the push worth opening: « 120 🥕 » and not
      // « potager plein ». The reminders that talk about the garden carry it too.
      // A snack carries its day instead: « jour 4/7 ».
      const snack = decision.kind === 'snack_ready' || decision.kind === 'snack_pack';
      const n = snack ? (snackOf.get(player.id)?.step ?? 0) + 1 : gardenYield(player, now);
      sent += (await sendToTokens(devices, decision.kind, { n })) > 0 ? 1 : 0;
    } catch (e) {
      console.warn('[push] sweep failed for', player.id, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
