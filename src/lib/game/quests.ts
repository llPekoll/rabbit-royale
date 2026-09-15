/**
 * The quest board, read off a player row.
 *
 * The seam between the schema and config/quests.ts: the row's counters become
 * `QuestFacts`, and everything else is the pure board. Kept apart from the
 * config so the browser bundle never imports this file's row type.
 */
import { questBoard, type QuestBoard, type QuestFacts } from '@/config/quests';

export interface QuestRow {
  runsPlayed: number;
  tilesDug: number;
  lifetimeCarrots: number;
  harvests: number;
  trapsPlaced: number;
  chestsOpened: number;
  raidsPlayed: number;
  questsClaimed: string[];
  questMarks: string[];
}

export function questFacts(row: QuestRow): QuestFacts {
  return {
    runsPlayed: row.runsPlayed,
    tilesDug: row.tilesDug,
    lifetimeCarrots: row.lifetimeCarrots,
    harvests: row.harvests,
    trapsPlaced: row.trapsPlaced,
    chestsOpened: row.chestsOpened,
    raidsPlayed: row.raidsPlayed,
    marks: row.questMarks,
  };
}

export function questBoardOf(row: QuestRow): QuestBoard {
  return questBoard(questFacts(row), row.questsClaimed);
}
