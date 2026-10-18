/**
 * LE BANC A CINQ — les iles partagees se remplissent-elles comme il faut ?
 *
 *   bun run tools/e2e/crowd.ts [--count 5] [--from 6] [--to 10] [--minutes 30]
 *   bun run tools/e2e/crowd.ts --count 9 --from 7 --gap 2 --once
 *       (9 lapins au niveau 7, un depart toutes les 2 s : 3 iles, dont 2
 *        pleines, attendues — verifie et note au rapport)
 *
 * Cinq vrais clients Godot (3 + 2 fenetres), cinq lapins qui partent du
 * niveau 6 (`--from`). Places par ile (RABBIT_LEVELS, 2026-10-02) : seul aux
 * niveaux 1-2, a deux du 3 au 5, a quatre des le 6 — `--from 3` montre les
 * paires, `--from 6` la melee a quatre. Ils traversent ensemble, puis chacun joue a son rythme — creuse vers
 * les coffres, foudroie, encre, pousse a la mer — et revient creuser : les
 * niveaux se decalent, et chaque traversee demande au serveur ou s'asseoir.
 *
 * Le chef d'orchestre RECENSE chaque ile toutes les 2 s (`__stage where`) et
 * relève ce qui n'est pas normal :
 *   • TROP PLEINE      plus de lapins que de places ;
 *   • NIVEAUX MELES    un lapin arrive sur une ile d'un autre niveau ;
 *   • ILE NEUVE        un lapin a une ile neuve alors qu'une ile de son niveau
 *                      avait une place (et de quoi creuser : ≥ 2 coffres) ;
 *   • SEUL             un lapin seul sur une ile partagee, et combien de temps.
 *
 * Triches (au rapport) : comptes faits ici (niveau, 3 M carottes, 5 eclairs et
 * 5 bloops), l'oracle, l'energie remise a 300. Socle : tools/e2e/bench.ts.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { players } from '../../src/lib/db/schema';
import { grantItem } from '../../src/lib/game/grant';
import { RABBIT_LEVELS } from '../../config/tuning';
import { BASE, Player, arg, ask, assist, clock, dig, home, phase, remark, runBench, sleep } from './bench';

const FROM = arg('--from', 6);
/** Le niveau ou l'on s'arrete ; au 10 (le dernier), on continue d'y creuser. */
const TO = Math.min(10, arg('--to', 10));
const MINUTES = arg('--minutes', 30);
/** Combien de lapins (une fenetre chacun, 3 par rangee, jusqu'a 9). */
const COUNT = Math.max(2, Math.min(9, arg('--count', 5)));
/** Les secondes entre deux departs d'une traversee commune. */
const GAP_S = arg('--gap', 1.2);
/** `--once` : une seule traversee commune, verifiee, puis chacun finit son ile. */
const ONCE = process.argv.includes('--once');
const NAMES = ['Shiro', 'Kuro', 'Mochi', 'Pepper', 'Clover', 'Nori', 'Biscuit', 'Tofu', 'Maple'];
const TAGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].slice(0, COUNT);
// 3 fenetres par rangee, au format du Seeker couche (890x400).
const W = 636;
const H = 286;
const seatsOf = (level: number) => RABBIT_LEVELS.LADDER[Math.max(1, Math.min(10, level)) - 1]?.seats ?? 1;

const crowd = TAGS.map((tag, i) => new Player(tag, {
  x: (i % 3) * (W + 6), y: 30 + Math.floor(i / 3) * (H + 34), w: W, h: H,
}));
const tagOf = new Map<string, string>();

// ── Le recensement des iles ──────────────────────────────────────────────────
interface Census { seed: string; level: number; seats: number; rabbits: string[]; chests: number; spare: number; at: number }
const islands = new Map<string, Census>();
const history = new Map<string, { level: number; seats: number; firstAt: string; most: number; who: Set<string>; lastAt: string }>();
const findings: string[] = [];
const arrivals: string[] = [];
const alone = new Map<string, { since: number; seed: string }>();
const aloneTotals: string[] = [];

function finding(text: string) {
  findings.push(`${clock()} ${text}`);
  console.log(`  ⚠ ${text}`);
}

async function look(seed: string): Promise<Census | null> {
  const w = await ask({ op: 'where', islandId: seed });
  if (!w || w.error) return null;
  const level = Number(w.level ?? Number(String(seed).match(/^lv(\d+):/)?.[1] ?? 0));
  const tiles = (w.tiles ?? []).length;
  const c: Census = {
    seed, level, seats: w.solo ? 1 : seatsOf(level),
    rabbits: (w.rabbits ?? []).map((r: any) => tagOf.get(r.playerId) ?? String(r.playerId).slice(6, 12)),
    chests: (w.chests ?? []).length,
    spare: tiles - (w.revealed ?? []).length - (w.bombs ?? []).length - (w.chests ?? []).length,
    at: Date.now(),
  };
  return c;
}

/** Toutes les 2 s : chaque ile ou se tient un des cinq, et celles deja vues. */
async function censusLoop() {
  const lastSeed = new Map<string, string>();
  for (;;) {
    await sleep(2000);
    const live = new Set<string>();
    for (const p of crowd) if (p.state?.onIsland && p.state.seed) live.add(p.state.seed);
    for (const seed of islands.keys()) live.add(seed);
    for (const seed of live) {
      const before = islands.get(seed);
      const c = await look(seed);
      if (!c) { islands.delete(seed); continue; }
      islands.set(seed, c);
      const h = history.get(seed) ?? { level: c.level, seats: c.seats, firstAt: clock(), most: 0, who: new Set<string>(), lastAt: clock() };
      h.most = Math.max(h.most, c.rabbits.length);
      c.rabbits.forEach((r) => h.who.add(r));
      h.lastAt = clock();
      history.set(seed, h);
      const was = before?.rabbits.join('+') ?? '';
      const now = c.rabbits.join('+');
      if (was !== now) remark(`ile ${seed.slice(0, 12)} (niv. ${c.level}, ${c.seats} place${c.seats > 1 ? 's' : ''}) : ${now || 'vide'} — ${c.chests} coffre(s) restant(s)`);
      if (c.rabbits.length > c.seats) finding(`TROP PLEINE : ${seed.slice(0, 12)} a ${c.rabbits.length} lapins pour ${c.seats} places (${now})`);
    }
    // LES ARRIVEES : un lapin dont l'ile change.
    for (const p of crowd) {
      const s = p.state;
      const seed = s?.onIsland ? s.seed : '';
      const prev = lastSeed.get(p.tag) ?? '';
      if (seed && seed !== prev) await arrived(p, seed);
      if (!seed && prev) leftAlone(p);
      lastSeed.set(p.tag, seed);
    }
    // SEUL sur une ile partagee.
    for (const p of crowd) {
      const s = p.state;
      const c = s?.onIsland ? islands.get(s.seed) : undefined;
      if (c && c.seats > 1 && c.rabbits.length === 1) {
        if (!alone.has(p.tag)) alone.set(p.tag, { since: Date.now(), seed: c.seed });
      } else {
        leftAlone(p);
      }
    }
  }
}

function leftAlone(p: Player) {
  const a = alone.get(p.tag);
  if (!a) return;
  alone.delete(p.tag);
  const secs = Math.round((Date.now() - a.since) / 1000);
  if (secs >= 6) aloneTotals.push(`${p.tag} seul ${secs} s sur ${a.seed.slice(0, 12)}`);
}

async function arrived(p: Player, seed: string) {
  const c = islands.get(seed) ?? (await look(seed));
  if (!c) return;
  const lvl = p.level;
  const others = c.rabbits.filter((r) => r !== p.tag);
  const fresh = !history.has(seed) || (history.get(seed)!.who.size <= 1 && others.length === 0);
  arrivals.push(`${clock()} ${p.tag} (niv. ${lvl}) → ${seed.slice(0, 12)} niv. ${c.level} : ${c.rabbits.length}/${c.seats}${others.length ? ` avec ${others.join('+')}` : ' (seul)'}`);
  console.log(`  → ${p.tag} niv. ${lvl} sur ${seed.slice(0, 12)} (${c.rabbits.length}/${c.seats})`);
  if (c.level && lvl && c.level !== lvl) finding(`NIVEAUX MELES : ${p.tag} niv. ${lvl} sur une ile niv. ${c.level} (${seed.slice(0, 12)})`);
  if (!fresh || c.seats <= 1) return;
  // Une ile de son niveau avait-elle une place, au dernier recensement ?
  for (const o of islands.values()) {
    if (o.seed === seed || o.level !== c.level || o.seats <= 1) continue;
    const room = o.rabbits.filter((r) => r !== p.tag).length < o.seats;
    if (room && o.chests >= 2 && o.spare >= 20 && Date.now() - o.at < 5000) {
      finding(`ILE NEUVE : ${p.tag} a eu ${seed.slice(0, 12)} alors que ${o.seed.slice(0, 12)} (niv. ${o.level}) avait ${o.rabbits.length}/${o.seats} et ${o.chests} coffres — a verifier (l'eruption n'est pas visible d'ici)`);
    }
  }
}

// ── Les comptes ──────────────────────────────────────────────────────────────
async function prepare() {
  for (let i = 0; i < crowd.length; i++) {
    const p = crowd[i];
    const g: any = await (await fetch(BASE + '/api/auth/guest', { method: 'POST' })).json();
    if (!g?.token) throw new Error('guest failed ' + JSON.stringify(g));
    p.token = g.token;
    tagOf.set(g.player.id, p.tag);
    await db.update(players).set({
      name: `${NAMES[i]}${Math.floor(Math.random() * 90 + 10)}`, level: FROM, runsPlayed: 5,
      energy: 300, energyUpdatedAt: new Date(), stock: 3_000_000, shieldedUntil: null,
    }).where(eq(players.id, g.player.id));
    for (const kind of ['lightning', 'bloop'] as const) {
      await db.transaction((tx) => grantItem(tx as any, g.player.id, kind, 5));
    }
  }
  assist(`${COUNT} comptes faits au niveau ${FROM} (tuto saute), 3 M carottes, 5 eclairs et 5 bloops chacun`);
}

// ── Le scenario ──────────────────────────────────────────────────────────────
async function together(label: string, ps = crowd) {
  remark(`${label} : ${ps.map((p) => `${p.tag} niv. ${p.level}`).join(', ')}`);
  return Promise.all(ps.map(async (p, i) => {
    await sleep(i * GAP_S * 1000);
    return dig(p, { fight: true, marks: 1 });
  }));
}

/**
 * LA REPARTITION ATTENDUE d'une traversee commune : des iles pleines, et ce
 * qui reste sur une derniere. Relevee quand tous sont assis (ou 90 s).
 */
async function checkSplit(level: number) {
  for (let i = 0; i < 180 && !crowd.every((p) => p.state?.onIsland); i++) await sleep(500);
  await sleep(2500);
  const seats = seatsOf(level);
  const bySeed = new Map<string, string[]>();
  for (const p of crowd) {
    const s = p.state;
    if (!s?.onIsland || !s.seed) continue;
    bySeed.set(s.seed, [...(bySeed.get(s.seed) ?? []), p.tag]);
  }
  const sizes = [...bySeed.values()].map((v) => v.length).sort((a, b) => b - a);
  const wantIslands = Math.ceil(COUNT / seats);
  const wantFull = Math.floor(COUNT / seats);
  const full = sizes.filter((n) => n === seats).length;
  const seen = [...bySeed.entries()].map(([seed, tags]) => `${seed.slice(0, 12)} ${tags.join('+')} (${tags.length}/${seats})`).join(' · ');
  const verdict = `attendu ${wantIslands} iles dont ${wantFull} pleines — vu ${bySeed.size} iles dont ${full} pleines [${sizes.join(', ')}]`;
  if (bySeed.size === wantIslands && full === wantFull && sizes.reduce((a, b) => a + b, 0) === COUNT) {
    remark(`✔ REPARTITION : ${verdict} — ${seen}`);
  } else {
    finding(`REPARTITION : ${verdict} — ${seen}`);
  }
}

async function scenario() {
  phase(`1. ${COUNT} sessions reprises, au terrier`);
  const ok = await Promise.all(crowd.map((p) => p.cmd('onboard', {}, 120)));
  if (ok.some((o) => !o.ok)) throw new Error('un joueur n\'arrive pas au terrier');
  void censusLoop();

  if (ONCE) {
    phase(`2. Niveau ${FROM} : ${COUNT} lapins traversent a ${GAP_S} s d'ecart (${seatsOf(FROM)} places par ile)`);
    const runs = together('traversee commune');
    await checkSplit(FROM);
    phase('3. Chacun finit son ile');
    await runs;
    for (const p of crowd) leftAlone(p);
    return;
  }

  phase(`2. Niveau ${FROM} : les ${COUNT} traversent en meme temps (${seatsOf(FROM)} places par ile)`);
  await together('traversee commune');

  phase(`3. Chacun a son rythme jusqu'au niveau ${TO} — les iles se remplissent au fil des retours`);
  const deadline = Date.now() + MINUTES * 60_000;
  // Arrive au 10, on continue de creuser : les autres le rejoignent un a un,
  // et l'ile a quatre places se remplit sous nos yeux. Sous le 10, on attend
  // les autres au niveau vise (creuser encore le ferait monter plus haut).
  await Promise.all(crowd.map(async (p) => {
    let n = 0;
    while (!crowd.every((q) => q.level >= TO) && Date.now() < deadline) {
      if (TO < 10 && p.level >= TO) { await sleep(2000); continue; }
      await home(p);
      if (++n % 3 === 0) await p.cmd('shop', { buy: { lightning: 2, bloop: 2 } }, 200);
      await dig(p, { fight: true, marks: 1 });
    }
  }));

  phase(`4. Niveau ${TO} : les ${COUNT} traversent en meme temps (${seatsOf(TO)} places par ile)`);
  await Promise.all(crowd.map((p) => home(p)));
  if (crowd.every((p) => p.level === TO)) {
    await together('derniere traversee commune');
  } else {
    remark(`pas tous au niveau ${TO} dans le temps donne : ${crowd.map((p) => `${p.tag} ${p.level}`).join(', ')}`);
  }
  for (const p of crowd) leftAlone(p);
}

await runBench({
  title: `Banc a ${COUNT} — les iles partagees`,
  players: crowd,
  prepare,
  scenario,
  godotArgs: ['--max-fps', '30'],
  sections: () => ({
    Constats: findings.map((f) => `- ${f}`),
    'Iles vues': [...history.entries()].map(([seed, h]) =>
      `- \`${seed.slice(0, 14)}\` niv. ${h.level}, ${h.seats} place(s) : au plus ${h.most} lapin(s) — ${[...h.who].join(', ')} (${h.firstAt} → ${h.lastAt})`),
    Arrivees: arrivals.map((a) => `- ${a}`),
    'Seul sur une ile partagee': aloneTotals.map((a) => `- ${a}`),
  }),
});
