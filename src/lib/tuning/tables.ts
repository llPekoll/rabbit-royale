/**
 * The tuning tables, LIVE — what server code imports instead of
 * `config/tuning.ts` for every table that holds an overridable key.
 *
 * Each export is the file's own object seen through a read-only view: a key
 * declared in `config/overridable.ts` (or an alias of one, `ENERGY.MAX`) reads
 * `tuned()` — the 30-second snapshot of the `tuning` table, in memory, no
 * database on the read — and every other key reads the file untouched. Same
 * object, same type, so a call site changes its import line and nothing else,
 * and the compiler still checks every property it reads.
 *
 * WHY A VIEW AND NOT `tuned('PATH')` AT EACH SITE. Twenty-odd files read these
 * numbers, through derived figures as much as directly (the raid floor, a
 * level's regen, a garden's cap, the pack's "full tank"). A string path per
 * read is a typo the compiler cannot see and a site somebody forgets; a view
 * makes the live value the only one an importer of this module can get.
 *
 * WHAT IS STILL THE FILE'S. Code that imports `config/tuning.ts` directly
 * reads the build's numbers — right for the client-side React leftovers, the
 * simulators in tools/ and the generator, wrong for anything that charges,
 * pays or refuses. Keys that cannot be live at all are listed in
 * overridable.ts with the reason.
 */
// RELATIVE imports, like live.ts: the WS server loads this under Bun.
import * as FILE from '../../../config/tuning';
import { ALIASES, OVERRIDABLE_BY_PATH } from '../../../config/overridable';
import { tuned } from './live';

/** Paths whose read must go through the snapshot. */
const LIVE_PATHS: ReadonlySet<string> = new Set([...OVERRIDABLE_BY_PATH.keys(), ...ALIASES.keys()]);

/**
 * `table` as seen at `prefix`, with its live keys read through `tuned()`.
 * Nested plain objects (SHOP.PRICES) get their own view, built once.
 */
function liveView<T extends object>(prefix: string, table: T): T {
  const nested = new Map<string, unknown>();
  return new Proxy(table, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string') return value;
      const path = `${prefix}.${prop}`;
      if (typeof value === 'number') return LIVE_PATHS.has(path) ? tuned(path) : value;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        let view = nested.get(prop);
        if (view === undefined) {
          view = liveView(path, value as object);
          nested.set(prop, view);
        }
        return view;
      }
      return value;
    },
    // Read-only, like the `as const` objects they stand for.
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}

export const ENERGY = liveView('ENERGY', FILE.ENERGY);
export const OUT_OF_RUN_ENERGY = liveView('OUT_OF_RUN_ENERGY', FILE.OUT_OF_RUN_ENERGY);
export const GARDEN = liveView('GARDEN', FILE.GARDEN);
export const BURROW = liveView('BURROW', FILE.BURROW);
export const RAID_RUN = liveView('RAID_RUN', FILE.RAID_RUN);
export const RAID = liveView('RAID', FILE.RAID);
export const TRAPS = liveView('TRAPS', FILE.TRAPS);
export const FENCES = liveView('FENCES', FILE.FENCES);
export const ENERGY_PACK = liveView('ENERGY_PACK', FILE.ENERGY_PACK);
export const SHOP = liveView('SHOP', FILE.SHOP);
export const PASS = liveView('PASS', FILE.PASS);
export const DROWN = liveView('DROWN', FILE.DROWN);

/** `regenPerHour(level)` on the live OUT_OF_RUN_ENERGY. */
export const regenPerHour = (level: number): number => FILE.regenPerHour(level, OUT_OF_RUN_ENERGY);

/** `upgradeCost(level)` on the live BURROW ladder. */
export const upgradeCost = (level: number): number => FILE.upgradeCost(level, BURROW);

/** `itemCap(kind)` with the live trap bag. */
export const itemCap = (kind: keyof typeof FILE.SHOP.PRICES): number => FILE.itemCap(kind, TRAPS);

/**
 * THE RAID FLOOR: the toll plus the walk the tank must hold past it to be let
 * in. One definition for the route that refuses and the views that say why.
 */
export const raidFloor = (): number => RAID_RUN.TOLL + RAID_RUN.WALK_FLOOR * RAID_RUN.STEP_COST;
