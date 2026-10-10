/**
 * Which numbers may be changed WITHOUT a deploy, and what a legal value is.
 *
 * `config/tuning.ts` stays the source of truth and the fallback. This file is
 * the narrow gate through which a row in the `tuning` table is allowed to
 * override one of its numbers at runtime — see `src/lib/tuning/`.
 *
 * TWO FAMILIES, and the split is not a matter of taste.
 *
 * A value is overridable when it is READ AT THE MOMENT IT APPLIES: a price is
 * read when the purchase is made, the garden's rate when the garden is read,
 * a raid's loot share when the raid settles. Changing one of those takes
 * effect on the next request and nobody is mid-anything.
 *
 * A value is NOT overridable when it is BAKED INTO STATE THAT OUTLIVES THE
 * READ. `ISLAND.CARROT_DENSITY` is the clearest case: tile contents are fixed
 * once, at generation (`generateIsland`), so changing the density would leave
 * two players on two islands playing different games with no way to tell. The
 * same goes for `ENERGY.START` and the per-carrot gains, which are the rules
 * of a run already in progress — moving them changes the board under someone
 * who is standing on it. Those stay in the file, where changing one means a
 * deploy, which is the honest cost of changing a rule mid-season.
 *
 * The registry is also what makes a database-backed value SAFE. A constant in
 * the file is typed and the compiler checks every use; a row in a table is
 * whatever somebody typed. So every key here carries its bounds, and anything
 * outside them is refused at load with the file's value kept — a bad row can
 * make an override not apply, never make the game start without rules.
 */

/** What a key accepts. `int` rejects fractions; `ratio` is a 0..1 share. */
export type TuningKind = 'int' | 'float' | 'ratio';

export interface TuningSpec {
  /** Dotted path into the tuning module, e.g. `SHOP.PRICES.trap`. */
  readonly path: string;
  readonly kind: TuningKind;
  readonly min: number;
  readonly max: number;
  /** One line for whoever reads the table or the admin listing. */
  readonly note: string;
}

/**
 * The overridable set.
 *
 * Deliberately small. Every key added here is a number that can change under
 * a running game, so it earns its place by being read at the point it applies
 * — and by being a number somebody actually wants to move on a live server:
 * prices, the passive economy, and what a raid takes.
 *
 * DECLARING A KEY IS NOT ENOUGH: the server code has to READ it live. Server
 * code imports these tables from `src/lib/tuning/tables.ts` (live views of the
 * same objects, typed identically) rather than from `config/tuning.ts`, whose
 * constants are the build's and never move. A test in `test/tuning-live.test.ts`
 * sets overrides and checks representative reads change. The Godot client
 * gets the same overrides from `/api/config` and `/api/burrow` (`tuning`).
 */
export const OVERRIDABLE: readonly TuningSpec[] = [
  // ── The shop. THE case for this whole mechanism: a price that turns out to
  //    be wrong should not cost a deploy, and a weekend promotion should not
  //    cost every live run.
  { path: 'SHOP.PRICES.trap', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un piège en carottes' },
  { path: 'SHOP.PRICES.lightning', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un éclair en carottes' },
  { path: 'SHOP.PRICES.shield', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un bouclier en carottes' },
  { path: 'SHOP.PRICES.energy', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un plein d\'énergie en carottes' },
  { path: 'SHOP.PRICES.smoke', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un écran de fumée en carottes' },
  { path: 'SHOP.PRICES.bloop', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un bloop en carottes' },
  { path: 'SHOP.PRICES.fence', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'une clôture en carottes' },

  /**
   * The money rail, bounded hard on purpose. A price in real currency is the
   * one number where a typo is not a balance problem but a refund problem, so
   * the ceiling here is deliberately far below anything a free-to-play game
   * would ever charge.
   */
  { path: 'SHOP.USDC_PRICES.trap', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un piège en USDC' },
  { path: 'SHOP.USDC_PRICES.lightning', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un éclair en USDC' },
  { path: 'SHOP.USDC_PRICES.shield', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un bouclier en USDC' },
  { path: 'SHOP.USDC_PRICES.energy', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un plein d\'énergie en USDC' },
  { path: 'SHOP.USDC_PRICES.smoke', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un écran de fumée en USDC' },
  { path: 'SHOP.USDC_PRICES.bloop', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un bloop en USDC' },
  { path: 'SHOP.USDC_PRICES.fence', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'une clôture en USDC' },
  { path: 'PASS.PRICE_USD', kind: 'float', min: 0.99, max: 50, note: 'Prix du Crown Race Ticket en USD' },

  // ── The passive economy. Derived from a timestamp at read time (see
  //    lib/game/regen), so a change applies to the next read and never to a
  //    stretch of time already accounted for.
  { path: 'GARDEN.YIELD_PER_HOUR_BASE', kind: 'int', min: 0, max: 1_000, note: 'Rendement du jardin au niveau 1, par heure' },
  { path: 'GARDEN.YIELD_PER_LEVEL', kind: 'int', min: 0, max: 500, note: 'Rendement gagné par niveau de terrier' },
  { path: 'GARDEN.CAP_HOURS', kind: 'int', min: 1, max: 168, note: 'Heures de production avant que le jardin sature' },
  { path: 'OUT_OF_RUN_ENERGY.REGEN_PER_HOUR', kind: 'float', min: 0.01, max: 120, note: 'Énergie rendue par heure hors partie' },
  { path: 'OUT_OF_RUN_ENERGY.MAX', kind: 'int', min: 1, max: 1_000, note: 'Plafond d\'énergie banquée' },
  { path: 'OUT_OF_RUN_ENERGY.REGEN_PER_LEVEL', kind: 'float', min: 0, max: 20, note: 'Énergie par heure gagnée par niveau de terrier' },
  { path: 'OUT_OF_RUN_ENERGY.REGEN_LEVEL_CAP', kind: 'int', min: 1, max: 50, note: 'Niveau de terrier au-delà duquel la regen ne monte plus' },

  // ── The burrow ladder. Read when the upgrade is bought.
  { path: 'BURROW.UPGRADE_BASE_COST', kind: 'int', min: 1, max: 1_000_000, note: 'Coût du niveau 2' },
  { path: 'BURROW.UPGRADE_GROWTH', kind: 'float', min: 1.01, max: 5, note: 'Croissance du coût par niveau' },

  /**
   * What a raid takes, and what it leaves.
   *
   * `LOOT_SHARE` is also the number every worst-case figure shown to a player
   * is computed from (the "safe stock" card), so an override moves the promise
   * and the robbery together — which is exactly why it belongs to the same
   * read rather than to a build.
   */
  { path: 'RAID_RUN.LOOT_SHARE', kind: 'ratio', min: 0, max: 1, note: 'Part maximale du stock volée par un raid' },
  { path: 'RAID_RUN.LOOT_SHARE_MIN', kind: 'ratio', min: 0, max: 1, note: 'Part minimale du stock volée par un raid' },
  { path: 'RAID_RUN.MIN_LOOT_FRACTION', kind: 'ratio', min: 0, max: 1, note: 'Part payée à un raid mort sur le seuil' },
  { path: 'RAID_RUN.SHIELD_AFTER_RAID_MS', kind: 'int', min: 0, max: 604_800_000, note: 'Bouclier après avoir été raidé (ms)' },
  { path: 'RAID_RUN.COOLDOWN_MS', kind: 'int', min: 0, max: 604_800_000, note: 'Délai entre deux raids sur la même victime (ms)' },
  { path: 'RAID.ASLEEP_AFTER_MS', kind: 'int', min: 3_600_000, max: 2_592_000_000, note: 'Absent depuis plus longtemps = terrier endormi (ms)' },
  { path: 'RAID.ASLEEP_LOOT_SHARE', kind: 'ratio', min: 0, max: 1, note: 'Part du butin que paie un terrier endormi (un raid par absence)' },
  { path: 'RAID.LOOT_CAP', kind: 'int', min: 1, max: 10_000_000, note: 'Plafond de butin d\'un seul raid' },
  { path: 'RAID.BROKEN_SHIELD_MS', kind: 'int', min: 0, max: 604_800_000, note: 'Bouclier après un terrier vidé (ms)' },
  { path: 'RAID.ONBOARDING_SHIELD_MS', kind: 'int', min: 0, max: 604_800_000, note: 'Bouclier offert à un nouveau joueur (ms)' },

  // ── Traps: the defensive half. Read when a trap is placed, bought or springs.
  { path: 'TRAPS.FREE_PER_DAY', kind: 'int', min: 0, max: 100, note: 'Pièges gratuits par jour' },
  { path: 'TRAPS.MAX_PLACED', kind: 'int', min: 1, max: 100, note: 'Pièges posés au maximum' },
  { path: 'TRAPS.MAX_HELD', kind: 'int', min: 1, max: 500, note: 'Pièges détenus au maximum' },
  // NOT HERE, ON PURPOSE:
  //  - `TRAPS.DOORSTEP` reshapes stored data. The burrow generator cuts the
  //    doorstep into the ground (`game/burrow/generate`), the result is cached
  //    per seed and per process, and traps are STORED BY TILE INDEX — a live
  //    change would leave traps already standing on what had become doorstep,
  //    and the Godot client draws the doorstep from its own bundled copy. It
  //    is a deploy (and a reset-burrows) like any change of ground.
  //  - `TRAPS.CARROT_COST` is not a second price: the shop charges
  //    `SHOP.PRICES.trap`, and the file defines one as the other. It is an
  //    ALIAS of that key (see ALIASES below), so a row for it would have been
  //    a knob wired to nothing.

  // ── The energy gate. The COST of entering a run is read at the crossing, so
  //    it moves cleanly; what the run then opens with (`ENERGY.START`) does not
  //    and stays in the file.
  { path: 'ENERGY.CROSSING_COST', kind: 'int', min: 0, max: 1_000, note: 'Énergie prise à la traversée vers une île' },
  { path: 'ENERGY.MIN_TO_CROSS', kind: 'int', min: 0, max: 1_000, note: 'Énergie minimale dans le réservoir pour traverser' },
  /**
   * A bomb is read at the moment it goes off (run.ts), so a change lands on
   * the next blast and on nothing already paid. The sea follows it (alias
   * DROWN.LOSS). Live since 3 October 2026, the user's call: 70 hurt too much
   * and a deploy per try was too slow.
   */
  { path: 'ENERGY.BOMB_LOSS', kind: 'int', min: 1, max: 300, note: 'Énergie perdue sur une bombe (et à la noyade)' },
  { path: 'RAID_RUN.TOLL', kind: 'int', min: 0, max: 1_000, note: 'Péage d\'un raid, pris au premier pas' },
  { path: 'RAID_RUN.STAKE', kind: 'int', min: 1, max: 1_000, note: 'Mise maximale d\'un raid, péage compris' },
  { path: 'RAID_RUN.WALK_FLOOR', kind: 'int', min: 0, max: 100, note: 'Pas de marche exigés en réserve au-delà du péage pour entrer en raid' },
  { path: 'RAID_RUN.STEP_REFUND_AT_FIELD', kind: 'ratio', min: 0, max: 1, note: 'Part des pas rendue au réservoir quand le raid atteint le champ' },

  // ── Energy refills (carried since 2026-10-08).
  { path: 'ENERGY_PACK.MAX_PER_DAY', kind: 'int', min: 0, max: 100, note: 'Pleins d\'énergie utilisables par 24 h glissantes' },
] as const;

/** Index by path, for the loader and the seed script. */
export const OVERRIDABLE_BY_PATH: ReadonlyMap<string, TuningSpec> =
  new Map(OVERRIDABLE.map((s) => [s.path, s]));

/**
 * Paths the FILE defines as another key, and which must therefore move with it.
 *
 * `ENERGY.MAX` and `OUT_OF_RUN_ENERGY.MAX` are ONE tank (see tuning.ts, "ONE
 * TANK"): the run's ceiling and the burrow's are the same bar, and an override
 * that raised one alone would let the island fill a tank the burrow then
 * clipped on the next read. The pack sells "a full tank", and a trap's price
 * IS the shop's trap price. So only the source key is declared; every alias
 * reads the source's live value through `tuned()`, and a row written for an
 * alias is refused at load with a message naming the key to set instead.
 *
 * A test checks that each alias equals its source in the file — the day one
 * of them is decoupled in tuning.ts, it has to leave this map too.
 */
export const ALIASES: ReadonlyMap<string, string> = new Map([
  ['ENERGY.MAX', 'OUT_OF_RUN_ENERGY.MAX'],
  ['ENERGY_PACK.AMOUNT', 'OUT_OF_RUN_ENERGY.MAX'],
  ['TRAPS.CARROT_COST', 'SHOP.PRICES.trap'],
  ['FENCES.CARROT_COST', 'SHOP.PRICES.fence'],
  ['DROWN.LOSS', 'ENERGY.BOMB_LOSS'],
]);

/**
 * Rules BETWEEN keys, checked on the merged values (overrides over the file).
 *
 * Per-key bounds cannot say "the toll must not exceed the stake" — each number
 * is legal alone and the pair is a raid that enters with negative energy. When
 * a relation fails, the OVERRIDDEN keys it names are dropped (the file's own
 * values always satisfy every rule; a test holds that), with a log line saying
 * which rule broke. Same contract as a bad row: an override can fail to apply,
 * the game never runs on numbers that contradict each other.
 */
export interface TuningRelation {
  /** Every path the rule reads. Only the overridden ones are dropped. */
  readonly keys: readonly string[];
  readonly holds: (v: (path: string) => number) => boolean;
  readonly why: string;
}

export const RELATIONS: readonly TuningRelation[] = [
  {
    keys: ['RAID_RUN.LOOT_SHARE_MIN', 'RAID_RUN.LOOT_SHARE'],
    holds: (v) => v('RAID_RUN.LOOT_SHARE_MIN') <= v('RAID_RUN.LOOT_SHARE'),
    why: 'la part minimale de butin dépasse la maximale',
  },
  {
    keys: ['RAID_RUN.TOLL', 'RAID_RUN.STAKE'],
    holds: (v) => v('RAID_RUN.TOLL') <= v('RAID_RUN.STAKE'),
    why: 'le péage dépasse la mise : un raid entrerait avec une énergie négative',
  },
  {
    keys: ['RAID_RUN.TOLL', 'RAID_RUN.WALK_FLOOR', 'RAID_RUN.STEP_COST', 'OUT_OF_RUN_ENERGY.MAX'],
    holds: (v) => v('RAID_RUN.TOLL') + v('RAID_RUN.WALK_FLOOR') * v('RAID_RUN.STEP_COST') <= v('OUT_OF_RUN_ENERGY.MAX'),
    why: 'le plancher de raid dépasse un réservoir plein : plus aucun raid possible',
  },
  {
    keys: ['ENERGY.CROSSING_COST', 'ENERGY.MIN_TO_CROSS'],
    holds: (v) => v('ENERGY.CROSSING_COST') <= v('ENERGY.MIN_TO_CROSS'),
    why: 'la traversée coûte plus que le minimum exigé pour traverser',
  },
  {
    keys: ['ENERGY.MIN_TO_CROSS', 'OUT_OF_RUN_ENERGY.MAX'],
    holds: (v) => v('ENERGY.MIN_TO_CROSS') <= v('OUT_OF_RUN_ENERGY.MAX'),
    why: 'le minimum pour traverser dépasse un réservoir plein : plus aucune partie possible',
  },
  {
    // tuning.ts, RAID.BROKEN_SHIELD_MS: "the ordering is the whole point" —
    // a sacked burrow must be protected at least as long as a defended one.
    keys: ['RAID_RUN.SHIELD_AFTER_RAID_MS', 'RAID.BROKEN_SHIELD_MS'],
    holds: (v) => v('RAID_RUN.SHIELD_AFTER_RAID_MS') <= v('RAID.BROKEN_SHIELD_MS'),
    why: 'un terrier vidé serait protégé moins longtemps qu\'un terrier défendu',
  },
];

/**
 * Why this value is not acceptable for this key, or null when it is.
 *
 * Returns the REASON rather than a boolean so a refused override can say what
 * was wrong in the log — a silently ignored row is how a server ends up
 * running numbers nobody chose.
 */
export function rejectReason(spec: TuningSpec, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'pas un nombre fini';
  if (spec.kind === 'int' && !Number.isInteger(value)) return 'doit être un entier';
  if (value < spec.min || value > spec.max) return `hors bornes [${spec.min}, ${spec.max}]`;
  return null;
}
