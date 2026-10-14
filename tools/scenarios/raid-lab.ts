/**
 * THE RAID LAB — test RAID both ways, by hand, on a LOCAL rr-ws, before any of
 * it goes to prod (« on va pas push en prod un truc pas testé ! », 2026-10-14).
 *
 *   bun ws                                            (another shell, port 3011)
 *   bun run tools/scenarios/raid-lab.ts [--kuro-in 45] [--size 890x400] [--no-godot]
 *
 * Opens the real Godot client as YOU — a level-5 guest kept between launches
 * (tools/scenarios/out/raid-you.json), topped up every launch: a full bar,
 * carrots worth stealing, no shield, its cooldowns wiped. Two more burrows are
 * kept the same way, AWAY (never connected, but seen a minute ago so not
 * asleep) and rich, so they head your RAID list.
 *
 *   • YOU RAID: the RAID plank → Navet or Radis → RAID. Walk to their garden,
 *     or retreat. Each launch clears your cooldowns on them.
 *   • YOU ARE RAIDED: press ENTER here (or `--kuro-in N` seconds after launch)
 *     and KURO, a level-5 bot, raids your burrow — one step every STEP_MS
 *     toward your garden by the shortest walk, fences and bombs as the server
 *     reads them. The alarm, the live defence, the lightning, the bombs going
 *     off under him, the end card. Open BURY first to see the plan give way.
 *     ENTER again for another raid.
 *
 * Refuses to run against a database that is not on this machine: it rewrites
 * players and deletes raid rows.
 */
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { players, raidRuns } from '../../src/lib/db/schema';
import { burrowNeighbors } from '../../src/game/burrow/board';
import { loadBurrowEdits } from '../../src/lib/game/burrowEdits';
import { distanceToField } from '../../src/lib/game/raid';

const BASE = process.env.STAGE_URL ?? `http://localhost:${process.env.WS_PORT ?? 3011}`;
const GODOT = process.env.GODOT_BIN ?? '/Applications/Godot.app/Contents/MacOS/Godot';
const OUT = new URL('./out/', import.meta.url).pathname;
const opt = (k: string, d: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const KURO_IN = Number(opt('--kuro-in', '0'));
const SIZE = opt('--size', '890x400');
/** Slow enough to read the alarm and strike, fast enough to reach the garden. */
const STEP_MS = Number(opt('--step-ms', '1400'));
const TARGET_NAMES = ['Navet', 'Radis'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function localOnly() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    console.error(`raid-lab : DATABASE_URL n'est pas locale (${url.replace(/\/\/[^@]*@/, '//…@')}). Refusé.`);
    process.exit(1);
  }
  if (!/localhost|127\.0\.0\.1/.test(BASE)) {
    console.error(`raid-lab : ${BASE} n'est pas un serveur local. Refusé.`);
    process.exit(1);
  }
}

async function guest(): Promise<{ id: string; token: string }> {
  const res = await fetch(BASE + '/api/auth/guest', { method: 'POST' });
  const json: any = await res.json();
  if (!json?.token) throw new Error('guest failed ' + JSON.stringify(json));
  return { id: json.player.id, token: json.token };
}

/** A guest kept in out/<file> from one launch to the next. */
async function kept(file: string): Promise<{ id: string; token: string }> {
  const path = OUT + file;
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const g = await guest();
  writeFileSync(path, JSON.stringify(g));
  return g;
}

/** Level 5, a full bar, `stock` carrots, no shield, not solo, seen just now. */
async function topUp(id: string, name: string, stock: number) {
  await db.update(players).set({
    name, level: 5, runsPlayed: 5, energy: 300, energyUpdatedAt: new Date(), stock,
    shieldedUntil: null, solo: false, lastSeenAt: new Date(),
  }).where(eq(players.id, id));
}

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

// ── Kuro raids you ───────────────────────────────────────────────────────────

let raiding = false;

async function kuroRaids(kuro: { id: string; token: string }, you: string) {
  if (raiding) return console.log('  Kuro est déjà chez toi.');
  raiding = true;
  try {
    // Ready for another go: a full bar, your shield down, the cooldown gone.
    await topUp(kuro.id, 'Kuro', 500);
    await db.update(players).set({ shieldedUntil: null }).where(eq(players.id, you));
    await db.delete(raidRuns).where(and(eq(raidRuns.attackerId, kuro.id), eq(raidRuns.defenderId, you)));

    const open = await api(kuro.token, 'POST', '/api/raid', { defenderId: you });
    if (open.status !== 200) return console.log(`  Kuro n'entre pas : ${JSON.stringify(open.json)}`);
    console.log('  🐰 Kuro entre dans ton terrier…');

    await loadBurrowEdits(you);
    const dist = distanceToField(you);
    let tile: number = open.json.raid?.tile ?? open.json.tile;
    const walked = new Set<number>([tile]);
    for (;;) {
      await sleep(STEP_MS);
      // The shortest walk to the garden; a fence refuses the step, so the
      // next best is tried (the server reads the fences, not us).
      const next = burrowNeighbors(you, tile)
        .filter((t) => !walked.has(t))
        .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99));
      let moved = false;
      for (const t of next) {
        const step = await api(kuro.token, 'PATCH', '/api/raid', { tile: t });
        if (step.json?.error === 'fenced') continue;
        if (step.status !== 200) {
          console.log(`  Kuro s'arrête : ${JSON.stringify(step.json)}`);
          return;
        }
        if (step.json.struck) return console.log('  ⚡ Kuro foudroyé — défense réussie.');
        tile = t;
        walked.add(t);
        moved = true;
        const r = step.json.raid ?? {};
        console.log(`  pas → ${t}  énergie ${r.energy}${step.json.sprungTrap ? '  💥 bombe !' : ''}`);
        const end = step.json.outcome;
        if (end) {
          console.log(end.reachedField
            ? `  🥕 Kuro a atteint ton potager : ${end.loot} carottes prises.`
            : '  😵 Kuro s\'est épuisé avant ton potager.');
          return;
        }
        break;
      }
      if (!moved) {
        await api(kuro.token, 'DELETE', '/api/raid');
        return console.log('  Kuro est coincé et repart.');
      }
    }
  } finally {
    raiding = false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  localOnly();
  mkdirSync(OUT, { recursive: true });
  const health = await fetch(BASE + '/health').catch(() => null);
  if (!health?.ok) {
    console.error(`raid-lab : pas de serveur sur ${BASE}. Lance \`bun ws\` d'abord.`);
    process.exit(1);
  }

  const you = await kept('raid-you.json');
  const kuro = await kept('raid-kuro.json');
  const targets = [await kept('raid-target-1.json'), await kept('raid-target-2.json')];

  await topUp(you.id, 'Toi', 3000);
  await topUp(kuro.id, 'Kuro', 500);
  for (let i = 0; i < targets.length; i++) await topUp(targets[i].id, TARGET_NAMES[i], 5_000_000_000);
  // Every cooldown between the lab's rabbits, and any raid left open.
  const lab = [you.id, kuro.id, ...targets.map((t) => t.id)];
  await db.delete(raidRuns).where(or(inArray(raidRuns.attackerId, lab), inArray(raidRuns.defenderId, lab)));

  // `--no-godot` : le client se lance a la main (une capture, un film) avec
  // le jeton ecrit dans out/raid-you.json.
  if (!process.argv.includes('--no-godot')) {
    const root = new URL('../../godot', import.meta.url).pathname;
    const log = openSync(OUT + 'raid-lab-godot.log', 'w');
    spawn(GODOT, ['--path', root, '--', `--server=${BASE}`, `--token=${you.token}`, `--size=${SIZE}`],
      { stdio: ['ignore', log, log], detached: true }).unref();
  }

  console.log(`\nRAID LAB sur ${BASE} — Godot ouvert en ${SIZE} (log : tools/scenarios/out/raid-lab-godot.log)`);
  console.log(`  TU RAIDES : planche RAID → ${TARGET_NAMES.join(' ou ')} → RAID.`);
  console.log('  ON TE RAIDE : Entrée ici → Kuro raide ton terrier. (Ouvre BURY avant pour voir le plan s\'effacer.)');
  console.log('  Ctrl+C pour sortir (Godot reste ouvert).\n');

  if (KURO_IN > 0) setTimeout(() => void kuroRaids(kuro, you.id), KURO_IN * 1000);
  const rl = createInterface({ input: process.stdin });
  rl.on('line', () => void kuroRaids(kuro, you.id));
}

void main();
