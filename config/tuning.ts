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
   * Balanced by simulation against RAID_RUN.START_ENERGY, not by feel: with a
   * competent owner mining the busiest tiles, an undefended burrow always falls
   * and a fully defended one still falls about a quarter of the time. A burrow
   * that could be made impregnable would end the attacking half of the game.
   *
   *   traps placed | raid succeeds
   *        0       |   100%
   *        2       |    94%
   *        4       |    67%
   *        6       |    42%
   *        8       |    27%
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
   * Tight on purpose. The shortest crossing is 7 steps, so this is not about
   * the walk — it is the number of TRAPS a raid can absorb, and it is what the
   * table on TRAPS.DRAIN was tuned against. Raising it makes defence decorative.
   */
  START_ENERGY: 20,
  /** Every step costs this, trap or not — distance itself is a defence. */
  STEP_COST: 1,
  /** Reaching the carrot field is the win condition; this is what it pays. */
  LOOT_SHARE: 0.25,
  /** Attacks on one victim per rolling window, so nobody is farmed. */
  COOLDOWN_MS: 60 * 60 * 1000,
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
