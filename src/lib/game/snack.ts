/**
 * SNACK TIME — the daily surprise box, as rules (SNACK in config/tuning.ts).
 *
 * Pure: a row, a clock, the phone's offset and a random source in, a decision
 * out. The route (`/api/snack`) and the push sweep (`lib/notify/schedule.ts`)
 * both ask here, so the banner that says "ready" and the phone that buzzes
 * "ready" can never disagree about when tomorrow starts.
 *
 * THE DAY IS THE PHONE'S. A snack is due once the phone's calendar has turned
 * past the day of the last one — local midnight — and at least
 * SNACK.MIN_GAP_MS after it, which is what keeps an offset flipped between two
 * claims from minting a midnight between them.
 *
 * A DAY IS A DAY THE PLAYER CAME: `weeks * WEEK + step`. The row has counted
 * that since the first Snack Time (2026-10-02), which is why the box needed no
 * migration: the golden box is the old seventh day, and the gifts fall on the
 * days a week closes.
 */
import { SNACK } from '@config/tuning';

const MINUTE = 60_000;
const DAY = 24 * MINUTE * 60;

/** Days in a round; the last one is the golden box. */
export const SNACK_DAYS = SNACK.WEEK;

export type BoxTier = 'common' | 'rare' | 'epic' | 'jackpot';
export const BOX_TIERS: BoxTier[] = ['common', 'rare', 'epic', 'jackpot'];

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

/** The days a player has taken a snack on, all weeks together. */
export function snackDays(row: SnackRow | null): number {
  const r = row ?? SNACK_START;
  return r.weeks * SNACK.WEEK + r.step;
}

/** Is the box waiting on `row` the golden one? */
export function isGolden(row: SnackRow | null): boolean {
  return (row ?? SNACK_START).step >= SNACK.WEEK - 1;
}

/** The decorations a player owns: one per week finished, in SNACK.GIFTS order. */
export function giftsOwned(row: SnackRow | null): number {
  return Math.min((row ?? SNACK_START).weeks, SNACK.GIFTS.length);
}

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

// ── The box ──────────────────────────────────────────────────────────────────

/**
 * What a box gives, as the screen and the grant both read it.
 *
 * `kind` is `carrots`, a bag item (`water`, `lightning`, `energy`…), a pack
 * (`magic_hat`, `lucky_foot`) or a skin kind (`skin_carrot`).
 */
export interface BoxPrize {
  kind: string;
  qty: number;
}

/** The contents of each tier, carrots resolved for `level`. */
export function boxContents(level: number): Record<BoxTier, BoxPrize[]> {
  const carrots = SNACK.BOX.CARROTS_PER_LEVEL * Math.max(1, level);
  return {
    common: SNACK.BOX.COMMON.map((p) => ({ kind: p.kind, qty: p.kind === 'carrots' ? carrots : p.qty })),
    rare: SNACK.BOX.RARE.map((p) => ({ kind: p.kind, qty: p.qty })),
    epic: SNACK.BOX.EPIC.map((p) => ({ kind: p.kind, qty: p.qty })),
    jackpot: SNACK.BOX.JACKPOT_SKINS.map((kind) => ({ kind, qty: 1 })),
  };
}

export function boxOdds(golden: boolean): Record<BoxTier, number> {
  return { ...(golden ? SNACK.BOX.GOLDEN_ODDS : SNACK.BOX.ODDS) };
}

/**
 * DRAW a box. `rand` is a [0, 1) source (Math.random on the server, seeded in
 * the tests). The jackpot is a skin the player does not own yet — the draw
 * among those left — and a pile of carrots for one who owns them all.
 */
export function drawBox(
  golden: boolean,
  level: number,
  ownedSkins: readonly string[],
  rand: () => number,
): { tier: BoxTier; prize: BoxPrize } {
  const odds = boxOdds(golden);
  const total = BOX_TIERS.reduce((n, t) => n + odds[t], 0);
  let pick = rand() * total;
  let tier: BoxTier = 'common';
  for (const t of BOX_TIERS) {
    if (odds[t] <= 0) continue;
    tier = t;
    pick -= odds[t];
    if (pick < 0) break;
  }
  const contents = boxContents(level);
  let options = contents[tier];
  if (tier === 'jackpot') {
    options = options.filter((p) => !ownedSkins.includes(p.kind));
    if (options.length === 0) return { tier, prize: { kind: 'carrots', qty: SNACK.BOX.JACKPOT_CARROTS } };
  }
  const prize = options[Math.min(options.length - 1, Math.floor(rand() * options.length))];
  return { tier, prize: { ...prize } };
}

/** The items a prize puts in the bag (a pack opened into its contents). */
export function prizeItems(prize: BoxPrize): SnackItem[] {
  if (isSnackPack(prize.kind)) return SNACK.PACKS[prize.kind].map((it) => ({ kind: it.kind, qty: it.qty }));
  return [];
}

// ── The bonus of the day ─────────────────────────────────────────────────────

/** What a buffed run banks on top of its carrots. */
export function buffBonus(carrots: number, level: number): number {
  if (carrots <= 0) return 0;
  return Math.min(Math.round(carrots * (SNACK.BUFF.MULT - 1)), SNACK.BUFF.MAX_BONUS_PER_LEVEL * Math.max(1, level));
}

/**
 * Is the bonus of the day live for a run banking `now`? Opened today (before
 * the phone's next midnight after the claim) and not yet spent: `spent` says
 * whether a run that paid anything has banked since the claim.
 */
export function buffLive(row: SnackRow | null, now: number, spent: boolean): boolean {
  const at = row?.claimedAt?.getTime();
  if (at === undefined || spent) return false;
  return now < nextLocalMidnight(at, row!.tzOffsetMin);
}

export interface BuffView {
  /** `idle` — no box opened today; `active` — waiting for a run; `used`. */
  state: 'idle' | 'active' | 'used';
  /** What it paid, once used. */
  bonus: number;
  /** The most it can pay at this level. */
  max: number;
  mult: number;
}

/** `firstRun`: the carrots of the first paying run banked since the claim, if any. */
export function buffView(row: SnackRow | null, now: number, level: number, firstRun: number | null): BuffView {
  const base = { bonus: 0, max: SNACK.BUFF.MAX_BONUS_PER_LEVEL * Math.max(1, level), mult: SNACK.BUFF.MULT };
  const at = row?.claimedAt?.getTime();
  if (at === undefined || now >= nextLocalMidnight(at, row!.tzOffsetMin)) return { state: 'idle', ...base };
  if (firstRun !== null) return { state: 'used', ...base, bonus: buffBonus(firstRun, level) };
  return { state: 'active', ...base };
}

// ── The view ─────────────────────────────────────────────────────────────────

export interface SnackGift {
  /** The day it comes on (7, 14, 21, 28). */
  day: number;
  kind: string;
  got: boolean;
}

/** Everything the screen and the banner need, in one read. */
export interface SnackView {
  /** The day to take next — the one waiting, or the one coming. 1-based. */
  day: number;
  /** Days taken, all weeks together. */
  days: number;
  ready: boolean;
  /** When it can be taken; null while it is ready. */
  readyAt: string | null;
  /** Is the box waiting (or coming) the golden one? */
  golden: boolean;
  /** Days until the next golden box, 0 when it is this one. */
  goldenIn: number;
  odds: Record<BoxTier, number>;
  goldenOdds: Record<BoxTier, number>;
  box: Record<BoxTier, BoxPrize[]>;
  /** The jackpot when every skin is owned. */
  jackpotCarrots: number;
  gifts: SnackGift[];
  buff: BuffView;
  /** Taken in this week so far (0 … 6) — the ticks on the banner. */
  taken: number;
  weeks: number;
}

export function snackView(
  row: SnackRow | null,
  now: number,
  tzOffsetMin: number,
  level = 1,
  firstRun: number | null = null,
): SnackView {
  const r = row ?? SNACK_START;
  const ready = snackReady(r, now, tzOffsetMin);
  const days = snackDays(r);
  const golden = isGolden(r);
  return {
    day: days + 1,
    days,
    ready,
    readyAt: ready ? null : new Date(snackReadyAt(r, tzOffsetMin)).toISOString(),
    golden,
    goldenIn: SNACK.WEEK - 1 - r.step,
    odds: boxOdds(false),
    goldenOdds: boxOdds(true),
    box: boxContents(level),
    jackpotCarrots: SNACK.BOX.JACKPOT_CARROTS,
    gifts: SNACK.GIFTS.map((kind, i) => ({ day: SNACK.WEEK * (i + 1), kind, got: r.weeks > i })),
    buff: buffView(row, now, level, firstRun),
    taken: r.step,
    weeks: r.weeks,
  };
}

// ── The claim ────────────────────────────────────────────────────────────────

export type SnackClaim =
  | {
    ok: true;
    next: SnackRow;
    /** The day just taken, 1-based. */
    day: number;
    golden: boolean;
    tier: BoxTier;
    prize: BoxPrize;
    /** The decoration this claim unlocked (a week closed), or null. */
    gift: string | null;
  }
  | { ok: false; error: 'not_ready' };

/**
 * Take today's box: what it gives, and the row after it. The week closes on
 * the golden box, and a closed week within SNACK.GIFTS brings its decoration.
 */
export function claimSnack(
  row: SnackRow | null,
  now: number,
  tzOffsetMin: number,
  level = 1,
  ownedSkins: readonly string[] = [],
  rand: () => number = Math.random,
): SnackClaim {
  const r = row ?? SNACK_START;
  if (!snackReady(r, now, tzOffsetMin)) return { ok: false, error: 'not_ready' };
  const golden = isGolden(r);
  const next: SnackRow = {
    step: golden ? 0 : r.step + 1,
    claimedAt: new Date(now),
    tzOffsetMin,
    weeks: r.weeks + (golden ? 1 : 0),
  };
  const { tier, prize } = drawBox(golden, level, ownedSkins, rand);
  const gift = golden && r.weeks < SNACK.GIFTS.length ? SNACK.GIFTS[r.weeks] : null;
  return { ok: true, next, day: snackDays(r) + 1, golden, tier, prize, gift };
}
