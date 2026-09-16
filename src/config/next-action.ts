/**
 * The next best thing to do — the NEXT strip once the quest arc is claimed.
 *
 * The quest board drives a player's first week; after that the strip has to
 * keep pointing somewhere, or the burrow goes back to being a column of
 * readings. These rules read the same state the cards show and pick ONE
 * line, in priority order: what is at risk first (a full garden is what a
 * raid takes), then what is about to lapse (the shield), then what is worth
 * taking (a rich open target), then the default (dig, or wait for the
 * energy to). One line, twelve words at most, and always a door — the loop
 * bar pops the tile it names.
 *
 * Pure and small on purpose: it is the one place the game says "now do
 * this", so it has to be readable in full. Numbers come from tuning.
 */
import { NEXT_ACTION } from '@config/tuning';
import type { QuestDoor } from './quests';
import type { Dict } from '@/i18n/dictionaries';
import { formatWait, groupDigits } from '@/i18n/format';

export interface NextActionInput {
  energy: number;
  runCost: number;
  /** Time until a run's worth of energy, null when there already is. */
  nextRunInMs: number | null;
  gardenReady: number;
  gardenCapacity: number;
  /** Milliseconds of shield left, null when unshielded. */
  shieldMs: number | null;
  trapsLive: number;
  trapsPlaced: number;
  /** Raidable burrows, with what stands in their garden. */
  targets: ReadonlyArray<{ name: string; garden: number; shielded: boolean }>;
}

export interface NextAction {
  door: QuestDoor;
  text: string;
}

export function nextAction(t: Dict, s: NextActionInput): NextAction {
  const wait = (ms: number) => formatWait(ms, t.units);
  // The garden: the purse a raid is for, and the one that empties by being
  // ignored. Says "before a raider does", which is the whole reason to come
  // home rather than dig again.
  if (s.gardenCapacity > 0 && s.gardenReady >= s.gardenCapacity * NEXT_ACTION.GARDEN_FULL_SHARE) {
    return { door: 'garden', text: t.next.gardenFull };
  }

  // The shield: while it holds, traps are the only thing that will matter
  // after it. Only when the floor is not already standing.
  if (s.shieldMs !== null && s.shieldMs <= NEXT_ACTION.SHIELD_WARNING_MS && s.trapsLive < NEXT_ACTION.TRAPS_WANTED) {
    return { door: 'base', text: t.next.shieldLifts(wait(s.shieldMs)) };
  }

  // Somebody left carrots outside. Named, because a name is a temptation and
  // a count is a statistic.
  const richest = s.targets
    .filter((t) => !t.shielded && t.garden >= NEXT_ACTION.RAID_WORTH_GARDEN)
    .sort((a, b) => b.garden - a.garden)[0];
  if (richest) {
    return { door: 'raid', text: t.next.raidTarget(richest.name, groupDigits(richest.garden)) };
  }

  // Otherwise the island, or the wait for it.
  if (s.energy >= s.runCost) {
    return { door: 'farm', text: t.next.dig(s.energy) };
  }
  return {
    door: 'farm',
    text: s.nextRunInMs === null
      ? t.next.digPlain
      : t.next.runIn(wait(s.nextRunInMs)),
  };
}
