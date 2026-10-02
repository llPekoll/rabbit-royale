/**
 * Snack Time: the daily gift's rules (lib/game/snack) and its push
 * (lib/notify/schedule). Pure — a fixed clock, no database.
 */
import { describe, expect, it } from 'vitest';
import { GARDEN, SNACK } from '@config/tuning';
import {
  SNACK_DAYS, SNACK_START, claimSnack, nextLocalMidnight, snackReady, snackReadyAt, snackView,
  type SnackRow,
} from '@/lib/game/snack';
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

describe('claiming', () => {
  it('pays the carrots of each of the first six days, in order', () => {
    let row: SnackRow | null = null;
    let now = paris(10);
    for (let d = 0; d < SNACK_DAYS - 1; d++) {
      const c = claimSnack(row, now, PARIS);
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      expect(c.day).toBe(d + 1);
      expect(c.carrots).toBe(SNACK.CARROTS[d]);
      expect(c.items).toEqual([]);
      row = c.next;
      now += 24 * H;
    }
    expect(row!.step).toBe(SNACK_DAYS - 1);
  });

  it('refuses a second snack the same day', () => {
    const c = claimSnack(taken(paris(9)), paris(21), PARIS);
    expect(c).toEqual({ ok: false, error: 'not_ready' });
  });

  it('asks for a pack on the seventh day, then starts the week over', () => {
    const row = taken(paris(10), SNACK_DAYS - 1);
    const next = paris(10, 0, 3);
    expect(claimSnack(row, next, PARIS)).toEqual({ ok: false, error: 'pick_a_pack' });
    expect(claimSnack(row, next, PARIS, 'nonsense')).toEqual({ ok: false, error: 'pick_a_pack' });
    const c = claimSnack(row, next, PARIS, 'magic_hat');
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.pack).toBe('magic_hat');
    expect(c.carrots).toBe(0);
    expect(c.items).toEqual(SNACK.PACKS.magic_hat);
    expect(c.next.step).toBe(0);
    expect(c.next.weeks).toBe(1);
  });

  it('does not reset a missed day: the streak waits', () => {
    const row = taken(paris(10), 3);
    const c = claimSnack(row, paris(10, 0, 9), PARIS);
    expect(c.ok && c.day).toBe(4);
  });
});

describe('the view', () => {
  it('says the day, the ticks and when the next one comes', () => {
    const v = snackView(taken(paris(10), 2), paris(15), PARIS);
    expect(v.day).toBe(3);
    expect(v.taken).toBe(2);
    expect(v.ready).toBe(false);
    expect(v.readyAt).toBe(new Date(paris(0, 0, 3)).toISOString());
    expect(v.week).toHaveLength(SNACK_DAYS);
    expect(v.week[SNACK_DAYS - 1].packs).not.toBeNull();
    expect(snackView(null, paris(15), PARIS)).toMatchObject({ day: 1, ready: true, readyAt: null, taken: 0 });
  });

  it('starts from SNACK_START without a row', () => {
    expect(snackView(null, 0, 0).day).toBe(SNACK_START.step + 1);
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

  it('is the pack on the seventh day', () => {
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
    expect(pushText('snack_ready', 'fr', { n: 4 }).title).toContain('4/7');
    for (const l of ['en', 'pt-BR', 'vi', 'zh']) {
      expect(pushText('snack_ready', l, { n: 2 }).title).toContain('2/7');
      expect(pushText('snack_pack', l).body).toContain('Magic Hat');
    }
  });
});
