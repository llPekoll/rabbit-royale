/**
 * LE SOCLE DES BANCS DE BOUT EN BOUT — de vrais clients Godot (main.tscn
 * joue par une main qu'on voit, godot/scripts/demo/duo_player.gd) sur un rr-ws
 * LOCAL, et un chef d'orchestre qui leur parle par fichiers.
 *
 *   tools/e2e/duo.ts     deux joueurs, du tuto au niveau 10
 *   tools/e2e/crowd.ts   cinq joueurs, les iles partagees (niveau 6 et plus)
 *
 * Ici : les joueurs (une fenetre chacun), le serveur de scene relance a neuf,
 * l'oracle (`__stage where` — ou sont les bombes et les coffres, pour CHOISIR
 * ou taper), la recharge d'energie, le journal et le rapport.
 *
 * Sortie : tools/e2e/out/<date>/ — report.md, godot-<tag>.log, server.log,
 * et dans <tag>/ l'etat, live.png (toutes les 4 s) et les captures des ratés.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync, openSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { io as connect, type Socket } from 'socket.io-client';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { players } from '../../src/lib/db/schema';

export const PORT = 3012;
export const BASE = `http://localhost:${PORT}`;
const GODOT = process.env.GODOT_BIN ?? '/Applications/Godot.app/Contents/MacOS/Godot';
export const ROOT = new URL('../../', import.meta.url).pathname;
export const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
export const OUT = `${ROOT}tools/e2e/out/${STAMP}/`;
const USER_DIR = 'rabbit-royale-e2e';

export const arg = (k: string, d: number) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
export const clock = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ── Le journal, qui devient le rapport ───────────────────────────────────────
export interface Line { t: string; who: string; op: string; ok: boolean | null; notes: string[]; result?: any }
export const journal: Line[] = [];
const assists: string[] = [];
let phases = 0;
/** `--stop-after N` : s'arrete avant la phase N+1 (pour regler un banc). */
const STOP_AFTER = arg('--stop-after', 99);
export function phase(title: string) {
  if (phases >= STOP_AFTER) throw new Error(`arret demande apres la phase ${STOP_AFTER}`);
  phases++;
  journal.push({ t: clock(), who: '—', op: `## ${title}`, ok: null, notes: [] });
  console.log(`\n━━ ${clock()} ${title}`);
}
export function assist(text: string) {
  assists.push(`${clock()} ${text}`);
  console.log(`  ⚙ ${text}`);
}
/** Une ligne du deroule qui n'est pas un geste (un constat du chef d'orchestre). */
export function remark(text: string) {
  journal.push({ t: clock(), who: '—', op: text, ok: null, notes: [] });
  console.log(`  · ${text}`);
}

// ── Un joueur, une fenetre ───────────────────────────────────────────────────
export interface State {
  playerId: string; name: string; level: number; energy: number; stock: number;
  place: string; crossing: boolean; seed: string; onIsland: boolean; spectating: string;
  inRaid: boolean; incoming: boolean; dialog: string; mode: string; op: string;
}
export interface Window { x: number; y: number; w: number; h: number }

export class Player {
  bus: string;
  seq = 0;
  proc?: ChildProcess;
  /** Pas de recharge d'energie pendant la run (le cas « il meurt »). */
  starve = false;
  asked = '';
  /** Un jeton deja fait (le joueur arrive au terrier) ; sinon l'accueil, en invite. */
  token = '';
  constructor(public tag: string, public win: Window) {
    this.bus = `${OUT}${tag}`;
    mkdirSync(this.bus, { recursive: true });
  }
  get state(): State | null {
    try { return JSON.parse(readFileSync(`${this.bus}/state.json`, 'utf8')); } catch { return null; }
  }
  get id() { return this.state?.playerId ?? ''; }
  get level() { return this.state?.level ?? 0; }

  launch(extra: string[] = []) {
    const log = openSync(`${OUT}godot-${this.tag}.log`, 'w');
    this.proc = spawn(GODOT, [
      '--path', `${ROOT}godot`, '--position', `${this.win.x},${this.win.y}`,
      '--resolution', `${this.win.w}x${this.win.h}`, ...extra,
      'scenes/demo/duo_player.tscn', '--',
      `--server=${BASE}`, `--token=${this.token || `e2e-${this.tag}-bogus`}`, `--bus=${this.bus}`, `--tag=${this.tag}`,
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
          console.log(`  ${this.tag} ${ack.ok ? '✔' : '✘'} ${op}${line.notes.length ? ' — ' + line.notes.slice(0, 12).join(' | ') : ''}`);
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
export const ask = (req: any) => new Promise<any>((ok) => {
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

export async function topUp(p: Player) {
  await db.update(players).set({ energy: 300, energyUpdatedAt: new Date(), energyPacksBought: 0 })
    .where(eq(players.id, p.id));
}

export async function liftShield(p: Player) {
  await db.update(players).set({ shieldedUntil: null }).where(eq(players.id, p.id));
}

/** Attend que le joueur soit au terrier, rien en cours. */
export async function home(p: Player, limitS = 60) {
  for (let i = 0; i < limitS * 2; i++) {
    const s = p.state;
    if (s && s.place === 'burrow' && !s.crossing && !s.op) return true;
    await sleep(500);
  }
  return false;
}

export async function dig(p: Player, args: Record<string, unknown> = {}) {
  await topUp(p);
  return p.cmd('dig', { marks: 2, ...args }, 900);
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

/** `sections` : ce que le banc ajoute en tete (titre → lignes markdown). */
export function report(title: string, ps: Player[], error?: unknown, sections: Record<string, string[]> = {}) {
  const fails = journal.filter((l) => l.ok === false);
  const md: string[] = [];
  md.push(`# ${title} — ${STAMP}`, '');
  md.push(`Duree ${clock()} · ${ps.map((p) => `${p.tag} = ${p.state?.name ?? '?'} niv. ${p.level}`).join(' · ')}`);
  md.push(`Gestes : ${journal.filter((l) => l.ok !== null).length}, ratés : ${fails.length}`, '');
  if (error) md.push(`**Arret : ${String(error)}**`, '');
  for (const [head, lines] of Object.entries(sections)) md.push(`## ${head}`, '', ...(lines.length ? lines : ['Rien.']), '');
  md.push('## Ratés', '');
  if (!fails.length) md.push('Aucun.');
  for (const l of fails) md.push(`- ${l.t} **${l.who}** \`${l.op}\` — ${l.notes.join(' · ')}`);
  md.push('', '## Erreurs Godot', '');
  for (const p of ps) {
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
    if (l.ok === null) { md.push(`- ${l.t} · ${l.op}`); continue; }
    const r = l.result && Object.keys(l.result).length ? ` \`${JSON.stringify(l.result).slice(0, 220)}\`` : '';
    md.push(`- ${l.t} ${l.ok ? '✔' : '✘'} **${l.who}** \`${l.op}\`${r}${l.notes.length ? '\n  - ' + l.notes.join('\n  - ') : ''}`);
  }
  const shots = ps.flatMap((p) => readdirSync(p.bus).filter((f) => f.endsWith('.png') && f !== 'live.png').map((f) => `${p.tag}/${f}`));
  if (shots.length) md.push('', '## Captures des ratés', '', ...shots.map((s) => `- ${s}`));
  writeFileSync(`${OUT}report.md`, md.join('\n'));
  console.log(`\nRapport : ${OUT}report.md`);
}

// ── Lancer un banc ───────────────────────────────────────────────────────────
export interface Bench {
  title: string;
  players: Player[];
  /** Avant d'ouvrir les fenetres, serveur et scene prets (faire des comptes). */
  prepare?: () => Promise<void>;
  scenario: () => Promise<void>;
  /** Les sections en tete du rapport. */
  sections?: () => Record<string, string[]>;
  /** Arguments Godot en plus (`--max-fps`, ...). */
  godotArgs?: string[];
}

export async function runBench(b: Bench) {
  mkdirSync(OUT, { recursive: true });
  const override = `${ROOT}godot/override.cfg`;
  if (existsSync(override)) throw new Error('godot/override.cfg existe deja — une capture tourne ?');
  await restartServer();

  const g: any = await (await fetch(BASE + '/api/auth/guest', { method: 'POST' })).json();
  stage = connect(BASE, { auth: { token: g.token }, transports: ['websocket'], reconnection: true });
  await new Promise<void>((ok) => stage.once('connect', () => ok()));
  await b.prepare?.();

  // Le meme user:// pour toutes les fenetres, jamais celui du vrai jeu ; la
  // taille de chacune passe par --resolution.
  writeFileSync(override, [
    '[application]', 'config/use_custom_user_dir=true', `config/custom_user_dir_name="${USER_DIR}"`,
    '[display]', 'window/size/viewport_width=890', 'window/size/viewport_height=400', 'window/size/mode=0',
  ].join('\n') + '\n');
  rmSync(`${homedir()}/Library/Application Support/${USER_DIR}`, { recursive: true, force: true });

  let failed: unknown;
  const write = (e?: unknown) => report(b.title, b.players, e, b.sections?.() ?? {});
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      write(`interrompu (${sig})`);
      rmSync(override, { force: true });
      for (const p of b.players) p.proc?.kill();
      process.exit(130);
    });
  }
  for (const p of b.players) {
    p.launch(b.godotArgs);
    await sleep(1200);
  }
  await sleep(5000);
  rmSync(override, { force: true }); // lu au demarrage ; ne pas le laisser trainer
  void oracleLoop(b.players);
  void energyLoop(b.players);
  try {
    await b.scenario();
  } catch (e) {
    failed = e;
    console.error(e);
  }
  write(failed);
  console.log('Les fenetres restent ouvertes. Ctrl+C pour sortir.');
}
