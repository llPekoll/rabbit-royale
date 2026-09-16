/**
 * THE CONTENT TABLES, PUT BACK TOGETHER.
 *
 * The lore and the quests are each split in two: config/ holds what is the
 * same in every language (thresholds, goals, the predicate that says a quest
 * is done, the order of the arc), and the dictionaries hold the words. The
 * split is what lets the SERVER import config/quests.ts — it checks whether a
 * claim is legitimate and never needs a sentence to do it — while the burrow
 * draws the same quest with prose in whatever language the player chose.
 *
 * These functions are the seam. They take a dictionary and return the object
 * the components already expected, so nothing downstream had to learn about
 * languages.
 */
import { LORE, type LoreChapter, type LoreId } from '@/config/lore';
import {
  QUESTS_ARC, questBoard as rawBoard, questView as rawView,
  type Quest, type QuestBoard, type QuestFacts, type QuestView,
} from '@/config/quests';
import { QUESTS, ISLAND_TIERS } from '@config/tuning';
import { groupDigits } from './format';
import type { Dict } from './dictionaries';

/** A chapter as the codex draws it: the thresholds, plus this language's words. */
export interface LoreChapterView extends LoreChapter {
  title: string;
  teaser: string;
  body: string[];
}

export function loreChapter(t: Dict, chapter: LoreChapter): LoreChapterView {
  return { ...chapter, ...t.lore[chapter.id] };
}

/** Every chapter, in order, with the words for this language. */
export function loreChapters(t: Dict): LoreChapterView[] {
  return LORE.map((c) => loreChapter(t, c));
}

export function loreTitle(t: Dict, id: LoreId): string {
  return t.lore[id].title;
}

/**
 * An island tier's name, translated.
 *
 * The tuning table names them in English ("Thicket"), and that string is the
 * KEY here rather than the label — so a tier added to tuning shows its English
 * name until a language adds a line for it, instead of showing nothing.
 */
export function islandName(t: Dict, name: string): string {
  return t.islands[name] ?? name;
}

/**
 * The words for one quest — its ask filled in with the numbers from tuning.
 *
 * The `ask` lines are the interpolated ones: "Dig 12 tiles", "Open chapter II",
 * "Reach 2 000 lifetime carrots". Which number goes in is decided HERE rather
 * than in each language's file, so a translation only has to place it.
 */
export function questText(t: Dict, quest: Quest): { title: string; ask: string; line: string } {
  // Each branch indexes the table itself rather than hoisting `t.quests[id]`
  // above the switch: the entries have different `ask` signatures (one takes a
  // count, one a numeral, most take nothing), and indexing with the un-narrowed
  // union collapses them all to `never`.
  switch (quest.id) {
    case 'break-ground': {
      const q = t.quests['break-ground'];
      return { title: q.title, ask: q.ask(QUESTS.FIRST_DIG_TILES), line: q.line };
    }
    case 'read-the-stones': {
      const q = t.quests['read-the-stones'];
      return { title: q.title, ask: q.ask(LORE[1].numeral), line: q.line };
    }
    case 'hold-the-door': {
      const q = t.quests['hold-the-door'];
      return { title: q.title, ask: q.ask(QUESTS.HOLD_THE_DOOR_TRAPS), line: q.line };
    }
    case 'the-thicket': {
      const q = t.quests['the-thicket'];
      const tier = ISLAND_TIERS[1];
      return {
        title: q.title(islandName(t, tier.name)),
        // Grouped by hand rather than by `toLocaleString`, which was pinned to
        // 'en-GB' here and would now be pinned to the wrong language instead.
        // See i18n/format.ts for why the grouping is done deterministically.
        ask: q.ask(groupDigits(tier.minLifetime)),
        line: q.line,
      };
    }
    default: {
      const q = t.quests[quest.id];
      return { title: q.title, ask: q.ask(), line: q.line };
    }
  }
}

/** A quest as the burrow draws it, in this language. */
export function questView(t: Dict, quest: Quest, facts: QuestFacts): QuestView {
  return { ...rawView(quest, facts), ...questText(t, quest) };
}

/** The board for one player, in this language. */
export function questBoard(
  t: Dict, facts: QuestFacts, claimed: readonly string[],
): QuestBoard {
  const board = rawBoard(facts, claimed);
  if (!board.active) return board;
  const quest = QUESTS_ARC.find((q) => q.id === board.active!.id);
  return quest ? { ...board, active: { ...board.active, ...questText(t, quest) } } : board;
}
