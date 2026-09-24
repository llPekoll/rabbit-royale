/**
 * THE PLAYGROUND — play the late game by hand, against bots, on a LOCAL rr-ws.
 *
 *   RR_STAGE=1 WS_PORT=3012 bun run server/index.ts        (another shell)
 *   bun run tools/scenarios/playground.ts [--bots 2] [--away 1] [--zap 12]
 *
 * Opens the real Godot client as YOU — a level-10 guest kept between runs
 * (tools/scenarios/out/you.json), topped up every launch with a full bar,
 * lightning and bombs. Then `--bots` rabbits (level 10, rich, so first in the
 * RAID list) dig for ever: when a run ends they go straight back out, so they
 * always read « out digging ».
 *
 *   • RAID → a row « out digging » → WATCH: you land on their island, and
 *     from there strike them or bloop them.
 *   • RAID → a row « away » (`--away` bots, never connected) → RAID: their
 *     burrow, nobody home.
 *   • DIG yourself: level 10 packs you onto the bots' island. The first bot
 *     strikes or bloops you (in turn) every `--zap` seconds (0 = never).
 *
 * Ctrl+C stops the bots (Godot stays open).
 */
import { io as connect, type Socket } from 'socket.io-client';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { eq, sql as raw } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { inventory, players } from '../../src/lib/db/schema';
import { grantItem } from '../../src/lib/game/grant';
import { terrainNeighbors } from '../../src/lib/game/terrainBoard';

const BASE = process.env.STAGE_URL ?? 'http://localhost:3012';
const GODOT = process.env.GODOT_BIN ?? '/Applications/Godot.app/Contents/MacOS/Godot';
const OUT = new URL('./out/', import.meta.url).pathname;
const arg = (k: string, d: number) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d);
const BOTS = arg('--bots', 2);
const ZAP_S = arg('--zap', 12);
const AWAY = arg('--away', 1);
const BOT_NAMES = ['Carotte', 'Navet', 'Radis', 'Poireau'];
const AWAY_NAMES = ['Dormeur', 'Absent', 'Parti'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

async function guest(): Promise<{ id: string; token: string }> {
  const res = await fetch(BASE + '/api/auth/guest', { method: 'POST' });
  const json: any = await res.json();
  if (!json?.token) throw new Error('guest failed ' + JSON.stringify(json));
  return { id: json.player.id, token: json.token };
}

/** Level 10, a full bar, and at least `n` of each weapon. */
async function kit(id: string, name: string, stock: number, weapons: number) {
  await db.update(players).set({
    name, level: 10, runsPlayed: 5, energy: 300, energyUpdatedAt: new Date(), stock, shieldedUntil: null,
  }).where(eq(players.id, id));
  for (const kind of ['lightning', 'bloop'] as const) {
    const [row] = await db.select({ qty: inventory.qty }).from(inventory)
      .where(raw`${inventory.playerId} = ${id} and ${inventory.kind} = ${kind}`);
    const missing = weapons - (row?.qty ?? 0);
    if (missing > 0) await db.transaction((tx) => grantItem(tx as any, id, kind, missing));
  }
}

/** At least three of `kind` in the bag — the zapper never runs dry. */
async function arm(id: string, kind: 'lightning' | 'bloop') {
  const [row] = await db.select({ qty: inventory.qty }).from(inventory)
    .where(raw`${inventory.playerId} = ${id} and ${inventory.kind} = ${kind}`);
  if ((row?.qty ?? 0) < 3) await db.transaction((tx) => grantItem(tx as any, id, kind, 3));
}

/** The scenario bench's throwaway guests leave the RAID list (level 1). */
async function tidy() {
  const r = await db.execute(raw`update players set level = 1
    where id like 'guest:%' and level >= 10
      and name ~ '^(A|B|Digger|Raider|Nine|Watcher|Director)-[a-z0-9]+$'`);
  return (r as any).count ?? 0;
}

// ── A bot that digs for ever ─────────────────────────────────────────────────
class Bot {
  s!: Socket;
  seed = '';
  me = -1;
  alive = false;
  revealed = new Map<number, string>();
  rabbits = new Map<string, { tile: number; alive: boolean; name?: string }>();
  stunnedUntil = 0;
  lastZap = Date.now();
  zaps = 0;

  constructor(public id: string, public token: string, public name: string, public you: string, public zapper: boolean) {}

  async start() {
    this.s = connect(BASE, { auth: { token: this.token }, transports: ['websocket'], reconnection: true, forceNew: true });
    const s = this.s;
    s.on('island', (snap: any) => {
      this.seed = snap.seed;
      this.revealed = new Map((snap.revealed ?? []).map((r: any) => [r.tile, r.content]));
      this.rabbits = new Map((snap.rabbits ?? []).map((r: any) => [r.playerId, { tile: r.tile, alive: r.alive, name: r.name }]));
      this.me = this.rabbits.get(this.id)?.tile ?? -1;
      this.alive = true;
      console.log(`  ${this.name} est sur une île (${this.rabbits.size} lapin·s)`);
    });
    s.on('tile_revealed', (r: any) => this.revealed.set(r.tile, r.content));
    s.on('rabbit_joined', (r: any) => {
      this.rabbits.set(r.playerId, { tile: r.tile, alive: r.alive, name: r.name });
      if (r.playerId === this.you) console.log(`  → tu es arrivé sur l'île de ${this.name}`);
    });
    s.on('rabbit_left', (r: any) => { if (!r.grace) this.rabbits.delete(r.playerId); });
    s.on('rabbit_moved', (r: any) => {
      const x = this.rabbits.get(r.playerId);
      if (x) x.tile = r.tile;
      if (r.playerId === this.id) this.me = r.tile;
    });
    s.on('rabbit_died', (r: any) => { const x = this.rabbits.get(r.playerId); if (x) x.alive = false; });
    s.on('move_result', (o: any) => { this.me = o.tile; });
    s.on('rabbit_pushed', (p: any) => {
      const x = this.rabbits.get(p.playerId); if (x) x.tile = p.to;
      if (p.playerId === this.id) { this.me = p.to; this.stunnedUntil = Date.now() + (p.stunMs ?? 0); }
    });
    s.on('bomb_hit', (p: any) => {
      const x = this.rabbits.get(p.playerId); if (x) x.tile = p.tile;
      if (p.playerId === this.id) { this.me = p.tile; this.stunnedUntil = Date.now() + (p.stunMs ?? 0); }
    });
    s.on('rabbit_struck', (p: any) => {
      if (p.playerId === this.id) { this.stunnedUntil = Date.now() + (p.stunMs ?? 0); console.log(`  ⚡ ${this.name} foudroyé (reste ${p.energy})`); }
      if (p.playerId === this.you && p.by === this.id) console.log(`  ⚡ ${this.name} t'a foudroyé (il te reste ${p.energy})`);
    });
    s.on('run_over', (o: any) => {
      this.alive = false;
      const by = o.killedBy ? ` — par ${o.killedBy.name} (${o.killedBy.how})` : '';
      console.log(`  ${this.name} : run finie${by}, il repart`);
    });
    s.on('error_msg', (e: any) => console.log(`  ${this.name} : refusé ${e.code}`));
    // The server restarted: its islands are gone, so the next tick rejoins one.
    s.on('disconnect', () => { this.alive = false; this.seed = ''; });
    s.on('lightning_rejected', (p: any) => console.log(`  ${this.name} : éclair refusé (${p.reason})`));
    s.on('bloop_rejected', (p: any) => console.log(`  ${this.name} : bloop refusé (${p.reason})`));
    s.on('rabbit_inked', (p: any) => { if (p.playerId === this.id) console.log(`  🦑 ${this.name} encré`); });
    await new Promise<void>((ok) => s.once('connect', () => ok()));
    void this.loop();
  }

  private async rejoin() {
    await kit(this.id, this.name, 2_000_000, 0);
    this.s.emit('join');
    await sleep(1500);
  }

  private async loop() {
    await this.rejoin();
    for (;;) {
      await sleep(650 + Math.random() * 500);
      if (!this.alive) { await sleep(1500); await this.rejoin(); continue; }
      if (Date.now() < this.stunnedUntil) continue;

      // THE ZAPPER: you on my island, alive → every ZAP_S seconds, a bolt,
      // then a bloop, in turn.
      const you = this.rabbits.get(this.you);
      if (this.zapper && ZAP_S > 0 && you?.alive && Date.now() - this.lastZap > ZAP_S * 1000) {
        this.lastZap = Date.now();
        const kind = this.zaps++ % 2 === 0 ? 'lightning' : 'bloop';
        await arm(this.id, kind);
        this.s.emit(kind, { tile: you.tile });
        if (kind === 'bloop') console.log(`  🦑 ${this.name} te lance un bloop`);
        continue;
      }

      if (!this.seed || this.me < 0) continue;
      const taken = new Set([...this.rabbits.entries()].filter(([id, r]) => id !== this.id && r.alive).map(([, r]) => r.tile));
      const around = terrainNeighbors(this.seed, this.me).filter((t) => !taken.has(t) && this.revealed.get(t) !== 'bomb');
      if (!around.length) continue;
      // Mostly dig new ground; now and then wander over what is open.
      const fresh = around.filter((t) => !this.revealed.has(t));
      const open = around.filter((t) => this.revealed.has(t));
      const next = fresh.length && (Math.random() < 0.7 || !open.length) ? pick(fresh) : pick(open);
      this.s.emit('move', { tile: next });
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const h = await fetch(BASE + '/health').then((r) => r.json()).catch(() => null);
  if (!h) throw new Error(`no rr-ws at ${BASE} — RR_STAGE=1 WS_PORT=3012 bun run server/index.ts`);
  mkdirSync(OUT, { recursive: true });
  console.log(`${await tidy()} vieux lapins du banc sortis de la liste RAID`);

  // YOU, the same account from one launch to the next.
  const YOU_FILE = OUT + 'you.json';
  const you = existsSync(YOU_FILE) ? JSON.parse(readFileSync(YOU_FILE, 'utf8')) : await guest();
  writeFileSync(YOU_FILE, JSON.stringify(you));
  await kit(you.id, 'Toi', 5_000, 5);

  // The bots' accounts are kept too, so the RAID list does not grow.
  const BOTS_FILE = OUT + 'bots.json';
  const saved: Array<{ id: string; token: string }> = existsSync(BOTS_FILE) ? JSON.parse(readFileSync(BOTS_FILE, 'utf8')) : [];
  while (saved.length < BOTS) saved.push(await guest());
  writeFileSync(BOTS_FILE, JSON.stringify(saved));

  // THE AWAY ONES: rich burrows whose owner never connects — the RAID row.
  const AWAY_FILE = OUT + 'away.json';
  const away: Array<{ id: string; token: string }> = existsSync(AWAY_FILE) ? JSON.parse(readFileSync(AWAY_FILE, 'utf8')) : [];
  while (away.length < AWAY) away.push(await guest());
  writeFileSync(AWAY_FILE, JSON.stringify(away));
  for (let i = 0; i < AWAY; i++) await kit(away[i].id, AWAY_NAMES[i] ?? `Away${i}`, 1_500_000, 0);

  for (let i = 0; i < BOTS; i++) {
    const b = saved[i];
    const bot = new Bot(b.id, b.token, BOT_NAMES[i] ?? `Bot${i}`, you.id, i === 0);
    await bot.start();
  }

  if (process.argv.includes('--no-godot')) return;
  const root = new URL('../../godot', import.meta.url).pathname;
  // Godot's own traces (`Net.trace`, local server only) land here.
  const log = openSync(OUT + 'godot.log', 'w');
  spawn(GODOT, ['--path', root, '--', `--server=${BASE}`, `--token=${you.token}`], { stdio: ['ignore', log, log], detached: true }).unref();
  console.log(`Logs : tools/scenarios/out/godot.log (Godot), et la sortie du serveur 3012 ([api] / [sock]).`);
  console.log(`\nGodot ouvert en « Toi » (niv. 10, 5 éclairs, 5 bloops).`);
  console.log(`  RAID → « out digging » (${BOT_NAMES.slice(0, BOTS).join(', ')}) → REGARDER : son île, puis éclair / bloop.`);
  console.log(`  RAID → « away » (${AWAY_NAMES.slice(0, AWAY).join(', ')}) → RAID : son terrier, personne à la maison.`);
  console.log(`  DIG → tu tombes sur l'île des bots ; ${BOT_NAMES[0]} te foudroie OU te bloop toutes les ${ZAP_S}s.`);
  console.log(`  En jeu aussi : ⚡ et 🦑 en haut, arme-les puis tape un bot.`);
  console.log(`Ctrl+C pour arrêter les bots.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
