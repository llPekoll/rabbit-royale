/**
 * LE TEST DE BOUT EN BOUT A DEUX — deux vrais clients Godot, cote a cote,
 * qui jouent ensemble du tuto au niveau 10 sur un rr-ws LOCAL.
 *
 *   bun run tools/e2e/duo.ts [--stop-after <phase>] [--to <niveau>]
 *
 * Chaque fenetre est le jeu (main.tscn) joue par une main qu'on voit
 * (godot/scripts/demo/duo_player.gd) : chaque geste est un vrai clic. Ce
 * script est le chef d'orchestre : il dit a chacun quoi faire (creuser,
 * raider l'autre, garder la maison, regarder, acheter...), lit ce qui s'est
 * passe, et ecrit le rapport.
 *
 * Ce qu'il triche, et seulement ca (tout est note au rapport) :
 *   • l'ORACLE : il dit au joueur ou sont les bombes et les coffres de son
 *     ile (`__stage where`), pour choisir ou taper — jamais pour jouer ;
 *   • l'ENERGIE : remise a 300 avant chaque traversee et pendant la run sous
 *     80 (sinon 10 niveaux = des heures de recharge) ;
 *   • les CAROTTES : 3 M au niveau 3, pour etre en tete de la liste RAID
 *     (la base locale garde des bots du banc a 2 M) ;
 *   • les BOUCLIERS leves avant chaque raid, et le delai d'une heure entre
 *     deux raids sur la meme victime efface (raid_runs recules, base locale).
 *
 * Sortie : tools/e2e/out/<date>/ — report.md, godot-A.log, godot-B.log,
 * server.log, et dans A/ B/ les captures des gestes ratés.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync, openSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { io as connect, type Socket } from 'socket.io-client';
import { and, eq, or } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { players, raidRuns } from '../../src/lib/db/schema';

const PORT = 3012;
const BASE = `http://localhost:${PORT}`;
const GODOT = process.env.GODOT_BIN ?? '/Applications/Godot.app/Contents/MacOS/Godot';
const ROOT = new URL('../../', import.meta.url).pathname;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = `${ROOT}tools/e2e/out/${STAMP}/`;
const USER_DIR = 'rabbit-royale-e2e';
const W = 950;
const H = 428;
const arg = (k: string, d: number) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d);
const FINAL_LEVEL = arg('--to', 10);
/** `--stop-after 2` : s'arrete avant la phase 3 (pour regler le banc). */
const STOP_AFTER = arg('--stop-after', 99);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const clock = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ── Le journal, qui devient le rapport ───────────────────────────────────────
interface Line { t: string; who: string; op: string; ok: boolean | null; notes: string[]; result?: any }
const journal: Line[] = [];
const assists: string[] = [];
const phases: Array<{ t: string; title: string }> = [];
function phase(title: string) {
  if (phases.length >= STOP_AFTER) throw new Error(`arret demande apres la phase ${STOP_AFTER}`);
  phases.push({ t: clock(), title });
  journal.push({ t: clock(), who: '—', op: `## ${title}`, ok: null, notes: [] });
  console.log(`\n━━ ${clock()} ${title}`);
}
function assist(text: string) {
  assists.push(`${clock()} ${text}`);
  console.log(`  ⚙ ${text}`);
}

// ── Les deux joueurs ─────────────────────────────────────────────────────────
interface State {
  playerId: string; name: string; level: number; energy: number; stock: number;
  place: string; crossing: boolean; seed: string; onIsland: boolean; spectating: string;
  inRaid: boolean; incoming: boolean; dialog: string; mode: string; op: string;
}
class Player {
  bus: string;
  seq = 0;
  proc?: ChildProcess;
  /** Pas de recharge d'energie pendant la run (le cas « il meurt »). */
  starve = false;
  asked = '';
  constructor(public tag: 'A' | 'B', public x: number) {
    this.bus = `${OUT}${tag}`;
    mkdirSync(this.bus, { recursive: true });
  }
  get state(): State | null {
    try { return JSON.parse(readFileSync(`${this.bus}/state.json`, 'utf8')); } catch { return null; }
  }
  get id() { return this.state?.playerId ?? ''; }
  get level() { return this.state?.level ?? 0; }

  launch() {
    const log = openSync(`${OUT}godot-${this.tag}.log`, 'w');
    this.proc = spawn(GODOT, [
      '--path', `${ROOT}godot`, '--position', `${this.x},40`,
      'scenes/demo/duo_player.tscn', '--',
      `--server=${BASE}`, `--token=e2e-${this.tag}-bogus`, `--bus=${this.bus}`, `--tag=${this.tag}`,
    ], { stdio: ['ignore', log, log] });
  }

  /** Un ordre ; rend l'ack quand le joueur a fini. */
  async cmd(op: string, args: Record<string, unknown> = {}, timeoutS = 600): Promise<{ ok: boolean; notes: string[]; result: any }> {
    const seq = ++this.seq;
    const tmp = `${this.bus}/.cmd.json`;
    writeFileSync(tmp, JSON.stringify({ seq, op, args: { timeout: timeoutS, ...args } }));
    renameSync(tmp, `${this.bus}/cmd.json`);
    const line: Line = { t: clock(), who: this.tag, op: `${op} ${Object.keys(args).length ? JSON.stringify(args) : ''}`.trim(), ok: null, notes: [] };
    journal.push(line);
    console.log(`  ${this.tag} ▶ ${line.op}`);
    const until = Date.now() + (timeoutS + 60) * 1000;
    for (;;) {
      await sleep(400);
      try {
        const ack = JSON.parse(readFileSync(`${this.bus}/ack.json`, 'utf8'));
        if (ack.seq === seq) {
          line.ok = !!ack.ok;
          line.notes = ack.notes ?? [];
          line.result = ack.result;
          console.log(`  ${this.tag} ${ack.ok ? '✔' : '✘'} ${op}${line.notes.length ? ' — ' + line.notes.join(' | ') : ''}`);
          return ack;
        }
      } catch { /* pas encore */ }
      if (Date.now() > until || this.proc?.exitCode != null) {
        line.ok = false;
        line.notes = [this.proc?.exitCode != null ? `Godot s'est arrete (code ${this.proc.exitCode})` : 'pas de reponse'];
        console.log(`  ${this.tag} ✘ ${op} — ${line.notes[0]}`);
        return { ok: false, notes: line.notes, result: {} };
      }
    }
  }
}

// ── Le serveur de scene, l'oracle, l'energie ─────────────────────────────────
let stage: Socket;
const ask = (req: any) => new Promise<any>((ok) => {
  const t = setTimeout(() => ok({ error: 'timeout' }), 3000);
  stage.emit('__stage', req, (res: any) => { clearTimeout(t); ok(res); });
});

async function restartServer() {
  const pids = (() => { try { return execSync(`lsof -ti tcp:${PORT} -sTCP:LISTEN`).toString().trim(); } catch { return ''; } })();
  if (pids) {
    console.log(`rr-ws ${PORT} relance (iles en memoire effacees)`);
    for (const p of pids.split('\n')) try { process.kill(Number(p)); } catch { /* deja parti */ }
    await sleep(1500);
  }
  const log = openSync(`${OUT}server.log`, 'w');
  const srv = spawn('bun', ['run', 'server/index.ts'], {
    cwd: ROOT, env: { ...process.env, RR_STAGE: '1', WS_PORT: String(PORT) }, stdio: ['ignore', log, log], detached: true,
  });
  srv.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const h = await fetch(BASE + '/health').then((r) => r.ok).catch(() => false);
    if (h) return;
  }
  throw new Error('rr-ws ne demarre pas — voir server.log');
}

async function oracleLoop(ps: Player[]) {
  for (;;) {
    await sleep(60);
    for (const p of ps) {
      let want = '';
      try { want = readFileSync(`${p.bus}/want.txt`, 'utf8').trim(); } catch { continue; }
      if (!want || want === p.asked) continue;
      p.asked = want;
      const [seed, n] = want.split('|');
      const res = await ask({ op: 'where', islandId: seed });
      const tmp = `${p.bus}/.where.json`;
      writeFileSync(tmp, JSON.stringify({ seed, n: Number(n), ...res }));
      renameSync(tmp, `${p.bus}/where.json`);
    }
  }
}

/** Pendant une run : sous 80, le lapin repart a 300 (sauf `starve`). */
async function energyLoop(ps: Player[]) {
  for (;;) {
    await sleep(1500);
    for (const p of ps) {
      const s = p.state;
      if (!s?.onIsland || !s.seed || p.starve) continue;
      const w = await ask({ op: 'where', islandId: s.seed });
      const me = (w.rabbits ?? []).find((r: any) => r.playerId === s.playerId);
      if (me?.alive && me.energy < 80) {
        await ask({ op: 'energy', islandId: s.seed, playerId: s.playerId, energy: 300 });
        assist(`${p.tag} : energie en run ${me.energy} → 300`);
      }
    }
  }
}

async function topUp(p: Player) {
  await db.update(players).set({ energy: 300, energyUpdatedAt: new Date(), energyPacksBought: 0 })
    .where(eq(players.id, p.id));
}

async function liftShield(p: Player) {
  await db.update(players).set({ shieldedUntil: null }).where(eq(players.id, p.id));
}

/** Attend que le joueur soit au terrier, rien en cours. */
async function home(p: Player, limitS = 60) {
  for (let i = 0; i < limitS * 2; i++) {
    const s = p.state;
    if (s && s.place === 'burrow' && !s.crossing && !s.op) return true;
    await sleep(500);
  }
  return false;
}

async function dig(p: Player, args: Record<string, unknown> = {}) {
  await topUp(p);
  return p.cmd('dig', { marks: 2, ...args }, 900);
}

// ── Le scenario ──────────────────────────────────────────────────────────────
async function scenario(A: Player, B: Player) {
  phase('1. Accueil, invite, tuto (les deux en meme temps)');
  const [oa, ob] = await Promise.all([A.cmd('onboard', {}, 240), B.cmd('onboard', {}, 240)]);
  if (!oa.ok || !ob.ok) throw new Error('onboard rate — rien ne peut suivre');
  for (const p of [A, B]) await liftShield(p);
  console.log(`  A = ${A.state?.name} (${A.id})\n  B = ${B.state?.name} (${B.id})`);

  phase('2. Niveaux 1-2 en solo, et fouiller le terrier');
  await Promise.all([A.cmd('wander', { random: 6 }, 240), B.cmd('wander', { random: 6 }, 240)]);
  const solo = async (p: Player, upTo: number, extras: (lvl: number) => Promise<void>) => {
    let guard = 0;
    while (p.level < upTo && guard++ < upTo * 3) {
      const lvl = p.level;
      await dig(p, { blast: guard === 1, wrong: guard === 2 });
      await home(p);
      if (p.level > lvl) await extras(p.level);
    }
  };
  const early = (p: Player) => async (lvl: number) => {
    if (lvl === 2) await p.cmd('defend_setup', { traps: 3, fences: 2 }, 180);
    await p.cmd('harvest', {}, 60);
  };
  await Promise.all([solo(A, 3, early(A)), solo(B, 3, early(B))]);

  phase('3. Raids croises au niveau 3 (defense en direct)');
  for (const p of [A, B]) {
    await db.update(players).set({ stock: 3_000_000 }).where(eq(players.id, p.id));
    await liftShield(p);
    await topUp(p);
  }
  // B pille A ; A, a la maison, le foudroie au 3e pas.
  await Promise.all([
    A.cmd('guard', { strike_after: 3, wait: 90 }, 200),
    (async () => { await sleep(3000); await B.cmd('raid', { target: A.id }, 180); })(),
  ]);
  // A pille B ; B regarde, sans frapper : A va jusqu'au potager.
  await liftShield(B); await topUp(A); await forgetRaids(A, B);
  await Promise.all([
    B.cmd('guard', { strike_after: -1, wait: 90 }, 200),
    (async () => { await sleep(3000); await A.cmd('raid', { target: B.id }, 180); })(),
  ]);
  // B pille A et se replie apres 2 pas.
  await liftShield(A); await topUp(B); await forgetRaids(A, B);
  await Promise.all([
    A.cmd('guard', { strike_after: -1, wait: 90 }, 200),
    (async () => { await sleep(3000); await B.cmd('raid', { target: A.id, retreat_after: 2 }, 180); })(),
  ]);

  // La boutique, maintenant que les carottes sont la : de quoi frapper.
  await Promise.all([
    A.cmd('shop', { buy: { lightning: 3, bloop: 3, trap: 1 } }, 240),
    B.cmd('shop', { buy: { lightning: 3, bloop: 3, fence: 1 } }, 240),
  ]);

  phase('4. A creuse ; B le regarde, puis pille son terrier vide');
  const aDig = dig(A, { leave_after: 150 });
  for (let i = 0; i < 60 && !A.state?.onIsland; i++) await sleep(500);
  await sleep(4000);
  await B.cmd('watch', { target: A.id, secs: 16, zap: true }, 120);
  await liftShield(A); await topUp(B); await forgetRaids(A, B);
  await B.cmd('raid', { target: A.id }, 180);
  await aDig;
  await home(A);

  phase('5. Niveaux 3-5 en solo');
  // LE POTAGER a pousse 6 h (il etait vide a chaque passage) : la recolte.
  for (const p of [A, B]) {
    await db.update(players).set({ gardenCollectedAt: new Date(Date.now() - 6 * 3600_000) }).where(eq(players.id, p.id));
  }
  assist('potager vieilli de 6 h pour A et B');
  await Promise.all([A.cmd('harvest', {}, 60), B.cmd('harvest', {}, 60)]);
  await Promise.all([solo(A, 6, async () => { await A.cmd('harvest'); }), solo(B, 6, async () => { await B.cmd('harvest'); })]);

  phase('6. Niveaux 6-9 : la meme ile, eclairs, bloops, poussees');
  let killed = false;
  let rounds = 0;
  while ((A.level < FINAL_LEVEL || B.level < FINAL_LEVEL) && rounds++ < 20) {
    await Promise.all([home(A), home(B)]);
    if (A.level >= FINAL_LEVEL && B.level >= FINAL_LEVEL) break;
    // Des munitions : la boutique, quand le sac se vide.
    if (rounds % 2 === 0) {
      await Promise.all([A.cmd('shop', { buy: { lightning: 2, bloop: 2 } }, 200), B.cmd('shop', { buy: { lightning: 2, bloop: 2 } }, 200)]);
    }
    if (A.level !== B.level) {
      const low = A.level < B.level ? A : B;
      console.log(`  niveaux ${A.level}/${B.level} : ${low.tag} rattrape seul`);
      await dig(low, { fight: true });
      continue;
    }
    const lvl = A.level;
    console.log(`  niveau ${lvl} : les deux traversent ensemble`);
    const both = [dig(A, { fight: true }), (async () => { await sleep(1500); return dig(B, { fight: true }); })()];
    // LE CAS « IL MEURT » : au niveau 7, B tombe a 25 d'energie ; le prochain
    // eclair ou la prochaine bombe le tue. Il regarde A finir, puis revient.
    if (lvl === 7 && !killed) {
      killed = true;
      for (let i = 0; i < 60 && !(A.state?.onIsland && B.state?.onIsland); i++) await sleep(500);
      if (A.state?.seed && A.state.seed === B.state?.seed) {
        await sleep(8000);
        B.starve = true;
        await ask({ op: 'energy', islandId: B.state.seed, playerId: B.id, energy: 25 });
        assist('B : energie en run → 25 (le cas « il meurt »)');
        const bEnd = await both[1];
        B.starve = false;
        await home(B);
        if (A.state?.onIsland) {
          await topUp(B);
          await B.cmd('watch', { target: A.id, secs: 14, zap: true }, 120);
          if (A.state?.onIsland) await dig(B, { fight: true });
        }
        console.log(`  B : ${bEnd.result?.end ?? '?'}`);
      } else {
        console.log('  ✘ A et B ne sont pas sur la meme ile au niveau 7');
      }
    }
    await Promise.all(both);
  }

  phase(`7. Niveau ${FINAL_LEVEL} : une derniere ile ensemble`);
  await Promise.all([home(A), home(B)]);
  await Promise.all([dig(A, { fight: true }), (async () => { await sleep(1500); return dig(B, { fight: true }); })()]);
  await Promise.all([A.cmd('wander', { random: 4 }, 200), B.cmd('wander', { random: 4 }, 200)]);
}

// ── Le delai entre deux raids ─────────────────────────────────────────────────
/**
 * LE DELAI D'UNE HEURE ENTRE DEUX RAIDS sur la meme victime se compte depuis
 * le `startedAt` du dernier raid marche. Le raid lit la constante du fichier,
 * pas la table `tuning` : on recule donc ces departs d'une heure, entre nos
 * deux invites seulement, dans la base locale.
 */
async function forgetRaids(a: Player, b: Player) {
  await db.update(raidRuns).set({ startedAt: new Date(Date.now() - 2 * 3600_000) })
    .where(or(
      and(eq(raidRuns.attackerId, a.id), eq(raidRuns.defenderId, b.id)),
      and(eq(raidRuns.attackerId, b.id), eq(raidRuns.defenderId, a.id)),
    ));
  assist(`delai entre deux raids leve (raid_runs ${a.tag}↔${b.tag} recules de 2 h)`);
}

// ── Le rapport ───────────────────────────────────────────────────────────────
function grep(file: string, re: RegExp, max = 60): string[] {
  if (!existsSync(file)) return [];
  const seen = new Map<string, number>();
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!re.test(l)) continue;
    const k = l.replace(/\d+/g, '#').slice(0, 200);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].slice(0, max).map(([k, n]) => (n > 1 ? `${k}  (×${n})` : k));
}

function report(A: Player, B: Player, error?: unknown) {
  const fails = journal.filter((l) => l.ok === false);
  const md: string[] = [];
  md.push(`# Test de bout en bout a deux — ${STAMP}`, '');
  md.push(`Duree ${clock()} · A = ${A.state?.name ?? '?'} niv. ${A.level} · B = ${B.state?.name ?? '?'} niv. ${B.level}`);
  md.push(`Gestes : ${journal.filter((l) => l.ok !== null).length}, ratés : ${fails.length}`, '');
  if (error) md.push(`**Arret : ${String(error)}**`, '');
  md.push('## Ratés', '');
  if (!fails.length) md.push('Aucun.');
  for (const l of fails) md.push(`- ${l.t} **${l.who}** \`${l.op}\` — ${l.notes.join(' · ')}`);
  md.push('', '## Erreurs Godot', '');
  for (const p of [A, B]) {
    const errs = grep(`${OUT}godot-${p.tag}.log`, /SCRIPT ERROR|USER SCRIPT ERROR|^ERROR|Invalid (get|call|access)|Parse Error|Nonexistent function/);
    md.push(`### ${p.tag}`, '', ...(errs.length ? errs.map((e) => `- \`${e}\``) : ['Aucune.']), '');
  }
  md.push('## Refus du serveur', '');
  const srv = grep(`${OUT}server.log`, /error_msg|_rejected|leave_rejected|Error|unhandled/i, 80);
  md.push(...(srv.length ? srv.map((e) => `- \`${e}\``) : ['Aucun.']), '');
  md.push('## Coups de pouce du banc', '', ...assists.map((a) => `- ${a}`), '');
  md.push('## Deroule', '');
  for (const l of journal) {
    if (l.ok === null && l.op.startsWith('##')) { md.push('', `### ${l.op.slice(3)}`, ''); continue; }
    const r = l.result && Object.keys(l.result).length ? ` \`${JSON.stringify(l.result).slice(0, 220)}\`` : '';
    md.push(`- ${l.t} ${l.ok ? '✔' : '✘'} **${l.who}** \`${l.op}\`${r}${l.notes.length ? '\n  - ' + l.notes.join('\n  - ') : ''}`);
  }
  const shots = [A, B].flatMap((p) => readdirSync(p.bus).filter((f) => f.endsWith('.png')).map((f) => `${p.tag}/${f}`));
  if (shots.length) md.push('', '## Captures des ratés', '', ...shots.map((s) => `- ${s}`));
  writeFileSync(`${OUT}report.md`, md.join('\n'));
  console.log(`\nRapport : ${OUT}report.md`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true });
  const override = `${ROOT}godot/override.cfg`;
  if (existsSync(override)) throw new Error('godot/override.cfg existe deja — une capture tourne ?');
  await restartServer();

  const g: any = await (await fetch(BASE + '/api/auth/guest', { method: 'POST' })).json();
  stage = connect(BASE, { auth: { token: g.token }, transports: ['websocket'], reconnection: true });
  await new Promise<void>((ok) => stage.once('connect', () => ok()));

  writeFileSync(override, [
    '[application]', 'config/use_custom_user_dir=true', `config/custom_user_dir_name="${USER_DIR}"`,
    '[display]', 'window/size/viewport_width=890', 'window/size/viewport_height=400',
    `window/size/window_width_override=${W}`, `window/size/window_height_override=${H}`, 'window/size/mode=0',
  ].join('\n') + '\n');
  rmSync(`${homedir()}/Library/Application Support/${USER_DIR}`, { recursive: true, force: true });

  const A = new Player('A', 0);
  const B = new Player('B', W + 10);
  let failed: unknown;
  const stop = async () => {
    rmSync(override, { force: true });
  };
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => { report(A, B, `interrompu (${sig})`); await stop(); A.proc?.kill(); B.proc?.kill(); process.exit(130); });
  }

  A.launch();
  await sleep(1200);
  B.launch();
  await sleep(6000);
  rmSync(override, { force: true }); // lu au demarrage ; ne pas le laisser trainer
  void oracleLoop([A, B]);
  void energyLoop([A, B]);
  try {
    await scenario(A, B);
  } catch (e) {
    failed = e;
    console.error(e);
  }
  report(A, B, failed);
  await stop();
  console.log('Les deux fenetres restent ouvertes. Ctrl+C pour sortir.');
}

main().catch(async (e) => {
  console.error(e);
  rmSync(`${ROOT}godot/override.cfg`, { force: true });
  process.exit(1);
});
