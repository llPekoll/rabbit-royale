/**
 * Snack Time: the daily gift's rules (lib/game/snack) and its push
 * (lib/notify/schedule). Pure — a fixed clock, no database.
 */
import { describe, expect, it } from 'vitest';
import { GARDEN, SNACK } from '@config/tuning';
import {
  SNACK_DAYS, SNACK_START, boxOdds, buffBonus, buffLive, buffView, claimSnack, drawBox, giftsOwned,
  nextLocalMidnight, snackDays, snackReady, snackReadyAt, snackView, type SnackRow,
} from '@/lib/game/snack';
import { burrowTerrain, editBurrow, giftHomes, withGifts } from '@/game/burrow/generate';
import { mulberry32 } from '@/lib/game/rng';
import { decideSweepPush, type SweepInput, type SweepState } from '@/lib/notify/schedule';
import { pushText } from '@/lib/notify/messages';

const H = 3_600_000;
/** Paris in summer. */
const PARIS = 120;
/** 2026-10-02 at `h`:`m` in Paris. */
const paris = (h: number, m = 0, day = 2) => Date.UTC(2026, 9, day, h - 2, m, 0);

const taken = (at: number, step = 1, tz = PARIS): SnackRow => ({ step, claimedAt: new Date(at), tzOffsetMin: tz, weeks: 0 });

describe('the phone\'s midnight', () => {
  it('is the next local midnight, not UTC\'s', () => {
    expect(nextLocalMidnight(paris(23), PARIS)).toBe(paris(0, 0, 3));
    expect(nextLocalMidnight(paris(0, 30), PARIS)).toBe(paris(0, 0, 3));
    // Exactly at midnight, the next one.
    expect(nextLocalMidnight(paris(0, 0, 3), PARIS)).toBe(paris(0, 0, 4));
  });

  it('works west of UTC too', () => {
    const ny = -240;
    const at = Date.UTC(2026, 9, 2, 3, 0, 0); // 23:00 on the 1st in New York
    expect(nextLocalMidnight(at, ny)).toBe(Date.UTC(2026, 9, 2, 4, 0, 0));
  });
});

describe('when a snack is ready', () => {
  it('is ready at once for a player who never took one', () => {
    expect(snackReadyAt(null, PARIS)).toBe(0);
    expect(snackReady(null, paris(10), PARIS)).toBe(true);
  });

  it('turns at the phone\'s midnight', () => {
    const row = taken(paris(10));
    expect(snackReady(row, paris(23, 59), PARIS)).toBe(false);
    expect(snackReady(row, paris(0, 0, 3), PARIS)).toBe(true);
  });

  it('waits at least MIN_GAP_MS after a late snack', () => {
    const row = taken(paris(23));
    expect(snackReadyAt(row, PARIS)).toBe(paris(23) + SNACK.MIN_GAP_MS);
    expect(snackReady(row, paris(1, 0, 3), PARIS)).toBe(false);
    expect(snackReady(row, paris(5, 0, 3), PARIS)).toBe(true);
  });

  it('cannot be farmed by flipping the time zone between two taps', () => {
    const row = taken(paris(10));
    // Ten minutes later, claiming from a zone where midnight just passed.
    expect(snackReady(row, paris(10, 10), 14 * 60)).toBe(false);
  });
});

/** A random source that always answers `x`. */
const fixed = (x: number) => () => x;

describe('the box', () => {
  it('draws each tier as often as its odds say', () => {
    const rand = mulberry32(7);
    const seen = { common: 0, rare: 0, epic: 0, jackpot: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) seen[drawBox(false, 1, [], rand).tier]++;
    for (const t of ['common', 'rare', 'epic'] as const) {
      expect(seen[t] / N).toBeCloseTo(SNACK.BOX.ODDS[t] / 100, 1);
    }
    expect(seen.jackpot).toBeGreaterThan(0);
  });

  it('never draws a common in the golden box', () => {
    expect(boxOdds(true).common).toBe(0);
    expect(drawBox(true, 1, [], fixed(0)).tier).not.toBe('common');
  });

  it('pays carrots by level', () => {
    const low = drawBox(false, 1, [], fixed(0));
    const high = drawBox(false, 10, [], fixed(0));
    expect(low).toEqual({ tier: 'common', prize: { kind: 'carrots', qty: SNACK.BOX.CARROTS_PER_LEVEL } });
    expect(high.prize.qty).toBe(SNACK.BOX.CARROTS_PER_LEVEL * 10);
  });

  it('gives a skin not owned yet, and carrots to one who owns them all', () => {
    const top = fixed(0.9999);
    const first = drawBox(false, 1, [], top);
    expect(first.tier).toBe('jackpot');
    expect(SNACK.BOX.JACKPOT_SKINS).toContain(first.prize.kind);
    expect(drawBox(false, 1, ['skin_solana'], top).prize.kind).toBe('skin_carrot');
    expect(drawBox(false, 1, [...SNACK.BOX.JACKPOT_SKINS], top).prize)
      .toEqual({ kind: 'carrots', qty: SNACK.BOX.JACKPOT_CARROTS });
  });
});

describe('claiming', () => {
  it('counts the days and makes every seventh box golden', () => {
    let row: SnackRow | null = null;
    let now = paris(10);
    for (let d = 1; d <= 2 * SNACK_DAYS; d++) {
      const c = claimSnack(row, now, PARIS, 3, [], fixed(0.5));
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      expect(c.day).toBe(d);
      expect(c.golden).toBe(d % SNACK_DAYS === 0);
      row = c.next;
      now += 24 * H;
    }
    expect(snackDays(row)).toBe(2 * SNACK_DAYS);
  });

  it('brings a gift when a week closes, until the gifts run out', () => {
    const golden = (weeks: number): SnackRow => ({ ...taken(paris(10), SNACK_DAYS - 1), weeks });
    const next = paris(10, 0, 3);
    const first = claimSnack(golden(0), next, PARIS);
    expect(first.ok && first.gift).toBe(SNACK.GIFTS[0]);
    const last = claimSnack(golden(SNACK.GIFTS.length - 1), next, PARIS);
    expect(last.ok && last.gift).toBe(SNACK.GIFTS[SNACK.GIFTS.length - 1]);
    const after = claimSnack(golden(SNACK.GIFTS.length), next, PARIS);
    expect(after.ok && after.gift).toBeNull();
    expect(first.ok && first.next).toMatchObject({ step: 0, weeks: 1 });
    expect(giftsOwned(first.ok ? first.next : null)).toBe(1);
  });

  it('refuses a second box the same day', () => {
    const c = claimSnack(taken(paris(9)), paris(21), PARIS);
    expect(c).toEqual({ ok: false, error: 'not_ready' });
  });

  it('does not reset a missed day: the streak waits', () => {
    const row = taken(paris(10), 3);
    const c = claimSnack(row, paris(10, 0, 9), PARIS);
    expect(c.ok && c.day).toBe(4);
  });
});

describe('the bonus of the day', () => {
  it('doubles the first paying run, capped by level', () => {
    expect(buffBonus(120, 1)).toBe(Math.min(120, SNACK.BUFF.MAX_BONUS_PER_LEVEL));
    expect(buffBonus(5000, 2)).toBe(2 * SNACK.BUFF.MAX_BONUS_PER_LEVEL);
    expect(buffBonus(0, 5)).toBe(0);
  });

  it('lives until the phone\'s midnight, and only once', () => {
    const row = taken(paris(10));
    expect(buffLive(row, paris(23), false)).toBe(true);
    expect(buffLive(row, paris(23), true)).toBe(false);
    expect(buffLive(row, paris(0, 30, 3), false)).toBe(false);
    expect(buffLive(null, paris(12), false)).toBe(false);
  });

  it('reads idle, active, then used with what it paid', () => {
    const row = taken(paris(10));
    expect(buffView(null, paris(12), 1, null).state).toBe('idle');
    expect(buffView(row, paris(12), 1, null).state).toBe('active');
    expect(buffView(row, paris(12), 1, 40)).toMatchObject({ state: 'used', bonus: 40 });
    expect(buffView(row, paris(0, 30, 3), 1, 80).state).toBe('idle');
  });
});

describe('the view', () => {
  it('says the day, the golden box, the gifts and when the next one comes', () => {
    const v = snackView({ ...taken(paris(10), 2), weeks: 1 }, paris(15), PARIS, 4);
    expect(v.day).toBe(SNACK_DAYS + 3);
    expect(v.days).toBe(SNACK_DAYS + 2);
    expect(v.taken).toBe(2);
    expect(v.ready).toBe(false);
    expect(v.goldenIn).toBe(SNACK_DAYS - 3);
    expect(v.readyAt).toBe(new Date(paris(0, 0, 3)).toISOString());
    expect(v.box.common.find((p) => p.kind === 'carrots')?.qty).toBe(4 * SNACK.BOX.CARROTS_PER_LEVEL);
    expect(v.gifts.map((g) => g.got)).toEqual(SNACK.GIFTS.map((_, i) => i < 1));
    expect(v.gifts[0].day).toBe(SNACK_DAYS);
    expect(snackView(null, paris(15), PARIS)).toMatchObject({ day: 1, ready: true, readyAt: null, taken: 0 });
  });

  it('starts from SNACK_START without a row', () => {
    expect(snackView(null, 0, 0).day).toBe(SNACK_START.step + 1);
  });
});

describe('the gifts in the burrow', () => {
  const base = burrowTerrain('snack-gifts-test');

  it('have a home each, on bare ground, the same every time', () => {
    const homes = giftHomes(base);
    expect(homes).toHaveLength(SNACK.GIFTS.length);
    expect(new Set(homes).size).toBe(homes.length);
    for (const t of homes) expect(base.cells[t]).toBe('ground');
    expect(giftHomes(burrowTerrain('snack-gifts-test'))).toEqual(homes);
  });

  it('stand in the edited burrow without moving the crossing', () => {
    const out = editBurrow(base, { gifts: 2 });
    expect(typeof out).not.toBe('string');
    if (typeof out === 'string') return;
    expect(out.placements.filter((p) => p.kind === 'gift')).toHaveLength(2);
    expect(out.crossing).toBe(base.crossing);
  });

  it('move like a tree, and are refused under the house', () => {
    const [home] = giftHomes(base);
    const free = base.cells.findIndex((c, t) => c === 'ground' && t !== home
      && !base.placements.some((p) => p.y * 19 + p.x === t) && !giftHomes(base).includes(t));
    expect(typeof editBurrow(base, { gifts: 1, moves: [[home, free]] })).not.toBe('string');
    expect(editBurrow(base, { gifts: 1, moves: [[home, base.house!]] })).toBe('cells_overlap');
  });

  it('find a free cell when something already covers their home', () => {
    const [home] = giftHomes(base);
    const tree = base.placements.find((p) => p.kind === 'tree')!;
    const covered = { moves: [[tree.y * 19 + tree.x, home] as [number, number]] };
    expect(editBurrow(base, { ...covered, gifts: 1 })).toBe('cells_overlap');
    const fixed = withGifts(base, covered, 1);
    expect(fixed).not.toBeNull();
    expect(typeof editBurrow(base, fixed!)).not.toBe('string');
    expect(fixed!.gifts).toBe(1);
  });
});

describe('the snack push', () => {
  const blank: SweepState = {
    energyFor: null, gardenFor: null, idleFor: null, idleStage: 0, onlineAt: null,
    lastPushAt: null, windowStart: null, windowCount: 0, snackFor: null,
  };
  /** Played until `seenAt`, garden just picked, tank empty: only the snack can be due. */
  function input(now: number, seenAt: number, snack: SnackRow | null, state = blank): SweepInput {
    const seen = new Date(seenAt);
    return {
      now, online: false, tzOffsetMin: PARIS, snack, state,
      player: {
        energy: 0, energyUpdatedAt: new Date(now), burrowLevel: 1,
        gardenCollectedAt: new Date(now), fertilisedUntil: null, lastSeenAt: seen,
      },
    };
  }

  it('waits for the morning, then says which day', () => {
    const snack = taken(paris(20), 3);
    expect(decideSweepPush(input(paris(0, 30, 3), paris(21), snack)).kind).toBeNull(); // quiet hours
    const d = decideSweepPush(input(paris(9, 5, 3), paris(21), snack));
    expect(d.kind).toBe('snack_ready');
    expect(d.patch.snackFor).toEqual(snack.claimedAt);
    // Once per snack.
    const again = decideSweepPush(input(paris(12, 0, 3), paris(21), snack, { ...blank, ...d.patch } as SweepState));
    expect(again.kind).not.toBe('snack_ready');
  });

  it('is the golden box on the seventh day', () => {
    const d = decideSweepPush(input(paris(9, 5, 3), paris(21), taken(paris(20), SNACK_DAYS - 1)));
    expect(d.kind).toBe('snack_pack');
  });

  it('says nothing to a player who came back after midnight', () => {
    const snack = taken(paris(20), 3);
    expect(decideSweepPush(input(paris(10, 0, 3), paris(8, 0, 3), snack)).kind).toBeNull();
  });

  it('uses up the 24 h reminder it stands in for', () => {
    const snack = taken(paris(9), 2);
    // Left at 9:00 on the 2nd; at 9:05 on the 3rd both are due.
    const d = decideSweepPush(input(paris(9, 5, 3), paris(9), snack));
    expect(d.kind).toBe('snack_ready');
    expect(d.patch.idleStage).toBe(1);
  });

  it('comes after a full garden', () => {
    const snack = taken(paris(20), 3);
    const i = input(paris(9, 5, 3), paris(21), snack);
    // Picked as they left at 21:00: full at 9:00, while they were away.
    i.player.gardenCollectedAt = new Date(paris(21) + 12 * H - GARDEN.CAP_HOURS * H);
    expect(decideSweepPush(i).kind).toBe('garden_ready');
  });

  it('reads the day in five languages', () => {
    expect(pushText('snack_ready', 'fr', { n: 13 }).title).toContain('13');
    for (const l of ['en', 'pt-BR', 'vi', 'zh']) {
      expect(pushText('snack_ready', l, { n: 2 }).title).toContain('2');
      expect(pushText('snack_pack', l, { n: 7 }).title).toContain('7');
    }
  });
});
