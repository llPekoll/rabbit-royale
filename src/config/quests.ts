/**
 * The quest board — the first week, one ask at a time.
 *
 * WHAT A QUEST IS HERE. One verb the game wants taught, a number the server
 * already counts, and a line in the island's voice for when it is done. There
 * is no quest engine: a quest is DONE when a predicate over the player's own
 * counters says so, and the only thing ever stored is which rewards were
 * taken (`players.questsClaimed`). Nothing can be lost, skipped or desynced,
 * because nothing is tracked — it is recomputed from what the player did.
 *
 * WHY ONE AT A TIME. The board shows a single card (Clash Royale, not a
 * checklist of ten). A list says "here is everything you have not done"; one
 * card says "here is the next thing". The one exception is a LATER quest that
 * has already been completed by accident — it is offered first, so a reward
 * that is earned is never hidden behind an ask that is not (see `questBoard`).
 *
 * LORE FOLLOWS THE MECHANIC, never the other way round. The chapters in
 * config/lore.ts open on lifetime carrots; a quest's `line` quotes the rule
 * the player just lived, and the codex quest asks them to read the chapter
 * that explains it — after they have already felt it. The crown is not
 * explained anywhere in here on purpose: "Look up" makes the player SEE it,
 * and chapter IV is 8 000 carrots away.
 *
 * NOTHING BLOCKS. A player who never opens the board plays the same game; a
 * quest is pull, not gate. The rewards are the pull, and they are carrots
 * mostly — feeding the three counters like any harvest — with two items
 * placed exactly where the item is about to matter (see QUESTS in tuning).
 *
 * The numbers live in config/tuning.ts (`QUESTS`); this file holds the words
 * and the order. Client and server import it alike: the board the burrow
 * draws and the board the claim route checks are one function.
 */
import { ISLAND_TIERS, QUESTS } from '@config/tuning';
import { LORE } from './lore';

/**
 * Which door on the burrow the quest lives behind — what the badge lights.
 *
 * `farm` is the GO FARM arrow, `garden` the harvest card, `season` the trophy
 * button; the other four are the hub tiles, by their own names.
 */
export type QuestDoor = 'farm' | 'garden' | 'base' | 'raid' | 'season' | 'story' | 'shop';

/** The counters a quest reads. All of them live on the player row. */
export interface QuestFacts {
  runsPlayed: number;
  tilesDug: number;
  lifetimeCarrots: number;
  harvests: number;
  trapsPlaced: number;
  chestsOpened: number;
  raidsPlayed: number;
  /** Client-observed facts the server cannot count — see QUEST_MARK. */
  marks: readonly string[];
}

/**
 * The marks a client may report. Named here so the two sides agree on the
 * spelling, and so the mark route can refuse anything else.
 */
export const QUEST_MARK = {
  /** The season board was opened — the player has seen who wears the crown. */
  LEADERBOARD: 'leaderboard',
  /** `codex:<chapter id>` — that chapter was opened in the codex. Accepted by
   *  the server only once the chapter is actually unlocked. */
  CODEX_PREFIX: 'codex:',
} as const;

export function codexMark(chapterId: string): string {
  return `${QUEST_MARK.CODEX_PREFIX}${chapterId}`;
}

export interface QuestReward {
  carrots?: number;
  item?: { kind: 'bomb' | 'shield'; qty: number };
}

export interface Quest {
  /** Stable key — persisted in `questsClaimed`, so never renamed. */
  id: string;
  /** Two or three words. The card's heading. */
  title: string;
  /** The ask, as an instruction. Twelve words at most: it is read at a glance. */
  ask: string;
  /** What the island says once it is done. Its voice, second person, dry. */
  line: string;
  door: QuestDoor;
  /** What `progress` has to reach. */
  goal: number;
  progress(facts: QuestFacts): number;
  reward: QuestReward;
}

const has = (facts: QuestFacts, mark: string) => (facts.marks.includes(mark) ? 1 : 0);

/** The chapter the codex quest asks for: the second one, "What the Numbers Know". */
const NUMBERS_CHAPTER = LORE[1];
/** The second island on the ladder. */
const THICKET = ISLAND_TIERS[1];

/**
 * In teaching order, which is also roughly the order a first week takes.
 *
 * Dig → bank → harvest → bury → open → raid → look up → read → hold → climb.
 * Each is the smallest true instance of the verb (ONE harvest, ONE trap, ONE
 * raid at any depth): the quest proves the door opens, and the game takes it
 * from there.
 */
export const QUESTS_ARC: readonly Quest[] = [
  {
    id: 'break-ground',
    title: 'Break ground',
    ask: `Dig ${QUESTS.FIRST_DIG_TILES} tiles.`,
    line: 'Every dug tile tells you how many bombs touch it. Exactly. The numbers are honest.',
    door: 'farm',
    goal: QUESTS.FIRST_DIG_TILES,
    progress: (f) => f.tilesDug,
    reward: { carrots: QUESTS.CARROTS['break-ground'] },
  },
  {
    id: 'come-home',
    title: 'Come home',
    ask: 'Finish a run.',
    line: 'What you carried is in the burrow now. Nothing on the island can reach it.',
    door: 'farm',
    goal: 1,
    progress: (f) => f.runsPlayed,
    reward: { carrots: QUESTS.CARROTS['come-home'] },
  },
  {
    id: 'bring-it-in',
    title: 'Bring it in',
    ask: 'Harvest the garden.',
    line: 'The garden grows while you are away. So does what a thief can carry off it.',
    door: 'garden',
    goal: 1,
    progress: (f) => f.harvests,
    reward: { carrots: QUESTS.CARROTS['bring-it-in'] },
  },
  {
    id: 'bury-something',
    title: 'Bury something',
    ask: 'Place a trap on your floor.',
    line: 'A trap nobody can see is the only wall worth building. A wall gets walked around.',
    door: 'base',
    goal: 1,
    progress: (f) => f.trapsPlaced,
    reward: { carrots: QUESTS.CARROTS['bury-something'] },
  },
  {
    id: 'open-a-chest',
    title: 'Open a chest',
    ask: 'Dig up a chest on an island.',
    line: 'A chest is a promise. It is also a walk across ground you have not read yet.',
    door: 'farm',
    goal: 1,
    progress: (f) => f.chestsOpened,
    reward: { item: { ...QUESTS.ITEMS['open-a-chest'] } },
  },
  {
    id: 'knock-on-a-door',
    title: 'Knock on a door',
    ask: 'Raid a burrow. Any depth counts.',
    line: 'The only thing that can be taken from a rabbit is what it left behind. Now you have been on both sides of that.',
    door: 'raid',
    goal: 1,
    progress: (f) => f.raidsPlayed,
    reward: { item: { ...QUESTS.ITEMS['knock-on-a-door'] } },
  },
  {
    id: 'look-up',
    title: 'Look up',
    ask: 'Open the season board.',
    line: 'Someone wears the crown. It puts a light on every map, and it never goes out.',
    door: 'season',
    goal: 1,
    progress: (f) => has(f, QUEST_MARK.LEADERBOARD),
    reward: { carrots: QUESTS.CARROTS['look-up'] },
  },
  {
    id: 'read-the-stones',
    title: 'Read the stones',
    ask: `Open chapter ${NUMBERS_CHAPTER.numeral} of the codex.`,
    line: 'The island does not kill the unlucky. It kills the hurried, and it keeps a careful record of the difference.',
    door: 'story',
    goal: 1,
    progress: (f) => has(f, codexMark(NUMBERS_CHAPTER.id)),
    reward: { carrots: QUESTS.CARROTS['read-the-stones'] },
  },
  {
    id: 'hold-the-door',
    title: 'Hold the door',
    ask: `Have ${QUESTS.HOLD_THE_DOOR_TRAPS} traps in the ground before your shield lifts.`,
    line: 'Your shield lifts soon. After that, the floor is all you have. Make it expensive.',
    door: 'base',
    goal: QUESTS.HOLD_THE_DOOR_TRAPS,
    progress: (f) => f.trapsPlaced,
    reward: { carrots: QUESTS.CARROTS['hold-the-door'] },
  },
  {
    id: 'the-thicket',
    title: `The ${THICKET.name}`,
    ask: `Reach ${THICKET.minLifetime.toLocaleString('en-GB')} lifetime carrots.`,
    line: 'Richer ground, and more of it buried. The island calls that a fair trade and does not wait for your answer.',
    door: 'farm',
    goal: THICKET.minLifetime,
    progress: (f) => f.lifetimeCarrots,
    reward: { carrots: QUESTS.CARROTS['the-thicket'] },
  },
];

export function questById(id: string): Quest | undefined {
  return QUESTS_ARC.find((q) => q.id === id);
}

export function isQuestDone(quest: Quest, facts: QuestFacts): boolean {
  return quest.progress(facts) >= quest.goal;
}

/** A quest as the burrow draws it: the definition plus where this player stands. */
export interface QuestView {
  id: string;
  title: string;
  ask: string;
  line: string;
  door: QuestDoor;
  goal: number;
  /** Clamped to `goal`, so a meter never overflows. */
  progress: number;
  done: boolean;
  reward: QuestReward;
  /** 1-based position in the arc, for "QUEST 3 / 10". */
  index: number;
  total: number;
}

export interface QuestBoard {
  /** The card to show, or null once every reward is taken. */
  active: QuestView | null;
  /** Quests done and not yet claimed — what the board badge counts. */
  claimable: number;
  claimed: number;
  total: number;
}

export function questView(quest: Quest, facts: QuestFacts): QuestView {
  const raw = quest.progress(facts);
  return {
    id: quest.id,
    title: quest.title,
    ask: quest.ask,
    line: quest.line,
    door: quest.door,
    goal: quest.goal,
    progress: Math.max(0, Math.min(quest.goal, raw)),
    done: raw >= quest.goal,
    reward: quest.reward,
    index: QUESTS_ARC.indexOf(quest) + 1,
    total: QUESTS_ARC.length,
  };
}

/**
 * The board for one player.
 *
 * The active card is the first unclaimed quest that is DONE, or failing that
 * the first unclaimed quest at all. Claimable-first is what stops a stuck ask
 * (a raid on a server with nobody to raid) from hiding a reward the player
 * has already earned further down the arc.
 */
export function questBoard(facts: QuestFacts, claimed: readonly string[]): QuestBoard {
  const taken = new Set(claimed);
  const open = QUESTS_ARC.filter((q) => !taken.has(q.id));
  const ready = open.filter((q) => isQuestDone(q, facts));
  const next = ready[0] ?? open[0] ?? null;
  return {
    active: next ? questView(next, facts) : null,
    claimable: ready.length,
    claimed: QUESTS_ARC.length - open.length,
    total: QUESTS_ARC.length,
  };
}
