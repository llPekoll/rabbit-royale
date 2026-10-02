/**
 * SNACK TIME — the daily gift, as rules (SNACK in config/tuning.ts).
 *
 * Pure: a row, a clock and the phone's offset in, a decision out. The route
 * (`/api/snack`) and the push sweep (`lib/notify/schedule.ts`) both ask here,
 * so the banner that says "ready" and the phone that buzzes "ready" can never
 * disagree about when tomorrow starts.
 *
 * THE DAY IS THE PHONE'S. A snack is due once the phone's calendar has turned
 * past the day of the last one — local midnight — and at least
 * SNACK.MIN_GAP_MS after it, which is what keeps an offset flipped between two
 * claims from minting a midnight between them.
 */
import { SNACK } from '@config/tuning';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Snacks in a week; the last one is the pack. */
export const SNACK_DAYS = SNACK.CARROTS.length + 1;

export type SnackPack = keyof typeof SNACK.PACKS;
export const SNACK_PACKS = Object.keys(SNACK.PACKS) as SnackPack[];

export function isSnackPack(v: unknown): v is SnackPack {
  return typeof v === 'string' && (SNACK_PACKS as string[]).includes(v);
}

/** One item of a pack, as the bag stores it. */
export interface SnackItem {
  kind: (typeof SNACK.PACKS)[SnackPack][number]['kind'];
  qty: number;
}

/** What the `snack_streak` row holds. No row reads as `SNACK_START`. */
export interface SnackRow {
  step: number;
  claimedAt: Date | null;
  tzOffsetMin: number;
  weeks: number;
}

export const SNACK_START: SnackRow = { step: 0, claimedAt: null, tzOffsetMin: 0, weeks: 0 };

/** The UTC instant of the first local midnight strictly after `ms`. */
export function nextLocalMidnight(ms: number, tzOffsetMin: number): number {
  const offset = tzOffsetMin * MINUTE;
  return (Math.floor((ms + offset) / DAY) + 1) * DAY - offset;
}

/**
 * When the next snack can be taken, on a phone `tzOffsetMin` east of UTC.
 * Zero for a player who never took one: it has been ready all along.
 */
export function snackReadyAt(row: SnackRow | null, tzOffsetMin: number): number {
  const at = row?.claimedAt?.getTime();
  if (at === undefined) return 0;
  return Math.max(nextLocalMidnight(at, tzOffsetMin), at + SNACK.MIN_GAP_MS);
}

export function snackReady(row: SnackRow | null, now: number, tzOffsetMin: number): boolean {
  return now >= snackReadyAt(row, tzOffsetMin);
}

/** A day of the week as the screen draws it. */
export interface SnackDay {
  /** 1 … 7. */
  day: number;
  /** Days one to six. */
  carrots: number;
  /** The seventh: the packs to pick from, with what is in them. */
  packs: Record<SnackPack, SnackItem[]> | null;
}

export function snackWeek(): SnackDay[] {
  const days: SnackDay[] = SNACK.CARROTS.map((carrots, i) => ({ day: i + 1, carrots, packs: null }));
  const packs = Object.fromEntries(
    SNACK_PACKS.map((p) => [p, SNACK.PACKS[p].map((it) => ({ kind: it.kind, qty: it.qty }))]),
  ) as Record<SnackPack, SnackItem[]>;
  days.push({ day: SNACK_DAYS, carrots: 0, packs });
  return days;
}

/** Everything the screen and the banner need, in one read. */
export interface SnackView {
  /** The snack to take next, 1 … 7 — the one waiting, or the one coming. */
  day: number;
  ready: boolean;
  /** When it can be taken; null while it is ready. */
  readyAt: string | null;
  /** Taken in this week so far (0 … 6) — the ticks on the strip. */
  taken: number;
  weeks: number;
  week: SnackDay[];
}

export function snackView(row: SnackRow | null, now: number, tzOffsetMin: number): SnackView {
  const r = row ?? SNACK_START;
  const ready = snackReady(r, now, tzOffsetMin);
  return {
    day: r.step + 1,
    ready,
    readyAt: ready ? null : new Date(snackReadyAt(r, tzOffsetMin)).toISOString(),
    taken: r.step,
    weeks: r.weeks,
    week: snackWeek(),
  };
}

export type SnackClaim =
  | { ok: true; next: SnackRow; day: number; carrots: number; items: SnackItem[]; pack: SnackPack | null }
  | { ok: false; error: 'not_ready' | 'pick_a_pack' };

/**
 * Take today's snack: what it gives, and the row after it.
 *
 * The seventh asks for `pick` and refuses without one — a pack chosen for the
 * player would be the one gift in the game they did not decide.
 */
export function claimSnack(row: SnackRow | null, now: number, tzOffsetMin: number, pick?: unknown): SnackClaim {
  const r = row ?? SNACK_START;
  if (!snackReady(r, now, tzOffsetMin)) return { ok: false, error: 'not_ready' };
  const last = r.step >= SNACK_DAYS - 1;
  if (last && !isSnackPack(pick)) return { ok: false, error: 'pick_a_pack' };
  const next: SnackRow = {
    step: last ? 0 : r.step + 1,
    claimedAt: new Date(now),
    tzOffsetMin,
    weeks: r.weeks + (last ? 1 : 0),
  };
  if (last) {
    const pack = pick as SnackPack;
    const items = SNACK.PACKS[pack].map((it) => ({ kind: it.kind, qty: it.qty }));
    return { ok: true, next, day: SNACK_DAYS, carrots: 0, items, pack };
  }
  return { ok: true, next, day: r.step + 1, carrots: SNACK.CARROTS[r.step], items: [], pack: null };
}
