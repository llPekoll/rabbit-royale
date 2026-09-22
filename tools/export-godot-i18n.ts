/**
 * THE FOUR DICTIONARIES, EXPORTED FOR GODOT.
 *
 *   bun tools/export-godot-i18n.ts
 *
 * Writes godot/assets/i18n/<locale>.json — one file per language, the same
 * shape as src/i18n/dict/*.ts, so `t.shop.title` on the web is
 * `I18N.t("shop.title")` in Godot and a string is translated ONCE, here.
 *
 * WHY EXPORT RATHER THAN RETYPE. The dictionaries are 3 500 lines across four
 * languages, and the web's compiler is what keeps them in step (a missing key
 * fails the build — see dictionaries.ts). A hand copy in GDScript would have
 * no such check and would drift the day someone edits a string on one side.
 * This script runs at the seam instead: the TypeScript is the source of
 * truth, the JSON is a build artefact of it, committed so a fresh Godot
 * checkout needs no bun.
 *
 * FUNCTIONS BECOME TEMPLATES. Every interpolated line is a function on the
 * web (`t.loop.traps(n)`), which JSON cannot carry. Each one is CALLED here
 * with placeholder arguments — "{0}", "{1}" — and what comes back is a
 * template Godot fills with String.format. That covers the plain
 * `${name}` lines outright.
 *
 * THE CONDITIONALS ARE THE HARD PART. A function is free to branch on its
 * arguments — `n === 1 ? '' : 's'`, `previous ? 'NEW' : 'FIRST'`,
 * `held > 0 ? ... : ...` — and a single placeholder call only ever sees one
 * branch. So each function is also called with the values those branches
 * key on (1, 0 and null, in every slot, in every combination), and each
 * result that differs from the plain template is kept as a VARIANT with the
 * argument values that produced it. Godot picks the variant whose conditions
 * its actual arguments satisfy, and falls back to the template. It is not a
 * general evaluator — it is the three values the dictionaries actually
 * branch on, and a test below fails the export if a new dictionary line
 * branches on something else.
 *
 * ARITHMETIC ON AN ARGUMENT (`#${rank - 1}`) turns a string placeholder into
 * NaN. Those lines are re-run with numeric sentinels, and the sentinel minus
 * one is written back as "{1-1}", which the Godot side knows to compute.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DICTIONARIES } from '../src/i18n/dictionaries';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** A template with the variants its branches produce. */
interface Template {
  $t: string;
  $v?: { when: Record<string, number | null>; t: string }[];
}

const OUT_DIR = join(import.meta.dir, '..', 'godot', 'assets', 'i18n');

/** The values the dictionaries branch on. A slot not in a condition keeps its placeholder. */
const PROBE_VALUES: (number | null)[] = [1, 0, null];

/** Numeric sentinels, one per slot, far from anything a line would print. */
const NUMERIC_BASE = 910000;
const NUMERIC_STEP = 1000;

function placeholder(i: number): string {
  return `{${i}}`;
}

/**
 * Call `fn` with `args` and turn the result into a template: every sentinel
 * becomes its placeholder. Numeric sentinels also map their `- 1` back.
 */
function render(fn: (...a: unknown[]) => unknown, args: unknown[], numeric: boolean): string | null {
  let out: unknown;
  try {
    out = fn(...args);
  } catch {
    return null;
  }
  if (typeof out !== 'string') return null;
  let text = out;
  if (numeric) {
    for (let i = args.length - 1; i >= 0; i -= 1) {
      const n = NUMERIC_BASE + i * NUMERIC_STEP;
      text = text.split(String(n - 1)).join(`{${i}-1}`);
      text = text.split(String(n)).join(placeholder(i));
    }
  }
  return text;
}

function baseArgs(arity: number, numeric: boolean): unknown[] {
  return Array.from({ length: arity }, (_, i) =>
    numeric ? NUMERIC_BASE + i * NUMERIC_STEP : placeholder(i));
}

/** What the plain template would print for these probe values. */
function fill(template: string, args: (number | null | string)[]): string {
  let text = template;
  args.forEach((v, i) => {
    // A slot still holding its placeholder is left as it is, `{i-1}` included.
    if (typeof v === 'string') return;
    const shown = v === null ? '' : String(v);
    text = text.split(`{${i}-1}`).join(v === null ? '' : String(v - 1));
    text = text.split(placeholder(i)).join(shown);
  });
  return text;
}

type SlotKind = 'num' | 'str';

function sentinel(i: number, kind: SlotKind): unknown {
  return kind === 'num' ? NUMERIC_BASE + i * NUMERIC_STEP : placeholder(i);
}

/**
 * NUMERIC SENTINELS FIRST, for every slot. A number far from anything a line
 * prints reads as the "many" case of every plural and passes through
 * arithmetic, so the template it yields is the general form — "{0} traps",
 * not "trap" — and the singular is then a variant, which is the right way
 * round. A slot whose function only accepts a string (`name.toUpperCase()`)
 * throws on a number, and that slot alone falls back to a string sentinel.
 */
function chooseKinds(fn: (...a: unknown[]) => unknown, arity: number): SlotKind[] {
  const kinds: SlotKind[] = Array.from({ length: arity }, () => 'num');
  const works = (): boolean => {
    try {
      const out = fn(...kinds.map((k, i) => sentinel(i, k)));
      return typeof out === 'string' && !/NaN|undefined/.test(out);
    } catch {
      return false;
    }
  };
  if (works()) return kinds;
  for (let i = 0; i < arity; i += 1) {
    kinds[i] = 'str';
    if (works()) return kinds;
  }
  throw new Error('cannot render with any sentinels');
}

function exportFunction(fn: (...a: unknown[]) => unknown, path: string): Template {
  const arity = fn.length;
  let kinds: SlotKind[];
  try {
    kinds = chooseKinds(fn, arity);
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  const numeric = kinds.some((k) => k === 'num');
  const base = render(fn, kinds.map((k, i) => sentinel(i, k)), numeric);
  if (base === null) throw new Error(`${path}: cannot render with placeholders`);

  // A null is only probed where the function can mean it: a string slot
  // (`previous ? ... : ...`) or a function that names null. In a numeric
  // slot it would otherwise pass through arithmetic as -1 and look like a branch.
  const source = fn.toString();
  const probesFor = (i: number): (number | null)[] =>
    kinds[i] === 'str' ? [null] : (source.includes('null') ? [1, 0, null] : [1, 0]);

  const variants: Template['$v'] = [];
  const slotChoices = Array.from({ length: arity }, (_, i) => [undefined, ...probesFor(i)]);
  const total = slotChoices.reduce((n, c) => n * c.length, 1);
  for (let mask = 1; mask < total; mask += 1) {
    const args: unknown[] = [];
    const when: Record<string, number | null> = {};
    let rest = mask;
    for (let i = 0; i < arity; i += 1) {
      const choices = slotChoices[i];
      const pick = choices[rest % choices.length];
      rest = Math.floor(rest / choices.length);
      if (pick === undefined) {
        args.push(sentinel(i, kinds[i]));
      } else {
        args.push(pick);
        when[String(i)] = pick;
      }
    }
    const text = render(fn, args, numeric);
    if (text === null) continue;
    // A null that was merely PRINTED ("null traps") is not a branch: only a
    // line that tests for null reads differently without saying the word.
    if (/null|undefined/.test(text)) continue;
    const probe = args.map((a, i) => (String(i) in when ? (when[String(i)] as number | null) : placeholder(i)));
    if (text === fill(base, probe)) continue;
    // A variant is only worth keeping if a SMALLER condition set does not
    // already produce it: `{0:1}` covers `{0:1, 1:0}` when the second value
    // changed nothing.
    const covered = variants.some((v) =>
      Object.entries(v.when).every(([k, val]) => when[k] === val) && fill(v.t, probe) === text);
    if (!covered) variants.push({ when, t: text });
  }
  const out: Template = { $t: base };
  if (variants.length) out.$v = variants;
  return out;
}

function exportNode(node: unknown, path: string): Json {
  if (typeof node === 'function') {
    return exportFunction(node as (...a: unknown[]) => unknown, path) as unknown as Json;
  }
  if (Array.isArray(node)) {
    return node.map((v, i) => exportNode(v, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(node)) out[k] = exportNode(v, path ? `${path}.${k}` : k);
    return out;
  }
  return node as Json;
}

mkdirSync(OUT_DIR, { recursive: true });
let functions = 0;
let variants = 0;
for (const [locale, dict] of Object.entries(DICTIONARIES)) {
  const tree = exportNode(dict, '');
  const walk = (n: Json): void => {
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      if ('$t' in n) {
        functions += 1;
        variants += ((n as unknown as Template).$v ?? []).length;
        return;
      }
      Object.values(n).forEach(walk);
    } else if (Array.isArray(n)) n.forEach(walk);
  };
  walk(tree);
  writeFileSync(join(OUT_DIR, `${locale}.json`), `${JSON.stringify(tree, null, 1)}\n`);
  console.log(`${locale}.json written`);
}
console.log(`${functions} templates, ${variants} variants across the four languages`);
