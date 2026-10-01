/**
 * Push notifications: the timing rules (lib/notify/schedule), the locale
 * fallback (lib/notify/messages) and the FCM message shape (lib/notify/fcm).
 * All pure — no database, no FCM, a fixed clock.
 */
import { describe, expect, it } from 'vitest';
import { GARDEN, GARDEN_BOOST, OUT_OF_RUN_ENERGY, regenPerHour } from '@config/tuning';
import { currentEnergy, gardenYield } from '@/lib/game/regen';
import {
  PUSH, clampTzOffset, countPush, decideSweepPush, energyFullAt, gardenReadyAt,
  idleStageFor, isQuietHours, localHour, nightAhead, underDailyCap, type SweepInput, type SweepState,
} from '@/lib/notify/schedule';
import { PUSH_PATH, pushText, resolveLocale } from '@/lib/notify/messages';
import { buildFcmMessage, isDeadTokenError, parseServiceAccount } from '@/lib/notify/fcm';

const H = 3_600_000;
const M = 60_000;
/** 2026-09-30 12:00 UTC — noon in London, 14:00 in Paris. */
const NOON = Date.UTC(2026, 8, 30, 12, 0, 0);

describe('energyFullAt', () => {
  it('is when currentEnergy first reads the cap', () => {
    const row = { energy: 60, energyUpdatedAt: new Date(NOON), burrowLevel: 1 };
    const at = energyFullAt(row)!.getTime();
    const rate = regenPerHour(1);
    expect(at).toBe(NOON + ((OUT_OF_RUN_ENERGY.MAX - 60) / rate) * H);
    expect(currentEnergy(row, at)).toBe(OUT_OF_RUN_ENERGY.MAX);
    expect(currentEnergy(row, at - M)).toBeLessThan(OUT_OF_RUN_ENERGY.MAX);
  });

  it('refills faster on a deeper burrow', () => {
    const base = { energy: 0, energyUpdatedAt: new Date(NOON) };
    expect(energyFullAt({ ...base, burrowLevel: 5 })!.getTime())
      .toBeLessThan(energyFullAt({ ...base, burrowLevel: 1 })!.getTime());
  });

  it('is null when the tank was already full at its stamp', () => {
    expect(energyFullAt({ energy: OUT_OF_RUN_ENERGY.MAX, energyUpdatedAt: new Date(NOON), burrowLevel: 1 })).toBeNull();
  });
});

describe('gardenReadyAt', () => {
  const collected = new Date(NOON);
  const plain = NOON + GARDEN.CAP_HOURS * H;
  const fed = plain + GARDEN_BOOST.FERTILISER.EXTRA_CAP_HOURS * H;
  const row = (fertilisedUntil: number | null) => ({
    gardenCollectedAt: collected, fertilisedUntil: fertilisedUntil ? new Date(fertilisedUntil) : null, burrowLevel: 1,
  });

  it('is CAP_HOURS after the harvest, unfed', () => {
    expect(gardenReadyAt(row(null)).getTime()).toBe(plain);
    // and gardenYield agrees: it has stopped growing there.
    expect(gardenYield(row(null), plain + H)).toBe(gardenYield(row(null), plain));
    expect(gardenYield(row(null), plain - H)).toBeLessThan(gardenYield(row(null), plain));
  });

  it('ignores a feeding that ran out before the plain cap', () => {
    expect(gardenReadyAt(row(plain - H)).getTime()).toBe(plain);
  });

  it('waits for the fed cap when the feeding outlasts it', () => {
    expect(gardenReadyAt(row(fed + 10 * H)).getTime()).toBe(fed);
  });

  it('is the instant the feeding lapses, when that falls between the two caps', () => {
    const lapse = plain + 2 * H;
    expect(gardenReadyAt(row(lapse)).getTime()).toBe(lapse);
  });
});

describe('quiet hours', () => {
  it('reads the device clock, minutes east of UTC', () => {
    expect(localHour(NOON, 0)).toBe(12);
    expect(localHour(NOON, 120)).toBe(14);   // Paris, summer
    expect(localHour(NOON, -300)).toBe(7);   // New York-ish
    expect(localHour(NOON, 7 * 60)).toBe(19); // Ho Chi Minh
    expect(localHour(NOON, 12 * 60 + 30)).toBe(0);
  });

  it('is 22:00 to 09:00', () => {
    const at = (h: number) => Date.UTC(2026, 8, 30, h, 0, 0);
    expect(isQuietHours(at(21) + 59 * M, 0)).toBe(false);
    expect(isQuietHours(at(22), 0)).toBe(true);
    expect(isQuietHours(at(3), 0)).toBe(true);
    expect(isQuietHours(at(8) + 59 * M, 0)).toBe(true);
    expect(isQuietHours(at(9), 0)).toBe(false);
    // noon UTC is 20:00 in Beijing (awake) and 22:00 in Sydney summer-ish (+600)
    expect(isQuietHours(NOON, 480)).toBe(false);
    expect(isQuietHours(NOON, 600)).toBe(true);
  });

  it('finds the night ahead, or the one still running', () => {
    const at = (d: number, h: number) => Date.UTC(2026, 8, d, h, 0, 0);
    // 20:00 UTC → tonight 22:00 to tomorrow 09:00
    expect(nightAhead(at(30, 20), 0)).toEqual({ from: at(30, 22), until: at(31, 9) });
    // 03:00 → the night that began yesterday at 22:00
    expect(nightAhead(at(30, 3), 0)).toEqual({ from: at(29, 22), until: at(30, 9) });
    // 13:00 UTC is 20:00 at +7: 22:00 there is 15:00 UTC
    expect(nightAhead(at(30, 13), 420)).toEqual({ from: at(30, 15), until: at(31, 2) });
  });

  it('clamps offsets that are not on Earth', () => {
    expect(clampTzOffset(120)).toBe(120);
    expect(clampTzOffset('nope')).toBe(0);
    expect(clampTzOffset(99999)).toBe(14 * 60);
    expect(clampTzOffset(-99999)).toBe(-12 * 60);
  });
});

describe('daily cap', () => {
  it('lets DAILY_CAP through in a window, then waits for the window to close', () => {
    let w = { windowStart: null as Date | null, windowCount: 0 };
    for (let i = 0; i < PUSH.DAILY_CAP; i++) {
      expect(underDailyCap(w, NOON + i * H)).toBe(true);
      w = countPush(w, NOON + i * H);
    }
    expect(w.windowCount).toBe(PUSH.DAILY_CAP);
    expect(underDailyCap(w, NOON + 23 * H)).toBe(false);
    expect(underDailyCap(w, NOON + 24 * H)).toBe(true);
    expect(countPush(w, NOON + 24 * H)).toEqual({ windowStart: new Date(NOON + 24 * H), windowCount: 1 });
  });
});

describe('idle stages', () => {
  it('owes one reminder at 24 h and a second at 72 h', () => {
    expect(idleStageFor(23 * H)).toBe(0);
    expect(idleStageFor(24 * H)).toBe(1);
    expect(idleStageFor(71 * H)).toBe(1);
    expect(idleStageFor(72 * H)).toBe(2);
    expect(idleStageFor(500 * H)).toBe(2);
  });
});

describe('decideSweepPush', () => {
  const blank: SweepState = {
    energyFor: null, gardenFor: null, idleFor: null, idleStage: 0, onlineAt: null,
    lastPushAt: null, windowStart: null, windowCount: 0,
  };
  /** A player last seen `awayH` hours before `now`, garden and tank stamped then. */
  function input(now: number, awayH: number, over: Partial<SweepInput> = {}): SweepInput {
    const seen = new Date(now - awayH * H);
    return {
      now,
      online: false,
      tzOffsetMin: 0,
      player: {
        energy: OUT_OF_RUN_ENERGY.MAX, energyUpdatedAt: seen, burrowLevel: 1,
        gardenCollectedAt: seen, fertilisedUntil: null, lastSeenAt: seen,
      },
      state: blank,
      ...over,
    };
  }

  it('never pushes someone at the keyboard, and notes they were here', () => {
    const d = decideSweepPush(input(NOON, 30, { online: true }));
    expect(d.kind).toBeNull();
    expect(d.patch.onlineAt?.getTime()).toBe(NOON);
  });

  it('tells a full garden once per harvest', () => {
    const base = input(NOON, GARDEN.CAP_HOURS + 1);
    const d = decideSweepPush(base);
    expect(d.kind).toBe('garden_ready');
    expect(d.patch.gardenFor).toEqual(base.player.gardenCollectedAt);
    expect(d.patch.windowCount).toBe(1);
    // Recorded: the same harvest is not told twice, even after the gap.
    const later = decideSweepPush({ ...base, now: NOON + 3 * H, state: { ...blank, ...d.patch } as SweepState });
    expect(later.kind).not.toBe('garden_ready');
  });

  it('tells a full tank once per refill, only if they have been gone AWAY_MIN_MS', () => {
    const now = NOON;
    const seen = new Date(now - 11 * H);
    const player = {
      energy: 0, energyUpdatedAt: seen, burrowLevel: 1,
      // harvested a minute ago → garden not due
      gardenCollectedAt: new Date(now - M), fertilisedUntil: null, lastSeenAt: seen,
    };
    const d = decideSweepPush({ ...input(now, 11), player });
    expect(d.kind).toBe('energy_full');
    expect(d.patch.energyFor).toEqual(seen);
    const again = decideSweepPush({ ...input(now + 3 * H, 14), player, state: { ...blank, ...d.patch } as SweepState });
    expect(again.kind).toBeNull();
  });

  it('says nothing about a tank that filled while they were still here', () => {
    const now = NOON;
    const player = {
      energy: 0, energyUpdatedAt: new Date(now - 20 * H), burrowLevel: 1,
      gardenCollectedAt: new Date(now - M), fertilisedUntil: null,
      lastSeenAt: new Date(now - 2 * H), // full at -10 h, seen at -2 h
    };
    expect(decideSweepPush({ ...input(now, 2), player }).kind).toBeNull();
  });

  it('waits out quiet hours, then sends', () => {
    const night = Date.UTC(2026, 8, 30, 23, 0, 0);
    const morning = Date.UTC(2026, 9, 1, 9, 5, 0);
    expect(decideSweepPush(input(night, GARDEN.CAP_HOURS + 1)).kind).toBeNull();
    // still due at 09:05 (same harvest, garden full since 11 h ago)
    const d = decideSweepPush({
      ...input(night, GARDEN.CAP_HOURS + 1),
      now: morning,
    });
    expect(d.kind).toBe('garden_ready');
  });

  it('respects the gap and the daily cap', () => {
    const base = input(NOON, GARDEN.CAP_HOURS + 1);
    expect(decideSweepPush({ ...base, state: { ...blank, lastPushAt: new Date(NOON - 30 * M) } }).kind).toBeNull();
    expect(decideSweepPush({
      ...base,
      state: { ...blank, windowStart: new Date(NOON - 5 * H), windowCount: PUSH.DAILY_CAP },
    }).kind).toBeNull();
  });

  it('reminds at 24 h, again at 72 h, then stops until they come back', () => {
    // Garden and tank stamped long ago → stale, only the reminder is due.
    const seen = NOON - 25 * H;
    const player = {
      energy: OUT_OF_RUN_ENERGY.MAX, energyUpdatedAt: new Date(seen), burrowLevel: 1,
      gardenCollectedAt: new Date(seen - 48 * H), fertilisedUntil: null, lastSeenAt: new Date(seen),
    };
    const first = decideSweepPush({ ...input(NOON, 25), player });
    expect(first.kind).toBe('comeback_1');
    let state = { ...blank, ...first.patch } as SweepState;

    const t2 = seen + 73 * H;
    const second = decideSweepPush({ ...input(t2, 73), player, state });
    expect(second.kind).toBe('comeback_2');
    state = { ...state, ...second.patch } as SweepState;

    expect(decideSweepPush({ ...input(seen + 200 * H, 200), player, state }).kind).toBeNull();

    // They come back: the reminders re-arm.
    const back = { ...player, lastSeenAt: new Date(seen + 201 * H) };
    const reset = decideSweepPush({ ...input(seen + 202 * H, 1), player: back, state });
    expect(reset.patch.idleStage).toBe(0);
  });

  it('reminds someone gone a week once, not twice in a row', () => {
    const seen = NOON - 7 * 24 * H;
    const player = {
      energy: OUT_OF_RUN_ENERGY.MAX, energyUpdatedAt: new Date(seen), burrowLevel: 1,
      gardenCollectedAt: new Date(seen), fertilisedUntil: null, lastSeenAt: new Date(seen),
    };
    const d = decideSweepPush({ ...input(NOON, 168), player });
    expect(d.kind).toBe('comeback_2');
    expect(d.patch.idleStage).toBe(2);
  });

  describe('a tank that fills overnight', () => {
    // 2026-09-30 on the Seeker (+7): a run ends at 20:16 with 188/300 at
    // burrow 3, the tank tops out at 23:46 — inside quiet hours.
    const tz = 420;
    const left = Date.UTC(2026, 8, 30, 13, 16, 0);
    const player = {
      energy: 188, energyUpdatedAt: new Date(left), burrowLevel: 3,
      gardenCollectedAt: new Date(left), fertilisedUntil: null, lastSeenAt: new Date(left),
    };
    const at = (localH: number, localM = 0) => Date.UTC(2026, 8, 30, localH - 7, localM, 0);
    const ask = (now: number, state = blank) => decideSweepPush({ now, online: false, tzOffsetMin: tz, player, state });

    it('is told in the evening, once they have been gone AWAY_MIN_MS', () => {
      expect(energyFullAt(player)!.getTime()).toBeGreaterThan(at(22));
      expect(ask(at(20, 25)).kind).toBeNull(); // gone 9 min
      const d = ask(at(20, 35));
      expect(d.kind).toBe('energy_overnight');
      expect(d.patch.energyFor).toEqual(player.energyUpdatedAt);
      // …and the morning does not say it again.
      const morning = Date.UTC(2026, 9, 1, 2, 5, 0); // 09:05 at +7
      expect(ask(morning, { ...blank, ...d.patch } as SweepState).kind).not.toMatch(/^energy/);
    });

    it('waits for the evening', () => {
      const early = { ...player, lastSeenAt: new Date(at(17)), energyUpdatedAt: new Date(at(17)), energy: 0 };
      expect(decideSweepPush({ now: at(19, 55), online: false, tzOffsetMin: tz, player: early, state: blank }).kind).toBeNull();
    });

    it('leaves a tank that fills before the quiet to energy_full', () => {
      const nearly = { ...player, energy: 290 }; // full ~20:35
      const d = decideSweepPush({ now: at(21, 20), online: false, tzOffsetMin: tz, player: nearly, state: blank });
      expect(d.kind).toBe('energy_full');
    });
  });

  it('counts a sweep that saw them online as being seen', () => {
    const player = input(NOON, 30).player;
    const d = decideSweepPush({
      ...input(NOON, 30),
      player: { ...player, gardenCollectedAt: new Date(NOON - M) },
      state: { ...blank, onlineAt: new Date(NOON - 10 * M) },
    });
    expect(d.kind).toBeNull();
  });
});

describe('locale', () => {
  it('maps every spelling to one of the five, English otherwise', () => {
    expect(resolveLocale('fr')).toBe('fr');
    expect(resolveLocale('fr_FR')).toBe('fr');
    expect(resolveLocale('FR-ca')).toBe('fr');
    expect(resolveLocale('pt_BR')).toBe('pt-BR');
    expect(resolveLocale('pt-PT')).toBe('pt-BR');
    expect(resolveLocale('vi_VN')).toBe('vi');
    expect(resolveLocale('zh-Hans-CN')).toBe('zh');
    expect(resolveLocale('zh_TW')).toBe('zh');
    expect(resolveLocale('de')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(42)).toBe('en');
  });

  it('fills the raider and the haul, and falls back to English text', () => {
    expect(pushText('raid_incoming', 'fr_FR', { name: 'Degen' }).title).toBe('Degen pille ton terrier !');
    expect(pushText('raid_looted', 'xx', { name: 'Degen', n: 120 }).title).toBe('Degen raided you: -120 🥕');
    expect(pushText('raid_held', 'pt-BR', { name: 'Kuro' }).body).toContain('Kuro');
    expect(pushText('raid_incoming', 'en', { name: 'x'.repeat(60) }).title.length).toBeLessThan(60);
  });

  it('routes raids to defend and the rest to a screen that exists', () => {
    expect(PUSH_PATH.raid_incoming).toBe('defend');
    expect(PUSH_PATH.raid_looted).toBe('burrow');
    expect(PUSH_PATH.energy_overnight).toBe('island');
    expect(pushText('energy_overnight', 'fr').title).toBe('Ton énergie sera pleine cette nuit');
    for (const p of Object.values(PUSH_PATH)) expect(['burrow', 'defend', 'island']).toContain(p);
  });
});

describe('fcm', () => {
  const account = { client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n', project_id: 'rr' };

  it('reads the service account as JSON or as base64 JSON', () => {
    const json = JSON.stringify(account);
    expect(parseServiceAccount(json)?.project_id).toBe('rr');
    expect(parseServiceAccount(Buffer.from(json).toString('base64'))?.client_email).toBe(account.client_email);
    expect(parseServiceAccount(json)?.private_key).toContain('\nabc\n');
    expect(parseServiceAccount('')).toBeNull();
    expect(parseServiceAccount('not json')).toBeNull();
    expect(parseServiceAccount('{"client_email":"x"}')).toBeNull();
  });

  it('builds the v1 message the clients expect', () => {
    const m = buildFcmMessage({
      token: 't', title: 'T', body: 'B', kind: 'raid_incoming', path: 'defend', raid: true, tag: 'raid-1', ttlSeconds: 600,
    });
    expect(m.data).toEqual({ kind: 'raid_incoming', path: 'defend' });
    expect(m.android.priority).toBe('HIGH');
    expect(m.android.notification.channel_id).toBe('rr_raid');
    expect(m.webpush.fcm_options.link).toBe('https://rabbit.rip/play/');
    const calm = buildFcmMessage({
      token: 't', title: 'T', body: 'B', kind: 'garden_ready', path: 'burrow', raid: false, tag: 'garden_ready', ttlSeconds: 60,
    });
    expect(calm.android.notification.channel_id).toBe('rr_default');
  });

  it('deletes a token only when FCM says the token is gone', () => {
    expect(isDeadTokenError(404, null)).toBe(true);
    expect(isDeadTokenError(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })).toBe(true);
    expect(isDeadTokenError(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at message.android.ttl' } })).toBe(false);
    expect(isDeadTokenError(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } })).toBe(true);
    expect(isDeadTokenError(403, { error: { status: 'PERMISSION_DENIED', details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } })).toBe(true);
    expect(isDeadTokenError(429, { error: { status: 'RESOURCE_EXHAUSTED' } })).toBe(false);
    expect(isDeadTokenError(500, null)).toBe(false);
  });
});
