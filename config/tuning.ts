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

export const ENERGY = {
  /** Energy a run starts with. The whole run length knob. */
  START: 30,
  /** A dug tile costs this. Walking a revealed tile is free. */
  DIG_COST: 1,
  /** Ordinary carrot. */
  CARROT_GAIN: 3,
  /** Golden carrot (rare). */
  GOLDEN_GAIN: 12,
  /** Stepping on a bomb. */
  BOMB_LOSS: 8,
  /** Hard ceiling so a lucky streak can't make a run immortal. */
  MAX: 99,
} as const;

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
  CARROT_DENSITY: 0.10,
  /** Of the carrots, this fraction are golden. */
  GOLDEN_SHARE: 0.06,
  /** Fraction of tiles holding a chest. */
  CHEST_DENSITY: 0.012,
  /** Radius around each spawn that is guaranteed bomb-free and pre-revealed. */
  SAFE_RADIUS: 1,
} as const;

/**
 * Difficulty tiers, unlocked by lifetime carrots (Phase 6). Each overrides the
 * base ISLAND densities: richer AND more dangerous, never one without the other.
 */
export interface IslandTier {
  readonly name: string;
  /** Lifetime carrots needed to unlock this tier. */
  readonly minLifetime: number;
  readonly bombDensity: number;
  readonly carrotDensity: number;
  readonly goldenShare: number;
}

export const ISLAND_TIERS: readonly IslandTier[] = [
  { name: 'Meadow',  minLifetime: 0,     bombDensity: 0.14, carrotDensity: 0.10, goldenShare: 0.06 },
  { name: 'Thicket', minLifetime: 2_000, bombDensity: 0.18, carrotDensity: 0.13, goldenShare: 0.09 },
  { name: 'Ashland', minLifetime: 10_000, bombDensity: 0.22, carrotDensity: 0.17, goldenShare: 0.13 },
  { name: 'Caldera', minLifetime: 40_000, bombDensity: 0.27, carrotDensity: 0.22, goldenShare: 0.18 },
] as const;

// ── Phase 2: island life cycle ───────────────────────────────────────────────

export const ERUPTION = {
  /** % of tiles dug at which the volcano starts smoking (3 escalating stages). */
  WARN_STAGES: [0.45, 0.62, 0.78],
  /** % dug that triggers the eruption. The island sinks, a new one is born. */
  THRESHOLD: 0.85,
  /** Length of the eruption cutscene before players land on the new island. */
  SEQUENCE_MS: 4000,
} as const;

// ── Phase 3: multiplayer ─────────────────────────────────────────────────────

export const MULTIPLAYER = {
  /** Drop-in joins the emptiest island under this cap; all full → new island. */
  MAX_PLAYERS_PER_ISLAND: 4,
  /** Server tick. Moves are resolved and broadcast on this cadence. */
  TICK_MS: 100,
  /** A move faster than this is dropped (anti-speedhack, server-side). */
  MIN_MOVE_INTERVAL_MS: 90,
  /** A disconnected player's seat is held this long for a refresh/reconnect. */
  RECONNECT_GRACE_MS: 45_000,
  /** An island with nobody on it is torn down after this long. */
  EMPTY_ISLAND_TTL_MS: 60_000,
} as const;

// ── Phase 4: the burrow ──────────────────────────────────────────────────────

export const BURROW = {
  /** Burrow level → max HP. Level is the ONLY stat (design decision, GDD). */
  HP_PER_LEVEL: 100,
  MAX_LEVEL: 20,
  /** Cost in carrots to go from level N to N+1: BASE * GROWTH^(N-1). */
  UPGRADE_BASE_COST: 250,
  UPGRADE_GROWTH: 1.55,
  /** Burrow HP regenerates this fraction of max per hour (timestamp-derived). */
  HP_REGEN_PER_HOUR: 0.20,
} as const;

export const GARDEN = {
  /** Carrots produced per hour, scaled by burrow level. */
  YIELD_PER_HOUR_BASE: 40,
  YIELD_PER_LEVEL: 8,
  /** Production stops once this many hours have accumulated — come back daily. */
  CAP_HOURS: 12,
} as const;

export const OUT_OF_RUN_ENERGY = {
  /** Energy the burrow refills while you are away. */
  REGEN_PER_HOUR: 12,
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
  /** Carrot price of one extra trap. */
  CARROT_COST: 180,
  /** A sprung trap is spent. It is not repaired, it is replaced. */
  CONSUMED_ON_TRIGGER: true,
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
  LOOT_SHARE: 0.25,
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
  LOOT_SHARE: 0.25,
  /** Hard cap on a single raid's haul, so a whale can't be emptied in one hit. */
  LOOT_CAP: 5_000,
  /** Shield granted automatically after your burrow is broken. */
  BROKEN_SHIELD_MS: 8 * 60 * 60 * 1000,
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
    lightning: 520,
    shield: 750,
    energy: 900,
    /**
     * The dearest thing in the shed, and the only one that is dear for a
     * DESIGN reason rather than an economic one: it takes information away
     * from an attacker, which is stronger than anything else on this shelf.
     * Priced so that blinding your burrow is a decision taken after a bad
     * night, not a standing habit.
     */
    smoke: 2_400,
    /**
     * Cheaper than smoke, and stronger — deliberately.
     *
     * Smoke buys a defensive state that lasts a day; a mirage buys ninety
     * seconds of someone else's confusion. The price is what separates a
     * standing habit from an opportunist strike, and this one is meant to be
     * thrown in the middle of a race rather than budgeted for.
     */
    mirage: 1_100,
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
  /** Bombs a single saboteur may have live on one victim's island. */
  MAX_PLANTED_PER_TARGET: 3,
  /** Cooldown between sabotage actions on the same victim. */
  COOLDOWN_MS: 5 * 60 * 1000,
  /** Tiles a lightning strike scrambles (re-hides revealed tiles). */
  LIGHTNING_RADIUS: 2,
} as const;

/** Chest loot table. Weights are relative, they need not sum to anything. */
export const CHEST_LOOT = [
  { kind: 'carrots', weight: 50, min: 20, max: 90 },
  { kind: 'bomb',    weight: 25, min: 1,  max: 2  },
  { kind: 'shield',  weight: 15, min: 1,  max: 1  },
  { kind: 'lightning', weight: 10, min: 1, max: 1 },
] as const;

// ── Phase 6: leaderboard, crown, seasons ─────────────────────────────────────

export const SEASON = {
  DURATION_MS: 14 * 24 * 60 * 60 * 1000,
  /** Leaderboard rows served to a client. */
  TOP_N: 100,
} as const;

export const CROWN = {
  /** The #1's carrot gains are multiplied by this. Heavy is the head. */
  GAIN_MULT: 1.15,
  /** …and their burrow gives up this much more when raided successfully. */
  LOOT_MULT: 1.75,
} as const;

/**
 * Single accessor so a caller never reaches into a tier by index. Returns the
 * richest tier the player has unlocked.
 */
export function tierFor(lifetimeCarrots: number): IslandTier {
  let tier = ISLAND_TIERS[0];
  for (const t of ISLAND_TIERS) if (lifetimeCarrots >= t.minLifetime) tier = t;
  return tier;
}

/** Carrot cost to upgrade a burrow from `level` to `level + 1`. */
export function upgradeCost(level: number): number {
  return Math.round(BURROW.UPGRADE_BASE_COST * BURROW.UPGRADE_GROWTH ** (level - 1));
}
