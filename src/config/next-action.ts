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

function wait(ms: number): string {
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function nextAction(s: NextActionInput): NextAction {
  // The garden: the purse a raid is for, and the one that empties by being
  // ignored. Says "before a raider does", which is the whole reason to come
  // home rather than dig again.
  if (s.gardenCapacity > 0 && s.gardenReady >= s.gardenCapacity * NEXT_ACTION.GARDEN_FULL_SHARE) {
    return { door: 'garden', text: `Garden nearly full. Bring it in before a raider does.` };
  }

  // The shield: while it holds, traps are the only thing that will matter
  // after it. Only when the floor is not already standing.
  if (s.shieldMs !== null && s.shieldMs <= NEXT_ACTION.SHIELD_WARNING_MS && s.trapsLive < NEXT_ACTION.TRAPS_WANTED) {
    return { door: 'base', text: `Shield lifts in ${wait(s.shieldMs)}. Bury traps.` };
  }

  // Somebody left carrots outside. Named, because a name is a temptation and
  // a count is a statistic.
  const richest = s.targets
    .filter((t) => !t.shielded && t.garden >= NEXT_ACTION.RAID_WORTH_GARDEN)
    .sort((a, b) => b.garden - a.garden)[0];
  if (richest) {
    return { door: 'raid', text: `${richest.name} left ${richest.garden} in the garden. Raid.` };
  }

  // Otherwise the island, or the wait for it.
  if (s.energy >= s.runCost) {
    return { door: 'farm', text: `${s.energy} energy: a run's worth. Dig.` };
  }
  return {
    door: 'farm',
    text: s.nextRunInMs === null
      ? 'Dig.'
      : `A run in ${wait(s.nextRunInMs)}. The garden grows meanwhile.`,
  };
}
