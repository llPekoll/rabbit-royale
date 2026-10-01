/**
 * The numbers, as they are RIGHT NOW.
 *
 * `config/tuning.ts` is the source of truth and the fallback; the `tuning`
 * table may override the handful of keys `config/overridable.ts` declares
 * changeable. This module is the only place the two are reconciled, so no
 * caller has to know whether a number came from the build or the database.
 *
 * WHY A SNAPSHOT RATHER THAN A LOOKUP PER READ. The values are read on paths
 * that already touch Postgres once (a purchase, a raid settling, a burrow
 * read) and asking for a second round-trip on each would double the cost of
 * every one of them for numbers that change a few times a season. So the whole
 * table is read at once, held, and refreshed on a timer: a change is live
 * within `TTL_MS` everywhere, which is the honest meaning of "on the fly" for
 * a value nobody is watching tick.
 *
 * WHY IT NEVER THROWS. A tuning override is a convenience; the game existing
 * is not. Every failure here — no table yet, database down, a row with a
 * nonsense value — degrades to the file's own number and logs. The one thing
 * this module must never do is make a server refuse to start because someone
 * typed a price wrong.
 */
// RELATIVE, not `@config/...`. This module is imported by the WS server as
// well as by Next, and the WS server runs under Bun with no alias resolution
// (see the `../src/...` imports throughout server/index.ts). An aliased import
// resolves fine in the editor and then hangs at runtime on the one process
// that holds every live island.
import * as FILE from '../../../config/tuning';
import { ALIASES, OVERRIDABLE_BY_PATH, RELATIONS, rejectReason } from '../../../config/overridable';

/**
 * How long a snapshot is trusted.
 *
 * Short enough that a price fix during a live incident lands while you are
 * still watching the dashboard; long enough that a busy server is not
 * re-reading a dozen rows every second. The refresh is lazy — a read past the
 * deadline kicks it off — so an idle process costs nothing.
 */
const TTL_MS = 30_000;

type Overrides = ReadonlyMap<string, number>;

let current: Overrides = new Map();
let loadedAt = 0;
/** In-flight refresh, so a burst of reads triggers ONE query, not one each. */
let inFlight: Promise<void> | null = null;

/** Read one dotted path out of the shipped module. Undefined if it is not there. */
function fromFile(path: string): unknown {
  let node: unknown = FILE as unknown as Record<string, unknown>;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * The live value at `path`.
 *
 * Falls back to the file whenever the path is not overridden, is not
 * overridable at all, or the snapshot has not been loaded yet — which is the
 * normal state for the first read after boot and is exactly right: the file's
 * number is never wrong, only potentially stale.
 */
export function tuned(path: string): number {
  // An alias (`ENERGY.MAX`, `ENERGY_PACK.AMOUNT`…) reads its source key: the
  // file defines them as the same number, so the live value must be too.
  const key = ALIASES.get(path) ?? path;
  const override = current.get(key);
  if (override !== undefined) return override;
  const base = fromFile(key);
  if (typeof base !== 'number') {
    // A path that does not resolve is a programming error, not a data one, and
    // it must be loud: returning 0 here would quietly make something free.
    throw new Error(`[tuning] chemin inconnu: ${path}`);
  }
  return base;
}

/** Every override currently in force, for an admin view or a health check. */
export function activeOverrides(): Record<string, number> {
  return Object.fromEntries(current);
}

/**
 * The overrides as a CLIENT must apply them: every overridden key, plus every
 * alias of one (`ENERGY.MAX` beside `OUT_OF_RUN_ENERGY.MAX`), so a client that
 * merges `{path: value}` over its bundled copy of tuning.ts reads the same
 * number under whichever name it uses. Empty when nothing is overridden —
 * which is also the signal for a client to drop overrides it applied before.
 * Served by `/api/config` and `/api/burrow`; reads the snapshot only.
 */
export function clientOverrides(): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(current);
  for (const [alias, source] of ALIASES) {
    const v = current.get(source);
    if (v !== undefined) out[alias] = v;
  }
  return out;
}

/** When the snapshot was last refreshed, as a timestamp. 0 before the first load. */
export function loadedAtMs(): number {
  return loadedAt;
}

/**
 * Turn rows into the snapshot, dropping whatever does not pass.
 *
 * Exported and pure so the validation can be tested without a database — the
 * part worth testing is precisely which rows are refused.
 */
export function buildSnapshot(
  rows: readonly { key: string; value: number }[],
  warn: (msg: string) => void = (m) => console.warn(m),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const spec = OVERRIDABLE_BY_PATH.get(row.key);
    const source = ALIASES.get(row.key);
    if (source) {
      warn(`[tuning] ${row.key} est un alias de ${source}, ignorée : régler ${source}`);
      continue;
    }
    if (!spec) {
      // Not refused for being wrong — refused for not being declared. A key
      // that was overridable and no longer is lands here after a deploy, and
      // the message has to say so rather than look like corruption.
      warn(`[tuning] clé non surchargeable, ignorée: ${row.key}`);
      continue;
    }
    const bad = rejectReason(spec, row.value);
    if (bad) {
      warn(`[tuning] valeur refusée pour ${row.key} (${row.value}): ${bad}`);
      continue;
    }
    out.set(row.key, row.value);
  }
  dropContradictions(out, warn);
  return out;
}

/**
 * Drop the overrides that break a rule between keys (`RELATIONS`).
 *
 * Only OVERRIDDEN keys are dropped — the file's values satisfy every rule (a
 * test holds that), so falling back to them always ends the contradiction.
 * Repeats until a full pass is clean, because dropping one override can bring
 * a file value back that contradicts another override.
 */
function dropContradictions(out: Map<string, number>, warn: (msg: string) => void): void {
  const v = (path: string): number => {
    const o = out.get(path);
    if (o !== undefined) return o;
    const base = fromFile(path);
    return typeof base === 'number' ? base : NaN;
  };
  for (let pass = 0; pass <= RELATIONS.length; pass++) {
    let dropped = false;
    for (const rule of RELATIONS) {
      if (rule.holds(v)) continue;
      const culprits = rule.keys.filter((k) => out.has(k));
      if (culprits.length === 0) {
        warn(`[tuning] le fichier lui-même contredit une règle : ${rule.why}`);
        continue;
      }
      for (const k of culprits) out.delete(k);
      warn(`[tuning] surcharges refusées (${culprits.join(', ')}) : ${rule.why}`);
      dropped = true;
    }
    if (!dropped) return;
  }
}

/**
 * Refresh the snapshot from the database, now.
 *
 * Safe to call from anywhere and at any frequency: concurrent callers share
 * one query, and a failure leaves the previous snapshot in place rather than
 * emptying it — a database blip must not silently reset prices to the file's.
 */
export async function refreshTuning(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // Imported here rather than at module scope so that importing this file
      // never opens a connection — the db module connects lazily and tests read
      // `tuned()` without a database at all.
      const { db } = await import('../db');
      const { tuning } = await import('../db/schema');
      const rows = await db.select({ key: tuning.key, value: tuning.value }).from(tuning);
      current = buildSnapshot(rows);
      loadedAt = Date.now();
    } catch (e) {
      // Includes "relation tuning does not exist" on a database that has not
      // run the migration yet. The file's numbers are correct there; this is
      // not an outage.
      console.warn('[tuning] lecture impossible, on garde les valeurs du fichier:', e);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Refresh if the snapshot is older than the TTL. Fire-and-forget by design:
 * the caller gets today's numbers immediately and tomorrow's on the next read,
 * which is what keeps this off the latency path of a purchase.
 */
export function refreshTuningIfStale(): void {
  if (Date.now() - loadedAt < TTL_MS) return;
  void refreshTuning();
}

/** Drop the snapshot. For tests, and for a process that wants a clean read. */
export function resetTuningCache(): void {
  current = new Map();
  loadedAt = 0;
}

/**
 * Install a snapshot from rows, as a refresh would — same validation, no
 * database. For tests and benches (`test/tuning-live.test.ts`). Marks the
 * snapshot fresh so a stray `refreshTuningIfStale()` does not overwrite it.
 */
export function setTuningOverrides(
  rows: readonly { key: string; value: number }[],
  warn?: (msg: string) => void,
): void {
  current = buildSnapshot(rows, warn);
  loadedAt = Date.now();
}
