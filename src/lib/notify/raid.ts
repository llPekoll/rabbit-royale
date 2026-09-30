/**
 * Raid pushes: the burrow's alarm, for an owner who is not at home.
 *
 * Driven by the same bus that draws a raid live for a defender who IS home
 * (`raid_incoming` on `player_push`, see lib/game/raid-events): rr-ws hears
 * every change of every raid, and when the defender has no socket it hands
 * the view here instead of dropping it. So a raid needs no second hook in the
 * route — the push is one more listener on the story the route already tells.
 *
 * That story is told on EVERY step, which is what the dedupe is for:
 *
 *   - the first event of an unfinished raid → "X is raiding your burrow!"
 *     (path `defend`), claimed once per raid on `raid_runs.pushed_incoming_at`;
 *   - the event that ends it → "X raided you: -N 🥕" or "Burrow held!" (path
 *     `burrow`), claimed once per raid on `pushed_result_at`;
 *   - and across raids, at most one raid push per player per PUSH.RAID_GAP_MS
 *     (`push_state.raid_push_at`). That same gap is the double-buzz rule: a
 *     raid that ends within two minutes of its own alert is not pushed again —
 *     the alert already opened DEFEND, where the outcome is on screen. One
 *     that ends later is, and its tag replaces the stale alert in the tray.
 *
 * A raid the defender ended with lightning is never pushed: they were there.
 *
 * Raid pushes ignore quiet hours and the daily cap. A raid is happening now,
 * and it is the one push worth being woken for; the gap and the per-raid
 * claims are what keep a busy night to a few buzzes.
 */
import { and, eq, isNull, sql as raw } from 'drizzle-orm';
import { db } from '../db';
import { pushState, raidRuns } from '../db/schema';
import type { DefenderRaidView } from '../game/defence';
import { pushEnabled } from './fcm';
import { PUSH } from './schedule';
import { sendToTokens, tokensOf } from './send';

/**
 * Claim the per-player raid gap. True when this push may go out — the stamp is
 * written in the same statement, so two listeners asking at once get one yes.
 */
async function claimRaidGap(playerId: string, now: Date): Promise<boolean> {
  const cut = new Date(now.getTime() - PUSH.RAID_GAP_MS);
  const rows = await db.insert(pushState)
    .values({ playerId, raidPushAt: now })
    .onConflictDoUpdate({
      target: pushState.playerId,
      set: { raidPushAt: now },
      setWhere: raw`${pushState.raidPushAt} is null or ${pushState.raidPushAt} < ${cut}`,
    })
    .returning({ playerId: pushState.playerId });
  return rows.length > 0;
}

/**
 * A `raid_incoming` push for a defender with no socket. Fire-and-forget: the
 * caller is the NOTIFY handler, and a push that fails costs a buzz, never the
 * raid.
 */
export async function pushRaidEvent(defenderId: string, payload: unknown): Promise<void> {
  const view = payload as Partial<DefenderRaidView> | null;
  if (!view?.raidId || !view.attacker || !pushEnabled()) return;
  if (view.struck) return;

  const tokens = await tokensOf(defenderId);
  if (tokens.length === 0) return;

  const run = await db.query.raidRuns.findFirst({
    where: eq(raidRuns.id, view.raidId),
    columns: { defenderId: true, pushedIncomingAt: true, pushedResultAt: true },
  });
  // The payload only names the raid; the row says whose it is.
  if (!run || run.defenderId !== defenderId) return;

  const finished = !!view.finished;
  // Already told, on this or another listener: read first, so a step that
  // changes nothing does not burn the player's raid gap.
  if (finished ? run.pushedResultAt : run.pushedIncomingAt) return;

  const now = new Date();
  if (!(await claimRaidGap(defenderId, now))) return;

  const column = finished ? raidRuns.pushedResultAt : raidRuns.pushedIncomingAt;
  const [claimed] = await db.update(raidRuns)
    .set(finished ? { pushedResultAt: now } : { pushedIncomingAt: now })
    .where(and(eq(raidRuns.id, view.raidId), isNull(column)))
    .returning({ id: raidRuns.id });
  if (!claimed) return;

  const name = view.attacker.name;
  const looted = Number(view.carrotsLooted ?? 0);
  const kind = !finished ? 'raid_incoming' : looted > 0 ? 'raid_looted' : 'raid_held';
  const sent = await sendToTokens(tokens, kind, { name, n: looted }, view.raidId);
  if (sent > 0) console.log(`[push] ${kind} → ${defenderId} (${sent} device(s))`);
}
