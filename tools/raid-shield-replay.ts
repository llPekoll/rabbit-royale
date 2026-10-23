/**
 * REPLAY THE RAIDS UNDER OTHER SHIELD RULES (2026-10-23).
 *
 *   bun tools/raid-shield-replay.ts sim-eu.json [sim-sg.json ...]
 *
 * The input is one JSON per region (raids, runs, purchases and players of the
 * last 14 days — the read-only query beside it in the session's scratchpad).
 * Every walked raid that really happened is replayed in order; a rule may
 * BLOCK it (the victim is in a breather or under an auto-shield). A blocked
 * raider then goes elsewhere with probability `retarget`, to one of the
 * burrows they really raided in the window, for a haul drawn from that
 * burrow's own real hauls.
 *
 * What it cannot know, and assumes:
 *  - a shield bought or found is not activated by hand (the logs do not say
 *    when one was; the raids that happened already went around those);
 *  - a blocked haul is lost to the raider, not taken later at a higher stock
 *    (the cap, 1 200, bounds that error for the burrows that matter);
 *  - free shields come from chests at the measured chests-per-run of each
 *    player × 5.9 % (gold 19 % × 20 % + crown 6 % × 35 %), plus the snack box
 *    (5 % a day played), plus every shield or Shiro's Stash bought.
 */
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/lib/game/rng';

type Player = {
  id: string; name: string; level: number; stock: number; solo: boolean;
  created: string; seen: string; chestsOpened: number; runsPlayed: number; shields: number;
};
type Raid = { at: string; end: string | null; a: string; d: string; steps: number; traps: number; ok: boolean; loot: number; struck: boolean };
type Run = { p: string; at: string; carrots: number };
type Purchase = { p: string; at: string; kind: string; qty: number; currency: string; cost: number };
type Dump = { now: string; players: Player[] | null; raids: Raid[] | null; runs: Run[] | null; purchases: Purchase[] | null };

const H = 3_600_000;
const SHIELD_PER_CHEST = 0.19 * 0.20 + 0.06 * 0.35;
const SNACK_SHIELD_PER_DAY = 0.15 / 3;

export type Rule = {
  name: string;
  /** No raid that takes carrots may land on a burrow this soon after the last one (ms). */
  breather: number;
  /** Auto-shield from the bag: fires when losses since the last one, inside `window`, reach `threshold`. */
  auto?: { threshold: number; window: number; duration: number };
  /** The old free shield: 12 h after a raid short of the field, 16 h after one on it. */
  freeShield?: boolean;
  /** Free shields (chests + snack) a player may gain per day; Infinity = as now. */
  freeCap: number;
  /** The bag at the start of the window: 'now' (today's bag) or 'empty'. */
  bag: 'now' | 'empty';
  /** Chance a blocked raider goes to another burrow instead. */
  retarget: number;
  /** At most this many raids that took carrots per burrow per rolling 24 h. */
  dayCap?: number;
};

type Out = {
  rule: Rule; days: number;
  attempts: number; blocked: number; moved: number;
  taken: number; lostBy: Map<string, number>; tookBy: Map<string, number>;
  worstDay: Map<string, number>; activations: Map<string, number>;
  shieldedShare: number; earned: Map<string, number>; dug: Map<string, number>;
};

export function replay(dump: Dump, rule: Rule, seed = 7): Out {
  const rand = mulberry32(seed);
  const players = new Map((dump.players ?? []).map((p) => [p.id, p]));
  const raids = (dump.raids ?? []).filter((r) => r.steps > 1);
  const runs = dump.runs ?? [];
  const buys = dump.purchases ?? [];
  const t0 = Math.min(...raids.map((r) => +new Date(r.at)), ...runs.map((r) => +new Date(r.at)));
  const t1 = +new Date(dump.now);
  const days = (t1 - t0) / (24 * H);

  // Supply events: a run brings chests, a played day a snack box, a purchase its shields.
  type Ev = { t: number; kind: 'supply'; p: string; free: boolean; n: number } | { t: number; kind: 'raid'; r: Raid };
  const evs: Ev[] = [];
  const playedDays = new Map<string, Set<number>>();
  const dug = new Map<string, number>();
  for (const r of runs) {
    const p = players.get(r.p);
    const perRun = p && p.runsPlayed > 0 ? Math.min(10, p.chestsOpened / p.runsPlayed) : 2;
    const t = +new Date(r.at);
    evs.push({ t, kind: 'supply', p: r.p, free: true, n: perRun * SHIELD_PER_CHEST });
    const day = Math.floor(t / (24 * H));
    const set = playedDays.get(r.p) ?? new Set();
    if (!set.has(day)) evs.push({ t, kind: 'supply', p: r.p, free: true, n: SNACK_SHIELD_PER_DAY });
    set.add(day); playedDays.set(r.p, set);
    dug.set(r.p, (dug.get(r.p) ?? 0) + r.carrots);
  }
  for (const b of buys) {
    const n = b.kind === 'shield' ? b.qty : b.kind === 'shiro_stash' ? b.qty : 0;
    if (n > 0) evs.push({ t: +new Date(b.at), kind: 'supply', p: b.p, free: false, n });
  }
  for (const r of raids) evs.push({ t: +new Date(r.at), kind: 'raid', r });
  evs.sort((x, y) => x.t - y.t);

  // Where each raider really went, and what each burrow really paid.
  const victimsOf = new Map<string, string[]>();
  const hauls = new Map<string, number[]>();
  for (const r of raids) {
    const v = victimsOf.get(r.a) ?? []; if (!v.includes(r.d)) v.push(r.d); victimsOf.set(r.a, v);
    const h = hauls.get(r.d) ?? []; h.push(r.loot); hauls.set(r.d, h);
  }

  // The bag. 'now' starts from today's and adds the window's supply on top —
  // generous on purpose, the upper bound of what an auto-shield could spend.
  const bag = new Map<string, number>();
  for (const p of players.values()) bag.set(p.id, rule.bag === 'now' ? p.shields : 0);
  const freeToday = new Map<string, { day: number; n: number }>();
  const earned = new Map<string, number>();

  const shieldUntil = new Map<string, number>();
  const lastLoot = new Map<string, number>();
  const sinceShield = new Map<string, { t: number; loot: number }[]>();
  const lostBy = new Map<string, number>(), tookBy = new Map<string, number>();
  const lossDay = new Map<string, number>();
  const activations = new Map<string, number>();
  const shieldedMs = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  const looted = new Map<string, number[]>();
  const open = (d: string, t: number) =>
    !((shieldUntil.get(d) ?? 0) > t) && !(rule.breather > 0 && t - (lastLoot.get(d) ?? -Infinity) < rule.breather)
    && !(rule.dayCap !== undefined && (looted.get(d) ?? []).filter((x) => t - x < 24 * H).length >= rule.dayCap);

  const land = (a: string, d: string, t: number, loot: number, ok: boolean) => {
    add(tookBy, a, loot); add(lostBy, d, loot);
    add(lossDay, `${d}|${Math.floor(t / (24 * H))}`, loot);
    if (loot <= 0) return;
    lastLoot.set(d, t);
    looted.set(d, [...(looted.get(d) ?? []), t]);
    if (rule.freeShield) {
      const dur = ok ? 16 * H : 12 * H;
      shieldUntil.set(d, t + dur); add(shieldedMs, d, Math.min(dur, t1 - t));
      return;
    }
    if (!rule.auto) return;
    const log = (sinceShield.get(d) ?? []).filter((x) => t - x.t < rule.auto!.window);
    log.push({ t, loot }); sinceShield.set(d, log);
    const sum = log.reduce((s, x) => s + x.loot, 0);
    if (sum >= rule.auto.threshold && (bag.get(d) ?? 0) >= 1) {
      bag.set(d, (bag.get(d) ?? 0) - 1);
      shieldUntil.set(d, t + rule.auto.duration);
      add(shieldedMs, d, Math.min(rule.auto.duration, t1 - t));
      add(activations, d, 1);
      sinceShield.set(d, []);
    }
  };

  let attempts = 0, blocked = 0, moved = 0, taken = 0;
  for (const e of evs) {
    if (e.kind === 'supply') {
      let n = e.n;
      if (e.free) {
        const day = Math.floor(e.t / (24 * H));
        const f = freeToday.get(e.p);
        const used = f && f.day === day ? f.n : 0;
        n = Math.max(0, Math.min(n, rule.freeCap - used));
        freeToday.set(e.p, { day, n: used + n });
        add(earned, e.p, n);
      }
      bag.set(e.p, (bag.get(e.p) ?? 0) + n);
      continue;
    }
    const r = e.r, t = e.t;
    attempts++;
    if (open(r.d, t)) { land(r.a, r.d, t, r.loot, r.ok); taken += r.loot; continue; }
    blocked++;
    if (rand() >= rule.retarget) continue;
    const others = (victimsOf.get(r.a) ?? []).filter((v) => v !== r.d && open(v, t));
    if (!others.length) continue;
    const v = others[Math.floor(rand() * others.length)];
    const h = hauls.get(v)!;
    const loot = h[Math.floor(rand() * h.length)];
    moved++; taken += loot;
    land(r.a, v, t, loot, loot > 0);
  }

  const worstDay = new Map<string, number>();
  for (const [k, n] of lossDay) { const d = k.split('|')[0]; worstDay.set(d, Math.max(worstDay.get(d) ?? 0, n)); }
  const victims = [...new Set(raids.map((r) => r.d))];
  const shieldedShare = victims.length
    ? victims.reduce((s, v) => s + (shieldedMs.get(v) ?? 0), 0) / (victims.length * (t1 - t0))
    : 0;
  return { rule, days, attempts, blocked, moved, taken, lostBy, tookBy, worstDay, activations, shieldedShare, earned, dug };
}

// ---------------------------------------------------------------------------

if (import.meta.main) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: bun tools/raid-shield-replay.ts sim-eu.json [...]'); process.exit(1); }
  const BOT = /^Bot-/;
  const f = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const pct = (n: number) => `${Math.round(n * 100)} %`;

  const base: Omit<Rule, 'name'> = { breather: 0, freeCap: Infinity, bag: 'empty', retarget: 0.5 };
  const rules: Rule[] = [
    { ...base, name: 'actuel (rien)' },
    { ...base, name: 'ancien bouclier gratuit 12/16 h', freeShield: true },
    { ...base, name: 'répit 30 min', breather: 0.5 * H },
    { ...base, name: 'répit 60 min', breather: 1 * H },
  ];
  for (const breather of [0, 0.5 * H])
    for (const threshold of [200, 300, 500])
      for (const duration of [3 * H, 6 * H])
        rules.push({
          ...base, breather, freeCap: 1,
          name: `${breather ? 'répit 30 + ' : ''}auto ≥${threshold}/2 h → ${duration / H} h, 1 gratuit/j`,
          auto: { threshold, window: 2 * H, duration },
        });
  const auto300 = { threshold: 300, window: 2 * H, duration: 6 * H };
  for (const dayCap of [2, 3, 4]) {
    rules.push({ ...base, dayCap, name: `max ${dayCap} raids/24 h par terrier` });
    rules.push({ ...base, dayCap, breather: 0.5 * H, freeCap: 1, bag: 'now', auto: auto300, name: `max ${dayCap}/24 h + répit 30 + auto 300 → 6 h, sac actuel` });
  }
  rules.push({ ...base, breather: 1 * H, freeCap: 1, bag: 'now', auto: auto300, name: 'répit 60 + auto ≥300/2 h → 6 h, sac actuel' });
  rules.push({ ...base, breather: 0.5 * H, freeCap: Infinity, name: 'répit 30 + auto ≥300/2 h → 6 h, gratuits sans plafond', auto: { threshold: 300, window: 2 * H, duration: 6 * H } });
  rules.push({ ...base, breather: 0.5 * H, freeCap: 1, bag: 'now', name: 'répit 30 + auto ≥300/2 h → 6 h, sac actuel', auto: { threshold: 300, window: 2 * H, duration: 6 * H } });

  for (const file of files) {
    const dump = JSON.parse(readFileSync(file, 'utf8')) as Dump;
    const names = new Map((dump.players ?? []).map((p) => [p.id, p.name]));
    const name = (id: string) => names.get(id) ?? id.slice(0, 10);
    const raids = (dump.raids ?? []).filter((r) => r.steps > 1);
    if (!raids.length) { console.log(`\n### ${file}: aucun raid`); continue; }

    const ref = replay(dump, rules[0]);
    const topVictims = [...ref.lostBy].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    const topRaiders = [...ref.tookBy].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);

    console.log(`\n### ${file} — ${raids.length} raids marchés sur ${ref.days.toFixed(1)} jours`);
    console.log('\nBoucliers gratuits estimés par jour joué (coffres + snack), sans plafond :');
    const free = replay(dump, { ...base, name: 'supply', freeCap: Infinity });
    const days = new Map<string, number>();
    for (const r of dump.runs ?? []) {
      const k = `${r.p}|${Math.floor(+new Date(r.at) / (24 * H))}`; days.set(k, 1);
    }
    const playedDays = new Map<string, number>();
    for (const k of days.keys()) { const p = k.split('|')[0]; playedDays.set(p, (playedDays.get(p) ?? 0) + 1); }
    for (const [p, n] of [...free.earned].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      if (BOT.test(name(p))) continue;
      const d = playedDays.get(p) ?? 1;
      console.log(`  ${name(p).padEnd(16)} ${(n / d).toFixed(2)}/jour joué  (${d} j, ${f((free.dug.get(p) ?? 0) / d)} carottes creusées/j)`);
    }

    console.log(`\n${'règle'.padEnd(52)} bloqués  déplacés  volés/j  ${topVictims.map((v) => name(v).slice(0, 10).padStart(11)).join('')}  ${topRaiders.map((v) => name(v).slice(0, 9).padStart(10)).join('')}  sous bouclier`);
    console.log(`${''.padEnd(52)} ${''.padStart(7)}  ${''.padStart(8)}  ${''.padStart(7)}  ${topVictims.map(() => '  pire j'.padStart(11)).join('')}  ${topRaiders.map(() => 'gain/j'.padStart(10)).join('')}`);
    for (const rule of rules) {
      const o = replay(dump, rule);
      console.log(
        `${rule.name.padEnd(52)} ${pct(o.blocked / o.attempts).padStart(7)}  ${String(o.moved).padStart(8)}  ${f(o.taken / o.days).padStart(7)}  `
        + topVictims.map((v) => f(o.worstDay.get(v) ?? 0).padStart(11)).join('')
        + '  ' + topRaiders.map((v) => f((o.tookBy.get(v) ?? 0) / o.days).padStart(10)).join('')
        + `  ${pct(o.shieldedShare).padStart(6)}`
        + (rule.auto ? `  (${[...o.activations.values()].reduce((a, b) => a + b, 0)} activations)` : ''),
      );
    }
  }
}
