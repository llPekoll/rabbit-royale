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
  /** Dotted path into the tuning module, e.g. `SHOP.PRICES.bomb`. */
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
 */
export const OVERRIDABLE: readonly TuningSpec[] = [
  // ── The shop. THE case for this whole mechanism: a price that turns out to
  //    be wrong should not cost a deploy, and a weekend promotion should not
  //    cost every live run.
  { path: 'SHOP.PRICES.trap', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un piège en carottes' },
  { path: 'SHOP.PRICES.bomb', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'une bombe en carottes' },
  { path: 'SHOP.PRICES.lightning', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un éclair en carottes' },
  { path: 'SHOP.PRICES.shield', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un bouclier en carottes' },
  { path: 'SHOP.PRICES.energy', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un plein d\'énergie en carottes' },
  { path: 'SHOP.PRICES.smoke', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un écran de fumée en carottes' },
  { path: 'SHOP.PRICES.mirage', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un mirage en carottes' },

  /**
   * The money rail, bounded hard on purpose. A price in real currency is the
   * one number where a typo is not a balance problem but a refund problem, so
   * the ceiling here is deliberately far below anything a free-to-play game
   * would ever charge.
   */
  { path: 'SHOP.USDC_PRICES.trap', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un piège en USDC' },
  { path: 'SHOP.USDC_PRICES.bomb', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'une bombe en USDC' },
  { path: 'SHOP.USDC_PRICES.lightning', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un éclair en USDC' },
  { path: 'SHOP.USDC_PRICES.shield', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un bouclier en USDC' },
  { path: 'SHOP.USDC_PRICES.energy', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un plein d\'énergie en USDC' },
  { path: 'SHOP.USDC_PRICES.smoke', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un écran de fumée en USDC' },
  { path: 'SHOP.USDC_PRICES.mirage', kind: 'float', min: 0.01, max: 50, note: 'Prix d\'un mirage en USDC' },

  // ── The passive economy. Derived from a timestamp at read time (see
  //    lib/game/regen), so a change applies to the next read and never to a
  //    stretch of time already accounted for.
  { path: 'GARDEN.YIELD_PER_HOUR_BASE', kind: 'int', min: 0, max: 1_000, note: 'Rendement du jardin au niveau 1, par heure' },
  { path: 'GARDEN.YIELD_PER_LEVEL', kind: 'int', min: 0, max: 500, note: 'Rendement gagné par niveau de terrier' },
  { path: 'GARDEN.CAP_HOURS', kind: 'int', min: 1, max: 168, note: 'Heures de production avant que le jardin sature' },
  { path: 'OUT_OF_RUN_ENERGY.REGEN_PER_HOUR', kind: 'float', min: 0.01, max: 120, note: 'Énergie rendue par heure hors partie' },
  { path: 'OUT_OF_RUN_ENERGY.MAX', kind: 'int', min: 1, max: 1_000, note: 'Plafond d\'énergie banquée' },

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
  { path: 'RAID.LOOT_CAP', kind: 'int', min: 1, max: 10_000_000, note: 'Plafond de butin d\'un seul raid' },
  { path: 'RAID.BROKEN_SHIELD_MS', kind: 'int', min: 0, max: 604_800_000, note: 'Bouclier après un terrier vidé (ms)' },
  { path: 'RAID.ONBOARDING_SHIELD_MS', kind: 'int', min: 0, max: 604_800_000, note: 'Bouclier offert à un nouveau joueur (ms)' },

  // ── Traps: the defensive half. Read when a trap is placed, bought or springs.
  { path: 'TRAPS.FREE_PER_DAY', kind: 'int', min: 0, max: 100, note: 'Pièges gratuits par jour' },
  { path: 'TRAPS.MAX_PLACED', kind: 'int', min: 1, max: 100, note: 'Pièges posés au maximum' },
  // Read by the GENERATOR, which is cached per seed and per process — so a
  // row here changes nothing until the next deploy, and is listed so the table
  // mirrors the file (docs/TUNING.md), not for a hot change.
  { path: 'TRAPS.DOORSTEP', kind: 'int', min: 0, max: 6, note: 'Pas depuis l\'entrée où aucun piège ne peut être posé' },
  { path: 'TRAPS.MAX_HELD', kind: 'int', min: 1, max: 500, note: 'Pièges détenus au maximum' },
  { path: 'TRAPS.CARROT_COST', kind: 'int', min: 1, max: 100_000, note: 'Prix d\'un piège supplémentaire' },

  // ── The energy gate. The COST of entering a run is read at the crossing, so
  //    it moves cleanly; what the run then opens with (`ENERGY.START`) does not
  //    and stays in the file.
  { path: 'ENERGY.RUN_COST', kind: 'int', min: 0, max: 1_000, note: 'Énergie du terrier dépensée pour lancer une partie' },

  // ── Paid energy refills.
  { path: 'ENERGY_PACK.MAX_PER_DAY', kind: 'int', min: 0, max: 100, note: 'Pleins d\'énergie achetables par jour' },
] as const;

/** Index by path, for the loader and the seed script. */
export const OVERRIDABLE_BY_PATH: ReadonlyMap<string, TuningSpec> =
  new Map(OVERRIDABLE.map((s) => [s.path, s]));

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
