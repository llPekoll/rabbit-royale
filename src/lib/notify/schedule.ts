/**
 * WHEN a push is owed — the pure half of the notification sweep.
 *
 * Every rule about timing lives here and nowhere else, as functions of a row
 * and a clock: when the tank tops up, when the garden stops growing, when a
 * player has been gone long enough to be reminded, whether it is night where
 * their phone is, whether they have had enough for today. The sweep in
 * `sweep.ts` only reads rows, asks `decideSweepPush`, and writes what it says.
 * Nothing in this file touches a database, a socket or FCM, so every rule can
 * be asserted with a fixed clock (`test/push.test.ts`).
 *
 * The rules, in short:
 *
 *   - a player at the keyboard is never pushed (they can see the game);
 *   - energy full and garden ready go out ONCE per cycle, only if the player
 *     has not been seen since it happened and has been gone 15 minutes;
 *   - a tank that will top out during the night is told in the evening
 *     instead (`energy_overnight`), since the morning push would come after
 *     hours of regen already lost — one or the other per refill, never both;
 *   - a comeback reminder at 24 h away, a second at 72 h, then silence until
 *     they return — a player gone a week gets one, not two in a row;
 *   - Snack Time once per snack, when the phone's day has turned since the
 *     last one and they have not been back since (`snack_pack` on the
 *     seventh) — it stands in for the 24 h reminder when both are due;
 *   - none of those between 22:00 and 09:00 on the device's clock (they wait
 *     for the first sweep after nine), none within PUSH.MIN_GAP_MS of the
 *     previous one, and at most PUSH.DAILY_CAP in a day.
 *
 * Raids are not decided here: they are pushed as they happen, day or night,
 * and outside the daily cap (`raid.ts`).
 */
import { GARDEN_BOOST } from '../../../config/tuning';
import { SNACK_DAYS, snackReadyAt, type SnackRow } from '../game/snack';
import { GARDEN, OUT_OF_RUN_ENERGY, regenPerHour } from '../tuning/tables';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const PUSH = {
  /** How often rr-ws runs the sweep. The rules below are all hours long, so
   *  five minutes late is never noticed and the sweep stays cheap. */
  SWEEP_MS: 5 * MINUTE,
  /** Energy and garden alerts only for someone gone at least this long: a
   *  player who closed the app a minute ago does not need their phone to tell
   *  them what they just saw. A quarter of an hour, not more: with an hour
   *  the alert for a tank a few points short reached the phone 50 minutes
   *  after it was full (2026-10-01). */
  AWAY_MIN_MS: 15 * MINUTE,
  /** An alert about a moment older than this is history, not news. Long
   *  enough to survive a night of quiet hours (22:00 → 09:00 is 11 h). */
  STALE_MS: 24 * HOUR,
  /** The two comeback reminders. */
  IDLE_FIRST_MS: 24 * HOUR,
  IDLE_SECOND_MS: 72 * HOUR,
  /** Quiet hours on the device's clock: no sweep push from QUIET_FROM:00 to
   *  QUIET_UNTIL:00. Raids ignore them — a raid is happening NOW. */
  QUIET_FROM_HOUR: 22,
  QUIET_UNTIL_HOUR: 9,
  /** From this hour to QUIET_FROM_HOUR, a tank due to fill during the coming
   *  night is announced now (`energy_overnight`). Two hours, so a player who
   *  plays on into the evening is still told before the quiet starts. */
  EVE_FROM_HOUR: 20,
  /** Non-raid pushes per player per day, and the least time between two.
   *  The gap is what stops "garden full" and "energy full" landing five
   *  minutes apart when both come due in the same evening. */
  DAILY_CAP: 3,
  DAY_MS: 24 * HOUR,
  MIN_GAP_MS: 2 * HOUR,
  /** Raid pushes to one player: at most one per this window, whatever the
   *  raid. It also covers the double buzz — a raid that ENDS within two
   *  minutes of the alert that it began says nothing the first did not. */
  RAID_GAP_MS: 2 * MINUTE,
} as const;

// ── The clocks ───────────────────────────────────────────────────────────────

/** The row the tank is read from — the same fields `currentEnergy` takes. */
export interface TankClock {
  energy: number;
  energyUpdatedAt: Date;
  burrowLevel: number;
}

/**
 * The instant the out-of-run tank reaches OUT_OF_RUN_ENERGY.MAX, or null when
 * there is no refill to wait for (it was already full at its stamp).
 *
 * The inverse of `currentEnergy`: stored energy plus hours × rate reaches the
 * cap after (MAX − energy) / rate hours. `currentEnergy` floors, so at that
 * instant it reads exactly MAX — never a moment early.
 */
export function energyFullAt(row: TankClock): Date | null {
  const missing = OUT_OF_RUN_ENERGY.MAX - row.energy;
  if (missing <= 0) return null;
  const rate = regenPerHour(row.burrowLevel);
  if (rate <= 0) return null;
  return new Date(row.energyUpdatedAt.getTime() + (missing / rate) * HOUR);
}

export interface GardenClock {
  gardenCollectedAt: Date;
  fertilisedUntil?: Date | null;
}

/**
 * The first instant the garden stops growing — `gardenYield` at its cap.
 *
 * Fertiliser is what makes this more than `collectedAt + CAP_HOURS`: while it
 * is live the cap is CAP_HOURS + EXTRA_CAP_HOURS, and when it lapses the cap
 * drops back (`capHoursFor` reads it at the moment of asking). So the garden
 * is full at the first t where either
 *   - t < fertilisedUntil and it has grown CAP + EXTRA hours, or
 *   - t ≥ fertilisedUntil and it has grown CAP hours —
 * which is the fed ceiling if it is reached before the feeding runs out, the
 * plain one if the feeding ran out first, and otherwise the instant it runs
 * out (the garden was already past the plain cap, and is now held to it).
 */
export function gardenReadyAt(row: GardenClock): Date {
  const from = row.gardenCollectedAt.getTime();
  const plain = from + GARDEN.CAP_HOURS * HOUR;
  const fed = plain + GARDEN_BOOST.FERTILISER.EXTRA_CAP_HOURS * HOUR;
  const until = row.fertilisedUntil?.getTime();
  if (until === undefined || until <= plain) return new Date(plain);
  if (fed < until) return new Date(fed);
  return new Date(until);
}

/**
 * Clamp a client-sent offset to the ones that exist on Earth (UTC−12 to
 * UTC+14). A garbage value must not put a player's night at noon.
 */
export function clampTzOffset(tzOffsetMin: unknown): number {
  const n = Math.round(Number(tzOffsetMin));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-12 * 60, Math.min(14 * 60, n));
}

/** The hour (0-23) on a device `tzOffsetMin` minutes east of UTC. */
export function localHour(nowMs: number, tzOffsetMin: number): number {
  const minutes = Math.floor(nowMs / MINUTE) + tzOffsetMin;
  const ofDay = ((minutes % 1440) + 1440) % 1440;
  return Math.floor(ofDay / 60);
}

/** Night on the device: no sweep push now, the next sweep after nine sends it. */
export function isQuietHours(nowMs: number, tzOffsetMin: number): boolean {
  const h = localHour(nowMs, tzOffsetMin);
  return h >= PUSH.QUIET_FROM_HOUR || h < PUSH.QUIET_UNTIL_HOUR;
}

/**
 * The next quiet window on the device that has not ended yet: `from` (its
 * 22:00) and `until` (the 09:00 after). Inside quiet hours, the current one.
 */
export function nightAhead(nowMs: number, tzOffsetMin: number): { from: number; until: number } {
  const DAY = 24 * HOUR;
  const offset = tzOffsetMin * MINUTE;
  // UTC instant of the local midnight that starts the device's current day.
  const midnight = Math.floor((nowMs + offset) / DAY) * DAY - offset;
  const length = (24 - PUSH.QUIET_FROM_HOUR + PUSH.QUIET_UNTIL_HOUR) * HOUR;
  let from = midnight + PUSH.QUIET_FROM_HOUR * HOUR;
  // Before nine in the morning: still last night's window.
  if (from - DAY + length > nowMs) from -= DAY;
  return { from, until: from + length };
}

// ── The daily cap ────────────────────────────────────────────────────────────

export interface CapWindow {
  windowStart: Date | null;
  windowCount: number;
}

/**
 * Whether one more non-raid push fits today.
 *
 * A window opened by the first push and closed a day later, rather than a
 * rolling log of timestamps: two columns, and "three a day" is still true for
 * any 24 h the player could point at that starts on a push.
 */
export function underDailyCap(w: CapWindow, nowMs: number): boolean {
  if (!w.windowStart || nowMs - w.windowStart.getTime() >= PUSH.DAY_MS) return true;
  return w.windowCount < PUSH.DAILY_CAP;
}

/** The window after one more push at `nowMs`. */
export function countPush(w: CapWindow, nowMs: number): { windowStart: Date; windowCount: number } {
  if (!w.windowStart || nowMs - w.windowStart.getTime() >= PUSH.DAY_MS) {
    return { windowStart: new Date(nowMs), windowCount: 1 };
  }
  return { windowStart: w.windowStart, windowCount: w.windowCount + 1 };
}

// ── The comeback reminders ───────────────────────────────────────────────────

/** How many comeback reminders someone gone this long is owed: 0, 1 or 2. */
export function idleStageFor(awayMs: number): 0 | 1 | 2 {
  if (awayMs >= PUSH.IDLE_SECOND_MS) return 2;
  if (awayMs >= PUSH.IDLE_FIRST_MS) return 1;
  return 0;
}

// ── The decision ─────────────────────────────────────────────────────────────

export type SweepKind =
  | 'garden_ready' | 'energy_full' | 'energy_overnight' | 'comeback_1' | 'comeback_2'
  | 'snack_ready' | 'snack_pack';

/** What the sweep remembers per player — `push_state`, minus the raid column. */
export interface SweepState extends CapWindow {
  energyFor: Date | null;
  gardenFor: Date | null;
  idleFor: Date | null;
  idleStage: number;
  onlineAt: Date | null;
  lastPushAt: Date | null;
  /** The snack whose successor was announced — see `snackStamp`. */
  snackFor: Date | null;
}

export interface SweepInput {
  now: number;
  /** Has a live socket right now. */
  online: boolean;
  player: TankClock & GardenClock & { lastSeenAt: Date };
  /** The Snack Time streak, null for a player who never took a snack. */
  snack: SnackRow | null;
  state: SweepState;
  /** The device clock that decides quiet hours (the newest token's). */
  tzOffsetMin: number;
}

export interface SweepDecision {
  /** The push to send, or null for none this sweep. */
  kind: SweepKind | null;
  /** What to write to `push_state` — also when nothing is sent (a player seen
   *  online, a return that resets the reminders). Empty: write nothing. */
  patch: Partial<SweepState>;
}

/** The stamp a snack push is sent for: the last claim, or the epoch for none. */
export function snackStamp(snack: SnackRow | null): Date {
  return snack?.claimedAt ?? new Date(0);
}

/** The most recent sign of life: the row's last-seen, or a sweep that saw a socket. */
export function lastSeen(player: { lastSeenAt: Date }, state: Pick<SweepState, 'onlineAt'>): number {
  return Math.max(player.lastSeenAt.getTime(), state.onlineAt?.getTime() ?? 0);
}

/**
 * The one push a player is owed on this sweep, if any, and the bookkeeping.
 *
 * At most ONE per sweep, in order of what costs the player most to miss: a
 * full garden is carrots a raider can take, a snack is the day's reason to
 * come back, a full tank is only regen going to waste, and a comeback
 * reminder is the least urgent of all. The others are still due next sweep —
 * after the gap.
 */
export function decideSweepPush(input: SweepInput): SweepDecision {
  const { now, online, player, state } = input;
  const patch: Partial<SweepState> = {};

  // At the keyboard: nothing to tell them, and the reminders count from now.
  if (online) {
    patch.onlineAt = new Date(now);
    return { kind: null, patch };
  }

  const seen = lastSeen(player, state);
  const away = now - seen;

  // A return since the last reminder re-arms the reminders.
  let idleStage = state.idleStage;
  if (state.idleFor?.getTime() !== seen) {
    if (state.idleStage !== 0 || state.idleFor !== null) {
      patch.idleFor = new Date(seen);
      patch.idleStage = 0;
    }
    idleStage = 0;
  }

  // The gates every non-raid push shares. Deferred, never dropped: whatever
  // is due stays due, and a later sweep sends it.
  if (isQuietHours(now, input.tzOffsetMin)) return { kind: null, patch };
  if (!underDailyCap(state, now)) return { kind: null, patch };
  if (state.lastPushAt && now - state.lastPushAt.getTime() < PUSH.MIN_GAP_MS) return { kind: null, patch };

  const sent = (kind: SweepKind, extra: Partial<SweepState>): SweepDecision => ({
    kind,
    patch: { ...patch, ...extra, lastPushAt: new Date(now), ...countPush(state, now) },
  });

  // "Happened while they were gone, recently enough to be news."
  const fresh = (at: number) => at <= now && at > seen && now - at <= PUSH.STALE_MS;

  if (away >= PUSH.AWAY_MIN_MS) {
    const garden = gardenReadyAt(player).getTime();
    if (state.gardenFor?.getTime() !== player.gardenCollectedAt.getTime() && fresh(garden)) {
      return sent('garden_ready', { gardenFor: player.gardenCollectedAt });
    }
    // SNACK TIME: once per snack, when the phone's day turned while they were
    // away. It says what the 24 h reminder would, better ("day 4/7" rather
    // than "come back"), so it uses that reminder up when both are due.
    const stamp = snackStamp(input.snack);
    const snackAt = snackReadyAt(input.snack, input.tzOffsetMin);
    if (state.snackFor?.getTime() !== stamp.getTime() && snackAt <= now && snackAt > seen) {
      const owedIdle = idleStageFor(away);
      const pack = (input.snack?.step ?? 0) >= SNACK_DAYS - 1;
      return sent(pack ? 'snack_pack' : 'snack_ready', {
        snackFor: stamp,
        ...(owedIdle > idleStage ? { idleFor: new Date(seen), idleStage: owedIdle } : {}),
      });
    }
    const full = energyFullAt(player)?.getTime();
    const unsaid = full !== undefined && state.energyFor?.getTime() !== player.energyUpdatedAt.getTime();
    if (unsaid && fresh(full)) {
      return sent('energy_full', { energyFor: player.energyUpdatedAt });
    }
    // The evening before a night the tank tops out in: the morning push would
    // only report hours of regen gone to waste, so say it while it can still
    // be spent. Stamped like energy_full, so the morning stays silent.
    if (unsaid && localHour(now, input.tzOffsetMin) >= PUSH.EVE_FROM_HOUR) {
      const night = nightAhead(now, input.tzOffsetMin);
      if (full >= night.from && full < night.until) {
        return sent('energy_overnight', { energyFor: player.energyUpdatedAt });
      }
    }
  }

  // Straight to the stage they are owed: someone gone a week is reminded
  // once, with the second message, not twice in a row.
  const owed = idleStageFor(away);
  if (owed > idleStage) {
    return sent(owed === 2 ? 'comeback_2' : 'comeback_1', { idleFor: new Date(seen), idleStage: owed });
  }

  return { kind: null, patch };
}
