/**
 * The quest board's rules.
 *
 * A quest is recomputed from the player's counters on every read and only the
 * CLAIM is stored, so the properties worth pinning are the ones a playtest
 * cannot see: that the arc is in teaching order, that a reward earned out of
 * order is never hidden behind a stuck ask, and that the words stay short
 * enough to be read on a phone at a glance.
 */
import { describe, expect, it } from 'vitest';
import {
  QUESTS_ARC, QUEST_MARK, codexMark, isQuestDone, questBoard, questById, type QuestFacts,
} from '../src/config/quests';
import { ISLAND_TIERS, QUESTS } from '../config/tuning';
import { LORE } from '../src/config/lore';

const fresh = (over: Partial<QuestFacts> = {}): QuestFacts => ({
  runsPlayed: 0,
  tilesDug: 0,
  lifetimeCarrots: 0,
  harvests: 0,
  trapsPlaced: 0,
  chestsOpened: 0,
  raidsPlayed: 0,
  marks: [],
  ...over,
});

describe('the arc', () => {
  it('has unique, stable ids', () => {
    const ids = QUESTS_ARC.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z-]+$/);
  });

  it('opens on digging and ends on the ladder — teaching order', () => {
    expect(QUESTS_ARC[0].id).toBe('break-ground');
    expect(QUESTS_ARC[1].id).toBe('come-home');
    expect(QUESTS_ARC.at(-1)!.id).toBe('the-thicket');
    // The raid comes after the burrow has been defended once: a player is
    // sent to knock on doors only after learning what a door is for.
    const bury = QUESTS_ARC.findIndex((q) => q.id === 'bury-something');
    const raid = QUESTS_ARC.findIndex((q) => q.id === 'knock-on-a-door');
    expect(bury).toBeLessThan(raid);
  });

  it('keeps every ask short enough to read at a glance', () => {
    for (const q of QUESTS_ARC) {
      expect(q.ask.split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(q.title.split(/\s+/).length).toBeLessThanOrEqual(4);
    }
  });

  it('pays every quest something, from tuning', () => {
    for (const q of QUESTS_ARC) {
      const paid = (q.reward.carrots ?? 0) > 0 || (q.reward.item?.qty ?? 0) > 0;
      expect(paid, q.id).toBe(true);
    }
    expect(questById('open-a-chest')!.reward.item).toEqual(QUESTS.ITEMS['open-a-chest']);
    expect(questById('knock-on-a-door')!.reward.item).toEqual(QUESTS.ITEMS['knock-on-a-door']);
  });

  it('never explains the crown — that is chapter IV, 8 000 carrots away', () => {
    for (const q of QUESTS_ARC) {
      expect(q.line.toLowerCase()).not.toMatch(/sacrifice|coin flip|tomb/);
    }
  });
});

describe('progress', () => {
  it('reads the counters the server already keeps', () => {
    const f = fresh({ tilesDug: QUESTS.FIRST_DIG_TILES - 1 });
    expect(isQuestDone(questById('break-ground')!, f)).toBe(false);
    f.tilesDug += 1;
    expect(isQuestDone(questById('break-ground')!, f)).toBe(true);
    expect(isQuestDone(questById('come-home')!, fresh({ runsPlayed: 1 }))).toBe(true);
    expect(isQuestDone(questById('bring-it-in')!, fresh({ harvests: 1 }))).toBe(true);
    expect(isQuestDone(questById('bury-something')!, fresh({ trapsPlaced: 1 }))).toBe(true);
    expect(isQuestDone(questById('open-a-chest')!, fresh({ chestsOpened: 1 }))).toBe(true);
    expect(isQuestDone(questById('knock-on-a-door')!, fresh({ raidsPlayed: 1 }))).toBe(true);
    expect(isQuestDone(questById('hold-the-door')!, fresh({ trapsPlaced: QUESTS.HOLD_THE_DOOR_TRAPS }))).toBe(true);
    expect(isQuestDone(questById('the-thicket')!, fresh({ lifetimeCarrots: ISLAND_TIERS[1].minLifetime }))).toBe(true);
  });

  it('reads the client marks for what the server cannot count', () => {
    expect(isQuestDone(questById('look-up')!, fresh())).toBe(false);
    expect(isQuestDone(questById('look-up')!, fresh({ marks: [QUEST_MARK.LEADERBOARD] }))).toBe(true);
    // The codex quest wants the SECOND chapter — the one about the numbers —
    // and only that one: opening chapter I on day one does not count.
    expect(isQuestDone(questById('read-the-stones')!, fresh({ marks: [codexMark(LORE[0].id)] }))).toBe(false);
    expect(isQuestDone(questById('read-the-stones')!, fresh({ marks: [codexMark(LORE[1].id)] }))).toBe(true);
  });
});

describe('the board', () => {
  it('shows one card: the first ask, on a fresh account', () => {
    const b = questBoard(fresh(), []);
    expect(b.active?.id).toBe('break-ground');
    expect(b.active?.progress).toBe(0);
    expect(b.active?.done).toBe(false);
    expect(b.claimable).toBe(0);
    expect(b.claimed).toBe(0);
    expect(b.total).toBe(QUESTS_ARC.length);
  });

  it('moves to the next ask once a reward is claimed', () => {
    const f = fresh({ tilesDug: 40, runsPlayed: 1 });
    expect(questBoard(f, []).active?.id).toBe('break-ground');
    expect(questBoard(f, ['break-ground']).active?.id).toBe('come-home');
    expect(questBoard(f, ['break-ground', 'come-home']).active?.id).toBe('bring-it-in');
    expect(questBoard(f, ['break-ground', 'come-home']).claimed).toBe(2);
  });

  it('offers an earned reward before a stuck ask', () => {
    // Nobody to raid, but the player has walked up the ladder anyway: the
    // Thicket's reward is offered rather than hidden behind "raid a burrow".
    const claimed = QUESTS_ARC.map((q) => q.id).filter((id) => id !== 'knock-on-a-door' && id !== 'the-thicket');
    const f = fresh({ lifetimeCarrots: ISLAND_TIERS[1].minLifetime });
    const b = questBoard(f, claimed);
    expect(b.active?.id).toBe('the-thicket');
    expect(b.active?.done).toBe(true);
    expect(b.claimable).toBe(1);
    // Once that is taken, the board goes back to the ask that is still open.
    expect(questBoard(f, [...claimed, 'the-thicket']).active?.id).toBe('knock-on-a-door');
  });

  it('clamps progress to the goal, so a meter never overflows', () => {
    const b = questBoard(fresh({ tilesDug: 10_000 }), []);
    expect(b.active?.progress).toBe(QUESTS.FIRST_DIG_TILES);
  });

  it('is empty once everything is claimed', () => {
    const b = questBoard(fresh(), QUESTS_ARC.map((q) => q.id));
    expect(b.active).toBeNull();
    expect(b.claimed).toBe(QUESTS_ARC.length);
  });
});
