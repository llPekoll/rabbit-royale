/**
 * The Cursed Crown — the codex, and the milestones that open it.
 *
 * The GDD's narrative rule is the Hades one: the story advances on LIFETIME
 * carrots, never on season score. That distinction is the whole design. Season
 * score is taken by raids and wiped at the roll-over — hanging the story on it
 * would mean a player who was robbed loses chapters they already read, and a
 * player who resets starts the story again. Lifetime is never stolen and never
 * reset, so a bad run, a raided burrow and a lost season all still move the
 * story forward. You cannot fall out of the story; you can only be slow.
 *
 * The chapters are written to be read in the order the game teaches its rules,
 * not in the order the island's history happened. Chapter 1 lands at zero — a
 * player who has never dug still has something to open, because a locked codex
 * on first sight reads as a bug rather than as a promise.
 *
 * Thresholds are carrots, and they are deliberately steep at the top: the last
 * chapter is meant to be a season's work, not a week's. Tune the curve here —
 * nothing else reads these numbers.
 */

export interface LoreChapter {
  /** Stable key. Persisted in nothing yet, but the read-marker will use it. */
  id: string;
  /** Roman numeral shown on the scroll's tab. */
  numeral: string;
  title: string;
  /** Lifetime carrots needed. Chapter 1 is 0 — always open. */
  unlockAt: number;
  /**
   * The chapter itself, one paragraph per entry. Kept as an array rather than
   * one blob so the panel can space paragraphs without parsing newlines.
   */
  body: string[];
  /**
   * The line under the title on the scroll — what this chapter is ABOUT, in the
   * island's own voice. Shown even while the chapter is locked, because a
   * locked chapter with no subject is just a grey row.
   */
  teaser: string;
}

export const LORE: LoreChapter[] = [
  {
    id: 'the-island',
    numeral: 'I',
    title: 'The Island That Gives',
    unlockAt: 0,
    teaser: 'Why the ground is generous.',
    body: [
      'Nobody planted the first carrot. The island was simply found, one morning, ' +
      'already full of them -- rows of orange crowns pushing up through ash that was ' +
      'still warm. The rabbits who found it did the sensible thing. They dug.',

      'It has never stopped giving. Dig a hole and the ground offers something: a ' +
      'carrot, a chest, a stone with a number scratched on it. The numbers are ' +
      'honest. They have always been honest. That is the part the old rabbits ' +
      'warn you about -- a thing that never lies to you is a thing that wants ' +
      'something, and it is patient enough to wait until you ask what.',
    ],
  },
  {
    id: 'the-numbers',
    numeral: 'II',
    title: 'What the Numbers Know',
    unlockAt: 500,
    teaser: 'The ground counts what it buried.',
    body: [
      'A dug tile tells you how many bombs touch it. Not roughly. Exactly. No ' +
      'rabbit has ever found a stone that lied, and rabbits have looked hard, ' +
      'usually while missing a paw.',

      'So the danger is never the dice. The danger is you, reading fast because ' +
      'someone else is three tiles away and reaching for the same carrot. The ' +
      'island does not kill the unlucky. It kills the hurried, and it keeps a ' +
      'careful record of the difference.',
    ],
  },
  {
    id: 'the-burrow',
    numeral: 'III',
    title: 'The Law of the Burrow',
    unlockAt: 2_000,
    teaser: 'Nothing is taken from you while you dig.',
    body: [
      'Out on the island you cannot lose. Step on a bomb and you are thrown, ' +
      'stunned, emptied of breath -- but your pile is not touched. Every carrot ' +
      'you have ever carried home is still at home.',

      'That is exactly the problem. Home is where it all is, and home is where ' +
      'you are not, because you are here, digging. The island made a rule out of ' +
      'this and thought it very funny: the only thing that can be taken from a ' +
      'rabbit is the thing it left behind.',
    ],
  },
  {
    id: 'the-crown',
    numeral: 'IV',
    title: 'The Crown Is Not a Prize',
    unlockAt: 8_000,
    teaser: 'It marks you on every map.',
    body: [
      'Whoever holds the largest season finds the crown waiting on their head one ' +
      'morning. It cannot be removed, sold, buried, or given away. Rabbits have ' +
      'tried all four. There is a chapter about the fourth one, and it is short.',

      'The crown is generous, which is how it works. It makes the ground richer ' +
      'under its wearer and the chests heavier. It also puts a light on the world ' +
      'map that every other rabbit can see from anywhere, and it never goes out. ' +
      'The island does not reward the first rabbit. It illuminates them, and then ' +
      'it stands back to watch what the others do about it.',
    ],
  },
  {
    id: 'the-eruption',
    numeral: 'V',
    title: 'When an Island Has Given Enough',
    unlockAt: 25_000,
    teaser: 'The ground closes its account.',
    body: [
      'Dig enough of an island and the mountain wakes. There is no negotiating ' +
      'with this and no re-covering what was opened -- an island is a thing that ' +
      'happens once. It gives until it is mostly holes, then it goes down into ' +
      'the water without much ceremony and the rabbits swim.',

      'The old rabbits do not treat this as a disaster. They treat it as a bill ' +
      'being settled. Something has been taken out of the world, in enormous ' +
      'quantity, by rabbits who were told the exact truth about every step and ' +
      'chose to keep going. The island simply stops, and another one surfaces ' +
      'somewhere, already full of carrots, already warm.',
    ],
  },
  {
    id: 'the-sacrifice',
    numeral: 'VI',
    title: 'The Sacrifice',
    unlockAt: 60_000,
    teaser: 'What the crown was for.',
    body: [
      'At the end of every season the island asks for its King. Not for the ' +
      'carrots -- it never wanted the carrots, it has more. It wanted somebody to ' +
      'stand at the top where everyone could see, and to have grown fond of ' +
      'standing there.',

      'A King who accepts is buried with honour, writes their own last words, and ' +
      'keeps a tomb in the world that no reset will ever clear. A King who runs ' +
      'gets one honest coin flip -- the island will not cheat, it has never ' +
      'cheated -- and comes back crowned, hunted and without a single shield, or ' +
      'does not come back at all.',

      'Every escape makes the next coin colder. The island learns. It has been ' +
      'doing this longer than there have been rabbits to do it to, and it has ' +
      'never once needed to raise its voice: it simply keeps giving carrots to ' +
      'the ambitious, and waits.',
    ],
  },
];

/** How many chapters a given lifetime total has opened. */
export function unlockedCount(lifetimeCarrots: number): number {
  return LORE.filter((c) => lifetimeCarrots >= c.unlockAt).length;
}

/**
 * The next chapter still to open, and how far off it is — the panel's "keep
 * digging" line. Null once the codex is complete.
 */
export function nextChapter(lifetimeCarrots: number):
  { chapter: LoreChapter; remaining: number } | null {
  const chapter = LORE.find((c) => lifetimeCarrots < c.unlockAt);
  return chapter ? { chapter, remaining: chapter.unlockAt - lifetimeCarrots } : null;
}
