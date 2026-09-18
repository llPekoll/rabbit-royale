/**
 * THE tuning file. Every game-design number lives here — none in the code.
 *
 * This is the file we hammer during playtests (BUILD-PLAN rule #2), so it is
 * organised by the question it answers, not by the module that reads it. If you
 * are about to type a number anywhere else in this repo, it belongs here.
 *
 * Server-authoritative values (energy, densities, damage) are read by the WS
 * server; the client imports the same constants only to PREDICT and to render
 * HUD. The server never trusts a client-sent number.
 */

// ── Phase 1: the solo run ────────────────────────────────────────────────────

/**
 * A run's energy: THE FUEL OF EXPLORING, on a bar of 100 — and it always runs
 * out. That is the design (the "capped run", 17 September 2026).
 *
 * Every dig costs a point. A well-placed red X (see FLAG) gives some back, but
 * never as much as the digging that found it cost: reading the board roughly
 * DOUBLES a run, it does not make it endless. So every run, at every level of
 * play, ends on the same sentence — no energy, no more exploring — and on the
 * recap that offers more. An island is a level several runs finish, alone over
 * a day or four rabbits at once, not something one ticket clears.
 *
 * How it got here. Three hearts (24 points, digging free) let a player who
 * deduced nothing clear 83 % of a Meadow island: the numbers were decoration.
 * A dig cost with a generous X (+8) fixed that and broke something else: a
 * good reader never ran dry, cleared the island in fifteen minutes on one
 * 20-energy ticket, and never once saw the refill offer — runs became 85-90 %
 * of all income against a target of 70 at most, and a 400-carrot refill bought
 * three runs worth thousands. Measured with robot players on real islands
 * (`tools/sim-dig.sim.ts`), at the values below:
 *
 *              no X         reads        reads + probes
 *   Meadow   100 / 660    175 / 1 470     181 / 1 530     (tiles dug / carrots)
 *   Thicket   91 / 800    204 / 2 100     236 / 2 490
 *   Ashland   79 / 820    155 / 1 990     175 / 2 280
 *   Caldera   55 / 720    141 / 2 270     198 / 3 450
 *
 * About four minutes without the X and eight to ten with it — the GDD's "5-10
 * min runs". Nobody clears an island alone; skill pays in carrots per ticket.
 */
export const ENERGY = {
  /** Energy a run starts with: a full bar. */
  START: 100,
  /**
   * A dug tile costs this. Walking a revealed tile is free.
   *
   * It was 1 on a bar of 30 (a run lasted ~17 tiles, "you can barely play one
   * game"), then 0 (the bar became a life gauge and the puzzle optional). 1 on
   * a bar of 100 is the third answer: long enough to play, short enough that
   * the X is how you go further.
   */
  DIG_COST: 1,
  /** Ordinary carrot: score, not fuel. The X is the pump; see FLAG. */
  CARROT_GAIN: 0,
  /**
   * Golden carrot: SCORE ONLY. Only a right red X puts energy back.
   *
   * It was a bomb's worth (30) under the hearts, then 10, then 5. Counted over
   * an island — 9 goldens on Meadow, 39 on Caldera — even 5 covered half of
   * what digging costs on the hardest board, which no tuning of the X could
   * then cap. At 0 the rule is one sentence ("the X is the only pump") and the
   * golden carrot is what it looks like: five carrots in one.
   */
  GOLDEN_GAIN: 0,
  /** Stepping on a bomb. Three and a bit end a fresh run; nobody gets four. */
  BOMB_LOSS: 30,
  /** Ceiling — a full bar. Gains past it are lost: an easy shore cannot be banked. */
  MAX: 100,
  /**
   * What the BURROW pays to start a run — drawn from `OUT_OF_RUN_ENERGY`, not
   * from the run's own tank, which always opens at START.
   *
   * This is the knob that makes the burrow's bar mean something. Until it was
   * wired, the server started every run at START without touching the bank,
   * so the bar sat at its ceiling forever, a bought refill topped up a bar
   * that was already full, and runs were unlimited.
   *
   * A THIRD of the bank, not a whole tank: a full burrow at OUT_OF_RUN_ENERGY
   * .MAX = 60 pays three runs, which is the session the economy is tuned for
   * (docs/economy-tuning.html). At 30 it paid two, and a newcomer — who is
   * created with a full bank, see src/lib/auth — was out after two games on
   * their first visit. A bought refill is worth three runs for the same
   * reason. A player short of this many points is shown the wait and the
   * refill on the burrow, before they cross — not an island that refuses them.
   *
   * 20, NOT 25 (16 September 2026): 25 was written as "a third" and was not
   * one — 60 / 25 is two runs and ten points over, and with the first island
   * being the first run a newcomer got exactly ONE real game before a
   * three-hour wait, ten minutes in. Watched happen on a fresh guest. Three
   * runs is what the comment above always meant.
   *
   * Unrelated to START: what a run costs to ENTER is not what it opens with.
   */
  RUN_COST: 20,
} as const;

/*
 * 15 September 2026: the economy was re-tuned as one set from
 * docs/economy-tuning.html (regen, run cost, carrot and chest densities, garden
 * yield, raid shares and cap, crown multiplier, upgrade growth, shop prices).
 * The values were chosen together on the carnet's model — moving one back
 * alone changes the day it was balanced for. The shop prices are ALSO seeded
 * in the `tuning` table: run `bun db:seed-tuning` after deploying.
 */

/**
 * What a dug carrot is WORTH, in carrots.
 *
 * 3, since 17 September 2026 — and this one number is what re-seats the whole
 * economy. Everything else that is priced in carrots (the garden, a raid's
 * haul, the shop, the burrow ladder, quests, chests, the codex) was tuned
 * around "a run is worth about what a raid or a garden visit is". That stayed
 * true of the MODEL, which had a rabbit digging blind for 21 tiles; a played
 * run digs 100 to 200. At 15 a carrot, measured (`tools/economy-day.sim.ts`),
 * runs were 84 % of a regular player's income against a ceiling of 70, a run
 * paid 1 250 against a 460 raid and a 240 garden visit, the 400-carrot refill
 * bought three runs worth 3 750, and burrow level 5 took a third of a day.
 *
 * At 3 a run pays 170 without the X, ~500 to a reader, ~340 to the player in
 * between — beside a 240 garden visit and a ~200 raid — and runs are 68 % of
 * the day. It was 1 once ("a whole run paid two carrots": that was the blind
 * model again) and then 15 (the same model, multiplied).
 */
export const RUN = {
  CARROT_VALUE: 3,
  /** Five ordinary carrots: rare, it shines, and it should pay like a small chest. */
  GOLDEN_VALUE: 15,
} as const;

/** Whole bombs a fresh run survives. The HUD draws a bar now (energy-bar.tsx);
 *  this remains for the hearts component its stories still show. */
export const HEARTS = Math.floor(ENERGY.START / ENERGY.BOMB_LOSS);

export const BOMB = {
  /** Tiles the rabbit is thrown backwards. Revealed terrain is preferred. */
  KNOCKBACK_TILES: 3,
  /** Input is ignored for this long after a blast. */
  STUN_MS: 1200,
} as const;

// ── Island generation ────────────────────────────────────────────────────────

/**
 * Island size varies to avoid monotony (Phase 2). Width/height are drawn
 * independently from [MIN, MAX] so islands are not always square.
 */
export const ISLAND = {
  MIN_SIZE: 14,
  MAX_SIZE: 20,
  /** Fraction of tiles that are bombs. */
  BOMB_DENSITY: 0.14,
  /** Fraction of tiles that are carrots. */
  CARROT_DENSITY: 0.30,
  /** Of the carrots, this fraction are golden. */
  GOLDEN_SHARE: 0.06,
  /**
   * Fraction of tiles holding a chest.
   *
   * Now the island's win condition rather than a bonus: the last chest out of
   * the ground ends the run for everyone on it (`chestProgress`), so this is
   * really "how many stops the lap has". 0.02 is about 10 chests on a full
   * island — enough that the coast is worth circling, few enough that a player
   * can hold how many are left in their head.
   */
  CHEST_DENSITY: 0.02,
  /**
   * How far out a chest must sit, as a share of the walk to the island's
   * furthest tile.
   *
   * The point of the rule change is that finishing an island means travelling
   * it. 0.6 puts every chest in the outer two fifths of the walk — off the
   * middle for certain, while still leaving enough eligible coast in each
   * angular slice that a lumpy island still gets its full count. Higher and
   * the thin bays run out of candidates and the lap loses stops. See
   * `rimTiles`.
   */
  CHEST_MIN_DEPTH: 0.6,
  /** Radius around each spawn that is guaranteed bomb-free and pre-revealed. */
  SAFE_RADIUS: 1,
  /**
   * How far from the RABBIT the cascade writes numbers, in grid squares.
   *
   * The cascade used to run to the end of every connected region of zeros. At
   * Meadow's density a third of the board is zeros, so an island was born with
   * 23 % of its numbers already written (measured over 40 islands) — a hundred
   * tiles of reading the player never did. Bounded, the same region still
   * opens, but as the rabbit walks into it: the rule is unchanged, only its
   * reach is. 3 keeps every classic pattern (1-2-1, 1-1 on a wall) readable
   * at once; at 1 there is nothing to deduce from. See `cascadeHints`.
   */
  CASCADE_RADIUS: 3,
  /**
   * A bomb is dealt touching at most this many other bombs (while the deal
   * can afford it). Spreads the same number of bombs over more of the board:
   * fewer fields of zeros to walk round a puzzle through, fewer 4s and 5s
   * that can only be guessed at. See the deal in `generateIsland`.
   */
  BOMB_MAX_TOUCHING: 1,
} as const;

/**
 * How a zone ANNOUNCES itself when the cascade opens one.
 *
 * Digging a zero opens a region of numbers at once, and the client used to
 * write all of them on the same frame — a dozen tiles changed state with a
 * blink, and the board's biggest moment was the one it said least about. It
 * now arrives as a ripple spreading from the dig: the numbers in order of
 * distance, and each LID rising and falling as the front reaches it. The
 * terrain never moves — the first cut lifted the cells themselves and the
 * island visibly heaved around every dig.
 *
 * Tuned on `Island/Cascade wave` in Storybook, which plays the real cascade
 * over a real island. A zone is now the WHOLE connected region of zeros (see
 * `cascadeAround`) — 35 tiles on average and up to ~190 — so MAX_DELAY, not
 * PER_STEP, is what decides how long the front takes on a wide one: past about
 * five rings the spread is compressed to fit the cap. Measured in game, a big
 * zone's front runs 3 → 10 → 19 → 20 → 11 → 5 lids over ~350ms.
 */
export const RIPPLE = {
  /**
   * Seconds of delay per step out from the dig, before MAX_DELAY scales it
   * down on a wide zone.
   *
   * Read against the lid's own fade, which `Tile.revealHint` fixes at 0.25s:
   * below about a third of that the rings overlap into a single bloom and the
   * wave stops being a wave.
   */
  PER_STEP: 0.12,
  /** Cap on the total spread, so a wide zone cannot outlive the player's attention. */
  MAX_DELAY: 0.6,
  /**
   * How far a lid rises as the front passes, in px.
   *
   * Small, and it has to be: the board draws at HALF_H = 12px per cell, so a
   * lid lifting 6px has travelled half a cell and starts to read as peeling
   * off its tile rather than lifting from it. 5 is just under that.
   */
  HEIGHT: 5,
  /** Seconds of the up-and-down itself — how long the crest sits on one cell. */
  TIME: 0.45,
} as const;

/**
 * Risk rises with the walk from the spawn — and so does what is worth having.
 *
 * Bombs and golden carrots are dealt WEIGHTED by how many steps out a tile is;
 * the COUNTS are still the tier's densities, so an island holds exactly as
 * many of each as before. The weight runs linearly from NEAR at the spawn to
 * FAR at the furthest tile. With three hearts, how deep to go becomes the
 * player's own call, and the hearts back are out where they get spent.
 * Ordinary carrots and chests stay uniform: the shore must still pay.
 */
export const RISK_GRADIENT = {
  BOMB: { NEAR: 0.5, FAR: 1.5 },
  GOLDEN: { NEAR: 0.3, FAR: 1.7 },
} as const;

/**
 * The red X: say where a bomb is, and be paid — or be wrong, and pay.
 *
 * A player may mark any undug, unread tile AROUND their rabbit. The server
 * answers at once. Right: the bomb stays in the ground under its X, nobody
 * can step on it any more, and the marker earns a little ENERGY and a carrot
 * bounty. Wrong: it costs energy, the tile's number is written on it (it is
 * safe, and now everyone knows), and the streak is gone.
 *
 * This is what deduction PAYS. Minesweeper has forced guesses — corners no
 * number resolves — and until now they cost a heart with nothing on the other
 * side of the ledger. Now reading the board fills the bar that the unreadable
 * corners drain: energy is the fuel of exploring, and the X is the pump.
 *
 * LOSS is well over twice the gain on purpose (the gain is per tier, 6 down to
 * 4 — see `IslandTier.xGain`). A blind X on a tile that is a bomb with
 * probability q returns q*gain - (1-q)*LOSS, which is only positive above
 * q = 0.71 on Meadow and 0.79 on Caldera: guessing loses, knowing wins. And
 * LOSS is HALF a blast, so at a true
 * coin-flip an X is the cheaper way to find out — a probe with a price — which
 * is what keeps a careful player marking rather than praying.
 *
 * Energy stays capped at ENERGY.MAX, so an easy shore cannot be banked
 * against the far side. The carrot bounty climbs with the STREAK (right Xs in
 * a row this run); a wrong X or a blast resets it. Every ITEM_EVERY-th X of a
 * streak digs the bomb up whole: a raid bomb, the DIG loop feeding RAID.
 */
export const FLAG = {
  /** Energy a wrong X costs, on every tier. Half a blast. */
  LOSS: 15,
  /**
   * The carrot side is kept SMALL on purpose: energy is the X's real pay, and
   * a reader already digs two or three times the tiles a non-reader does. At
   * 10/+5/30 the bounties alone added ~1 900 carrots to a cleared Meadow
   * island. They are counted in DUG CARROTS (RUN.CARROT_VALUE): a third of one
   * to start, a whole one at a streak of three. Left at 5-10 when the carrot
   * went from 15 to 3, they had become 40 % of a reader's income.
   */
  CARROTS_BASE: 1,
  /** Added per further X in the streak. */
  CARROTS_STEP: 1,
  /** Ceiling on a single bounty (reached at a streak of 3): one dug carrot's worth. */
  CARROTS_MAX: 3,
  /** Every n-th X of a streak also yields one raid bomb: two or three on a
   *  flawless island, about what its chests give. */
  ITEM_EVERY: 25,
  /**
   * Carrots paid per point of energy a right X could NOT deliver because the
   * bar was already full.
   *
   * A good reader lives at the ceiling: simulated, 6 of 69 right Xs on a Meadow
   * island and 25 of 108 on Caldera paid no energy at all, and the first X of
   * every run is placed on a full bar — the game's central reward, invisible
   * at the moment it is taught. Raising ENERGY.MAX was tried and rejected: at
   * 150 the same 24 Xs were still wasted (the reader simply sits at the new
   * ceiling) and nobody died on Caldera any more, which was the last tension
   * a reader had. So the ceiling stays and the overflow becomes score: an X
   * that is right ALWAYS pays, in fuel while there is room and in carrots
   * when there is not.
   *
   * 1, not 2: a reader is at the ceiling so often that at 2 the overflow alone
   * added 16 % to a Caldera island's haul. At 1 it adds about 8 %, and a full-
   * bar X still reads "+13" against a plain "+5".
   */
  OVERFLOW_CARROTS: 1,
} as const;

/**
 * Difficulty tiers, unlocked by lifetime carrots (Phase 6). Each overrides the
 * base ISLAND densities: richer AND more dangerous, never one without the other.
 *
 * THE X PAYS LESS AS THE BOMBS THICKEN (`xGain`, 17 September 2026).
 *
 * Bombs are a reader's fuel, so one price for every tier starves the first and
 * floods the last: per safe tile dug a Meadow island buries 0.16 bombs and a
 * Caldera one 0.32. 3 / 3 / 2 / 2 puts what a perfect marker earns back at
 * 50-60 % of what the digging cost on every tier — the capped run, see ENERGY.
 *
 * THE DEAL WAS LEFT ALONE, on evidence. Forced guesses looked like the thing
 * to fix on Caldera, and three ways of dealing the bombs were simulated: never
 * adjacent (no zeros left, no cascade: far worse), a gentler gradient (worse
 * too), and looser clumps (fewer guesses, each one deadlier: no gain). Most of
 * what looked forced was the robot being naive — comparing two numbers leaves
 * 3 guesses on a Meadow island and 26 on Caldera — and an X placed as a PROBE
 * on the likeliest tile answers the rest. The tool was already in the game.
 *
 * RE-SPACED 17 September 2026 — same intended pace, measured income.
 *
 * The pace below (Thicket on day 3, Ashland on day 8, Caldera on day 14) is
 * still the goal. What was wrong was the income it was computed from: "a run
 * is 21 digs and 120 carrots" is a rabbit digging BLIND until its third bomb,
 * and nobody who reads the numbers plays like that. `tools/economy-day.sim.ts`
 * walks the ladder a day at a time as the regular player — four runs halfway
 * between no X and a reader, a full garden, one raid — and prints where the
 * doors have to stand for those three days: 6 000, 19 500 and 37 500. Run it
 * again after touching RUN, FLAG, GARDEN or RAID; the doors move with them.
 *
 * Re-spaced once before, on 15 September 2026, for two reasons.
 *
 * The thresholds were set when a dug carrot was worth 1. At RUN.CARROT_VALUE a
 * day of play (four runs plus a garden) is worth ~700 lifetime carrots, so the
 * ladder is walked in about a fortnight: Thicket on day 3, Ashland on day 8,
 * Caldera on day 14. That is the intended pace — a player sees every island the
 * game has inside two weeks, and the long progression after that is the burrow
 * ladder (BURROW.MAX_LEVEL, costs growing at UPGRADE_GROWTH), not the terrain.
 *
 * And the carrot densities had to climb. Meadow went to 30 % while the tiers
 * above it sat at 13-22 %, so crossing a threshold made the game POORER and
 * more dangerous at once — the exact inverse of the line above. Worse, with
 * hearts (ENERGY.START / BOMB_LOSS) more bombs means a SHORTER run, not a
 * harder one: the bomb density is now the metronome. So each tier lifts
 * carrots faster than bombs, and a run up the ladder pays a little more for a
 * lot less board — 21 tiles at Meadow down to 13 at Caldera, 120 carrots up to
 * 139. The tension rises; the yield barely does.
 *
 * NOT reset between seasons: `lifetimeCarrots` never resets (see the Economy
 * section of gdd.md), so a returning player starts season two already in
 * Caldera. That is deliberate for now — the tiers are an account's progression,
 * not a season's — and it is the thing to revisit if picking your island per
 * run ever ships.
 */
export interface IslandTier {
  readonly name: string;
  /** Lifetime carrots needed to unlock this tier. */
  readonly minLifetime: number;
  readonly bombDensity: number;
  readonly carrotDensity: number;
  readonly goldenShare: number;
  /**
   * Energy a RIGHT red X gives back on this tier — see FLAG and the note on
   * ISLAND_TIERS. Per tier because bombs are a reader's fuel: the more of
   * them an island buries, the less each one may be worth.
   */
  readonly xGain: number;
}

export const ISLAND_TIERS: readonly IslandTier[] = [
  { name: 'Meadow',  minLifetime: 0,      bombDensity: 0.14, carrotDensity: 0.30, goldenShare: 0.06, xGain: 3 },
  { name: 'Thicket', minLifetime: 6_000,   bombDensity: 0.17, carrotDensity: 0.34, goldenShare: 0.09, xGain: 3 },
  { name: 'Ashland', minLifetime: 19_500,  bombDensity: 0.20, carrotDensity: 0.38, goldenShare: 0.13, xGain: 2 },
  { name: 'Caldera', minLifetime: 37_500,  bombDensity: 0.24, carrotDensity: 0.43, goldenShare: 0.18, xGain: 2 },
] as const;

// ── Phase 2: island life cycle ───────────────────────────────────────────────

/**
 * The island's end.
 *
 * Since 14 September 2026 the eruption is the END OF EVERY RUN on the island,
 * not a change of scenery: the runs are banked and everyone goes home. An
 * island is a level to clear, and it is CLEARED when every safe tile — every
 * tile that is not a bomb — has been dug; the bombs left in the ground are
 * known by then and nobody is asked to step on them. See `islandProgress` in
 * island.ts and `erupt` in server/index.ts.
 *
 * Whoever is on the island finishes it. The threshold below is about who may
 * START on it, not about ending anyone's run.
 */
export const ERUPTION = {
  /** Share of the island's CHESTS collected at which the volcano starts
   *  smoking (3 stages). See `chestProgress`. */
  WARN_STAGES: [0.45, 0.62, 0.78],
  /**
   * Safe tiles left below which nobody new joins, and an island with nobody
   * on it is torn down at once instead of living out its day.
   *
   * An ABSOLUTE count, not a share: what a late joiner is offered is measured
   * in tiles, and a run of a dozen tiles is not worth what a run costs. So this
   * is also the shortest run the game can sell — anyone already there keeps
   * digging past it to the end.
   *
   * Kept on TILES although the island now ends on chests (`chestProgress`),
   * and the two say different things on purpose. This one asks "is there still
   * ground worth digging here" — a joiner wants carrots and room to move, not
   * only the last chest. `JOIN_MIN_CHESTS_LEFT` answers the other half.
   */
  JOIN_MIN_TILES_LEFT: 20,
  /**
   * Chests left below which nobody new joins.
   *
   * The island ends on the last chest, so a board with one left may be seconds
   * from erupting however much ground it still has. Sending someone to it buys
   * them a recap, not a run.
   */
  JOIN_MIN_CHESTS_LEFT: 2,
  /** Length of the eruption cutscene before players land on the new island. */
  SEQUENCE_MS: 4000,
} as const;

// ── Phase 3: multiplayer ─────────────────────────────────────────────────────

export const MULTIPLAYER = {
  /** Drop-in joins the FULLEST island under this cap; all full → new island. */
  MAX_PLAYERS_PER_ISLAND: 4,
  /** Server tick. Moves are resolved and broadcast on this cadence. */
  TICK_MS: 100,
  /** A move faster than this is dropped (anti-speedhack, server-side). */
  MIN_MOVE_INTERVAL_MS: 90,
  /** A disconnected player's seat is held this long for a refresh/reconnect. */
  RECONNECT_GRACE_MS: 45_000,
  /**
   * An island with nobody on it is torn down after this long.
   *
   * A DAY, since 14 September 2026. A started island is a level in progress:
   * whoever died on it, or anyone else, can come back and pay a run to finish
   * it, and its remaining tiles are exactly what the next run is worth. Tearing
   * it down after a minute threw that away and handed a lone joiner a fresh
   * island with the old one's carrots still in the ground. The day is a
   * memory bound for the single-replica WS server, not a design choice: an
   * island nobody has touched since yesterday is not coming back.
   */
  EMPTY_ISLAND_TTL_MS: 24 * 60 * 60 * 1000,
} as const;

// ── Phase 4: the burrow ──────────────────────────────────────────────────────

export const BURROW = {
  /** Burrow level → max HP. Level is the ONLY stat (design decision, GDD). */
  HP_PER_LEVEL: 100,
  MAX_LEVEL: 20,
  /** Cost in carrots to go from level N to N+1: BASE * GROWTH^(N-1). */
  // 500, from 250: level 5 in about two days of a regular player's income
  // (it was a third of a day), level 10 in about fifteen.
  UPGRADE_BASE_COST: 500,
  UPGRADE_GROWTH: 1.45,
  /** Burrow HP regenerates this fraction of max per hour (timestamp-derived). */
  HP_REGEN_PER_HOUR: 0.20,
} as const;

export const GARDEN = {
  /** Carrots produced per hour, scaled by burrow level. */
  YIELD_PER_HOUR_BASE: 20,
  YIELD_PER_LEVEL: 8,
  /** Production stops once this many hours have accumulated — come back daily. */
  CAP_HOURS: 12,
} as const;

export const OUT_OF_RUN_ENERGY = {
  /** Energy the burrow refills while you are away. */
  REGEN_PER_HOUR: 5,
  /** Ceiling on banked energy. */
  MAX: 60,
} as const;

// ── Phase 5: raids & sabotage ────────────────────────────────────────────────

/**
 * Traps: the defensive half of the raid.
 *
 * A raider WALKS your burrow — in through the path, tile by tile, towards the
 * carrot field — spending energy as they go. Traps drain that energy, and at
 * zero the raid ends where it stands. This is what makes PLACING one mean
 * something: you are choosing which approach to make expensive, and a raider
 * who finds the short route mined has to take the long one.
 *
 * They are invisible to the attacker until stepped on. A visible trap is just a
 * wall, and a wall is routed around rather than feared.
 */
export const TRAPS = {
/**
   * Energy a trap drains when stepped on.
   *
   * Sized against RAID_RUN.START_ENERGY so that a trap costs a raider roughly a
   * fifth of their crossing: enough that mining the right tile visibly shortens
   * a raid, not so much that one trap ends it. Since loot is paid by depth, a
   * trap now converts directly into carrots the attacker does not get.
   */
  DRAIN: 8,
  /** Free traps per rolling 24h — derived from a timestamp, never a cron. */
  FREE_PER_DAY: 3,
  /** The free allowance refills over this window. */
  REFILL_MS: 24 * 60 * 60 * 1000,
  /** Ceiling on traps held at once, however they were obtained. */
  MAX_HELD: 12,
  /** Traps live on the board at the same time. Beyond this the burrow is a maze
   *  rather than a gauntlet, and no raid is ever winnable — which kills the
   *  attacking half of the game. */
  MAX_PLACED: 8,
  /**
   * The DOORSTEP: how many steps in from the entrance stay free of traps.
   *
   * Without it the best defence was the same in every burrow — eight bombs in
   * a ring round the door, and a raider dead on the tile they arrived on, with
   * no step taken and no number read. A raid is meant to be a crossing that is
   * read one clue at a time; that only starts once there is open ground to
   * read it from.
   *
   * Counted in STEPS a raider can take (the raid's own metric, cliffs
   * included), not in cells, and cut by the generator (`game/burrow/generate`)
   * so the client's grid and the server's refusal name the same tiles. Steps
   * go eight ways, so the doorstep is a BLOB round the door, not a corridor:
   * 1 → the entrance and its ring (3..9 cells, 6 typical); 2 → 7..20 cells;
   * 4 → ~38 of ~195, a fifth of the ground. It opened at 4 and was settled
   * at 2 on sight: a four-step blob read as a quarter of the homestead handed
   * to the raider, one step was just the landing tile, two is a lawn in front
   * of the door with the first real decision one step past it. The generator
   * caps it two short of the crossing, so the ring round the field stays
   * minable whatever this says — measured over 300 seeds the crossing is
   * 8..13 steps, so the cap never bites in practice.
   */
  DOORSTEP: 2,
  /** Carrot price of one extra trap. */
  CARROT_COST: 150,
  /**
   * How long one sprung trap takes to rearm.
   *
   * A sprung trap is REPAIRED, not replaced: it keeps its tile and comes back
   * on this clock, costing its owner neither a carrot nor a re-placement. The
   * opposite rule — consumed on trigger — is pay-to-repair, which the GDD
   * rejects by name for churn.
   *
   * Sized so a burrow raided overnight is meaningfully back up by morning
   * without being whole: at 8 traps placed and STAGGER_MS between each, a
   * fully sprung board takes REARM_MS + 7 * STAGGER_MS ~= 6.5h to stand again.
   */
  REARM_MS: 3 * 60 * 60 * 1000,
  /**
   * Extra delay per trap beyond the first, so a board rearms ONE AT A TIME.
   *
   * Without it every trap sprung in one raid comes back on the same tick and
   * the burrow snaps from bare to full, which makes the second raider's
   * crossing meaningless and reads to the owner as a switch rather than a
   * recovery. Staggering also means a raider who returns mid-rearm meets a
   * partly-defended board — the gradient the whole raid design is built on.
   */
  REARM_STAGGER_MS: 30 * 60 * 1000,
} as const;

/**
 * The raid run itself: an attacker's budget for crossing someone's burrow.
 *
 * Deliberately tight against TRAPS.DRAIN — four untouched traps end a raid, so
 * a well-defended burrow is genuinely hard, and an undefended one is a walk.
 */
export const RAID_RUN = {
  /**
   * Energy an attacker enters with.
   *
   * Sized against the crossing (9 steps) and TRAPS.DRAIN, so that an
   * undefended burrow is walked easily and each trap costs the attacker a
   * visible slice of the haul:
   *
   *   traps | avg loot of a 10 000 stock | how far the raider got
   *      0  |            2 500           |         100%
   *      2  |            2 500           |         100%
   *      3  |            2 027           |          78%
   *      5  |            1 555           |          56%
   *      8  |              847           |          22%
   *
   * Because loot is paid by DEPTH, this is a slope rather than a threshold —
   * raising this number shifts where the slope starts, it cannot restore the
   * pass/fail cliff the design had before.
   */
  START_ENERGY: 26,
  /** Every step costs this, trap or not — distance itself is a defence. */
  STEP_COST: 1,
  /**
   * The most a raid can take, reached only by touching the carrot field.
   *
   * A raid is scored by HOW FAR it got, not by whether it "won" — the Clash of
   * Clans shape. This matters mechanically, not just thematically: the crossing
   * is about five steps, so a handful of traps will always stop a raider dead,
   * and a pass/fail rule therefore only ever returned 100% or 0% however the
   * numbers were tuned. Paying by depth makes each trap shave a slice off the
   * haul instead of deciding the whole thing, which is the gradient the design
   * needs and cannot be tuned back into a cliff.
   */
  // 8-10 % of the exposed stock, from 6-8: raids were 8 % of a regular day's
  // income against a floor of 10 (`tools/economy-day.sim.ts`).
  LOOT_SHARE: 0.10,
  /**
   * The share is ROLLED between this and `LOOT_SHARE` on every settled raid,
   * so two raids on the same stock do not pay the same round number — a haul
   * that is always exactly a quarter reads as a rule, one that lands anywhere
   * in a band reads as a robbery. `LOOT_SHARE` stays the ceiling every
   * worst-case figure (`maxRaidLoss`, the "safe" stock) is computed from.
   */
  LOOT_SHARE_MIN: 0.08,
  /**
   * How long a raid ended BY LIGHTNING is still answered to the raider, in ms.
   *
   * The defender's strike closes the run from the other side of the wire: the
   * raider learns of it on their next step or poll, not the instant it lands.
   * So a struck run keeps answering `GET /api/raid` — as a finished raid,
   * flagged `struck` — for this long, which is what lets the raider's screen
   * play the shock they were dealt rather than a bare "no raid" refusal. Two
   * minutes covers a phone that was locked mid-crossing.
   */
  STRUCK_SHOWN_MS: 2 * 60 * 1000,
  /**
   * How long a FINISHED raid is still reported to the burrow it was on, in ms.
   *
   * The defender watches a live raid by polling `/api/raid/incoming`; once the
   * run ends, one more answer has to carry the ending (the field reached, the
   * energy gone, the strike) or their screen would simply see the rabbit
   * vanish. Ten seconds is a few polls' worth.
   */
  ENDED_SHOWN_MS: 10 * 1000,
  /**
   * A raid that dies on the doorstep still pays this share of the maximum, so
   * attacking is never pure loss — otherwise nobody attacks a defended burrow
   * twice and the PvP loop stops.
   */
  MIN_LOOT_FRACTION: 0.15,
  /** Attacks on one victim per rolling window, so nobody is farmed. */
  COOLDOWN_MS: 60 * 60 * 1000,
  /**
   * After being raided you cannot be raided again for this long.
   *
   * The Clash of Clans shield, and the single most important anti-churn rule in
   * the game: without it a player who logs off rich is farmed to zero by
   * morning and does not come back.
   */
  SHIELD_AFTER_RAID_MS: 12 * 60 * 60 * 1000,
} as const;

export const RAID = {
  /** Damage a bomb item deals to a burrow, ± the jitter fraction. */
  BOMB_DAMAGE: 45,
  DAMAGE_JITTER: 0.20,
  /** Fraction of the victim's stock taken when their burrow hits 0 HP. This is
   *  THE number to lower if playtesters uninstall instead of retaliating. */
  LOOT_SHARE: 0.08,
  /** Hard cap on a single raid's haul, so a whale can't be emptied in one hit. */
  LOOT_CAP: 1_200,
  /**
   * Carrots of stock no raid can touch — the warehouse floor.
   *
   * Wired on 15 September 2026. Before it, "safe stock" was only the share the
   * loot rules left behind, which for a beginner holding 200 carrots meant
   * losing 16 of them to anyone who walked in. A floor is what a player feels
   * when they read "safe": below it, nobody. Clash of Clans protects newcomers
   * differently (loot caps by town-hall level); this is the simpler rule.
   */
  SAFE_FLOOR: 300,
  /**
   * Share of the victim's UNHARVESTED garden a raid may take.
   *
   * Wired on 15 September 2026, and the Clash of Clans lesson in one number:
   * collectors are raided at 50 % where storages give 10-20 %, because what is
   * produced passively and left outside is what should be vulnerable. Until
   * this, a raid took a slice of the stock and never touched the garden, so
   * leaving carrots to grow was free and being away was never punished. Now a
   * full garden is the thing worth raiding — which is what brings the owner
   * back twice a day to bring it in. Scaled by depth like the stock, and it
   * sits OUTSIDE the safe floor: the floor is the warehouse, the garden is not.
   */
  GARDEN_LOOT_SHARE: 0.35,
  /**
   * Shield granted when a raider walked all the way onto the carrot field.
   *
   * LONGER than `RAID_RUN.SHIELD_AFTER_RAID_MS`, and the ordering is the whole
   * point: these two used to be 8h for a sacked burrow against 12h for a raid
   * that died at the door, so the worse the beating the sooner you were open
   * again. Gravity has to buy protection or the rule teaches players that
   * defending well is what gets them farmed. Clash of Clans grades the same
   * way — 12h at 40% destruction, 16h at 90%.
   */
  BROKEN_SHIELD_MS: 16 * 60 * 60 * 1000,
  /** Shield a brand-new player is born with. */
  ONBOARDING_SHIELD_MS: 48 * 60 * 60 * 1000,
  /** Duration of a consumable shield item. */
  ITEM_SHIELD_MS: 6 * 60 * 60 * 1000,
  /** Damage reduction while shielded (1 = immune). */
  SHIELD_REDUCTION: 1,
} as const;

/**
 * The shop: what carrots buy, and what money buys instead.
 *
 * TWO PRICES ON EVERY LINE, always. That is the GDD's economy rule stated as a
 * data shape: "everything is buyable in carrots OR money", and "no exclusive
 * power for money, ever". Money is the CONVENIENCE route — it skips the grind,
 * it never buys a thing the grind cannot reach — so an item with a USDC price
 * and no carrot price would be a design bug, and `everyItemHasBothPrices` in
 * the tests fails if one ever appears.
 *
 * Carrot prices are steep on purpose. Carrots are the sink the whole economy
 * drains into, and because spending never touches the season score, an
 * expensive shop is what turns surplus carrots into protected points rather
 * than into a bigger pile sitting in a raidable burrow.
 *
 * The two prices are NOT pegged to each other. A carrot price is tuned against
 * what a player earns in a run; a USDC price is tuned against what the thing is
 * worth to someone who would rather not do the run. Trying to hold them at a
 * fixed ratio would drag every carrot retune into a pricing decision.
 */
/**
 * The smoke screen: the anti-revenge item.
 *
 * Hides the clue numbers of YOUR burrow while it holds, so a raider crosses it
 * blind — reading nothing but their own steps and whatever they spring.
 *
 * It exists because of a specific failure of a raid game: after you take
 * somebody's carrots they come straight back, and the second visit is easy
 * because they already learned the layout. A trap you have to re-buy does not
 * fix that — they know where the old ones were. Blinding the board does.
 *
 * Deliberately EXPENSIVE and TEMPORARY. The crossing is meant to be solvable,
 * so permanent blindness would make defence free and end the attacking half of
 * the game; 24h is long enough to cover the window where revenge actually
 * happens and short enough that it has to be bought again.
 */
export const SMOKE = {
  /** How long the numbers stay hidden. */
  DURATION_MS: 24 * 60 * 60 * 1000,
  /**
   * Whether a fresh purchase EXTENDS an active screen or restarts it.
   *
   * Extends: buying two in a row is worth two days, which is what a player
   * assumes. Restarting would quietly burn the second one.
   */
  STACKS: true,
  /** Ceiling on banked screen time, so a whale cannot buy a blind season. */
  MAX_MS: 3 * 24 * 60 * 60 * 1000,
} as const;

/**
 * The mirage: the anti-DEDUCTION item.
 *
 * Smoke takes the numbers away. This one leaves them there and makes some of
 * them LIE — a "2" that should read 3, on a live island, while the victim is
 * playing it. The GDD already names this as the sabotage tell worth having:
 * "a revealed 2 silently becomes a 3, and an attentive victim can spot it."
 *
 * It is the stronger idea of the two and the cheaper item, which is not a
 * contradiction:
 *
 *  - Smoke removes information. The victim KNOWS they are blind, adapts, and
 *    walks carefully. It is expensive because certainty-of-ignorance is a
 *    solid defensive state.
 *  - A mirage corrupts information. The victim does not know, trusts the
 *    board, and walks into a bomb reading a number that said it was safe.
 *
 * What keeps it from being pure cruelty is that it is READABLE. A lie is only
 * a lie against the truth around it: a corrupted hint contradicts its
 * neighbours, so a player who is actually reading the board can catch it and
 * re-derive the real count. That is the skill the item attacks and rewards at
 * the same time — and it is why only a FEW tiles are touched, never all of
 * them. Corrupt everything and there is nothing to check a number against,
 * which is just smoke with extra steps.
 */
/**
 * The lightning strike: sabotage by AREA rather than by ambush.
 *
 * A planted bomb waits for the victim to step on it. A strike does not wait —
 * it lands where the attacker points and sets off everything buried under the
 * cells around it, at once, whether the victim was going that way or not.
 *
 * The two are deliberately different weapons rather than two speeds of the
 * same one. A bomb is patient and cheap and rewards knowing where someone is
 * headed; a strike is loud, costs more, and takes ground away from a victim
 * who was nowhere near it. What it does NOT do is re-cover dug tiles — the GDD
 * rejects that outright ("breaks minesweeper logic"), and rightly: a board
 * that can un-deduce itself makes reading it pointless.
 */
export const LIGHTNING = {
  /**
   * Radius of the strike, in tiles. 1 is the 3x3 around the target.
   *
   * Kept small on purpose. The strike's value is that it hits ground the
   * victim has not chosen to walk on, and a wide blast would clear half an
   * island in one purchase — which ends the run rather than damaging it.
   */
  RADIUS: 1,
  /** Milliseconds between each tile in the area going off, for the eye. */
  STAGGER_MS: 60,
  /**
   * What a rabbit CAUGHT in the strike loses: exactly what stepping on a bomb
   * costs, and TIED to it rather than copied — the economy is recalibrated by
   * moving `ENERGY.BOMB_LOSS`, and a strike that kept an older bomb's price
   * would silently become the cheap or the ruinous way to lose a run.
   *
   * The strike used to open ground only. It now also electrocutes any rival
   * standing in its square, which is what makes it a weapon aimed at a PLAYER
   * rather than at a patch of dirt — and a bomb's worth is the right price for
   * a hit the victim could not have read on the board: more, and one item
   * ends a run outright; less, and it is not worth carrying.
   */
  SHOCK_LOSS: ENERGY.BOMB_LOSS,
  /**
   * How long a struck rabbit is held, in ms. Longer than a bomb's stun
   * (BOMB.STUN_MS): the current has to be SEEN holding them, and the
   * electrocuted pose reads as a flicker under a second.
   */
  SHOCK_STUN_MS: 2000,
} as const;

export const MIRAGE = {
  /** How long the false numbers hold on the victim's island. */
  DURATION_MS: 90 * 1000,
  /**
   * How many REVEALED tiles are made to lie.
   *
   * A handful, not a share of the board: the lie has to be findable. Three
   * wrong numbers among twenty honest ones is a puzzle; twenty wrong ones is
   * noise, and a player who cannot trust anything stops reading and just digs.
   */
  TILES: 3,
  /**
   * How far a corrupted hint drifts from the truth.
   *
   * Plus or minus one. A "2" showing 3 or 1 is a plausible number that sits
   * wrong against its neighbours; a "2" showing 7 is obviously broken and
   * fools nobody. The lie has to be worth believing to be worth spotting.
   */
  DRIFT: 1,
  /**
   * Only ever tiles the victim has ALREADY dug.
   *
   * An undug tile has no number to corrupt, and faking one would invent
   * information rather than falsify it — the victim would be reading a hint
   * for ground nobody has opened, which reads as a bug.
   */
  REVEALED_ONLY: true,
  /**
   * Share of ground dug DURING the mirage that also comes out wrong.
   *
   * Without it the item lasts one puzzle: the victim checks the three
   * corrupted tiles, finds them, and everything after is honest. A quarter
   * keeps the doubt alive for the whole ninety seconds while leaving three
   * digs in four truthful — enough honest ground to catch the liars against.
   */
  FRESH_RATE: 0.25,
} as const;

export const SHOP = {
  /**
   * Carrot price per kind.
   *
   * Set against what each one DOES rather than against each other:
   *  - trap      — the cheapest, and the only one also given away free
   *                (TRAPS.FREE_PER_DAY). Defence must never be gated on wealth,
   *                or a poor player is farmed forever.
   *  - bomb      — offence. Above a trap, because it takes carrots off somebody
   *                else where a trap only keeps your own.
   *  - lightning — scrambles revealed ground mid-run. Rarer than a bomb in the
   *                chest table, so dearer here to match.
   *  - shield    — the most expensive: it removes you from the PvP loop for
   *                RAID.ITEM_SHIELD_MS, and cheap safety empties a raiding game
   *                of targets.
   *  - energy    — one refill (see ENERGY_PACK). Deliberately the harshest
   *                carrot-per-value line in the shop: the GDD names energy as
   *                THE carrot sink, so paying for a run in carrots should
   *                visibly hurt.
   */
  PRICES: {
    trap: TRAPS.CARROT_COST,
    bomb: 300,
    lightning: 500,
    shield: 600,
    // Three runs' worth of carrots, give or take — 3 x ~340 for the player in the
    // middle. At 400 it bought runs worth 3 750 (carrot at 15) and made the
    // paid refill pointless. `tools/economy-day.sim.ts` checks the ratio.
    energy: 900,
    /**
     * The dearest thing in the shed, and the only one that is dear for a
     * DESIGN reason rather than an economic one: it takes information away
     * from an attacker, which is stronger than anything else on this shelf.
     * Priced so that blinding your burrow is a decision taken after a bad
     * night, not a standing habit.
     */
    smoke: 2_000,
    /**
     * Cheaper than smoke, and stronger — deliberately.
     *
     * Smoke buys a defensive state that lasts a day; a mirage buys ninety
     * seconds of someone else's confusion. The price is what separates a
     * standing habit from an opportunist strike, and this one is meant to be
     * thrown in the middle of a race rather than budgeted for.
     */
    mirage: 1_000,
  },
  /**
   * USDC price per kind, in whole USDC (converted to base units at the edge —
   * see USDC.DECIMALS). Small numbers on purpose: this is a free-to-play game
   * whose paid route is a convenience, and a $5 bomb reads as a game that
   * expects to be paid rather than played.
   */
  USDC_PRICES: {
    trap: 0.25,
    bomb: 0.40,
    lightning: 0.60,
    shield: 0.90,
    energy: 0.99,
    smoke: 1.99,
    mirage: 0.99,
  },
  /**
   * Ceiling per kind, so a whale cannot stockpile a season of offence in one
   * sitting. Traps have their own, tighter cap (TRAPS.MAX_HELD) because they
   * are also handed out free.
   */
  MAX_HELD: 20,
  /** Items per purchase. A "buy 5" that silently bought 5000 is a refund
   *  request; the server clamps to this and says so. */
  MAX_QTY_PER_PURCHASE: 10,
} as const;

/**
 * What one energy purchase gives.
 *
 * A refill rather than a stack of points, because energy is what gates a RUN:
 * the thing being sold is "go and play now", and a player who buys it should
 * land on an island rather than on a slightly fuller bar.
 *
 * It tops up to OUT_OF_RUN_ENERGY.MAX and no further. Selling energy ABOVE the
 * natural ceiling would be selling a longer run than the game gives anyone,
 * which is the pay-to-win line — money buys the wait, never the advantage.
 */
export const ENERGY_PACK = {
  /** Energy added, capped at OUT_OF_RUN_ENERGY.MAX. */
  AMOUNT: OUT_OF_RUN_ENERGY.MAX,
  /** Refills per rolling day, so money cannot buy an unlimited session. */
  MAX_PER_DAY: 5,
  WINDOW_MS: 24 * 60 * 60 * 1000,
} as const;

/**
 * The USDC rail.
 *
 * Payment is a signed SPL transfer to the treasury, verified ON CHAIN by the
 * server before anything is credited — the client reports a signature and is
 * believed about nothing else, exactly as it is believed about nothing in a
 * run. The mint and the treasury come from the environment, because a hardcoded
 * mainnet address in a repo is how a testnet build takes real money.
 */
export const USDC = {
  /** USDC is a 6-decimal SPL token on Solana, on every network. */
  DECIMALS: 6,
  /** Confirmations the server waits for before crediting. */
  COMMITMENT: 'confirmed',
  /**
   * A payment intent expires after this. It is the window in which a quoted
   * price is honoured, so it has to be long enough to approve a transaction in
   * a wallet and short enough that a stale quote cannot be redeemed later.
   */
  INTENT_TTL_MS: 15 * 60 * 1000,
} as const;

/** Whole USDC → base units (the integer amount a transfer actually moves). */
export function usdcBaseUnits(amount: number): number {
  return Math.round(amount * 10 ** USDC.DECIMALS);
}

/** What one item of `kind` costs in carrots. */
export function itemPrice(kind: keyof typeof SHOP.PRICES): number {
  return SHOP.PRICES[kind];
}

/** What one item of `kind` costs in whole USDC. */
export function itemUsdcPrice(kind: keyof typeof SHOP.USDC_PRICES): number {
  return SHOP.USDC_PRICES[kind];
}

/** How many of `kind` a player may hold at once. Energy is not held — it is
 *  applied on purchase — so it has no bag ceiling of its own. */
export function itemCap(kind: keyof typeof SHOP.PRICES): number {
  if (kind === 'trap') return TRAPS.MAX_HELD;
  if (kind === 'energy') return ENERGY_PACK.MAX_PER_DAY;
  // Smoke is TIME, not a thing carried: the ceiling is how many days of screen
  // may be banked at once, so the shelf can say "2 of 3 days" like it says
  // "4 of 20 bombs".
  if (kind === 'smoke') return Math.round(SMOKE.MAX_MS / SMOKE.DURATION_MS);
  return SHOP.MAX_HELD;
}

export const SABOTAGE = {
  /**
   * Bombs a single saboteur may have LIVE (unrevealed) on one island.
   *
   * The island is shared, so the ceiling is per island rather than per
   * victim — there is no one victim to count against. Three is enough to
   * mine an approach and not enough to mine a board: a saboteur who could
   * salt every undug tile would end the island for everyone, themself
   * included. See `lib/game/sabotage`.
   */
  MAX_PLANTED_PER_ISLAND: 3,
} as const;

/**
 * What each chest tier rolls. Weights are relative, they need not sum to
 * anything.
 *
 * ONE TABLE PER TIER, because the board makes a PROMISE. A chest announces
 * itself from across the island — a coloured beam and the tier written over it
 * — and the walk towards it is the trade the whole feature is about. The label
 * is what the player prices that walk on, so `CHEST_TIER_PROMISE` in
 * config/chestConfig.ts has to be TRUE: a flat table would let a BRONZE pay out
 * an NFT and a CROWN pay out carrots, and four steps spent on a promise that
 * the roll ignores is worse than no label at all.
 *
 * The ladder is therefore in WHAT is drawn, not in how much:
 *  - BRONZE — carrots. The floor, and never a dead drop: an item you have
 *    capped out on is a wasted chest, whereas carrots always land.
 *  - SILVER — the garden pair. A nudge on a twelve-hour clock, not a jackpot,
 *    so it is the tier a farmer walks towards.
 *  - GOLD — the raid items. They act on somebody else's board, which is what
 *    makes them worth more than anything that only helps your own.
 *  - CROWN — a raid item AND a shot at an RR Genesis piece. The only tier an
 *    NFT can come out of, which is what makes a crown chest worth crossing an
 *    island for.
 *
 * Both families stay reachable by everyone: a farmer who never raids still
 * meets gold chests, and a raider still gets a garden they did not ask for.
 * What changed is that the player now CHOOSES which of them to walk to.
 */
/**
 * How the chests on an island split across the ladder.
 *
 * Weights, drawn per chest at generation. The shape is the whole economy of the
 * feature: CROWN is the rarest thing on the board because it is the only tier
 * that can carry a Genesis piece, and its scarcity — not the NFT chance inside
 * it — is what keeps pieces from becoming an income stream (see
 * `CHEST_NFT_ODDS`).
 *
 * A tier-1 island holds ~3 chests, so at 6% per chest about one island in six
 * carries a crown: rare enough to be an event worth crossing the board for,
 * common enough that the word CROWN means something to a player by the time
 * they meet their first. Combined with `CHEST_NFT_ODDS`, a Genesis piece lands
 * roughly once in twenty-four islands — a few times a season at two sessions a
 * day, which is the intended "this happened to me once" cadence.
 *
 * Bronze stays the most common so the ordinary chest is never a disappointment.
 */
export const CHEST_TIER_WEIGHTS = [
  { kind: 'bronze', weight: 45 },
  { kind: 'silver', weight: 30 },
  { kind: 'gold', weight: 19 },
  { kind: 'crown', weight: 6 },
] as const;

/** One weighted line of a loot table. */
export interface LootRoll {
  readonly kind: string;
  readonly weight: number;
  readonly min: number;
  readonly max: number;
}

/**
 * Typed as a plain record of `LootRoll[]` rather than left to `as const`
 * inference: four literal tuples of four different shapes will not unify, so a
 * caller indexing this by a variable tier gets a union it cannot pass anywhere.
 * The names still autocomplete; only the row literals are widened.
 */
export const CHEST_LOOT_BY_TIER: Record<'bronze' | 'silver' | 'gold' | 'crown', readonly LootRoll[]> = {
  bronze: [
    { kind: 'carrots', weight: 100, min: 20, max: 90 },
  ],
  silver: [
    { kind: 'water', weight: 55, min: 1, max: 3 },
    { kind: 'fertiliser', weight: 45, min: 1, max: 2 },
  ],
  gold: [
    { kind: 'bomb', weight: 50, min: 1, max: 2 },
    { kind: 'shield', weight: 28, min: 1, max: 1 },
    { kind: 'lightning', weight: 22, min: 1, max: 1 },
  ],
  /**
   * The crown's raid item is GUARANTEED and the NFT rides on top, which is why
   * `nft` is not an entry here — a chance at a piece is not a substitute for
   * the item, it is an extra. See `CHEST_NFT_ODDS`.
   */
  crown: [
    { kind: 'lightning', weight: 40, min: 1, max: 1 },
    { kind: 'shield', weight: 35, min: 1, max: 1 },
    { kind: 'bomb', weight: 25, min: 2, max: 3 },
  ],
};

/**
 * The flat table, kept for any caller that has no tier to hand.
 *
 * Weighted so a tier-less roll still feels like the game's overall mix rather
 * than like a fifth, secretly different chest. Prefer `CHEST_LOOT_BY_TIER`:
 * this exists so a chest can never fail to roll ANYTHING, not as a design.
 */
export const CHEST_LOOT = [
  { kind: 'carrots',   weight: 40, min: 20, max: 90 },
  { kind: 'bomb',      weight: 16, min: 1,  max: 2  },
  { kind: 'water',     weight: 15, min: 1,  max: 3  },
  { kind: 'fertiliser', weight: 12, min: 1, max: 2  },
  { kind: 'shield',    weight: 9,  min: 1,  max: 1  },
  { kind: 'lightning', weight: 7,  min: 1,  max: 1  },
  { kind: 'nft',       weight: 1,  min: 1,  max: 1  },
] as const;

/**
 * The chance a CROWN chest also carries an RR Genesis piece.
 *
 * A SEPARATE roll, not an entry in the crown's table, because the piece is an
 * extra rather than an alternative: a crown chest always pays its raid item,
 * and then this is asked. Folding it into the table would have made the best
 * possible outcome — the NFT — cost the player the item they were promised.
 *
 * ONE IN FOUR of crown chests, and the rarity lives in how rare a CROWN is, not
 * in this number. That is the part to hold on to when retuning: the player who
 * walks four tiles to a crown chest is taking the longest, most expensive walk
 * in the game, and doing it for a 1% chance would teach them not to bother.
 * A visible, sizeable chance is what makes the walk a decision; the scarcity of
 * crown chests themselves is what keeps pieces from becoming an income stream.
 *
 * So if pieces start arriving too fast, make CROWN chests rarer — do not shave
 * this number, or the crown walk quietly becomes a bad bet.
 */
export const CHEST_NFT_ODDS = { inCrown: 0.25 } as const;

/**
 * What the garden consumables do.
 *
 * They act on the two different halves of `GARDEN`, which is what keeps them
 * from being the same item twice:
 *  - WATER raises the RATE. A watered garden makes more per hour, so it pays
 *    the player who comes back often and harvests before the cap.
 *  - FERTILISER raises the CEILING. A fed garden accumulates for longer before
 *    it stops, so it pays the player who cannot come back tonight.
 * One rewards attention, the other forgives its absence, and a player holding
 * both has a real choice to make about the day ahead of them rather than a
 * strictly-better button.
 *
 * Both are timed rather than instant. An instant "+N carrots" would be a
 * carrot drop wearing a different sprite; a window means using one is a small
 * bet on when you will next be here.
 */
export const GARDEN_BOOST = {
  WATER: {
    /** Yield per hour is multiplied by this while a watering is live. */
    RATE_MULT: 1.5,
    /** How long one unit of water lasts. Stacks by extending, not by multiplying. */
    DURATION_MS: 4 * 60 * 60 * 1000,
  },
  FERTILISER: {
    /** Hours added to GARDEN.CAP_HOURS while a feeding is live. */
    EXTRA_CAP_HOURS: 6,
    DURATION_MS: 12 * 60 * 60 * 1000,
  },
  /**
   * Ceiling on banked boost, per kind. Without it a player sitting on twenty
   * waterings from a lucky week runs a permanently buffed garden, and a
   * permanent buff is just a higher base rate with extra steps.
   */
  MAX_BANKED_MS: 24 * 60 * 60 * 1000,
} as const;

// ── Phase 6: leaderboard, crown, seasons ─────────────────────────────────────

export const SEASON = {
  /**
   * A MONTH, as the GDD has always said — the file said a fortnight, and the
   * file is what created the season rows.
   *
   * Deliberately longer than the ISLAND_TIERS ladder, which is walked in about
   * two weeks: a player should have seen every island the game has, and be
   * playing its hardest one, well before the crown is decided. The Sacrifice
   * at season's end is a contest between players who know the board, not a
   * race to unlock it.
   */
  DURATION_MS: 30 * 24 * 60 * 60 * 1000,
  /** Leaderboard rows served to a client. */
  TOP_N: 100,
} as const;

export const CROWN = {
  /** The #1's carrot gains are multiplied by this. Heavy is the head. */
  GAIN_MULT: 1.15,
  /** …and their burrow gives up this much more when raided successfully. */
  LOOT_MULT: 1.5,
} as const;

// ── Onboarding: the first island and the first-week quests ───────────────────

/**
 * THE FIRST ISLAND — the run that is the tutorial.
 *
 * A player with no runs behind them is not dropped onto the fullest island;
 * they get one of their own, cut smaller and dealt by hand rather than by
 * density (see `firstIslandLayout` in island.ts). Nobody reads a tutorial
 * card; everybody remembers the first bomb. So the island is authored to make
 * the beats land in order and inside two minutes:
 *
 *   1. the spawn ring shows exactly ONE "1", beside exactly one bomb — the
 *      first number the player ever reads has one honest meaning;
 *   2. a golden carrot sits two steps past that bomb, so the heart a bomb
 *      takes is given back before the lesson has time to hurt;
 *   3. a chest is visible from the spawn, so the walk-to-a-prize decision is
 *      made once on safe ground;
 *   4. the island is small enough to CLEAR, because "the island is the clock"
 *      is the rule nobody guesses and the eruption is the only way to say it.
 *
 * Private (nobody else is seated on it) and served exactly once: the second
 * run is the real game, on the real ladder, at Meadow. The GDD's line is that
 * the first session decides whether there is a second — this is that session.
 */
export const FIRST_RUN = {
  /** Share of the box the first island covers — the ladder's islands use
   *  TERRAIN_OPTIONS.land (0.62, ~500 tiles). Smaller is the point: at 0.08
   *  the terrain cuts ~65 connected tiles, which is one sitting, and the
   *  eruption lands inside a few minutes. Measured, not derived: the
   *  coastline's falloff and its tidying both eat into the share. */
  LAND: 0.08,
  /** Bombs beyond the taught one, as a share of tiles. Meadow is 0.14;
   *  the first board asks for one lesson, not fourteen. */
  BOMB_DENSITY: 0.06,
  /** Richer than Meadow on purpose: the first recap should show a haul. */
  CARROT_DENSITY: 0.40,
  /** Steps from the spawn to the visible chest, at most. */
  CHEST_MAX_DISTANCE: 5,
} as const;

/**
 * THE QUEST BOARD: one ask at a time, in the order the game teaches its
 * rules (config/quests.ts holds the words; this holds the numbers).
 *
 * Every reward feeds the three counters like a harvest does — a quest is a
 * carrot event, not a coupon. The two item rewards are placed where the item
 * is about to matter: a SHIELD lands right before the onboarding shield lifts,
 * a BOMB lands the moment the player has raided someone and learned what
 * revenge is for.
 */
export const QUESTS = {
  /** Tiles to dig for the first ask — done inside the first island. */
  FIRST_DIG_TILES: 10,
  /** Traps standing before the onboarding shield lifts. TRAPS.FREE_PER_DAY
   *  covers it on day one, so this is never a purchase. */
  HOLD_THE_DOOR_TRAPS: 3,
  /** Carrot rewards, by quest id. */
  CARROTS: {
    'break-ground': 50,
    'come-home': 100,
    'bring-it-in': 75,
    'bury-something': 100,
    'look-up': 50,
    'read-the-stones': 100,
    'hold-the-door': 150,
    'the-thicket': 250,
  },
  /** Item rewards, by quest id. */
  ITEMS: {
    'open-a-chest': { kind: 'shield', qty: 1 },
    'knock-on-a-door': { kind: 'bomb', qty: 1 },
  },
} as const;

/**
 * THE NEXT STRIP after the quests — when the burrow's "now do this" line
 * comes from the state rather than from the arc (config/next-action.ts).
 */
export const NEXT_ACTION = {
  /** The garden counts as "nearly full" above this share of its ceiling. */
  GARDEN_FULL_SHARE: 0.8,
  /** The shield is "about to lift" under this. */
  SHIELD_WARNING_MS: 60 * 60 * 1000,
  /** Traps standing below which the shield warning fires. */
  TRAPS_WANTED: 3,
  /** A target's garden has to hold this much to be named as worth a raid. */
  RAID_WORTH_GARDEN: 100,
} as const;

/**
 * Single accessor so a caller never reaches into a tier by index. Returns the
 * richest tier the player has unlocked.
 */
/** What a right red X pays on an island of this tier (by its `name`, which is
 *  what an `Island` carries). An unknown name reads as the first tier. */
export function xGainFor(tierName: string): number {
  return (ISLAND_TIERS.find((t) => t.name === tierName) ?? ISLAND_TIERS[0]).xGain;
}

export function tierFor(lifetimeCarrots: number): IslandTier {
  let tier = ISLAND_TIERS[0];
  for (const t of ISLAND_TIERS) if (lifetimeCarrots >= t.minLifetime) tier = t;
  return tier;
}

/** Carrot cost to upgrade a burrow from `level` to `level + 1`. */
export function upgradeCost(level: number): number {
  return Math.round(BURROW.UPGRADE_BASE_COST * BURROW.UPGRADE_GROWTH ** (level - 1));
}
