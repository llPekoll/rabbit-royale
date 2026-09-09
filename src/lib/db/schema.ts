/**
 * Rabbit Royale: The Cursed Crown — schema.
 *
 * Standalone: this game owns its own database (`rr_crown`) and its own identity.
 * There is no hub session and no money here — it is F2P non-gambling by design,
 * so nothing in this file records a balance, a wager or a token.
 *
 * Written up front for phases 4-6 so migrations do not thrash while gameplay is
 * still being tuned; phases 1-3 simply do not read most of it.
 */
import {
  pgTable, text, integer, bigint, timestamp, boolean, uuid, index, uniqueIndex, pgEnum,
} from 'drizzle-orm/pg-core';

export const itemKindEnum = pgEnum('item_kind', ['bomb', 'shield', 'lightning']);
export const raidResultEnum = pgEnum('raid_result', ['damaged', 'looted', 'blocked']);

/**
 * A player. Identity is a proven Solana wallet — the Seeker is the target
 * device, so the Seed Vault is the login and there are no passwords or emails
 * to lose. `id` is `sol:<address>`, mirroring the convention used across the
 * Domin8 stack so log lines stay greppable between projects.
 */
export const players = pgTable('players', {
  id: text('id').primaryKey(),                    // "sol:<address>"
  wallet: text('wallet').notNull(),               // base58 address
  name: text('name').notNull(),

  /** THE THREE COUNTERS (GDD). One carrot event feeds all three, always. */
  /** Spendable bank. Raids move carrots out of here. */
  stock: bigint('stock', { mode: 'number' }).notNull().default(0),
  /** Season score — reset at season roll-over, and transferred on a raid. */
  seasonScore: bigint('season_score', { mode: 'number' }).notNull().default(0),
  /** Never reset, never stolen. Drives island-tier unlocks. */
  lifetimeCarrots: bigint('lifetime_carrots', { mode: 'number' }).notNull().default(0),

  burrowLevel: integer('burrow_level').notNull().default(1),
  burrowHp: integer('burrow_hp').notNull().default(100),
  /** HP and energy regen are derived from timestamps at read time — no per-player
   *  cron, which is what lets this scale to a lot of players (BUILD-PLAN 5). */
  hpUpdatedAt: timestamp('hp_updated_at', { withTimezone: true }).notNull().defaultNow(),

  energy: integer('energy').notNull().default(30),
  energyUpdatedAt: timestamp('energy_updated_at', { withTimezone: true }).notNull().defaultNow(),

  gardenCollectedAt: timestamp('garden_collected_at', { withTimezone: true }).notNull().defaultNow(),
  /** Raids bounce off until this instant. */
  shieldedUntil: timestamp('shielded_until', { withTimezone: true }),

  runsPlayed: integer('runs_played').notNull().default(0),
  tilesDug: bigint('tiles_dug', { mode: 'number' }).notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('players_wallet_idx').on(t.wallet),
  // The season leaderboard is served from Redis, but this index keeps the
  // rebuild-from-Postgres path (cold start, Redis flush) cheap.
  index('players_season_score_idx').on(t.seasonScore),
]);

/**
 * Sign-in challenges, keyed by ADDRESS because no session exists yet. Single-use
 * and short-lived; see lib/auth/wallet-login.ts.
 */
export const loginNonces = pgTable('login_nonces', {
  address: text('address').primaryKey(),
  nonce: text('nonce').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Attack/defence consumables, dropped by chests. Stacked per kind. */
export const inventory = pgTable('inventory', {
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  kind: itemKindEnum('kind').notNull(),
  qty: integer('qty').notNull().default(0),
}, (t) => [uniqueIndex('inventory_player_kind_idx').on(t.playerId, t.kind)]);

/**
 * One row per finished run. Kept because "is digging fun?" is answered by this
 * table (duration, tiles dug, carrots) far better than by watching over a
 * shoulder — it is the playtest instrument for phases 1-2.
 */
export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  islandSeed: text('island_seed').notNull(),
  islandTier: text('island_tier').notNull(),
  carrots: integer('carrots').notNull().default(0),
  tilesDug: integer('tiles_dug').notNull().default(0),
  bombsHit: integer('bombs_hit').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (t) => [index('runs_player_idx').on(t.playerId, t.startedAt)]);

/**
 * Raid log. Also the source of the "X pillaged your burrow" notification a
 * player sees on reconnect, so it stores what was taken, not just that it was.
 */
export const raids = pgTable('raids', {
  id: uuid('id').primaryKey().defaultRandom(),
  attackerId: text('attacker_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  defenderId: text('defender_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  damage: integer('damage').notNull().default(0),
  result: raidResultEnum('result').notNull(),
  carrotsLooted: bigint('carrots_looted', { mode: 'number' }).notNull().default(0),
  /** The season score moves WITH the carrots — a stolen carrot changes sides
   *  entirely, it does not merely leave the victim's bank (GDD, phase 5). */
  scoreTransferred: bigint('score_transferred', { mode: 'number' }).notNull().default(0),
  seenByDefender: boolean('seen_by_defender').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('raids_defender_idx').on(t.defenderId, t.createdAt),
  index('raids_attacker_idx').on(t.attackerId, t.createdAt),
]);

/** Sabotage: a bomb or a lightning strike planted on someone else's live island. */
export const sabotages = pgTable('sabotages', {
  id: uuid('id').primaryKey().defaultRandom(),
  attackerId: text('attacker_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  victimId: text('victim_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  kind: itemKindEnum('kind').notNull(),
  islandSeed: text('island_seed').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  /** Set when the victim actually walked into it. */
  triggeredAt: timestamp('triggered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sabotages_victim_idx').on(t.victimId, t.createdAt)]);

/** Seasons. The current one is the row with `endedAt` null. */
export const seasons = pgTable('seasons', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  /** The King. Set when the season closes. */
  championId: text('champion_id').references(() => players.id),
  championScore: bigint('champion_score', { mode: 'number' }),
});

/** Frozen final standings — the leaderboard after a reset is gone otherwise. */
export const seasonStandings = pgTable('season_standings', {
  seasonId: integer('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  rank: integer('rank').notNull(),
  score: bigint('score', { mode: 'number' }).notNull(),
}, (t) => [uniqueIndex('standings_season_player_idx').on(t.seasonId, t.playerId)]);
